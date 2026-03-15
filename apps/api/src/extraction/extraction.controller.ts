import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Request,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, MemberRole } from '../common/enums/role.enum';
import { ExtractionService, ApplyExtractionDto } from './extraction.service';
import { PrismaService } from '../prisma.service';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsUUID,
} from 'class-validator';

class TriggerExtractionDto {
  @IsOptional()
  @IsString()
  fileId?: string;
}

class WebhookExtractionDto {
  @IsString()
  invoiceId: string;

  @IsOptional()
  @IsString()
  fileId?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;
}

class CreateFromTempDto {
  @IsString()
  tempFilePath: string;

  @IsString()
  originalName: string;

  @IsString()
  mimeType: string;

  @IsNumber()
  sizeBytes: number;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsString()
  vendorName?: string;

  @IsOptional()
  @IsUUID()
  invoiceTypeId?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;

  @IsOptional()
  @IsUUID()
  pharmacyId?: string;

  @IsOptional()
  @IsUUID()
  instanceId?: string;
}

@Controller('extraction')
@UseGuards(JwtAuthGuard)
export class ExtractionController {
  constructor(
    private readonly extractionService: ExtractionService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get provider status and info
   */
  @Get('status')
  async getStatus() {
    return this.extractionService.getProviderInfo();
  }

  /**
   * Extract invoice data WITHOUT creating an invoice (new preferred method)
   * POST /extraction/extract-only
   * Uploads file to temp storage, extracts data, returns results
   * No invoice is created - prevents orphaned drafts when users abandon the page
   */
  @Post('extract-only')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  )
  async extractOnly(
    @UploadedFile() file: Express.Multer.File,
    @Body('pharmacyId') pharmacyId: string,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!pharmacyId) {
      throw new BadRequestException('Pharmacy ID is required');
    }

    // Check pharmacy access
    const hasAccess = await this.checkPharmacyAccess(req.user, pharmacyId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this pharmacy');
    }

