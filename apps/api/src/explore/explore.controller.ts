import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { InvoiceQueryService } from '../query/invoice-query.service';
import { GroupByType, FilterChip } from '../query/dto/query.dto';
import { PrismaService } from '../prisma.service';

@Controller('explore')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.COMPANY_MANAGER)
export class ExploreController {
  constructor(
    private readonly queryService: InvoiceQueryService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get assigned pharmacy IDs for a COMPANY_MANAGER user
   */
  private async getManagerPharmacyIds(req: any): Promise<string[] | undefined> {
    if (req.user.role !== Role.COMPANY_MANAGER) return undefined;
    const assignments = await this.prisma.managerPharmacy.findMany({
      where: { userId: req.user.id },
      select: { pharmacyId: true },
    });
    return assignments.map((a) => a.pharmacyId);
  }

  /**
   * Search invoices with filters
   * GET /v1/explore/invoices
   */
  @Get('invoices')
  async searchInvoices(
    @Query('pharmacyId') pharmacyId: string,
    @Query('pharmacyCode') pharmacyCode: string,
    @Query('invoiceType') invoiceType: string,
    @Query('invoiceTypeId') invoiceTypeId: string,
    @Query('status') status: string, // comma-separated
    @Query('needsReview') needsReview: string,
    @Query('overdueOnly') overdueOnly: string,
    @Query('dueDateFrom') dueDateFrom: string,
    @Query('dueDateTo') dueDateTo: string,
    @Query('amountMin') amountMin: string,
    @Query('amountMax') amountMax: string,
    @Query('vendorId') vendorId: string,
    @Query('vendorNameContains') vendorNameContains: string,
    @Query('month') month: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('sortField') sortField: string,
    @Query('sortDirection') sortDirection: string,
    @Request() req,
  ) {
    const orgId = this.getOrgId(req);
    const assignedPharmacyIds = await this.getManagerPharmacyIds(req);

    // Build filters
    const filters = {
      orgId,
      assignedPharmacyIds,
      pharmacyId: pharmacyId || undefined,
      pharmacyCode: pharmacyCode || undefined,
      invoiceType: invoiceType || undefined,
      invoiceTypeId: invoiceTypeId || undefined,
      statusIn: status ? status.split(',') : undefined,
      needsReview: needsReview === 'true' ? true : needsReview === 'false' ? false : undefined,
      overdueOnly: overdueOnly === 'true',
      dueDateRange:
        dueDateFrom || dueDateTo
          ? { from: dueDateFrom, to: dueDateTo }
          : undefined,
      amountRange:
        amountMin || amountMax
          ? {
              min: amountMin ? parseFloat(amountMin) : undefined,
              max: amountMax ? parseFloat(amountMax) : undefined,
            }
          : undefined,
      vendorId: vendorId || undefined,
      vendorNameContains: vendorNameContains || undefined,
      month: month || undefined,
    };

    // Build pagination
    const pagination = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 100) : 20,
    };

    // Build sort
    const sort = sortField
      ? [
          {
            field: sortField as any,
            direction: (sortDirection || 'asc') as 'asc' | 'desc',
          },
        ]
      : undefined;

    const result = await this.queryService.searchInvoices(
      filters,
      pagination,
      sort,
    );

    // Generate filter chips for UI
    const filterChips = this.generateFilterChips(filters);

