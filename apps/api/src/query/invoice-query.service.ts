import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma, InvoiceStatus } from '@prisma/client';
import {
  InvoiceFiltersDto,
  PaginationDto,
  SortDto,
  GroupByType,
  SearchResult,
  SummaryResult,
  SlaSummaryResult,
  InvoiceRow,
  GroupedSummary,
  SummaryMetrics,
} from './dto/query.dto';

@Injectable()
export class InvoiceQueryService {
  constructor(private prisma: PrismaService) {}

  /**
   * Search invoices with filters and pagination
   */
  async searchInvoices(
    filters: InvoiceFiltersDto,
    pagination: PaginationDto = { page: 1, limit: 20 },
    sort: SortDto[] = [{ field: 'dueDate', direction: 'asc' }],
  ): Promise<SearchResult> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    // Build where clause
    const where = await this.buildWhereClause(filters);

    // Build order by
    const orderBy = this.buildOrderBy(sort);

    // Execute queries
    const [rows, totalCount] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          pharmacy: { select: { id: true, name: true, code: true } },
          vendor: { select: { id: true, name: true } },
          invoiceType: { select: { id: true, name: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      rows: rows.map((row) => this.mapToInvoiceRow(row)),
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }

  /**
   * Summarize invoices with optional grouping
   */
  async summarizeInvoices(
    filters: InvoiceFiltersDto,
    groupBy?: GroupByType,
  ): Promise<SummaryResult> {
    const where = await this.buildWhereClause(filters);

    // Get overall metrics
    const overall = await this.getMetrics(where);

    // Get grouped metrics if requested
    let groups: GroupedSummary[] = [];
    if (groupBy) {
      groups = await this.getGroupedMetrics(where, groupBy);
    }

    return { overall, groups };
  }

  /**
   * Get SLA summary for a month
   */
  async getSlaSummary(month: string, orgId: string): Promise<SlaSummaryResult> {
    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('Month must be in YYYY-MM format');
    }

    // Get all pharmacies in the org
    const pharmacies = await this.prisma.pharmacy.findMany({
      where: { orgId, isActive: true },
      select: { id: true, name: true, code: true },
    });

    // Get monthly requirements
    const requirements = await this.prisma.monthlyInvoiceRequirement.findMany({
      where: {
        yearMonth: month,
        pharmacy: { orgId },
      },
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
      },
    });

    // Get SLA events for the month
    const slaEvents = await this.prisma.slaEvent.findMany({
      where: {
        yearMonth: month,
        pharmacy: { orgId },
      },
    });

    // Build pharmacy summaries
    const pharmacySummaries = pharmacies.map((pharmacy) => {
      const req = requirements.find((r) => r.pharmacyId === pharmacy.id);
      const events = slaEvents.filter((e) => e.pharmacyId === pharmacy.id);

      const submissionMissed = events.filter(
        (e) => e.eventType === 'SUBMISSION_MISSED',
      ).length;
      const processingMissed = events.filter(
        (e) => e.eventType === 'PROCESSING_MISSED',
      ).length;

      return {
        pharmacyId: pharmacy.id,
        pharmacyName: pharmacy.name,
        pharmacyCode: pharmacy.code,
        submissionMissed,
        processingMissed,
        pending: (req?.expectedCount || 0) - (req?.submittedCount || 0),
        totalExpected: req?.expectedCount || 0,
        submittedCount: req?.submittedCount || 0,
        processedCount: req?.processedCount || 0,
        complianceRate: req?.expectedCount
          ? Math.round(((req.processedCount || 0) / req.expectedCount) * 100)
          : 100,
      };
    });

    // Calculate totals
    const compliantPharmacies = pharmacySummaries.filter(
      (p) => p.submissionMissed === 0 && p.processingMissed === 0,
    ).length;

