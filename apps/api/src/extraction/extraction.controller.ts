import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, MemberRole } from '../common/enums/role.enum';
import { ExtractionService, ApplyExtractionDto } from './extraction.service';
import { PrismaService } from '../prisma.service';

class TriggerExtractionDto {
  fileId?: string;
}

class WebhookExtractionDto {
  invoiceId: string;
  fileId?: string;
  webhookSecret?: string;
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

    // Company manager can see org-wide
    if (req.user.role === Role.COMPANY_MANAGER) {
      if (pharmacyId) {
        // Verify pharmacy is in their org
        const pharmacy = await this.prisma.pharmacy.findUnique({
          where: { id: pharmacyId },
          select: { orgId: true },
        });
        if (pharmacy?.orgId !== req.user.orgId) {
          throw new ForbiddenException('You do not have access to this pharmacy');
        }
        return this.extractionService.getInvoicesNeedingReview(pharmacyId);
      }
      return this.extractionService.getInvoicesNeedingReview(undefined, req.user.orgId);
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

    // Check if manager has org access
    if (user.role === Role.COMPANY_MANAGER) {
      return invoice.pharmacy.orgId === user.orgId;
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
}