    return {
      ...result,
      filterChips,
    };
  }

  /**
   * Get invoice summary with grouping
   * GET /v1/explore/summary
   */
  @Get('summary')
  async getSummary(
    @Query('pharmacyId') pharmacyId: string,
    @Query('invoiceTypeId') invoiceTypeId: string,
    @Query('status') status: string,
    @Query('needsReview') needsReview: string,
    @Query('overdueOnly') overdueOnly: string,
    @Query('dueDateFrom') dueDateFrom: string,
    @Query('dueDateTo') dueDateTo: string,
    @Query('month') month: string,
    @Query('groupBy') groupBy: string,
    @Request() req,
  ) {
    const orgId = this.getOrgId(req);
    const assignedPharmacyIds = await this.getManagerPharmacyIds(req);

    const filters = {
      orgId,
      assignedPharmacyIds,
      pharmacyId: pharmacyId || undefined,
      invoiceTypeId: invoiceTypeId || undefined,
      statusIn: status ? status.split(',') : undefined,
      needsReview: needsReview === 'true' ? true : needsReview === 'false' ? false : undefined,
      overdueOnly: overdueOnly === 'true',
      dueDateRange:
        dueDateFrom || dueDateTo
          ? { from: dueDateFrom, to: dueDateTo }
          : undefined,
      month: month || undefined,
    };

    const validGroupBy = ['pharmacy', 'invoiceType', 'status', 'vendor'];
    const groupByValue = validGroupBy.includes(groupBy)
      ? (groupBy as GroupByType)
      : undefined;

    return this.queryService.summarizeInvoices(filters, groupByValue);
  }

  /**
   * Get SLA summary for a month
   * GET /v1/explore/sla
   */
  @Get('sla')
  async getSlaSummary(@Query('month') month: string, @Request() req) {
    const orgId = this.getOrgId(req);
    const assignedPharmacyIds = await this.getManagerPharmacyIds(req);

    if (!month) {
      // Default to current month
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.queryService.getSlaSummary(month, orgId, assignedPharmacyIds);
  }

  /**
   * Get invoice detail
   * GET /v1/explore/invoices/:id
   */
  @Get('invoices/:id')
  async getInvoiceDetail(@Query('id') invoiceId: string, @Request() req) {
    const orgId = this.getOrgId(req);
    return this.queryService.getInvoiceDetail(invoiceId, orgId);
  }

  /**
   * Get filter options (pharmacies, types, vendors)
   * GET /v1/explore/options
   */
  @Get('options')
  async getFilterOptions(@Request() req) {
    const orgId = this.getOrgId(req);
    const assignedPharmacyIds = await this.getManagerPharmacyIds(req);

    const [pharmacies, invoiceTypes, vendors, statuses] = await Promise.all([
      this.queryService.getPharmaciesForOrg(orgId, assignedPharmacyIds),
      this.queryService.getInvoiceTypes(),
      this.queryService.getVendors(),
      Promise.resolve([
        'DRAFT',
        'SUBMITTED',
        'NEEDS_INFO',
        'APPROVED',
        'SCHEDULED',
        'PAID',
        'REJECTED',
      ]),
    ]);

    return {
      pharmacies,
      invoiceTypes,
      vendors,
      statuses,
    };
  }

  /**
   * Get org ID from request, scoped appropriately
   */
  private getOrgId(req: any): string {
    if (req.user.role === Role.ADMIN) {
      // Admin can optionally filter by org
      return req.query?.orgId || req.user.orgId;
    }

    if (!req.user.orgId) {
      throw new ForbiddenException('User is not associated with an organization');
    }

    return req.user.orgId;
  }

  /**
   * Generate filter chips from filters for UI display
   */
  private generateFilterChips(filters: any): FilterChip[] {
    const chips: FilterChip[] = [];

    if (filters.pharmacyId) {
      chips.push({
        key: 'pharmacyId',
        label: 'Pharmacy',
        value: filters.pharmacyId,
        removable: true,
      });
    }

    if (filters.invoiceTypeId || filters.invoiceType) {
      chips.push({
        key: 'invoiceType',
        label: 'Type',
        value: filters.invoiceTypeId || filters.invoiceType,
        removable: true,
      });
    }

    if (filters.statusIn && filters.statusIn.length > 0) {
      chips.push({
        key: 'status',
        label: 'Status',
        value: filters.statusIn.join(', '),
        removable: true,
      });
    }

    if (filters.needsReview !== undefined) {
      chips.push({
        key: 'needsReview',
        label: 'Needs Review',
        value: filters.needsReview,
        removable: true,
      });
    }

    if (filters.overdueOnly) {
      chips.push({
        key: 'overdueOnly',
        label: 'Overdue',
        value: true,
        removable: true,
      });
    }

    if (filters.dueDateRange) {
      const { from, to } = filters.dueDateRange;
      if (from && to) {
        chips.push({
          key: 'dueDateRange',
          label: 'Due Date',
          value: `${from} to ${to}`,
          removable: true,
        });
      } else if (from) {
        chips.push({
          key: 'dueDateRange',
          label: 'Due After',
          value: from,
          removable: true,
        });
      } else if (to) {
        chips.push({
          key: 'dueDateRange',
          label: 'Due Before',
          value: to,
          removable: true,
        });
      }
    }

    if (filters.amountRange) {
      const { min, max } = filters.amountRange;
      if (min !== undefined && max !== undefined) {
        chips.push({
          key: 'amountRange',
          label: 'Amount',
          value: `$${min} - $${max}`,
          removable: true,
        });
      } else if (min !== undefined) {
        chips.push({
          key: 'amountRange',
          label: 'Min Amount',
          value: `$${min}+`,
          removable: true,
        });
      } else if (max !== undefined) {
        chips.push({
          key: 'amountRange',
          label: 'Max Amount',
          value: `up to $${max}`,
          removable: true,
        });
      }
    }

    if (filters.vendorId || filters.vendorNameContains) {
      chips.push({
        key: 'vendor',
        label: 'Vendor',
        value: filters.vendorId || filters.vendorNameContains,
        removable: true,
      });
    }

    if (filters.month) {
      chips.push({
        key: 'month',
        label: 'Month',
        value: filters.month,
        removable: true,
      });
    }

    return chips;
  }
}