    return {
      month,
      pharmacies: pharmacySummaries,
      totals: {
        totalPharmacies: pharmacies.length,
        compliantPharmacies,
        submissionMissedTotal: pharmacySummaries.reduce(
          (sum, p) => sum + p.submissionMissed,
          0,
        ),
        processingMissedTotal: pharmacySummaries.reduce(
          (sum, p) => sum + p.processingMissed,
          0,
        ),
      },
    };
  }

  /**
   * Get detailed invoice information
   */
  async getInvoiceDetail(invoiceId: string, orgId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        pharmacy: { select: { id: true, name: true, code: true, orgId: true } },
        vendor: { select: { id: true, name: true } },
        invoiceType: { select: { id: true, name: true } },
        files: {
          include: {
            uploadedBy: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        events: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        extractions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Verify org access
    if (invoice.pharmacy.orgId !== orgId) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  /**
   * Get list of pharmacies for filter dropdown
   */
  async getPharmaciesForOrg(orgId: string) {
    return this.prisma.pharmacy.findMany({
      where: { orgId, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get list of invoice types for filter dropdown
   */
  async getInvoiceTypes() {
    return this.prisma.invoiceType.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get list of vendors for filter dropdown
   */
  async getVendors() {
    return this.prisma.vendor.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Build Prisma where clause from filters
   */
  private async buildWhereClause(
    filters: InvoiceFiltersDto,
  ): Promise<Prisma.InvoiceWhereInput> {
    const where: Prisma.InvoiceWhereInput = {};

    // Always scope by org
    if (filters.orgId) {
      where.pharmacy = { orgId: filters.orgId };
    }

    // Pharmacy filter
    if (filters.pharmacyId) {
      where.pharmacyId = filters.pharmacyId;
    } else if (filters.pharmacyCode) {
      const pharmacy = await this.prisma.pharmacy.findUnique({
        where: { code: filters.pharmacyCode },
      });
      if (pharmacy) {
        where.pharmacyId = pharmacy.id;
      }
    }

    // Invoice type filter
    if (filters.invoiceTypeId) {
      where.invoiceTypeId = filters.invoiceTypeId;
    } else if (filters.invoiceType) {
      const invoiceType = await this.prisma.invoiceType.findFirst({
        where: { name: { contains: filters.invoiceType, mode: 'insensitive' } },
      });
      if (invoiceType) {
        where.invoiceTypeId = invoiceType.id;
      }
    }

    // Status filter
    if (filters.statusIn && filters.statusIn.length > 0) {
      where.status = { in: filters.statusIn as InvoiceStatus[] };
    }

    // Needs review filter
    if (filters.needsReview !== undefined) {
      where.needsReview = filters.needsReview;
    }

    // Overdue filter
    if (filters.overdueOnly) {
      where.dueDate = { lt: new Date() };
      where.status = {
        notIn: [InvoiceStatus.PAID, InvoiceStatus.REJECTED],
      };
    }

    // Due date range filter
    if (filters.dueDateRange) {
      where.dueDate = where.dueDate || {};
      if (filters.dueDateRange.from) {
        (where.dueDate as any).gte = new Date(filters.dueDateRange.from);
      }
      if (filters.dueDateRange.to) {
        (where.dueDate as any).lte = new Date(filters.dueDateRange.to);
      }
    }

    // Amount range filter
    if (filters.amountRange) {
      where.amount = {};
      if (filters.amountRange.min !== undefined) {
        where.amount.gte = filters.amountRange.min;
      }
      if (filters.amountRange.max !== undefined) {
        where.amount.lte = filters.amountRange.max;
      }
    }

    // Vendor filter
    if (filters.vendorId) {
      where.vendorId = filters.vendorId;
    } else if (filters.vendorNameContains) {
      where.vendor = {
        name: { contains: filters.vendorNameContains, mode: 'insensitive' },
      };
    }

    // Month filter (for invoices created/due in a specific month)
    if (filters.month) {
      const [year, month] = filters.month.split('-').map(Number);
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);
      where.OR = [
        { invoiceDate: { gte: startOfMonth, lte: endOfMonth } },
        { dueDate: { gte: startOfMonth, lte: endOfMonth } },
      ];
    }

    return where;
  }

  /**
   * Build order by clause
   */
  private buildOrderBy(
    sort: SortDto[],
  ): Prisma.InvoiceOrderByWithRelationInput[] {
    if (!sort || sort.length === 0) {
      return [{ dueDate: 'asc' }];
    }

    return sort.map((s) => ({
      [s.field]: s.direction,
    }));
  }

  /**
   * Map Prisma result to InvoiceRow
   */
  private mapToInvoiceRow(row: any): InvoiceRow {
    return {
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      pharmacy: row.pharmacy,
      invoiceType: row.invoiceType,
      vendor: row.vendor,
      amount: row.amount ? Number(row.amount) : null,
      dueDate: row.dueDate,
      invoiceDate: row.invoiceDate,
      status: row.status,
      needsReview: row.needsReview,
      submittedAt: row.submittedAt,
      createdAt: row.createdAt,
    };
  }

  /**
   * Get aggregate metrics
   */
  private async getMetrics(
    where: Prisma.InvoiceWhereInput,
  ): Promise<SummaryMetrics> {
    const [aggregates, paidAggregates, cycleDays] = await Promise.all([
      this.prisma.invoice.aggregate({
        where,
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { ...where, status: InvoiceStatus.PAID },
        _sum: { amount: true },
      }),
      this.prisma.invoice.findMany({
        where: { ...where, status: InvoiceStatus.PAID, paidAt: { not: null } },
        select: { createdAt: true, paidAt: true },
      }),
    ]);

    // Calculate average cycle days
    let avgCycleDays: number | null = null;
    if (cycleDays.length > 0) {
      const totalDays = cycleDays.reduce((sum, inv) => {
        if (inv.paidAt && inv.createdAt) {
          const days =
            (inv.paidAt.getTime() - inv.createdAt.getTime()) /
            (1000 * 60 * 60 * 24);
          return sum + days;
        }
        return sum;
      }, 0);
      avgCycleDays = Math.round(totalDays / cycleDays.length);
    }

    return {
      count: aggregates._count.id,
      sumAmount: Number(aggregates._sum.amount || 0),
      sumPaid: Number(paidAggregates._sum.amount || 0),
      avgCycleDays,
    };
  }

  /**
   * Get grouped metrics
   */
  private async getGroupedMetrics(
    where: Prisma.InvoiceWhereInput,
    groupBy: GroupByType,
  ): Promise<GroupedSummary[]> {
    let groupField: string;
    let labelField: string;

    switch (groupBy) {
      case 'pharmacy':
        groupField = 'pharmacyId';
        labelField = 'pharmacy.name';
        break;
      case 'invoiceType':
        groupField = 'invoiceTypeId';
        labelField = 'invoiceType.name';
        break;
      case 'status':
        groupField = 'status';
        labelField = 'status';
        break;
      case 'vendor':
        groupField = 'vendorId';
        labelField = 'vendor.name';
        break;
      default:
        return [];
    }

    // Use raw groupBy query
    const grouped = await this.prisma.invoice.groupBy({
      by: [groupField as any],
      where,
      _count: { id: true },
      _sum: { amount: true },
    });

    // Get labels for each group
    const results: GroupedSummary[] = [];

    for (const group of grouped) {
      const groupKey = (group as any)[groupField];
      if (!groupKey) continue;

      let groupLabel = groupKey;

      // Get label based on group type
      if (groupBy === 'pharmacy' && groupKey) {
        const pharmacy = await this.prisma.pharmacy.findUnique({
          where: { id: groupKey },
          select: { name: true },
        });
        groupLabel = pharmacy?.name || groupKey;
      } else if (groupBy === 'invoiceType' && groupKey) {
        const type = await this.prisma.invoiceType.findUnique({
          where: { id: groupKey },
          select: { name: true },
        });
        groupLabel = type?.name || groupKey;
      } else if (groupBy === 'vendor' && groupKey) {
        const vendor = await this.prisma.vendor.findUnique({
          where: { id: groupKey },
          select: { name: true },
        });
        groupLabel = vendor?.name || groupKey;
      }

      // Get paid amount for this group
      const paidWhere = {
        ...where,
        [groupField]: groupKey,
        status: InvoiceStatus.PAID,
      };
      const paidSum = await this.prisma.invoice.aggregate({
        where: paidWhere,
        _sum: { amount: true },
      });

      results.push({
        groupKey,
        groupLabel,
        metrics: {
          count: group._count.id,
          sumAmount: Number(group._sum.amount || 0),
          sumPaid: Number(paidSum._sum.amount || 0),
          avgCycleDays: null, // Skip for grouped for performance
        },
      });
    }

    return results.sort((a, b) => b.metrics.sumAmount - a.metrics.sumAmount);
  }
}
