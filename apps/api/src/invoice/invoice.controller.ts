import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, MemberRole } from '../common/enums/role.enum';
import { InvoiceService } from './invoice.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceQueryDto,
  InvoiceStatusDto,
} from './dto';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  /**
   * Create a new invoice
   * Pharmacy users can create invoices for their pharmacies
   */
  @Post()
  async create(@Body() dto: CreateInvoiceDto, @Request() req) {
    // Verify user has access to the pharmacy
    const hasAccess = await this.checkPharmacyAccess(
      req.user,
      dto.pharmacyId,
      [MemberRole.PHARMACY_ADMIN, MemberRole.PHARMACY_USER],
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to create invoices for this pharmacy');
    }
    return this.invoiceService.create(dto, req.user.id);
  }

  /**
   * Get all invoices (filtered by user access)
   */
  @Get()
  async findAll(@Query() query: InvoiceQueryDto, @Request() req) {
    return this.invoiceService.findAll(
      query,
      req.user.id,
      req.user.role,
      req.user.orgId,
    );
  }

  /**
   * Get pending approval invoices (managers only)
   */
  @Get('pending-approval')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async getPendingApproval(@Request() req) {
    if (req.user.role === Role.ADMIN) {
      // Admin can see all pending - for now just return empty or all
      return this.invoiceService.findAll(
        { status: 'SUBMITTED' as any },
        req.user.id,
        req.user.role,
      );
    }
    return this.invoiceService.getPendingApproval(req.user.orgId);
  }

  /**
   * Get invoice statistics
   */
  @Get('stats')
  async getStats(@Query('pharmacyId') pharmacyId: string, @Request() req) {
    if (pharmacyId) {
      const hasAccess = await this.checkPharmacyAccess(
        req.user,
        pharmacyId,
        [MemberRole.PHARMACY_ADMIN, MemberRole.PHARMACY_USER, MemberRole.READ_ONLY],
      );
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to this pharmacy');
      }
      return this.invoiceService.getStats(pharmacyId);
    }

    // Return org stats for managers
    if (req.user.role === Role.COMPANY_MANAGER) {
      return this.invoiceService.getStats(undefined, req.user.orgId);
    }

    // For admin, return all stats
    if (req.user.role === Role.ADMIN) {
      return this.invoiceService.getStats();
    }

    throw new ForbiddenException('Pharmacy ID required');
  }

  /**
   * Get vendors list
   */
  @Get('vendors')
  async getVendors() {
    return this.invoiceService.getVendors();
  }

  /**
   * Get invoice types list
   */
  @Get('types')
  async getInvoiceTypes() {
    return this.invoiceService.getInvoiceTypes();
  }

  /**
   * Get a single invoice
   */
  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    const hasAccess = await this.invoiceService.checkAccess(
      id,
      req.user.id,
      req.user.role,
      req.user.orgId,
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this invoice');
    }
    return this.invoiceService.findOne(id);
  }

  /**
   * Update an invoice (only in DRAFT or NEEDS_INFO status)
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @Request() req,
  ) {
    const invoice = await this.invoiceService.findOne(id);
    const hasAccess = await this.checkPharmacyAccess(
      req.user,
      invoice.pharmacyId,
      [MemberRole.PHARMACY_ADMIN, MemberRole.PHARMACY_USER],
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to update this invoice');
    }
    return this.invoiceService.update(id, dto, req.user.id);
  }

  /**
   * Submit invoice for approval
   */
  @Post(':id/submit')
  async submit(
    @Param('id') id: string,
    @Body() dto: InvoiceStatusDto,
    @Request() req,
  ) {
    const invoice = await this.invoiceService.findOne(id);
    const hasAccess = await this.checkPharmacyAccess(
      req.user,
      invoice.pharmacyId,
      [MemberRole.PHARMACY_ADMIN, MemberRole.PHARMACY_USER],
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to submit this invoice');
    }
    return this.invoiceService.submit(id, req.user.id, dto);
  }

  /**
   * Request more information (managers only)
   */
  @Post(':id/needs-info')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async needsInfo(
    @Param('id') id: string,
    @Body() dto: InvoiceStatusDto,
    @Request() req,
  ) {
    await this.validateManagerAccess(req, id);
    return this.invoiceService.needsInfo(id, req.user.id, dto);
  }

  /**
   * Approve invoice (managers only)
   */
  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async approve(
    @Param('id') id: string,
    @Body() dto: InvoiceStatusDto,
    @Request() req,
  ) {
    await this.validateManagerAccess(req, id);
    return this.invoiceService.approve(id, req.user.id, dto);
  }

  /**
   * Schedule payment (managers only)
   */
  @Post(':id/schedule')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async schedule(
    @Param('id') id: string,
    @Body() dto: InvoiceStatusDto,
    @Request() req,
  ) {
    await this.validateManagerAccess(req, id);
    return this.invoiceService.schedule(id, req.user.id, dto);
  }

  /**
   * Mark invoice as paid (managers only)
   */
  @Post(':id/paid')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async markPaid(
    @Param('id') id: string,
    @Body() dto: InvoiceStatusDto,
    @Request() req,
  ) {
    await this.validateManagerAccess(req, id);
    return this.invoiceService.markPaid(id, req.user.id, dto);
  }

  /**
   * Reject invoice (managers only)
   */
  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.COMPANY_MANAGER)
  async reject(
    @Param('id') id: string,
    @Body() dto: InvoiceStatusDto,
    @Request() req,
  ) {
    await this.validateManagerAccess(req, id);
    return this.invoiceService.reject(id, req.user.id, dto);
  }

  /**
   * Helper to check pharmacy access
   */
  private async checkPharmacyAccess(
    user: any,
    pharmacyId: string,
    allowedRoles: MemberRole[],
  ): Promise<boolean> {
    // Admin has full access
    if (user.role === Role.ADMIN) return true;

    // Check if manager has org access
    if (user.role === Role.COMPANY_MANAGER) {
      const pharmacy = await this.invoiceService['prisma'].pharmacy.findUnique({
        where: { id: pharmacyId },
        select: { orgId: true },
      });
      return pharmacy?.orgId === user.orgId;
    }

    // Check pharmacy membership
    const membership = await this.invoiceService['prisma'].pharmacyMember.findUnique({
      where: { userId_pharmacyId: { userId: user.id, pharmacyId } },
    });

    if (!membership) return false;
    return allowedRoles.includes(membership.memberRole as MemberRole);
  }

  /**
   * Helper to validate manager access to invoice's org
   */
  private async validateManagerAccess(req: any, invoiceId: string) {
    if (req.user.role === Role.ADMIN) return;

    const invoice = await this.invoiceService.findOne(invoiceId);
    if (req.user.orgId !== invoice.pharmacy.orgId) {
      throw new ForbiddenException('You do not have access to this invoice');
    }
  }
}
