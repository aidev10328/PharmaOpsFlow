import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditLogService } from '../admin/audit-log.service';
import { InvoiceQueryService } from '../query/invoice-query.service';
import { ExtractionService } from '../extraction/extraction.service';
import { SlaService } from '../sla/sla.service';
import { InvoiceStatus, InvoiceEventType } from '@prisma/client';
import {
  OversightInvoiceQueryDto,
  OversightSlaEventsQueryDto,
  OversightNotificationQueryDto,
  OverrideStatusDto,
  UnlockInvoiceDto,
  ReassignPharmacyDto,
} from './dto';

// Admin override transitions — more permissive than normal workflow
const ADMIN_OVERRIDE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: [InvoiceStatus.SUBMITTED, InvoiceStatus.REJECTED],
  SUBMITTED: [
    InvoiceStatus.APPROVED,
    InvoiceStatus.NEEDS_INFO,
    InvoiceStatus.REJECTED,
    InvoiceStatus.DRAFT,
  ],
  NEEDS_INFO: [
    InvoiceStatus.SUBMITTED,
    InvoiceStatus.DRAFT,
    InvoiceStatus.REJECTED,
  ],
  APPROVED: [
    InvoiceStatus.SCHEDULED,
    InvoiceStatus.SUBMITTED,
    InvoiceStatus.REJECTED,
  ],
  SCHEDULED: [
    InvoiceStatus.PAID,
    InvoiceStatus.APPROVED,
    InvoiceStatus.REJECTED,
  ],
  PAID: [], // Terminal — no override allowed
  REJECTED: [InvoiceStatus.DRAFT], // Reopen
};

