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
        vendor: { select: { id: true, name: true, code: true } },
        invoiceType: { select: { id: true, name: true } },
      },
    });

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

    // Execute query with pagination
    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          pharmacy: { select: { id: true, name: true, code: true } },
          vendor: { select: { id: true, name: true, code: true } },
          invoiceType: { select: { id: true, name: true } },
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
        vendor: { select: { id: true, name: true, code: true } },
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
   * Update an invoice (only allowed in DRAFT or NEEDS_INFO status)
   */
  async update(invoiceId: string, dto: UpdateInvoiceDto, userId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Only allow updates in DRAFT or NEEDS_INFO status
    if (invoice.status !== InvoiceStatus.DRAFT && invoice.status !== InvoiceStatus.NEEDS_INFO) {
      throw new BadRequestException(
        `Cannot update invoice in ${invoice.status} status`,
      );
    }

    // Build update data
    const updateData: Prisma.InvoiceUpdateInput = {};
    if (dto.vendorId) updateData.vendor = { connect: { id: dto.vendorId } };
    if (dto.invoiceTypeId) updateData.invoiceType = { connect: { id: dto.invoiceTypeId } };
    if (dto.invoiceNumber) updateData.invoiceNumber = dto.invoiceNumber;
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
        vendor: { select: { id: true, name: true, code: true } },
        invoiceType: { select: { id: true, name: true } },
      },
    });

    return updated;
  }

  /**
   * Submit an invoice for approval
   */
  async submit(invoiceId: string, userId: string, dto?: InvoiceStatusDto) {
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
        vendor: { select: { id: true, name: true, code: true } },
        invoiceType: { select: { id: true, name: true } },
      },
    });

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
        vendor: { select: { id: true, name: true, code: true } },
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
}
