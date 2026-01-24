import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { StorageProvider, STORAGE_PROVIDER } from '../storage';
import { InvoiceEventType, ExtractionStatus, AIProvider, Prisma } from '@prisma/client';
import {
  ExtractionContext,
  ExtractionResult,
  ExtractedInvoiceData,
  ExtractionConfidence,
  needsReviewCheck,
  fuzzyMatchVendor,
  mapInvoiceType,
} from './types';
import { AIExtractorProvider, AI_EXTRACTOR_PROVIDER } from './providers';

export interface ExtractInvoiceDto {
  invoiceId: string;
  fileId?: string; // Optional: specific file to extract from
}

export interface ApplyExtractionDto {
  vendorId?: string;
  invoiceTypeId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  amount?: number;
  currency?: string;
}

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER)
    private storageProvider: StorageProvider,
    @Inject(AI_EXTRACTOR_PROVIDER)
    private aiProvider: AIExtractorProvider,
  ) {}

  /**
   * Extract invoice data from a file using AI
   */
  async extractInvoice(dto: ExtractInvoiceDto, userId?: string): Promise<{
    extraction: any;
    needsReview: boolean;
    matchedVendorId?: string;
    matchedInvoiceTypeId?: string;
  }> {
    const { invoiceId, fileId } = dto;

    // Get invoice with pharmacy and files
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        pharmacy: {
          select: { id: true, orgId: true, name: true },
        },
        files: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Determine which file to extract from
    let targetFile = fileId
      ? invoice.files.find((f) => f.id === fileId)
      : invoice.files[0];

    if (!targetFile) {
      throw new BadRequestException('No files found for this invoice');
    }

    // Check if AI provider is configured
    if (!this.aiProvider.isConfigured()) {
      throw new BadRequestException(
        `AI provider (${this.aiProvider.name}) is not configured. Please set the required environment variables.`,
      );
    }

    // Update invoice extraction status to PENDING
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { extractionStatus: ExtractionStatus.PENDING },
    });

    // Log extraction started event
    if (userId) {
      await this.prisma.invoiceEvent.create({
        data: {
          invoiceId,
          eventType: InvoiceEventType.EXTRACTION_STARTED,
          userId,
          notes: `AI extraction started using ${this.aiProvider.name}`,
          metadata: { fileId: targetFile.id, fileName: targetFile.originalName },
        },
      });
    }

    // Get model name based on provider
    const modelName = this.getModelName();

    // Create extraction record
    const extraction = await this.prisma.invoiceExtraction.create({
      data: {
        invoiceId,
        invoiceFileId: targetFile.id,
        provider: this.aiProvider.providerType as AIProvider,
        model: modelName,
        status: ExtractionStatus.PENDING,
        extractedJson: {},
        confidenceJson: {},
      },
    });

    try {
      // Get signed download URL for the file
      const downloadUrl = await this.storageProvider.getSignedDownloadUrl(
        targetFile.storagePath,
        3600, // 1 hour expiry
      );

      // Get known vendors and invoice types for context
      const [vendors, invoiceTypes] = await Promise.all([
        this.prisma.vendor.findMany({
          where: { isActive: true },
          select: { id: true, name: true, code: true },
        }),
        this.prisma.invoiceType.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        }),
      ]);

      // Build extraction context
      const context: ExtractionContext = {
        downloadUrl,
        mimeType: targetFile.mimeType,
        fileName: targetFile.originalName,
        orgContext: {
          orgId: invoice.pharmacy.orgId,
          orgName: invoice.pharmacy.name,
        },
        knownVendors: vendors,
        knownInvoiceTypes: invoiceTypes,
      };

      // Call AI provider
      const result = await this.aiProvider.extractInvoiceFromFile(context);

      // Match vendor and invoice type
      const vendorMatch = fuzzyMatchVendor(result.extracted.vendorName, vendors);
      const typeMatch = mapInvoiceType(result.extracted.invoiceType, invoiceTypes);

      // Determine if review is needed
      const reviewNeeded = needsReviewCheck(result.extracted, result.confidence);

      // Update extraction record with results
      const updatedExtraction = await this.prisma.invoiceExtraction.update({
        where: { id: extraction.id },
        data: {
          extractedJson: result.extracted as any,
          confidenceJson: result.confidence as any,
          rawText: result.rawText,
          status: ExtractionStatus.SUCCESS,
          processingMs: result.processingMs,
        },
      });

      // Update invoice with extraction results
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          extractionStatus: ExtractionStatus.SUCCESS,
          extractedAt: new Date(),
          lastExtractionId: extraction.id,
          needsReview: reviewNeeded,
        },
      });

      // Log extraction completed event
      if (userId) {
        await this.prisma.invoiceEvent.create({
          data: {
            invoiceId,
            eventType: InvoiceEventType.EXTRACTION_COMPLETED,
            userId,
            notes: `AI extraction completed${reviewNeeded ? ' - needs review' : ''}`,
            metadata: {
              extractionId: extraction.id,
              needsReview: reviewNeeded,
              processingMs: result.processingMs,
            },
          },
        });
      }

      this.logger.log(
        `Extraction completed for invoice ${invoiceId}, needsReview: ${reviewNeeded}`,
      );

      return {
        extraction: {
          ...updatedExtraction,
          extractedJson: result.extracted,
          confidenceJson: result.confidence,
        },
        needsReview: reviewNeeded,
        matchedVendorId: vendorMatch?.vendorId,
        matchedInvoiceTypeId: typeMatch?.invoiceTypeId,
      };
    } catch (error) {
      this.logger.error(`Extraction failed for invoice ${invoiceId}: ${error.message}`);

      // Update extraction record with error
      await this.prisma.invoiceExtraction.update({
        where: { id: extraction.id },
        data: {
          status: ExtractionStatus.FAILED,
          error: error.message,
        },
      });

      // Update invoice status
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          extractionStatus: ExtractionStatus.FAILED,
          lastExtractionId: extraction.id,
        },
      });

      // Log extraction failed event
      if (userId) {
        await this.prisma.invoiceEvent.create({
          data: {
            invoiceId,
            eventType: InvoiceEventType.EXTRACTION_FAILED,
            userId,
            notes: `AI extraction failed: ${error.message}`,
            metadata: { extractionId: extraction.id, error: error.message },
          },
        });
      }

      throw error;
    }
  }

  /**
   * Get extraction history for an invoice
   */
  async getExtractionHistory(invoiceId: string) {
    const extractions = await this.prisma.invoiceExtraction.findMany({
      where: { invoiceId },
      include: {
        invoiceFile: {
          select: { id: true, originalName: true, mimeType: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return extractions;
  }

  /**
   * Get the latest extraction for an invoice
   */
  async getLatestExtraction(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { lastExtractionId: true },
    });

    if (!invoice?.lastExtractionId) {
      return null;
    }

    const extraction = await this.prisma.invoiceExtraction.findUnique({
      where: { id: invoice.lastExtractionId },
      include: {
        invoiceFile: {
          select: { id: true, originalName: true, mimeType: true },
        },
      },
    });

    return extraction;
  }

  /**
   * Apply extracted data to an invoice
   */
  async applyExtraction(
    invoiceId: string,
    dto: ApplyExtractionDto,
    userId: string,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { extractions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Validate vendor if provided
    if (dto.vendorId) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: dto.vendorId },
      });
      if (!vendor) {
        throw new BadRequestException('Vendor not found');
      }
    }

    // Validate invoice type if provided
    if (dto.invoiceTypeId) {
      const invoiceType = await this.prisma.invoiceType.findUnique({
        where: { id: dto.invoiceTypeId },
      });
      if (!invoiceType) {
        throw new BadRequestException('Invoice type not found');
      }
    }

    // Build update data
    const updateData: Prisma.InvoiceUpdateInput = {
      needsReview: false,
    };

    if (dto.vendorId) updateData.vendor = { connect: { id: dto.vendorId } };
    if (dto.invoiceTypeId) updateData.invoiceType = { connect: { id: dto.invoiceTypeId } };
    if (dto.invoiceNumber) updateData.invoiceNumber = dto.invoiceNumber;
    if (dto.invoiceDate) updateData.invoiceDate = new Date(dto.invoiceDate);
    if (dto.dueDate) updateData.dueDate = new Date(dto.dueDate);
    if (dto.amount !== undefined) updateData.amount = dto.amount;
    if (dto.currency) updateData.currency = dto.currency;

    // Update invoice
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: updateData,
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true, code: true } },
        invoiceType: { select: { id: true, name: true } },
      },
    });

    // Log event
    await this.prisma.invoiceEvent.create({
      data: {
        invoiceId,
        eventType: InvoiceEventType.EXTRACTION_APPLIED,
        userId,
        notes: 'Extraction data applied to invoice',
        metadata: {
          appliedFields: Object.keys(dto),
          extractionId: invoice.lastExtractionId,
        },
      },
    });

    this.logger.log(`Extraction applied to invoice ${invoiceId}`);

    return updated;
  }

  /**
   * Retry extraction for an invoice
   */
  async retryExtraction(extractionId: string, userId: string) {
    const extraction = await this.prisma.invoiceExtraction.findUnique({
      where: { id: extractionId },
      include: {
        invoice: true,
        invoiceFile: true,
      },
    });

    if (!extraction) {
      throw new NotFoundException('Extraction not found');
    }

    // Trigger new extraction for the same file
    return this.extractInvoice(
      {
        invoiceId: extraction.invoiceId,
        fileId: extraction.invoiceFileId,
      },
      userId,
    );
  }

  /**
   * Get invoices needing review
   */
  async getInvoicesNeedingReview(pharmacyId?: string, orgId?: string) {
    const where: Prisma.InvoiceWhereInput = {
      needsReview: true,
      extractionStatus: ExtractionStatus.SUCCESS,
    };

    if (pharmacyId) {
      where.pharmacyId = pharmacyId;
    } else if (orgId) {
      where.pharmacy = { orgId };
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true, code: true } },
        invoiceType: { select: { id: true, name: true } },
        extractions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { extractedAt: 'desc' },
    });

    return invoices;
  }

  /**
   * Check if provider is configured
   */
  isProviderConfigured(): boolean {
    return this.aiProvider.isConfigured();
  }

  /**
   * Get provider info
   */
  getProviderInfo() {
    return {
      name: this.aiProvider.name,
      providerType: this.aiProvider.providerType,
      isConfigured: this.aiProvider.isConfigured(),
    };
  }

  /**
   * Get model name based on provider type
   */
  private getModelName(): string {
    switch (this.aiProvider.providerType) {
      case 'OPENAI':
        return process.env.OPENAI_MODEL || 'gpt-4o';
      case 'GEMINI':
        return process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      case 'ANTHROPIC':
        return process.env.ANTHROPIC_MODEL || 'claude-3-sonnet';
      default:
        return 'unknown';
    }
  }
}
