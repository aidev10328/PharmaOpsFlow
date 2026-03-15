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
import {
  IsOptional,
  IsUUID,
  IsString,
  IsDateString,
  IsNumber,
  MaxLength,
  Min,
} from 'class-validator';

export interface ExtractInvoiceDto {
  invoiceId: string;
  fileId?: string; // Optional: specific file to extract from
}

export interface UploadAndParseDto {
  pharmacyId: string;
  file: Express.Multer.File;
  userId: string;
}

export interface ExtractOnlyDto {
  pharmacyId: string;
  file: Express.Multer.File;
  userId: string;
}

export interface ExtractionWarning {
  type: 'pharmacy_mismatch' | 'date_anomaly' | 'type_mismatch' | 'vendor_unknown' | 'low_confidence' | 'missing_field';
  severity: 'error' | 'warning' | 'info';
  field?: string;
  message: string;
}

export interface ExtractOnlyResult {
  tempFilePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  extractedData: ExtractedInvoiceData | null;
  confidence: ExtractionConfidence | null;
  matchedVendorId?: string;
  matchedInvoiceTypeId?: string;
  vendors: any[];
  invoiceTypes: any[];
  warnings?: ExtractionWarning[];
}

export class ApplyExtractionDto {
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  invoiceTypeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
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
          select: { id: true, name: true },
        }),
        this.prisma.invoiceType.findMany({
          where: { isActive: true },
          select: { id: true, name: true, code: true },
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
   * Upload a file and parse it to create an invoice with extracted data
   * This is the main entry point for the "Upload Invoice" feature
   */
  async uploadAndParseInvoice(dto: UploadAndParseDto): Promise<{
    invoice: any;
    extraction: any;
    extractedData: any;
    confidence: any;
    matchedVendorId?: string;
    matchedInvoiceTypeId?: string;
    vendors: any[];
    invoiceTypes: any[];
  }> {
    const { pharmacyId, file, userId } = dto;

    // Check if AI provider is configured
    if (!this.aiProvider.isConfigured()) {
      throw new BadRequestException(
        `AI provider (${this.aiProvider.name}) is not configured. Please set the required environment variables.`,
      );
    }

    // Get pharmacy info
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { id: true, orgId: true, name: true },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    // Create a draft invoice
    const invoice = await this.prisma.invoice.create({
      data: {
        pharmacyId,
        status: 'DRAFT',
        entryMethod: 'AI_EXTRACTION',
        extractionStatus: ExtractionStatus.PENDING,
      },
    });

    this.logger.log(`Created draft invoice ${invoice.id} for upload-and-parse`);

    // Upload the file to storage
    const storagePath = `invoices/${invoice.id}/${Date.now()}-${file.originalname}`;
    await this.storageProvider.uploadFile({
      file: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      storagePath,
    });

    // Create file record
    const invoiceFile = await this.prisma.invoiceFile.create({
      data: {
        invoiceId: invoice.id,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
        uploadedByUserId: userId,
      },
    });

    // Log event
    await this.prisma.invoiceEvent.create({
      data: {
        invoiceId: invoice.id,
        eventType: InvoiceEventType.CREATED,
        userId,
        notes: 'Invoice created via upload-and-parse',
        metadata: { fileName: file.originalname },
      },
    });

    // Get model name
    const modelName = this.getModelName();

    // Create extraction record
    const extraction = await this.prisma.invoiceExtraction.create({
      data: {
        invoiceId: invoice.id,
        invoiceFileId: invoiceFile.id,
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
        storagePath,
        3600,
      );

      // Get known vendors and invoice types for context
      const [vendors, invoiceTypes] = await Promise.all([
        this.prisma.vendor.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        }),
        this.prisma.invoiceType.findMany({
          where: { isActive: true },
          select: { id: true, name: true, code: true },
        }),
      ]);

      // Build extraction context
      const context: ExtractionContext = {
        downloadUrl,
        mimeType: file.mimetype,
        fileName: file.originalname,
        orgContext: {
          orgId: pharmacy.orgId,
          orgName: pharmacy.name,
        },
        knownVendors: vendors,
        knownInvoiceTypes: invoiceTypes,
      };

      // Call AI provider
      const result = await this.aiProvider.extractInvoiceFromFile(context);

      // Match vendor and invoice type
      const vendorMatch = fuzzyMatchVendor(result.extracted.vendorName, vendors);
      const typeMatch = mapInvoiceType(result.extracted.invoiceType, invoiceTypes);

      // Update extraction record with results
      await this.prisma.invoiceExtraction.update({
        where: { id: extraction.id },
        data: {
          extractedJson: result.extracted as any,
          confidenceJson: result.confidence as any,
          rawText: result.rawText,
          status: ExtractionStatus.SUCCESS,
          processingMs: result.processingMs,
        },
      });

      // Update invoice with extraction status
      const updatedInvoice = await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          extractionStatus: ExtractionStatus.SUCCESS,
          extractedAt: new Date(),
          lastExtractionId: extraction.id,
        },
        include: {
          pharmacy: { select: { id: true, name: true, code: true } },
          files: true,
        },
      });

      // Log extraction completed
      await this.prisma.invoiceEvent.create({
        data: {
          invoiceId: invoice.id,
          eventType: InvoiceEventType.EXTRACTION_COMPLETED,
          userId,
          notes: 'AI extraction completed',
          metadata: {
            extractionId: extraction.id,
            processingMs: result.processingMs,
          },
        },
      });

      this.logger.log(`Upload-and-parse completed for invoice ${invoice.id}`);

      return {
        invoice: updatedInvoice,
        extraction,
        extractedData: result.extracted,
        confidence: result.confidence,
        matchedVendorId: vendorMatch?.vendorId,
        matchedInvoiceTypeId: typeMatch?.invoiceTypeId,
        vendors,
        invoiceTypes,
      };
    } catch (error) {
      this.logger.error(`Upload-and-parse extraction failed: ${error.message}`);

      // Update extraction and invoice status
      await this.prisma.invoiceExtraction.update({
        where: { id: extraction.id },
        data: {
          status: ExtractionStatus.FAILED,
          error: error.message,
        },
      });

      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          extractionStatus: ExtractionStatus.FAILED,
          lastExtractionId: extraction.id,
        },
      });

      // Log failure
      await this.prisma.invoiceEvent.create({
        data: {
          invoiceId: invoice.id,
          eventType: InvoiceEventType.EXTRACTION_FAILED,
          userId,
          notes: `AI extraction failed: ${error.message}`,
          metadata: { error: error.message },
        },
      });

      // Still return the invoice so user can manually fill data
      const failedInvoice = await this.prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          pharmacy: { select: { id: true, name: true, code: true } },
          files: true,
        },
      });

      const [vendors, invoiceTypes] = await Promise.all([
        this.prisma.vendor.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        }),
        this.prisma.invoiceType.findMany({
          where: { isActive: true },
          select: { id: true, name: true, code: true },
        }),
      ]);

      return {
        invoice: failedInvoice,
        extraction: null,
        extractedData: null,
        confidence: null,
        vendors,
        invoiceTypes,
      };
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
        vendor: { select: { id: true, name: true } },
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
  async getInvoicesNeedingReview(pharmacyId?: string, orgId?: string, assignedPharmacyIds?: string[]) {
    const where: Prisma.InvoiceWhereInput = {
      needsReview: true,
      extractionStatus: ExtractionStatus.SUCCESS,
    };

    if (pharmacyId) {
      where.pharmacyId = pharmacyId;
    } else if (assignedPharmacyIds) {
      where.pharmacyId = { in: assignedPharmacyIds };
    } else if (orgId) {
      where.pharmacy = { orgId };
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true } },
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

  /**
   * Extract invoice data from a file WITHOUT creating an invoice
   * The file is stored temporarily and can be used later when creating the invoice
   * This prevents orphaned draft invoices when users abandon the upload page
   */
  async extractOnly(dto: ExtractOnlyDto): Promise<ExtractOnlyResult> {
    const { pharmacyId, file } = dto;

    // Check if AI provider is configured
    if (!this.aiProvider.isConfigured()) {
      throw new BadRequestException(
        `AI provider (${this.aiProvider.name}) is not configured. Please set the required environment variables.`,
      );
    }

    // Get pharmacy info
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { id: true, orgId: true, name: true },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    // Upload the file to temporary storage (using a temp prefix)
    const tempFilePath = `temp-invoices/${pharmacyId}/${Date.now()}-${file.originalname}`;
    await this.storageProvider.uploadFile({
      file: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      storagePath: tempFilePath,
    });

    this.logger.log(`Uploaded temp file ${tempFilePath} for extract-only`);

    try {
      // Get signed download URL for the file
      const downloadUrl = await this.storageProvider.getSignedDownloadUrl(
        tempFilePath,
        3600,
      );

      // Get known vendors and invoice types for context
      const [vendors, invoiceTypes] = await Promise.all([
        this.prisma.vendor.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        }),
        this.prisma.invoiceType.findMany({
          where: { isActive: true },
          select: { id: true, name: true, code: true },
        }),
      ]);

      // Build extraction context
      const context: ExtractionContext = {
        downloadUrl,
        mimeType: file.mimetype,
        fileName: file.originalname,
        orgContext: {
          orgId: pharmacy.orgId,
          orgName: pharmacy.name,
        },
        knownVendors: vendors,
        knownInvoiceTypes: invoiceTypes,
      };

      // Call AI provider
      const result = await this.aiProvider.extractInvoiceFromFile(context);

      // Match vendor and invoice type
      const vendorMatch = fuzzyMatchVendor(result.extracted.vendorName, vendors);
      const typeMatch = mapInvoiceType(result.extracted.invoiceType, invoiceTypes);

      this.logger.log(`Extract-only completed for temp file ${tempFilePath}`);

      // Generate warnings based on extraction analysis
      const warnings: ExtractionWarning[] = this.generateExtractionWarnings(
        result.extracted,
        result.confidence,
        pharmacy.name,
        vendorMatch,
        typeMatch,
        vendors,
        invoiceTypes,
      );

      return {
        tempFilePath,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        extractedData: result.extracted,
        confidence: result.confidence,
        matchedVendorId: vendorMatch?.vendorId,
        matchedInvoiceTypeId: typeMatch?.invoiceTypeId,
        vendors,
        invoiceTypes,
        warnings,
      };
    } catch (error) {
      this.logger.error(`Extract-only failed: ${error.message}`);

      // Still return the file path so user can manually fill data
      const [vendors, invoiceTypes] = await Promise.all([
        this.prisma.vendor.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        }),
        this.prisma.invoiceType.findMany({
          where: { isActive: true },
          select: { id: true, name: true, code: true },
        }),
      ]);

      return {
        tempFilePath,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        extractedData: null,
        confidence: null,
        vendors,
        invoiceTypes,
      };
    }
  }

  /**
   * Generate warnings/observations from extracted data
   */
  private generateExtractionWarnings(
    extracted: ExtractedInvoiceData | null,
    confidence: ExtractionConfidence | null,
    pharmacyName: string,
    vendorMatch: any,
    typeMatch: any,
    vendors: any[],
    invoiceTypes: any[],
  ): ExtractionWarning[] {
    const warnings: ExtractionWarning[] = [];
    if (!extracted) return warnings;

    const now = new Date();

    // 1. Pharmacy mismatch — check if vendor name or payable-to mentions a different pharmacy
    if (extracted.vendorName) {
      const vn = extracted.vendorName.toLowerCase();
      const pn = pharmacyName.toLowerCase();
      // Check if extracted vendor name contains "pharmacy" and doesn't match the current pharmacy
      if (vn.includes('pharmacy') && !vn.includes(pn.split(' ')[0]?.toLowerCase())) {
        warnings.push({
          type: 'pharmacy_mismatch',
          severity: 'warning',
          field: 'vendorName',
          message: `Extracted vendor "${extracted.vendorName}" appears to be a pharmacy. This invoice is being uploaded to "${pharmacyName}" — please verify it belongs here.`,
        });
      }
    }
    // Also check payableTo
    if (extracted.payableTo) {
      const pt = extracted.payableTo.toLowerCase();
      const pn = pharmacyName.toLowerCase();
      if (pt.includes('pharmacy') && !pt.includes(pn.split(' ')[0]?.toLowerCase())) {
        warnings.push({
          type: 'pharmacy_mismatch',
          severity: 'warning',
          field: 'payableTo',
          message: `Payment is to "${extracted.payableTo}" which appears to be a different pharmacy than "${pharmacyName}".`,
        });
      }
    }

    // 2. Date anomalies
    if (extracted.invoiceDate) {
      const invDate = new Date(extracted.invoiceDate);
      if (!isNaN(invDate.getTime())) {
        const diffMonths = (now.getFullYear() - invDate.getFullYear()) * 12 + (now.getMonth() - invDate.getMonth());
        if (diffMonths > 6) {
          warnings.push({
            type: 'date_anomaly',
            severity: 'warning',
            field: 'invoiceDate',
            message: `Invoice date ${extracted.invoiceDate} is ${diffMonths} months in the past. The year might be incorrect — please verify.`,
          });
        } else if (diffMonths < -3) {
          warnings.push({
            type: 'date_anomaly',
            severity: 'warning',
            field: 'invoiceDate',
            message: `Invoice date ${extracted.invoiceDate} is ${Math.abs(diffMonths)} months in the future. Please verify this is correct.`,
          });
        }
        // Check if year seems wrong (e.g., 2020 when it should be 2026)
        if (Math.abs(invDate.getFullYear() - now.getFullYear()) >= 2) {
          warnings.push({
            type: 'date_anomaly',
            severity: 'error',
            field: 'invoiceDate',
            message: `Invoice date year is ${invDate.getFullYear()} but the current year is ${now.getFullYear()}. This is likely a parsing error — please correct the date.`,
          });
        }
      }
    }
    if (extracted.dueDate && extracted.dueDate !== 'DUE_UPON_RECEIPT') {
      const dueDate = new Date(extracted.dueDate);
      if (!isNaN(dueDate.getTime())) {
        const diffMonths = (now.getFullYear() - dueDate.getFullYear()) * 12 + (now.getMonth() - dueDate.getMonth());
        if (diffMonths > 6) {
          warnings.push({
            type: 'date_anomaly',
            severity: 'warning',
            field: 'dueDate',
            message: `Due date ${extracted.dueDate} is ${diffMonths} months in the past. Please verify.`,
          });
        }
        if (Math.abs(dueDate.getFullYear() - now.getFullYear()) >= 2) {
          warnings.push({
            type: 'date_anomaly',
            severity: 'error',
            field: 'dueDate',
            message: `Due date year is ${dueDate.getFullYear()} but the current year is ${now.getFullYear()}. This is likely a parsing error.`,
          });
        }
      }
    }

    // 3. Vendor not recognized
    if (extracted.vendorName && !vendorMatch?.vendorId) {
      warnings.push({
        type: 'vendor_unknown',
        severity: 'info',
        field: 'vendorName',
        message: `Vendor "${extracted.vendorName}" is not in the system. A new vendor will be created when this invoice is saved.`,
      });
    }

    // 4. Invoice type detection
    if (extracted.invoiceType && !typeMatch?.invoiceTypeId) {
      warnings.push({
        type: 'type_mismatch',
        severity: 'info',
        field: 'invoiceType',
        message: `Detected invoice type "${extracted.invoiceType}" does not match any existing type in the system. Please select the correct type.`,
      });
    }

    // 5. Low confidence warnings
    if (confidence) {
      const lowConfidenceFields: { field: string; label: string; value: number }[] = [];
      if (confidence.vendorName < 0.7) lowConfidenceFields.push({ field: 'vendorName', label: 'Vendor name', value: confidence.vendorName });
      if (confidence.invoiceNumber < 0.7) lowConfidenceFields.push({ field: 'invoiceNumber', label: 'Invoice number', value: confidence.invoiceNumber });
      if (confidence.invoiceDate < 0.7) lowConfidenceFields.push({ field: 'invoiceDate', label: 'Invoice date', value: confidence.invoiceDate });
      if (confidence.dueDate < 0.7) lowConfidenceFields.push({ field: 'dueDate', label: 'Due date', value: confidence.dueDate });
      if (confidence.amount < 0.7) lowConfidenceFields.push({ field: 'amount', label: 'Amount', value: confidence.amount });
      if (confidence.invoiceType < 0.5) lowConfidenceFields.push({ field: 'invoiceType', label: 'Invoice type', value: confidence.invoiceType });

      for (const lc of lowConfidenceFields) {
        warnings.push({
          type: 'low_confidence',
          severity: 'warning',
          field: lc.field,
          message: `${lc.label} extraction confidence is low (${Math.round(lc.value * 100)}%). Please verify this value.`,
        });
      }
    }

    // 6. Missing required fields
    const requiredFields: { field: string; label: string; value: any }[] = [
      { field: 'vendorName', label: 'Vendor name', value: extracted.vendorName },
      { field: 'invoiceNumber', label: 'Invoice number', value: extracted.invoiceNumber },
      { field: 'amount', label: 'Amount', value: extracted.amount },
      { field: 'invoiceDate', label: 'Invoice date', value: extracted.invoiceDate },
    ];
    for (const rf of requiredFields) {
      if (!rf.value) {
        warnings.push({
          type: 'missing_field',
          severity: 'error',
          field: rf.field,
          message: `${rf.label} could not be extracted from the document. Please enter it manually.`,
        });
      }
    }

    return warnings;
  }

  /**
   * Create an invoice from a temporary file (used after extractOnly)
   * Moves the file from temp storage to permanent storage and creates the invoice
   */
  async createInvoiceFromTempFile(params: {
    pharmacyId: string;
    tempFilePath: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    userId: string;
    invoiceData: {
      vendorId?: string;
      invoiceTypeId?: string;
      invoiceNumber?: string;
      accountNumber?: string;
      documentType?: 'INVOICE' | 'STATEMENT' | 'CREDIT_MEMO' | 'OTHER';
      invoiceDate?: string;
      dueDate?: string;
      amount?: number;
      currency?: string;
      description?: string;
      notes?: string;
    };
    submit?: boolean;
  }): Promise<any> {
    const { pharmacyId, tempFilePath, originalName, mimeType, sizeBytes, userId, invoiceData, submit } = params;

    // Check for duplicate invoice (same vendor + pharmacy + invoice number)
    // If existing is a DRAFT, update it instead of failing
    let invoice: any;
    let isUpdate = false;

    if (invoiceData.vendorId && invoiceData.invoiceNumber) {
      const existing = await this.prisma.invoice.findFirst({
        where: {
          pharmacyId,
          vendorId: invoiceData.vendorId,
          invoiceNumber: { equals: invoiceData.invoiceNumber, mode: 'insensitive' },
        },
      });
      if (existing) {
        if (existing.status === 'DRAFT') {
          // Update existing draft instead of creating a new one
          invoice = await this.prisma.invoice.update({
            where: { id: existing.id },
            data: {
              status: submit ? 'SUBMITTED' : 'DRAFT',
              invoiceTypeId: invoiceData.invoiceTypeId || existing.invoiceTypeId,
              invoiceDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : existing.invoiceDate,
              dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : existing.dueDate,
              amount: invoiceData.amount || existing.amount,
              description: invoiceData.description || existing.description,
              notes: invoiceData.notes || existing.notes,
            },
          });
          isUpdate = true;
          this.logger.log(`Updated existing draft invoice ${invoice.id} from temp file`);
        } else {
          throw new BadRequestException(
            `Invoice "${invoiceData.invoiceNumber}" from this vendor already exists and is not in draft status`,
          );
        }
      }
    }

    if (!invoice) {
      // Create new invoice
      invoice = await this.prisma.invoice.create({
        data: {
          pharmacyId,
          status: submit ? 'SUBMITTED' : 'DRAFT',
          entryMethod: 'AI_EXTRACTION',
          vendorId: invoiceData.vendorId || undefined,
          invoiceTypeId: invoiceData.invoiceTypeId || undefined,
          invoiceNumber: invoiceData.invoiceNumber || undefined,
          accountNumber: invoiceData.accountNumber || undefined,
          documentType: invoiceData.documentType || 'INVOICE',
          invoiceDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : undefined,
          dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : undefined,
          amount: invoiceData.amount || undefined,
          currency: invoiceData.currency || 'USD',
          description: invoiceData.description || undefined,
          notes: invoiceData.notes || undefined,
        },
      });
      this.logger.log(`Created invoice ${invoice.id} from temp file`);
    }

    // Move the file from temp storage to permanent storage
    const permanentPath = `invoices/${invoice.id}/${Date.now()}-${originalName}`;

    // Download from temp location and re-upload to permanent location
    try {
      const downloadUrl = await this.storageProvider.getSignedDownloadUrl(tempFilePath, 300);
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download temp file: ${response.statusText}`);
      }
      const fileBuffer = Buffer.from(await response.arrayBuffer());

      await this.storageProvider.uploadFile({
        file: fileBuffer,
        originalName,
        mimeType,
        storagePath: permanentPath,
      });

      // Delete temp file
      await this.storageProvider.deleteFile(tempFilePath);
    } catch (err) {
      this.logger.warn(`Failed to move temp file ${tempFilePath}: ${err.message}`);
      // Continue anyway - the file might still be usable from temp location
    }

    // Create file record
    await this.prisma.invoiceFile.create({
      data: {
        invoiceId: invoice.id,
        originalName,
        mimeType,
        sizeBytes,
        storagePath: permanentPath,
        uploadedByUserId: userId,
      },
    });

    // Log event
    await this.prisma.invoiceEvent.create({
      data: {
        invoiceId: invoice.id,
        eventType: isUpdate ? InvoiceEventType.UPDATED : InvoiceEventType.CREATED,
        userId,
        notes: isUpdate
          ? `Draft invoice updated${submit ? ' and submitted' : ''} with new file`
          : (submit ? 'Invoice created and submitted' : 'Invoice created as draft'),
        metadata: { fileName: originalName },
      },
    });

    if (submit) {
      await this.prisma.invoiceEvent.create({
        data: {
          invoiceId: invoice.id,
          eventType: InvoiceEventType.SUBMITTED,
          userId,
          notes: 'Invoice submitted for approval',
        },
      });
    }

    return this.prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true } },
        invoiceType: { select: { id: true, name: true } },
        files: true,
      },
    });
  }

  /**
   * Clean up old temporary files (called by cron job or manually)
   */
  async cleanupTempFiles(maxAgeMinutes: number = 60): Promise<{ deleted: number }> {
    // This would require listing files in temp-invoices/ and deleting old ones
    // Implementation depends on storage provider capabilities
    this.logger.log(`Temp file cleanup requested (maxAge: ${maxAgeMinutes} minutes)`);
    return { deleted: 0 }; // Placeholder - implement based on storage provider
  }
}