    return this.extractionService.extractOnly({
      pharmacyId,
      file,
      userId: req.user.id,
    });
  }

  /**
   * Create invoice from a previously uploaded temp file
   * POST /extraction/create-from-temp
   * Creates the actual invoice after user reviews and confirms the data
   */
  @Post('create-from-temp')
  async createFromTemp(
    @Body() dto: CreateFromTempDto,
    @Request() req,
  ) {
    const pharmacyId = dto.pharmacyId;

    if (!pharmacyId) {
      throw new BadRequestException('Pharmacy ID is required');
    }

    if (!dto.tempFilePath) {
      throw new BadRequestException('Temp file path is required');
    }

    // Check pharmacy access
    const hasAccess = await this.checkPharmacyAccess(req.user, pharmacyId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this pharmacy');
    }

    // Auto-create vendor if vendorName provided but no vendorId
    let resolvedVendorId = dto.vendorId;
    if (!resolvedVendorId && dto.vendorName?.trim()) {
      const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { orgId: true } });
      if (pharmacy) {
        // Check if vendor with same name already exists (case-insensitive) — active or pending
        const existingVendor = await this.prisma.vendor.findFirst({
          where: {
            orgId: pharmacy.orgId,
            name: { equals: dto.vendorName.trim(), mode: 'insensitive' },
          },
        });
        if (existingVendor) {
          resolvedVendorId = existingVendor.id;
        } else {
          // Create vendor as pending (isActive=false) for draft invoices, active for submitted
          const newVendor = await this.prisma.vendor.create({
            data: {
              orgId: pharmacy.orgId,
              name: dto.vendorName.trim(),
              isActive: !!dto.submit,
            },
          });
          resolvedVendorId = newVendor.id;
        }
      }
    }

    const result = await this.extractionService.createInvoiceFromTempFile({
      pharmacyId,
      tempFilePath: dto.tempFilePath,
      originalName: dto.originalName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      userId: req.user.id,
      invoiceData: {
        vendorId: resolvedVendorId,
        invoiceTypeId: dto.invoiceTypeId,
        invoiceNumber: dto.invoiceNumber,
        accountNumber: dto.accountNumber,
        invoiceDate: dto.invoiceDate,
        dueDate: dto.dueDate,
        amount: dto.amount,
        currency: dto.currency,
        notes: dto.notes,
      },
      submit: dto.submit,
    });

    // Link to requirement instance if provided
    if (dto.instanceId && result?.id) {
      try {
        await this.prisma.requirementInstance.update({
          where: { id: dto.instanceId },
          data: {
            invoiceId: result.id,
            status: dto.submit ? 'SUBMITTED' : 'PENDING',
            submittedAt: dto.submit ? new Date() : null,
            lastEvaluatedAt: new Date(),
          },
        });
      } catch {
        // Don't fail invoice creation if linking fails
      }
    }

    return result;
  }

  /**
   * Bulk extract: accept multiple files, extract each, match to pending instances
   * POST /extraction/bulk-extract
   */
  @Post('bulk-extract')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async bulkExtract(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('pharmacyId') pharmacyId: string,
    @Request() req,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }
    if (!pharmacyId) {
      throw new BadRequestException('Pharmacy ID is required');
    }

    const hasAccess = await this.checkPharmacyAccess(req.user, pharmacyId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this pharmacy');
    }

    // Get pending instances for this pharmacy (all periods, not just current month)
    const pendingInstances = await this.prisma.requirementInstance.findMany({
      where: {
        requirement: { pharmacyId, isActive: true },
        status: { in: ['PENDING', 'OVERDUE'] },
      },
      include: {
        requirement: {
          include: {
            vendor: { select: { id: true, name: true } },
            invoiceType: { select: { id: true, name: true } },
          },
        },
        invoice: { select: { id: true } },
      },
      orderBy: { submissionDeadline: 'asc' },
    });

    // Check for existing invoices in this pharmacy (for duplicate + amount anomaly detection)
    const existingInvoices = await this.prisma.invoice.findMany({
      where: { pharmacyId, status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED', 'SCHEDULED', 'PAID'] } },
      select: { invoiceNumber: true, vendorId: true, amount: true, invoiceDate: true, status: true, vendor: { select: { name: true } } },
    });

    // Build historical average amounts per vendor for anomaly detection
    const vendorAmountHistory: Record<string, number[]> = {};
    for (const inv of existingInvoices) {
      if (inv.vendorId && inv.amount) {
        if (!vendorAmountHistory[inv.vendorId]) vendorAmountHistory[inv.vendorId] = [];
        vendorAmountHistory[inv.vendorId].push(Number(inv.amount));
      }
    }

    // Helper: check if invoice date falls within an instance's period
    const isDateInPeriod = (dateStr: string | null | undefined, inst: typeof pendingInstances[number]): boolean => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= inst.periodStart && d <= inst.periodEnd;
    };

    // Helper: check if vendor matches (by ID or name contains)
    const isVendorMatch = (vendorId: string | null | undefined, vendorName: string | null | undefined, inst: typeof pendingInstances[number]): boolean => {
      if (vendorId && inst.requirement.vendorId === vendorId) return true;
      if (vendorName && inst.requirement.vendor?.name) {
        const a = vendorName.toLowerCase();
        const b = inst.requirement.vendor.name.toLowerCase();
        if (a.includes(b) || b.includes(a)) return true;
      }
      return false;
    };

    // Helper: check if description/name matches requirement name or invoice type
    const isDescriptionMatch = (vendorName: string | null | undefined, extractedData: any, inst: typeof pendingInstances[number]): boolean => {
      const reqName = inst.requirement.name?.toLowerCase() || '';
      const reqDesc = inst.requirement.description?.toLowerCase() || '';
      const typeName = inst.requirement.invoiceType?.name?.toLowerCase() || '';
      const extractedVendor = (vendorName || '').toLowerCase();
      // Check if extracted vendor name or any extracted text has overlap with requirement name/desc/type
      const candidates = [extractedVendor];
      if (extractedData?.description) candidates.push(extractedData.description.toLowerCase());
      for (const text of candidates) {
        if (!text) continue;
        const words = text.split(/\s+/).filter((w: string) => w.length > 3);
        for (const word of words) {
          if (reqName.includes(word) || reqDesc.includes(word) || typeName.includes(word)) return true;
        }
        // Also check if requirement name words appear in extracted text
        const reqWords = reqName.split(/\s+/).filter((w: string) => w.length > 3);
        for (const word of reqWords) {
          if (text.includes(word)) return true;
        }
      }
      return false;
    };

    // Helper: check if vendors match by ID or name
    const vendorsMatch = (vid: string | null | undefined, vname: string | null | undefined, existing: typeof existingInvoices[number]): boolean => {
      if (vid && existing.vendorId === vid) return true;
      if (vname && existing.vendor?.name) {
        const a = vname.toLowerCase();
        const b = existing.vendor.name.toLowerCase();
        if (a === b || a.includes(b) || b.includes(a)) return true;
      }
      return false;
    };

    // Helper: check duplicate — multiple signals: invoice number, vendor+date, vendor+amount
    const isDuplicateCheck = (vendorId: string | null | undefined, vendorName: string | null | undefined, invoiceNumber: string | null | undefined, invoiceDate: string | null | undefined, amount: number | null | undefined): boolean => {
      return existingInvoices.some(e => {
        const vendorMatches = vendorsMatch(vendorId, vendorName, e);

        // Signal 1: Same invoice number — always flag as duplicate
        // Same invoice number in the same pharmacy is almost certainly a duplicate
        if (invoiceNumber && e.invoiceNumber) {
          const a = invoiceNumber.toLowerCase().trim();
          const b = e.invoiceNumber.toLowerCase().trim();
          if (a === b) return true;
        }

        // Signal 2: Same vendor + same invoice date + similar amount
        if (vendorMatches && invoiceDate && e.invoiceDate) {
          const extDate = new Date(invoiceDate).toISOString().slice(0, 10);
          const existDate = new Date(e.invoiceDate).toISOString().slice(0, 10);
          if (extDate === existDate) {
            // Same vendor + same date = likely duplicate
            if (amount && e.amount && Math.abs(Number(e.amount) - amount) < 0.01) return true;
            // Same vendor + same date + same invoice number
            if (invoiceNumber && e.invoiceNumber && invoiceNumber.toLowerCase().trim() === e.invoiceNumber.toLowerCase().trim()) return true;
          }
        }

        // Signal 3: Same vendor + same amount + dates within 3 days
        if (vendorMatches && amount && e.amount && Math.abs(Number(e.amount) - amount) < 0.01 && invoiceDate && e.invoiceDate) {
          const daysDiff = Math.abs(new Date(invoiceDate).getTime() - new Date(e.invoiceDate).getTime()) / (1000 * 60 * 60 * 24);
          if (daysDiff <= 3) return true;
        }

        return false;
      });
    };

    // Helper: check amount anomaly (> 3x or < 0.2x the average for this vendor)
    const checkAmountAnomaly = (vendorId: string | null | undefined, amount: number | null | undefined): { isAnomaly: boolean; avgAmount?: number; message?: string } => {
      if (!vendorId || !amount || !vendorAmountHistory[vendorId] || vendorAmountHistory[vendorId].length < 2) {
        return { isAnomaly: false };
      }
      const history = vendorAmountHistory[vendorId];
      const avg = history.reduce((s, v) => s + v, 0) / history.length;
      if (avg === 0) return { isAnomaly: false };
      const ratio = amount / avg;
      if (ratio > 3) {
        return { isAnomaly: true, avgAmount: Math.round(avg * 100) / 100, message: `Amount $${amount} is ${ratio.toFixed(1)}x higher than average $${avg.toFixed(2)} for this vendor` };
      }
      if (ratio < 0.2) {
        return { isAnomaly: true, avgAmount: Math.round(avg * 100) / 100, message: `Amount $${amount} is much lower than average $${avg.toFixed(2)} for this vendor` };
      }
      return { isAnomaly: false, avgAmount: Math.round(avg * 100) / 100 };
    };

    // Extract each file
    const results: any[] = [];
    for (const file of files) {
      try {
        const extraction = await this.extractionService.extractOnly({
          pharmacyId,
          file,
          userId: req.user.id,
        });

        const invoiceDate = extraction.extractedData?.invoiceDate;
        const vendorId = extraction.matchedVendorId;
        const vendorName = extraction.extractedData?.vendorName;
        const invoiceNumber = extraction.extractedData?.invoiceNumber;
        const amount = extraction.extractedData?.amount;

        // Check for duplicate
        const duplicate = isDuplicateCheck(vendorId, vendorName, invoiceNumber, invoiceDate, amount);

        // Check amount anomaly
        const amountAnomaly = checkAmountAnomaly(vendorId, amount);

        // Find best matching instance
        let matchedInstance: typeof pendingInstances[number] | null = null;
        let matchConfidence: 'high' | 'medium' | 'low' | 'none' = 'none';
        let dateInPeriod = false;
        let descMatch = false;

        // Try to match against pending instances
        for (const inst of pendingInstances) {
          if (results.some(r => r.matchedInstance?.id === inst.id)) continue;
          if (inst.invoice) continue;

          const vMatch = isVendorMatch(vendorId, vendorName, inst);
          const dMatch = isDateInPeriod(invoiceDate, inst);
          const typeMatch = extraction.matchedInvoiceTypeId &&
            inst.requirement.invoiceTypeId === extraction.matchedInvoiceTypeId;
          const dscMatch = isDescriptionMatch(vendorName, extraction.extractedData, inst);

          // Best: vendor + date in period + type
          if (vMatch && dMatch && typeMatch) {
            matchedInstance = inst;
            matchConfidence = 'high';
            dateInPeriod = true;
            descMatch = dscMatch;
            break;
          }
          // Good: vendor + date in period
          if (vMatch && dMatch && (matchConfidence === 'none' || matchConfidence === 'low')) {
            matchedInstance = inst;
            matchConfidence = 'high';
            dateInPeriod = true;
            descMatch = dscMatch;
          }
          // Medium: vendor matches but date doesn't fall in period
          if (vMatch && !dMatch && (matchConfidence === 'none' || matchConfidence === 'low')) {
            matchedInstance = inst;
            matchConfidence = 'medium';
            dateInPeriod = false;
            descMatch = dscMatch;
          }
          // Low: no vendor match but description/type matches
          if (!vMatch && dscMatch && matchConfidence === 'none') {
            matchedInstance = inst;
            matchConfidence = 'low';
            dateInPeriod = dMatch;
            descMatch = true;
          }
        }

        // Determine category:
        // 1 = "current_match" - vendor + dates match current period instance
        // 2 = "vendor_match_diff_dates" - vendor matches but dates are past/future
        // 3 = "type_match_no_vendor" - description/type matches a requirement but vendor doesn't
        // 4 = "new_same_month" - no match but invoice date is current month
        // 5 = "no_match" - nothing matches or duplicate
        let category: 'current_match' | 'vendor_match_diff_dates' | 'type_match_no_vendor' | 'new_same_month' | 'no_match';

        if (duplicate) {
          category = 'no_match';
        } else if (matchedInstance && (matchConfidence === 'high') && dateInPeriod) {
          category = 'current_match';
        } else if (matchedInstance && matchConfidence === 'medium') {
          category = 'vendor_match_diff_dates';
        } else if (matchedInstance && matchConfidence === 'high' && !dateInPeriod) {
          // vendor matched but date didn't fall in period (shouldn't normally happen but handle it)
          category = 'vendor_match_diff_dates';
        } else if (matchedInstance && matchConfidence === 'low' && descMatch) {
          category = 'type_match_no_vendor';
        } else {
          const now = new Date();
          const invDate = invoiceDate ? new Date(invoiceDate) : null;
          const isCurrentMonth = invDate &&
            invDate.getMonth() === now.getMonth() &&
            invDate.getFullYear() === now.getFullYear();
          category = isCurrentMonth ? 'new_same_month' : 'no_match';
        }

        results.push({
          fileName: file.originalname,
          tempFilePath: extraction.tempFilePath,
          originalName: extraction.originalName,
          mimeType: extraction.mimeType,
          sizeBytes: extraction.sizeBytes,
          extractedData: extraction.extractedData,
          confidence: extraction.confidence,
          matchedVendorId: extraction.matchedVendorId,
          matchedInvoiceTypeId: extraction.matchedInvoiceTypeId,
          matchedInstance: matchedInstance ? {
            id: matchedInstance.id,
            requirementName: matchedInstance.requirement.name,
            vendorName: matchedInstance.requirement.vendor?.name || null,
            invoiceTypeName: matchedInstance.requirement.invoiceType?.name || null,
            periodLabel: matchedInstance.periodLabel,
            periodStart: matchedInstance.periodStart,
            periodEnd: matchedInstance.periodEnd,
            submissionDeadline: matchedInstance.submissionDeadline,
            alreadyHasInvoice: !!matchedInstance.invoice,
          } : null,
          matchConfidence,
          category,
          isDuplicate: duplicate,
          amountAnomaly: amountAnomaly.isAnomaly ? amountAnomaly.message : null,
          avgAmount: amountAnomaly.avgAmount || null,
          error: null,
        });
      } catch (err: any) {
        results.push({
          fileName: file.originalname,
          tempFilePath: null,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          extractedData: null,
          confidence: null,
          matchedVendorId: null,
          matchedInvoiceTypeId: null,
          matchedInstance: null,
          matchConfidence: 'none',
          category: 'no_match',
          isDuplicate: false,
          amountAnomaly: null,
          avgAmount: null,
          error: err.message || 'Extraction failed',
        });
      }
    }

    // Post-processing: detect multiple files from same vendor in this batch
    const vendorFileCounts: Record<string, number> = {};
    for (const r of results) {
      const vid = r.matchedVendorId || r.extractedData?.vendorName?.toLowerCase();
      if (vid) {
        vendorFileCounts[vid] = (vendorFileCounts[vid] || 0) + 1;
      }
    }
    for (const r of results) {
      const vid = r.matchedVendorId || r.extractedData?.vendorName?.toLowerCase();
      r.multiSameVendor = vid && vendorFileCounts[vid] > 1
        ? `${vendorFileCounts[vid]} invoices from this vendor in this batch`
        : null;
    }

    // Group pending instances by period for the frontend dropdown
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const availableInstances = pendingInstances
      .filter(i => !i.invoice)
      .map(i => {
        const pStart = new Date(i.periodStart);
        const monthDiff = (pStart.getFullYear() - currentYear) * 12 + (pStart.getMonth() - currentMonth);
        return {
          id: i.id,
          requirementName: i.requirement.name,
          vendorName: i.requirement.vendor?.name || null,
          invoiceTypeName: i.requirement.invoiceType?.name || null,
          periodLabel: i.periodLabel,
          periodStart: i.periodStart,
          periodEnd: i.periodEnd,
          submissionDeadline: i.submissionDeadline,
          monthDiff, // negative = past, 0 = current, positive = future
        };
      })
      // Limit to 2 months past and 2 months future
      .filter(i => i.monthDiff >= -2 && i.monthDiff <= 2);

    return {
      results,
      pendingInstances: availableInstances,
    };
  }

  /**
   * Upload and parse invoice document (DEPRECATED - use extract-only instead)
   * POST /extraction/upload-and-parse
   * Creates a draft invoice, uploads the file, and extracts data
   * @deprecated Use /extraction/extract-only and /extraction/create-from-temp instead
   */
  @Post('upload-and-parse')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  )
  async uploadAndParse(
    @UploadedFile() file: Express.Multer.File,
    @Body('pharmacyId') pharmacyId: string,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!pharmacyId) {
      throw new BadRequestException('Pharmacy ID is required');
    }

    // Check pharmacy access
    const hasAccess = await this.checkPharmacyAccess(req.user, pharmacyId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this pharmacy');
    }

    return this.extractionService.uploadAndParseInvoice({
      pharmacyId,
      file,
      userId: req.user.id,
    });
  }

  /**
   * Trigger extraction for an invoice
   * POST /v1/invoices/:id/extract
   */
  @Post('/invoices/:id/extract')
  async extractInvoice(
    @Param('id') invoiceId: string,
    @Body() dto: TriggerExtractionDto,
    @Request() req,
  ) {
    // Check access
    const hasAccess = await this.checkInvoiceAccess(
      req.user,
      invoiceId,
      [MemberRole.PHARMACY_ADMIN, MemberRole.PHARMACY_USER],
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to extract this invoice');
    }

    return this.extractionService.extractInvoice(
      { invoiceId, fileId: dto.fileId },
      req.user.id,
    );
  }

  /**
   * Get latest extraction for an invoice
   * GET /v1/invoices/:id/extraction
   */
  @Get('/invoices/:id/extraction')
  async getExtraction(@Param('id') invoiceId: string, @Request() req) {
    const hasAccess = await this.checkInvoiceAccess(
      req.user,
      invoiceId,
      [MemberRole.PHARMACY_ADMIN, MemberRole.PHARMACY_USER, MemberRole.READ_ONLY],
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this invoice');
    }

    const extraction = await this.extractionService.getLatestExtraction(invoiceId);
    if (!extraction) {
      return { extraction: null, message: 'No extraction found for this invoice' };
    }
    return { extraction };
  }

  /**
   * Get extraction history for an invoice
   * GET /v1/invoices/:id/extractions
   */
  @Get('/invoices/:id/extractions')
  async getExtractionHistory(@Param('id') invoiceId: string, @Request() req) {
    const hasAccess = await this.checkInvoiceAccess(
      req.user,
      invoiceId,
      [MemberRole.PHARMACY_ADMIN, MemberRole.PHARMACY_USER, MemberRole.READ_ONLY],
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this invoice');
    }

    const extractions = await this.extractionService.getExtractionHistory(invoiceId);
    return { extractions };
  }

  /**
   * Apply extraction data to an invoice
   * POST /v1/invoices/:id/apply-extraction
   */
  @Post('/invoices/:id/apply-extraction')
  async applyExtraction(
    @Param('id') invoiceId: string,
    @Body() dto: ApplyExtractionDto,
    @Request() req,
  ) {
    const hasAccess = await this.checkInvoiceAccess(
      req.user,
      invoiceId,
      [MemberRole.PHARMACY_ADMIN, MemberRole.PHARMACY_USER],
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to update this invoice');
    }

    return this.extractionService.applyExtraction(invoiceId, dto, req.user.id);
  }

  /**
   * Retry an extraction
   * POST /v1/invoice-extractions/:id/retry
   */
  @Post('/invoice-extractions/:id/retry')
  async retryExtraction(@Param('id') extractionId: string, @Request() req) {
    // Get the extraction to check invoice access
    const extraction = await this.prisma.invoiceExtraction.findUnique({
      where: { id: extractionId },
      include: { invoice: { select: { id: true, pharmacyId: true } } },
    });

    if (!extraction) {
      throw new BadRequestException('Extraction not found');
    }

    const hasAccess = await this.checkInvoiceAccess(
      req.user,
      extraction.invoiceId,
      [MemberRole.PHARMACY_ADMIN, MemberRole.PHARMACY_USER],
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to retry this extraction');
    }

    return this.extractionService.retryExtraction(extractionId, req.user.id);
  }

  /**
   * Get invoices needing review
   * GET /v1/extraction/needs-review
   */
  @Get('needs-review')
  async getInvoicesNeedingReview(
    @Query('pharmacyId') pharmacyId: string,
    @Request() req,
  ) {
    // Admin can see all
    if (req.user.role === Role.ADMIN) {
      return this.extractionService.getInvoicesNeedingReview(pharmacyId);
    }

    // Company manager can see assigned pharmacies
    if (req.user.role === Role.COMPANY_MANAGER) {
      if (pharmacyId) {
        const assignment = await this.prisma.managerPharmacy.findUnique({
          where: { userId_pharmacyId: { userId: req.user.id, pharmacyId } },
        });
        if (!assignment) {
          throw new ForbiddenException('You do not have access to this pharmacy');
        }
        return this.extractionService.getInvoicesNeedingReview(pharmacyId);
      }
      // Get all assigned pharmacy IDs for review
      const assignments = await this.prisma.managerPharmacy.findMany({
        where: { userId: req.user.id },
        select: { pharmacyId: true },
      });
      return this.extractionService.getInvoicesNeedingReview(undefined, req.user.orgId, assignments.map(a => a.pharmacyId));
    }

    // Pharmacy users can see their pharmacies
    if (pharmacyId) {
      const hasAccess = await this.checkPharmacyMembership(req.user.id, pharmacyId);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to this pharmacy');
      }
      return this.extractionService.getInvoicesNeedingReview(pharmacyId);
    }

    // Get all pharmacies user has access to
    const memberships = await this.prisma.pharmacyMember.findMany({
      where: { userId: req.user.id },
      select: { pharmacyId: true },
    });

    if (memberships.length === 0) {
      return [];
    }

    // Return invoices for first pharmacy (user should specify)
    return this.extractionService.getInvoicesNeedingReview(memberships[0].pharmacyId);
  }

  /**
   * Webhook endpoint for n8n to trigger extraction
   * POST /v1/extraction/webhook
   */
  @Post('webhook')
  async webhookExtract(@Body() dto: WebhookExtractionDto, @Request() req) {
    // Verify webhook secret if configured
    const configuredSecret = process.env.EXTRACTION_WEBHOOK_SECRET;
    if (configuredSecret && dto.webhookSecret !== configuredSecret) {
      throw new ForbiddenException('Invalid webhook secret');
    }

    return this.extractionService.extractInvoice(
      { invoiceId: dto.invoiceId, fileId: dto.fileId },
      req.user?.id,
    );
  }

  /**
   * Helper to check invoice access
   */
  private async checkInvoiceAccess(
    user: any,
    invoiceId: string,
    allowedRoles: MemberRole[],
  ): Promise<boolean> {
    // Admin has full access
    if (user.role === Role.ADMIN) return true;

    // Get invoice with pharmacy
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { pharmacyId: true, pharmacy: { select: { orgId: true } } },
    });

    if (!invoice) return false;

    // Check if manager is assigned to this pharmacy
    if (user.role === Role.COMPANY_MANAGER) {
      const assignment = await this.prisma.managerPharmacy.findUnique({
        where: { userId_pharmacyId: { userId: user.id, pharmacyId: invoice.pharmacyId } },
      });
      return !!assignment;
    }

    // Check pharmacy membership
    const membership = await this.prisma.pharmacyMember.findUnique({
      where: { userId_pharmacyId: { userId: user.id, pharmacyId: invoice.pharmacyId } },
    });

    if (!membership) return false;
    return allowedRoles.includes(membership.memberRole as MemberRole);
  }

  /**
   * Helper to check pharmacy membership
   */
  private async checkPharmacyMembership(
    userId: string,
    pharmacyId: string,
  ): Promise<boolean> {
    const membership = await this.prisma.pharmacyMember.findUnique({
      where: { userId_pharmacyId: { userId, pharmacyId } },
    });
    return membership !== null;
  }

  /**
   * Helper to check pharmacy access for upload
   */
  private async checkPharmacyAccess(user: any, pharmacyId: string): Promise<boolean> {
    // Admin has full access
    if (user.role === Role.ADMIN) return true;

    // Get pharmacy
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { orgId: true },
    });

    if (!pharmacy) return false;

    // Check if manager is assigned to this pharmacy
    if (user.role === Role.COMPANY_MANAGER) {
      const assignment = await this.prisma.managerPharmacy.findUnique({
        where: { userId_pharmacyId: { userId: user.id, pharmacyId } },
      });
      return !!assignment;
    }

    // Check pharmacy membership
    const membership = await this.prisma.pharmacyMember.findUnique({
      where: { userId_pharmacyId: { userId: user.id, pharmacyId } },
    });

    if (!membership) return false;
    return [MemberRole.PHARMACY_ADMIN, MemberRole.PHARMACY_USER].includes(
      membership.memberRole as MemberRole,
    );
  }
}
