import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Role } from '../common/enums/role.enum';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceQueryDto,
  InvoiceStatusDto,
} from './dto';
import { InvoiceStatus, InvoiceEventType, Prisma } from '@prisma/client';
import { SlaService } from '../sla/sla.service';
import { RequirementsService } from '../requirements/requirements.service';

// Valid status transitions
const STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: [InvoiceStatus.SUBMITTED],
  SUBMITTED: [InvoiceStatus.APPROVED, InvoiceStatus.NEEDS_INFO, InvoiceStatus.REJECTED],
  NEEDS_INFO: [InvoiceStatus.SUBMITTED],
  APPROVED: [InvoiceStatus.SCHEDULED],
  SCHEDULED: [InvoiceStatus.PAID],
  PAID: [],
  REJECTED: [],
};

@Injectable()
export class InvoiceService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => SlaService))
    private slaService: SlaService,
    @Inject(forwardRef(() => RequirementsService))
    private requirementsService: RequirementsService,
  ) {}

  /**
   * Create a new invoice
   */
  async create(dto: CreateInvoiceDto, userId: string) {
    // Verify vendor and invoice type exist
    const [vendor, invoiceType, pharmacy] = await Promise.all([
      this.prisma.vendor.findUnique({ where: { id: dto.vendorId } }),
      this.prisma.invoiceType.findUnique({ where: { id: dto.invoiceTypeId } }),
      this.prisma.pharmacy.findUnique({ where: { id: dto.pharmacyId } }),
    ]);

    if (!vendor) throw new NotFoundException('Vendor not found');
    if (!invoiceType) throw new NotFoundException('Invoice type not found');
    if (!pharmacy) throw new NotFoundException('Pharmacy not found');

    // Create invoice with initial event
    const invoice = await this.prisma.invoice.create({
      data: {
        pharmacyId: dto.pharmacyId,
        vendorId: dto.vendorId,
        invoiceTypeId: dto.invoiceTypeId,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: new Date(dto.invoiceDate),
        dueDate: new Date(dto.dueDate),
        amount: dto.amount,
        description: dto.description,
        notes: dto.notes,
        status: InvoiceStatus.DRAFT,
        events: {
          create: {
            eventType: InvoiceEventType.CREATED,
            userId,
            notes: 'Invoice created',
          },
        },
      },
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true } },
        invoiceType: { select: { id: true, name: true } },
      },
    });

    // Auto-link to matching requirement instance
    try {
      await this.requirementsService.autoLinkInvoice({
        id: invoice.id,
        pharmacyId: invoice.pharmacyId,
        vendorId: invoice.vendorId,
        invoiceTypeId: invoice.invoiceTypeId,
        invoiceDate: invoice.invoiceDate,
        submittedAt: invoice.submittedAt,
        approvedAt: invoice.approvedAt,
        status: invoice.status,
      });
    } catch (e) {
      // Auto-linking is best-effort, don't fail invoice creation
      console.error('Auto-link failed:', e);
    }

    return invoice;
  }

  /**
   * Get invoices with filtering based on user access
   */
  async findAll(
    query: InvoiceQueryDto,
    userId: string,
    userRole: Role,
    userOrgId?: string,
  ) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    // Build where clause based on filters and user access
    const where: Prisma.InvoiceWhereInput = {};

    // Apply pharmacy access restrictions
    if (userRole === Role.ADMIN) {
      // Admin can see all invoices
      if (query.pharmacyId) {
        where.pharmacyId = query.pharmacyId;
      }
    } else if (userRole === Role.COMPANY_MANAGER && userOrgId) {
      // Manager can see invoices for all pharmacies in their org
      where.pharmacy = { orgId: userOrgId };
      if (query.pharmacyId) {
        where.pharmacyId = query.pharmacyId;
      }
    } else {
      // Pharmacy users can only see invoices for pharmacies they're members of
      const memberships = await this.prisma.pharmacyMember.findMany({
        where: { userId },
        select: { pharmacyId: true },
      });
      const pharmacyIds = memberships.map((m) => m.pharmacyId);

      if (query.pharmacyId) {
        if (!pharmacyIds.includes(query.pharmacyId)) {
          throw new ForbiddenException('You do not have access to this pharmacy');
        }
        where.pharmacyId = query.pharmacyId;
      } else {
        where.pharmacyId = { in: pharmacyIds };
      }
    }

    // Apply other filters
    if (query.vendorId) {
      where.vendorId = query.vendorId;
    }
    if (query.status) {
      where.status = query.status as InvoiceStatus;
    }
    if (query.dueDateFrom || query.dueDateTo) {
      where.dueDate = {};
      if (query.dueDateFrom) {
        where.dueDate.gte = new Date(query.dueDateFrom);
      }
      if (query.dueDateTo) {
        where.dueDate.lte = new Date(query.dueDateTo);
      }
    }
    if (query.invoiceDateFrom || query.invoiceDateTo) {
      // Filter by invoice date range, also include invoices with no date set (incomplete drafts)
      const dateCondition: Prisma.DateTimeNullableFilter = {};
      if (query.invoiceDateFrom) {
        dateCondition.gte = new Date(query.invoiceDateFrom);
      }
      if (query.invoiceDateTo) {
        dateCondition.lte = new Date(query.invoiceDateTo);
      }
      where.OR = [
        { invoiceDate: dateCondition },
        { invoiceDate: null }, // Include drafts with no invoice date set
      ];
    }

    // Execute query with pagination
    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          pharmacy: { select: { id: true, name: true, code: true } },
          vendor: { select: { id: true, name: true } },
          invoiceType: { select: { id: true, name: true } },
          files: {
            select: { id: true, originalName: true, mimeType: true, storagePath: true },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          requirementInstances: {
            select: {
              id: true,
              periodLabel: true,
              requirement: {
                select: { id: true, name: true },
              },
            },
            take: 1,
          },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single invoice by ID
   */
  async findOne(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        pharmacy: { select: { id: true, name: true, code: true, orgId: true } },
        vendor: { select: { id: true, name: true } },
        invoiceType: { select: { id: true, name: true } },
        files: true,
        events: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  /**
   * Update an invoice
   * - Pharmacy users: can only edit in DRAFT, NEEDS_INFO, or REJECTED status
   * - Managers/Admins: can edit in any status
   */
  async update(invoiceId: string, dto: UpdateInvoiceDto, userId: string, userRole?: Role) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Check edit permissions based on role and status
    const isManagerOrAdmin = userRole === Role.ADMIN || userRole === Role.COMPANY_MANAGER;
    const editableStatuses: InvoiceStatus[] = [InvoiceStatus.DRAFT, InvoiceStatus.NEEDS_INFO, InvoiceStatus.REJECTED];

    if (!isManagerOrAdmin && !editableStatuses.includes(invoice.status)) {
      throw new BadRequestException(
        `Cannot update invoice in ${invoice.status} status. Contact your manager if changes are needed.`,
      );
    }

    // Check for duplicate invoice number (same vendor + pharmacy + invoice number)
    const vendorId = dto.vendorId || invoice.vendorId;
    const invoiceNumber = dto.invoiceNumber || invoice.invoiceNumber;
    if (vendorId && invoiceNumber) {
      const isDuplicate = await this.checkDuplicateInvoice(
        invoice.pharmacyId,
        vendorId,
        invoiceNumber,
        invoiceId, // Exclude current invoice from check
      );
      if (isDuplicate) {
        throw new BadRequestException(
          `An invoice with number "${invoiceNumber}" already exists for this vendor and pharmacy`,
        );
      }
    }

    // Build update data
    const updateData: Prisma.InvoiceUpdateInput = {};
    if (dto.vendorId) updateData.vendor = { connect: { id: dto.vendorId } };
    if (dto.invoiceTypeId) updateData.invoiceType = { connect: { id: dto.invoiceTypeId } };
    if (dto.invoiceNumber) updateData.invoiceNumber = dto.invoiceNumber;
    if (dto.accountNumber !== undefined) updateData.accountNumber = dto.accountNumber;
    if (dto.documentType) updateData.documentType = dto.documentType;
    if (dto.invoiceDate) updateData.invoiceDate = new Date(dto.invoiceDate);
    if (dto.dueDate) updateData.dueDate = new Date(dto.dueDate);
    if (dto.amount !== undefined) updateData.amount = dto.amount;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    // Update invoice and log event
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        ...updateData,
        events: {
          create: {
            eventType: InvoiceEventType.UPDATED,
            userId,
            notes: 'Invoice updated',
            metadata: dto as object,
          },
        },
      },
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true } },
        invoiceType: { select: { id: true, name: true } },
      },
    });

    return updated;
  }

  /**
   * Submit an invoice for approval
   */
  async submit(invoiceId: string, userId: string, dto?: InvoiceStatusDto) {
    // Get invoice details first
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Validate required fields before submission
    if (!invoice.vendorId) {
      throw new BadRequestException('Vendor is required before submitting');
    }
    if (!invoice.invoiceTypeId) {
      throw new BadRequestException('Invoice type is required before submitting');
    }
    if (!invoice.invoiceNumber && !invoice.accountNumber) {
      throw new BadRequestException('Invoice number or account number is required before submitting');
    }
    if (!invoice.amount) {
      throw new BadRequestException('Amount is required before submitting');
    }
    if (!invoice.dueDate) {
      throw new BadRequestException('Due date is required before submitting');
    }

    // Check for duplicate invoice number (same vendor + pharmacy + invoice number)
    // Only check if invoice number is provided
    if (invoice.invoiceNumber) {
      const isDuplicate = await this.checkDuplicateInvoice(
        invoice.pharmacyId,
        invoice.vendorId,
        invoice.invoiceNumber,
        invoiceId,
      );
      if (isDuplicate) {
        throw new BadRequestException(
          `An invoice with number "${invoice.invoiceNumber}" already exists for this vendor and pharmacy`,
        );
      }
    }

    return this.transitionStatus(
      invoiceId,
      InvoiceStatus.SUBMITTED,
      InvoiceEventType.SUBMITTED,
      userId,
      dto?.notes,
      { submittedAt: new Date() },
    );
  }

  /**
   * Return invoice for more information
   */
  async needsInfo(invoiceId: string, userId: string, dto: InvoiceStatusDto) {
    if (!dto.notes) {
      throw new BadRequestException('Notes are required when requesting more information');
    }
    return this.transitionStatus(
      invoiceId,
      InvoiceStatus.NEEDS_INFO,
      InvoiceEventType.NEEDS_INFO,
      userId,
      dto.notes,
    );
  }

  /**
   * Approve an invoice
   */
  async approve(invoiceId: string, userId: string, dto?: InvoiceStatusDto) {
    return this.transitionStatus(
      invoiceId,
      InvoiceStatus.APPROVED,
      InvoiceEventType.APPROVED,
      userId,
      dto?.notes,
      { approvedAt: new Date(), approvedById: userId },
    );
  }

  /**
   * Schedule payment for an invoice
   */
  async schedule(invoiceId: string, userId: string, dto?: InvoiceStatusDto) {
    return this.transitionStatus(
      invoiceId,
      InvoiceStatus.SCHEDULED,
      InvoiceEventType.SCHEDULED,
      userId,
      dto?.notes,
    );
  }

  /**
   * Mark invoice as paid
   */
  async markPaid(invoiceId: string, userId: string, dto?: InvoiceStatusDto) {
    return this.transitionStatus(
      invoiceId,
      InvoiceStatus.PAID,
      InvoiceEventType.PAID,
      userId,
      dto?.notes,
      { paidAt: new Date() },
    );
  }

  /**
   * Reject an invoice
   */
  async reject(invoiceId: string, userId: string, dto: InvoiceStatusDto) {
    if (!dto.notes) {
      throw new BadRequestException('Notes are required when rejecting an invoice');
    }
    return this.transitionStatus(
      invoiceId,
      InvoiceStatus.REJECTED,
      InvoiceEventType.REJECTED,
      userId,
      dto.notes,
    );
  }

  /**
   * Generic status transition helper
   */
  private async transitionStatus(
    invoiceId: string,
    newStatus: InvoiceStatus,
    eventType: InvoiceEventType,
    userId: string,
    notes?: string,
    additionalData?: Prisma.InvoiceUpdateInput,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Validate transition
    const allowedTransitions = STATUS_TRANSITIONS[invoice.status];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${invoice.status} to ${newStatus}`,
      );
    }

    // Update invoice with new status and event
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: newStatus,
        ...additionalData,
        events: {
          create: {
            eventType,
            userId,
            notes,
          },
        },
      },
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true } },
        invoiceType: { select: { id: true, name: true } },
      },
    });

    // Update requirement instance status when invoice status changes
    try {
      await this.requirementsService.updateInstanceForInvoice({
        id: updated.id,
        submittedAt: updated.submittedAt,
        approvedAt: updated.approvedAt,
        status: updated.status,
      });
    } catch (e) {
      // Best-effort update, don't fail the status transition
      console.error('Update instance failed:', e);
    }

    // Update SLA counts when invoice is submitted or approved
    if (newStatus === InvoiceStatus.SUBMITTED || newStatus === InvoiceStatus.APPROVED) {
      const submittedDate = updated.submittedAt || new Date();
      const yearMonth = `${submittedDate.getFullYear()}-${String(submittedDate.getMonth() + 1).padStart(2, '0')}`;
      await this.slaService.updateInvoiceCounts(invoice.pharmacyId, yearMonth);
    }

    return updated;
  }

  /**
   * Check if user has access to an invoice
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
   * Get vendors list
   */
  async getVendors() {
    return this.prisma.vendor.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Create a new vendor
   */
  async createVendor(data: { name: string; externalRef?: string; orgId: string }) {
    // Check if vendor with same name already exists in this org
    const existing = await this.prisma.vendor.findFirst({
      where: {
        name: { equals: data.name.trim(), mode: 'insensitive' },
        orgId: data.orgId,
      },
    });

    if (existing) {
      throw new BadRequestException(`Vendor "${data.name}" already exists`);
    }

    return this.prisma.vendor.create({
      data: {
        name: data.name.trim(),
        externalRef: data.externalRef?.trim() || null,
        orgId: data.orgId,
        isActive: true,
      },
    });
  }

  /**
   * Get invoice types list
   */
  async getInvoiceTypes() {
    return this.prisma.invoiceType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get invoices pending approval (for managers)
   */
  async getPendingApproval(userOrgId: string) {
    return this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.SUBMITTED,
        pharmacy: { orgId: userOrgId },
      },
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true } },
        invoiceType: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { submittedAt: 'asc' }],
    });
  }

  /**
   * Get invoice statistics for a pharmacy or org
   */
  async getStats(pharmacyId?: string, orgId?: string) {
    const where: Prisma.InvoiceWhereInput = {};

    if (pharmacyId) {
      where.pharmacyId = pharmacyId;
    } else if (orgId) {
      where.pharmacy = { orgId };
    }

    const [statusCounts, totalAmount, upcomingDue] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.invoice.aggregate({
        where: { ...where, status: { notIn: [InvoiceStatus.REJECTED] } },
        _sum: { amount: true },
      }),
      this.prisma.invoice.count({
        where: {
          ...where,
          status: { in: [InvoiceStatus.SUBMITTED, InvoiceStatus.APPROVED, InvoiceStatus.SCHEDULED] },
          dueDate: {
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next 7 days
          },
        },
      }),
    ]);

    return {
      statusCounts: statusCounts.reduce(
        (acc, item) => {
          acc[item.status] = item._count.id;
          return acc;
        },
        {} as Record<string, number>,
      ),
      totalAmount: totalAmount._sum.amount || 0,
      upcomingDue,
    };
  }

  /**
   * Delete a draft invoice
   * Only DRAFT invoices can be deleted
   */
  async delete(invoiceId: string, _userId?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Only allow deleting draft invoices
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only draft invoices can be deleted');
    }

    // Delete the invoice (cascade will handle files, events, extractions)
    await this.prisma.invoice.delete({
      where: { id: invoiceId },
    });

    return { message: 'Invoice deleted successfully' };
  }

  /**
   * Clean up abandoned draft invoices
   * Deletes DRAFT invoices that have no invoice number and are older than the specified age
   * This handles cases where users upload an invoice but close the browser before saving
   */
  async cleanupAbandonedDrafts(maxAgeHours: number = 24): Promise<{ deleted: number }> {
    const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    // Find and delete abandoned drafts:
    // - Status is DRAFT
    // - No invoice number (temp record from upload-and-parse)
    // - Created more than maxAgeHours ago
    const abandonedDrafts = await this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.DRAFT,
        invoiceNumber: null,
        createdAt: { lt: cutoffDate },
      },
      select: { id: true },
    });

    if (abandonedDrafts.length === 0) {
      return { deleted: 0 };
    }

    // Delete all abandoned drafts (cascade handles related records)
    const result = await this.prisma.invoice.deleteMany({
      where: {
        id: { in: abandonedDrafts.map((d) => d.id) },
      },
    });

    return { deleted: result.count };
  }

  /**
   * Clean up abandoned draft invoices for a specific user
   * Deletes DRAFT invoices with no invoice number that are older than 5 minutes
   * Called when a user visits the upload page to clean up their previous abandoned uploads
   */
  async cleanupUserAbandonedDrafts(userId: string, pharmacyIds: string[]): Promise<{ deleted: number }> {
    // Only clean up drafts older than 5 minutes (to avoid deleting current upload in progress)
    const cutoffDate = new Date(Date.now() - 5 * 60 * 1000);

    // Find and delete abandoned drafts for this user's pharmacies
    const abandonedDrafts = await this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.DRAFT,
        invoiceNumber: null,
        pharmacyId: { in: pharmacyIds },
        createdAt: { lt: cutoffDate },
      },
      select: { id: true },
    });

    if (abandonedDrafts.length === 0) {
      return { deleted: 0 };
    }

    // Delete all abandoned drafts (cascade handles related records)
    const result = await this.prisma.invoice.deleteMany({
      where: {
        id: { in: abandonedDrafts.map((d) => d.id) },
      },
    });

    return { deleted: result.count };
  }

  /**
   * Check for duplicate invoice number for same vendor + pharmacy combination
   */
  async checkDuplicateInvoice(
    pharmacyId: string,
    vendorId: string,
    invoiceNumber: string,
    excludeInvoiceId?: string,
  ): Promise<boolean> {
    const existing = await this.prisma.invoice.findFirst({
      where: {
        pharmacyId,
        vendorId,
        invoiceNumber: { equals: invoiceNumber, mode: 'insensitive' },
        id: excludeInvoiceId ? { not: excludeInvoiceId } : undefined,
      },
    });

    return existing !== null;
  }
}
