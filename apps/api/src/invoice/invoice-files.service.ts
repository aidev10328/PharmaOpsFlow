import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { StorageProvider, STORAGE_PROVIDER } from '../storage';
import { Role, MemberRole } from '../common/enums/role.enum';
import { InvoiceStatus, InvoiceEventType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { ExtractionService } from '../extraction/extraction.service';

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
];

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface UploadFileDto {
  invoiceId: string;
  file: Express.Multer.File;
  userId: string;
  autoExtract?: boolean; // Optionally trigger extraction after upload
}

@Injectable()
export class InvoiceFilesService {
  private readonly logger = new Logger(InvoiceFilesService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER)
    private storageProvider: StorageProvider,
    @Inject(forwardRef(() => ExtractionService))
    private extractionService: ExtractionService,
  ) {}

  /**
   * Upload a file for an invoice
   */
  async uploadFile(dto: UploadFileDto) {
    const { invoiceId, file, userId } = dto;

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    // Get invoice with pharmacy info
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        pharmacy: {
          select: { id: true, orgId: true },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Generate storage path: org/{orgId}/pharmacy/{pharmacyId}/invoice/{invoiceId}/{uuid}-{originalName}
    const fileUuid = uuidv4();
    const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `org/${invoice.pharmacy.orgId}/pharmacy/${invoice.pharmacyId}/invoice/${invoiceId}/${fileUuid}-${safeFileName}`;

    // Upload to storage
    const uploadResult = await this.storageProvider.uploadFile({
      file: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      storagePath,
    });

    // Create database record
    const invoiceFile = await this.prisma.invoiceFile.create({
      data: {
        invoiceId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: uploadResult.storagePath,
        uploadedByUserId: userId,
      },
      include: {
        uploadedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    // Log event
    await this.prisma.invoiceEvent.create({
      data: {
        invoiceId,
        eventType: InvoiceEventType.UPDATED,
        userId,
        notes: `File uploaded: ${file.originalname}`,
        metadata: {
          action: 'FILE_ADDED',
          fileId: invoiceFile.id,
          fileName: file.originalname,
        },
      },
    });

    // Get download URL
    const downloadUrl = await this.storageProvider.getSignedDownloadUrl(
      uploadResult.storagePath,
    );

    // Auto-extract if requested and provider is configured
    let extractionResult: any = null;
    if (dto.autoExtract && this.extractionService.isProviderConfigured()) {
      try {
        this.logger.log(`Auto-extracting invoice ${invoiceId} from file ${invoiceFile.id}`);
        extractionResult = await this.extractionService.extractInvoice(
          { invoiceId, fileId: invoiceFile.id },
          userId,
        );
      } catch (error) {
        this.logger.warn(`Auto-extraction failed for invoice ${invoiceId}: ${error.message}`);
        // Don't fail the upload if extraction fails
      }
    }

    return {
      ...invoiceFile,
      downloadUrl,
      extraction: extractionResult,
    };
  }

  /**
   * List files for an invoice
   */
  async listFiles(invoiceId: string) {
    const files = await this.prisma.invoiceFile.findMany({
      where: { invoiceId },
      include: {
        uploadedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get download URLs for each file
    const filesWithUrls = await Promise.all(
      files.map(async (file) => ({
        ...file,
        downloadUrl: await this.storageProvider.getSignedDownloadUrl(
          file.storagePath,
        ),
      })),
    );

    return filesWithUrls;
  }

  /**
   * Get a single file
   */
  async getFile(fileId: string) {
    const file = await this.prisma.invoiceFile.findUnique({
      where: { id: fileId },
      include: {
        invoice: {
          include: {
            pharmacy: {
              select: { id: true, orgId: true },
            },
          },
        },
        uploadedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

  /**
   * Get download URL for a file
   */
  async getDownloadUrl(fileId: string) {
    const file = await this.getFile(fileId);
    const downloadUrl = await this.storageProvider.getSignedDownloadUrl(
      file.storagePath,
    );
    return { downloadUrl, file };
  }

  /**
   * Delete a file
   */
  async deleteFile(fileId: string, userId: string, userRole: Role) {
    const file = await this.prisma.invoiceFile.findUnique({
      where: { id: fileId },
      include: {
        invoice: true,
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Check if deletion is allowed based on invoice status
    const canDelete = file.invoice.status === InvoiceStatus.DRAFT || file.invoice.status === InvoiceStatus.NEEDS_INFO;
    if (!canDelete && userRole !== Role.ADMIN) {
      throw new ForbiddenException(
        'Files can only be deleted when invoice is in DRAFT or NEEDS_INFO status',
      );
    }

    // Delete from storage
    await this.storageProvider.deleteFile(file.storagePath);

    // Delete from database
    await this.prisma.invoiceFile.delete({
      where: { id: fileId },
    });

    // Log event
    await this.prisma.invoiceEvent.create({
      data: {
        invoiceId: file.invoiceId,
        eventType: InvoiceEventType.UPDATED,
        userId,
        notes: `File deleted: ${file.originalName}`,
        metadata: {
          action: 'FILE_DELETED',
          fileId: file.id,
          fileName: file.originalName,
        },
      },
    });

    return { success: true };
  }

  /**
   * Check if user has access to the invoice's files
   */
  async checkAccess(
    invoiceId: string,
    userId: string,
    userRole: Role,
    userOrgId?: string,
  ): Promise<boolean> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { pharmacy: { select: { orgId: true } } },
    });

    if (!invoice) return false;

    // Admin has access to everything
    if (userRole === Role.ADMIN) return true;

    // Manager has access to invoices in their org
    if (userRole === Role.COMPANY_MANAGER && userOrgId === invoice.pharmacy.orgId) {
      return true;
    }

    // Check pharmacy membership
    const membership = await this.prisma.pharmacyMember.findUnique({
      where: {
        userId_pharmacyId: { userId, pharmacyId: invoice.pharmacyId },
      },
    });

    return membership !== null;
  }

  /**
   * Check if user can upload to an invoice
   */
  async canUpload(
    invoiceId: string,
    userId: string,
    userRole: Role,
    userOrgId?: string,
  ): Promise<boolean> {
    const hasAccess = await this.checkAccess(invoiceId, userId, userRole, userOrgId);
    if (!hasAccess) return false;

    // Admin and Company Manager can always upload
    if (userRole === Role.ADMIN || userRole === Role.COMPANY_MANAGER) {
      return true;
    }

    // Check membership role - only PHARMACY_ADMIN and PHARMACY_USER can upload
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) return false;

    const membership = await this.prisma.pharmacyMember.findUnique({
      where: {
        userId_pharmacyId: { userId, pharmacyId: invoice.pharmacyId },
      },
    });

    if (!membership) return false;

    return [MemberRole.PHARMACY_ADMIN, MemberRole.PHARMACY_USER].includes(
      membership.memberRole as MemberRole,
    );
  }
}