@Injectable()
export class OversightService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private invoiceQuery: InvoiceQueryService,
    private extractionService: ExtractionService,
    private slaService: SlaService,
  ) {}

  // =============================================
  // Invoice Oversight (read)
  // =============================================

  async getInvoices(query: OversightInvoiceQueryDto) {
    const filters: any = {};

    if (query.pharmacyId) filters.pharmacyId = query.pharmacyId;
    if (query.status) filters.statusIn = [query.status];
    if (query.invoiceTypeId) filters.invoiceTypeId = query.invoiceTypeId;
    if (query.vendorId) filters.vendorId = query.vendorId;
    if (query.overdueOnly === 'true') filters.overdueOnly = true;
    if (query.needsReview === 'true') filters.needsReview = true;
    if (query.dateFrom || query.dateTo) {
      filters.dueDateRange = {
        from: query.dateFrom,
        to: query.dateTo,
      };
    }

    return this.invoiceQuery.searchInvoices(
      filters,
      { page: query.page || 1, limit: query.limit || 20 },
    );
  }

  async getInvoiceDetail(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        pharmacy: {
          select: { id: true, name: true, code: true, street: true, city: true, state: true, zip: true },
        },
        vendor: {
          select: { id: true, name: true, email: true, phone: true, paymentTerms: true },
        },
        invoiceType: {
          select: { id: true, name: true, code: true },
        },
        files: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            storagePath: true,
            createdAt: true,
            uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        events: {
          select: {
            id: true,
            eventType: true,
            notes: true,
            metadata: true,
            createdAt: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        slaEvents: {
          select: {
            id: true,
            eventType: true,
            yearMonth: true,
            notes: true,
            metadata: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        extractions: {
          select: {
            id: true,
            provider: true,
            model: true,
            status: true,
            error: true,
            processingMs: true,
            extractedJson: true,
            confidenceJson: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  // =============================================
  // Intervention Actions (write, audit-logged)
  // =============================================

  async overrideStatus(
    invoiceId: string,
    dto: OverrideStatusDto,
    actorUserId: string,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { pharmacy: { select: { id: true, name: true, code: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const currentStatus = invoice.status;
    const allowedTargets = ADMIN_OVERRIDE_TRANSITIONS[currentStatus];

    if (!allowedTargets || !allowedTargets.includes(dto.newStatus)) {
      throw new BadRequestException(
        `Cannot override from ${currentStatus} to ${dto.newStatus}. Allowed: ${allowedTargets?.join(', ') || 'none'}`,
      );
    }

    const before = {
      status: invoice.status,
      submittedAt: invoice.submittedAt,
      approvedAt: invoice.approvedAt,
      approvedById: invoice.approvedById,
      paidAt: invoice.paidAt,
    };

    // Build update data based on target status
    const updateData: any = { status: dto.newStatus };

    switch (dto.newStatus) {
      case InvoiceStatus.SUBMITTED:
        updateData.submittedAt = new Date();
        break;
      case InvoiceStatus.APPROVED:
        updateData.approvedAt = new Date();
        updateData.approvedById = actorUserId;
        break;
      case InvoiceStatus.PAID:
        updateData.paidAt = new Date();
        break;
      case InvoiceStatus.DRAFT:
        // Reset workflow timestamps
        updateData.submittedAt = null;
        updateData.approvedAt = null;
        updateData.approvedById = null;
        break;
      case InvoiceStatus.REJECTED:
        break;
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: updateData,
    });

    // Create InvoiceEvent
    await this.prisma.invoiceEvent.create({
      data: {
        invoiceId,
        eventType: InvoiceEventType.UPDATED,
        userId: actorUserId,
        notes: `ADMIN OVERRIDE: ${currentStatus} → ${dto.newStatus}. Reason: ${dto.reason}`,
        metadata: {
          action: 'ADMIN_OVERRIDE',
          fromStatus: currentStatus,
          toStatus: dto.newStatus,
          reason: dto.reason,
        },
      },
    });

    // Update SLA counts if relevant
    if (
      dto.newStatus === InvoiceStatus.SUBMITTED ||
      dto.newStatus === InvoiceStatus.APPROVED
    ) {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await this.slaService.updateInvoiceCounts(invoice.pharmacyId, yearMonth);
    }

    // Audit log
    await this.auditLog.log({
      actorUserId,
      action: 'invoice.admin_override',
      entityType: 'Invoice',
      entityId: invoiceId,
      before,
      after: {
        status: updated.status,
        submittedAt: updated.submittedAt,
        approvedAt: updated.approvedAt,
        approvedById: updated.approvedById,
        paidAt: updated.paidAt,
        reason: dto.reason,
      },
    });

    return updated;
  }

  async unlockInvoice(
    invoiceId: string,
    dto: UnlockInvoiceDto,
    actorUserId: string,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { pharmacy: { select: { id: true, name: true, code: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    // Determine unlock target
    let targetStatus: InvoiceStatus;
    const clearFields: any = {};

    switch (invoice.status) {
      case InvoiceStatus.SUBMITTED:
      case InvoiceStatus.NEEDS_INFO:
        targetStatus = InvoiceStatus.DRAFT;
        clearFields.submittedAt = null;
        break;
      case InvoiceStatus.APPROVED:
        targetStatus = InvoiceStatus.SUBMITTED;
        clearFields.approvedAt = null;
        clearFields.approvedById = null;
        break;
      case InvoiceStatus.SCHEDULED:
        targetStatus = InvoiceStatus.APPROVED;
        break;
      default:
        throw new BadRequestException(
          `Cannot unlock invoice in ${invoice.status} status. Unlock is available for SUBMITTED, NEEDS_INFO, APPROVED, or SCHEDULED invoices.`,
        );
    }

    const before = {
      status: invoice.status,
      submittedAt: invoice.submittedAt,
      approvedAt: invoice.approvedAt,
      approvedById: invoice.approvedById,
    };

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: targetStatus,
        ...clearFields,
      },
    });

    await this.prisma.invoiceEvent.create({
      data: {
        invoiceId,
        eventType: InvoiceEventType.UPDATED,
        userId: actorUserId,
        notes: `ADMIN UNLOCK: ${invoice.status} → ${targetStatus}. Reason: ${dto.reason}`,
        metadata: {
          action: 'ADMIN_UNLOCK',
          fromStatus: invoice.status,
          toStatus: targetStatus,
          reason: dto.reason,
        },
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'invoice.admin_unlock',
      entityType: 'Invoice',
      entityId: invoiceId,
      before,
      after: {
        status: updated.status,
        submittedAt: updated.submittedAt,
        approvedAt: updated.approvedAt,
        approvedById: updated.approvedById,
        reason: dto.reason,
      },
    });

    return updated;
  }

  async reassignPharmacy(
    invoiceId: string,
    dto: ReassignPharmacyDto,
    actorUserId: string,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { pharmacy: { select: { id: true, name: true, code: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (invoice.pharmacyId === dto.newPharmacyId) {
      throw new BadRequestException('Invoice is already assigned to this pharmacy');
    }

    const newPharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: dto.newPharmacyId },
      select: { id: true, name: true, code: true, isActive: true },
    });
    if (!newPharmacy) throw new NotFoundException('Target pharmacy not found');
    if (!newPharmacy.isActive) throw new BadRequestException('Target pharmacy is inactive');

    const before = {
      pharmacyId: invoice.pharmacyId,
      pharmacyName: invoice.pharmacy.name,
      pharmacyCode: invoice.pharmacy.code,
    };

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { pharmacyId: dto.newPharmacyId },
    });

    await this.prisma.invoiceEvent.create({
      data: {
        invoiceId,
        eventType: InvoiceEventType.UPDATED,
        userId: actorUserId,
        notes: `ADMIN REASSIGN: ${invoice.pharmacy.name} (${invoice.pharmacy.code}) → ${newPharmacy.name} (${newPharmacy.code}). Reason: ${dto.reason}`,
        metadata: {
          action: 'ADMIN_REASSIGN',
          fromPharmacyId: invoice.pharmacyId,
          fromPharmacyName: invoice.pharmacy.name,
          toPharmacyId: dto.newPharmacyId,
          toPharmacyName: newPharmacy.name,
          reason: dto.reason,
        },
      },
    });

    await this.auditLog.log({
      actorUserId,
      action: 'invoice.admin_reassign',
      entityType: 'Invoice',
      entityId: invoiceId,
      before,
      after: {
        pharmacyId: dto.newPharmacyId,
        pharmacyName: newPharmacy.name,
        pharmacyCode: newPharmacy.code,
        reason: dto.reason,
      },
    });

    return updated;
  }

  // =============================================
  // SLA & Compliance Oversight
  // =============================================

  async getSlaEvents(query: OversightSlaEventsQueryDto, user?: any) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.month) where.yearMonth = query.month;
    if (query.pharmacyId) where.pharmacyId = query.pharmacyId;
    if (query.eventType) where.eventType = query.eventType;

    // Scope to manager's assigned pharmacies
    if (user?.role === 'COMPANY_MANAGER') {
      const assignments = await this.prisma.managerPharmacy.findMany({
        where: { userId: user.id },
        select: { pharmacyId: true },
      });
      where.pharmacyId = query.pharmacyId
        ? query.pharmacyId
        : { in: assignments.map(a => a.pharmacyId) };
    }

    const [data, totalCount] = await Promise.all([
      this.prisma.slaEvent.findMany({
        where,
        include: {
          pharmacy: { select: { id: true, name: true, code: true } },
          invoice: { select: { id: true, invoiceNumber: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.slaEvent.count({ where }),
    ]);

    return {
      data,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }

  async getSlaSummary(month?: string, user?: any) {
    const now = new Date();
    const yearMonth =
      month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Get org - use user's org for managers, or first org for admin
    let orgId: string | undefined;
    if (user?.orgId) {
      orgId = user.orgId;
    } else {
      const org = await this.prisma.org.findFirst();
      if (!org) throw new NotFoundException('No organization found');
      orgId = org.id;
    }

    // For managers, scope to their assigned pharmacies
    let assignedPharmacyIds: string[] | undefined;
    if (user?.role === 'COMPANY_MANAGER') {
      const assignments = await this.prisma.managerPharmacy.findMany({
        where: { userId: user.id },
        select: { pharmacyId: true },
      });
      assignedPharmacyIds = assignments.map(a => a.pharmacyId);
    }

    return this.invoiceQuery.getSlaSummary(yearMonth, orgId, assignedPharmacyIds);
  }

  // =============================================
  // Automation & AI Health
  // =============================================

  async getAutomationStats() {
    const [total, successCount, failedCount, pendingCount] = await Promise.all([
      this.prisma.invoiceExtraction.count(),
      this.prisma.invoiceExtraction.count({ where: { status: 'SUCCESS' } }),
      this.prisma.invoiceExtraction.count({ where: { status: 'FAILED' } }),
      this.prisma.invoiceExtraction.count({ where: { status: 'PENDING' } }),
    ]);

    const successRate = total > 0 ? Math.round((successCount / total) * 100 * 10) / 10 : 0;

    // Average processing time for successful extractions
    const avgResult = await this.prisma.invoiceExtraction.aggregate({
      _avg: { processingMs: true },
      where: { status: 'SUCCESS', processingMs: { not: null } },
    });

    // Recent failures
    const recentFailures = await this.prisma.invoiceExtraction.findMany({
      where: { status: 'FAILED' },
      select: {
        id: true,
        invoiceId: true,
        provider: true,
        model: true,
        error: true,
        createdAt: true,
        invoice: {
          select: { id: true, invoiceNumber: true, pharmacyId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      total,
      success: successCount,
      failed: failedCount,
      pending: pendingCount,
      successRate,
      avgProcessingMs: Math.round(avgResult._avg.processingMs || 0),
      recentFailures,
    };
  }

  async retryExtraction(extractionId: string, userId: string) {
    const result = await this.extractionService.retryExtraction(extractionId, userId);

    await this.auditLog.log({
      actorUserId: userId,
      action: 'extraction.admin_retry',
      entityType: 'InvoiceExtraction',
      entityId: extractionId,
      after: { retried: true },
    });

    return result;
  }

  // =============================================
  // Notification Logs
  // =============================================

  async getNotifications(query: OversightNotificationQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.channel) where.channel = query.channel;
    if (query.pharmacyId) where.pharmacyId = query.pharmacyId;
    if (query.type) where.type = query.type;
    if (query.dateFrom || query.dateTo) {
      where.sentAt = {};
      if (query.dateFrom) where.sentAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.sentAt.lte = new Date(query.dateTo + 'T23:59:59.999Z');
    }

    const [data, totalCount] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        include: {
          pharmacy: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notificationLog.count({ where }),
    ]);

    return {
      data,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }
}
