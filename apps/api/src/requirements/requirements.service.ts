import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  RequirementFrequency,
  RequirementInstanceStatus,
  InvoiceStatus,
} from '@prisma/client';
import {
  CreateRequirementDto,
  UpdateRequirementDto,
  RequirementFiltersDto,
  InstanceFiltersDto,
  RequirementResponse,
  InstanceResponse,
  ComplianceSummary,
  GenerateResult,
  PharmacyRequirementsSummary,
} from './dto/requirements.dto';

@Injectable()
export class RequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to resolve orgId - if null, get first org (for ADMIN users)
   */
  private async resolveOrgId(orgId: string | null | undefined): Promise<string> {
    if (orgId) return orgId;
    const firstOrg = await this.prisma.org.findFirst();
    if (!firstOrg) throw new NotFoundException('No organization found');
    return firstOrg.id;
  }

  /**
   * Create a new invoice requirement
   */
  async createRequirement(
    dto: CreateRequirementDto,
    orgId: string | null | undefined,
  ): Promise<RequirementResponse> {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    // Verify pharmacy belongs to org
    const pharmacy = await this.prisma.pharmacy.findFirst({
      where: { id: dto.pharmacyId, orgId: resolvedOrgId },
    });
    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    // Verify vendor if provided
    if (dto.vendorId) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: dto.vendorId, orgId: resolvedOrgId },
      });
      if (!vendor) {
        throw new NotFoundException('Vendor not found');
      }
    }

    // Verify invoice type if provided
    if (dto.invoiceTypeId) {
      const invoiceType = await this.prisma.invoiceType.findFirst({
        where: { id: dto.invoiceTypeId, orgId: resolvedOrgId },
      });
      if (!invoiceType) {
        throw new NotFoundException('Invoice type not found');
      }
    }

    // Validate applicable months for quarterly/annual
    if (dto.frequency === RequirementFrequency.QUARTERLY && !dto.applicableMonths) {
      dto.applicableMonths = '3,6,9,12'; // Default quarterly months
    }
    if (dto.frequency === RequirementFrequency.ANNUALLY && !dto.applicableMonths) {
      dto.applicableMonths = '12'; // Default to December
    }

    const requirement = await this.prisma.invoiceRequirement.create({
      data: {
        pharmacyId: dto.pharmacyId,
        vendorId: dto.vendorId || null,
        invoiceTypeId: dto.invoiceTypeId || null,
        name: dto.name,
        description: dto.description || null,
        frequency: dto.frequency,
        submissionDueDay: dto.submissionDueDay,
        processingDueDay: dto.processingDueDay,
        applicableMonths: dto.applicableMonths || null,
      },
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true } },
        invoiceType: { select: { id: true, name: true } },
      },
    });

    // Auto-generate instances from current month through December
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const endMonth = `${now.getFullYear()}-12`;
    try {
      await this.generateInstances(currentMonth, endMonth, dto.pharmacyId, resolvedOrgId);
    } catch {
      // Don't fail requirement creation if instance generation fails
    }

    return this.mapToResponse(requirement);
  }

  /**
   * Update an existing requirement
   */
  async updateRequirement(
    id: string,
    dto: UpdateRequirementDto,
    orgId: string | null | undefined,
  ): Promise<RequirementResponse> {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    // Verify requirement exists and belongs to org
    const existing = await this.prisma.invoiceRequirement.findFirst({
      where: { id, pharmacy: { orgId: resolvedOrgId } },
    });
    if (!existing) {
      throw new NotFoundException('Requirement not found');
    }

    // Verify vendor if provided
    if (dto.vendorId) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: dto.vendorId, orgId: resolvedOrgId },
      });
      if (!vendor) {
        throw new NotFoundException('Vendor not found');
      }
    }

    // Verify invoice type if provided
    if (dto.invoiceTypeId) {
      const invoiceType = await this.prisma.invoiceType.findFirst({
        where: { id: dto.invoiceTypeId, orgId: resolvedOrgId },
      });
      if (!invoiceType) {
        throw new NotFoundException('Invoice type not found');
      }
    }

    const requirement = await this.prisma.invoiceRequirement.update({
      where: { id },
      data: {
        vendorId: dto.vendorId !== undefined ? dto.vendorId : undefined,
        invoiceTypeId: dto.invoiceTypeId !== undefined ? dto.invoiceTypeId : undefined,
        name: dto.name,
        description: dto.description,
        frequency: dto.frequency,
        submissionDueDay: dto.submissionDueDay,
        processingDueDay: dto.processingDueDay,
        applicableMonths: dto.applicableMonths,
        isActive: dto.isActive,
      },
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true } },
        invoiceType: { select: { id: true, name: true } },
      },
    });

    return this.mapToResponse(requirement);
  }

  /**
   * Delete a requirement (soft delete by setting isActive = false)
   */
  async deleteRequirement(id: string, orgId: string | null | undefined): Promise<void> {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    const existing = await this.prisma.invoiceRequirement.findFirst({
      where: { id, pharmacy: { orgId: resolvedOrgId } },
    });
    if (!existing) {
      throw new NotFoundException('Requirement not found');
    }

    await this.prisma.invoiceRequirement.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Get a single requirement by ID
   */
  async getRequirement(id: string, orgId: string | null | undefined): Promise<RequirementResponse> {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    const requirement = await this.prisma.invoiceRequirement.findFirst({
      where: { id, pharmacy: { orgId: resolvedOrgId } },
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true } },
        invoiceType: { select: { id: true, name: true } },
      },
    });
    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }
    return this.mapToResponse(requirement);
  }

  /**
   * List requirements with filters
   */
  async listRequirements(
    filters: RequirementFiltersDto,
    orgId: string | null | undefined,
  ): Promise<RequirementResponse[]> {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    const where: any = {
      pharmacy: { orgId: resolvedOrgId },
    };

    if (filters.pharmacyId) where.pharmacyId = filters.pharmacyId;
    if (filters.vendorId) where.vendorId = filters.vendorId;
    if (filters.invoiceTypeId) where.invoiceTypeId = filters.invoiceTypeId;
    if (filters.frequency) where.frequency = filters.frequency;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;

    const requirements = await this.prisma.invoiceRequirement.findMany({
      where,
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true } },
        invoiceType: { select: { id: true, name: true } },
      },
      orderBy: [{ pharmacy: { name: 'asc' } }, { name: 'asc' }],
    });

    return requirements.map((r) => this.mapToResponse(r));
  }

  /**
   * Generate requirement instances for a period
   */
  async generateInstances(
    startMonth: string,
    endMonth: string | undefined,
    pharmacyId: string | undefined,
    orgId: string | null | undefined,
  ): Promise<GenerateResult> {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(startMonth)) {
      throw new BadRequestException('startMonth must be in YYYY-MM format');
    }
    const actualEndMonth = endMonth || startMonth;
    if (!/^\d{4}-\d{2}$/.test(actualEndMonth)) {
      throw new BadRequestException('endMonth must be in YYYY-MM format');
    }

    // Get all active requirements
    const where: any = { isActive: true, pharmacy: { orgId: resolvedOrgId } };
    if (pharmacyId) where.pharmacyId = pharmacyId;

    const requirements = await this.prisma.invoiceRequirement.findMany({
      where,
      include: {
        pharmacy: { select: { id: true, name: true, code: true } },
      },
    });

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Generate instances for each requirement
    for (const req of requirements) {
      const periods = this.getPeriodsForRange(
        req.frequency,
        startMonth,
        actualEndMonth,
        req.applicableMonths,
      );

      for (const period of periods) {
        try {
          // Check if instance already exists
          const existing = await this.prisma.requirementInstance.findUnique({
            where: {
              requirementId_periodStart: {
                requirementId: req.id,
                periodStart: period.start,
              },
            },
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Calculate deadlines from requirement's own due days
          const submissionDay = req.submissionDueDay ?? 5;
          const processingDay = req.processingDueDay ?? 10;
          const submissionDeadline = this.calculateDeadline(
            period.start,
            submissionDay,
            req.frequency,
          );
          const processingDeadline = this.calculateDeadline(
            period.start,
            processingDay,
            req.frequency,
          );

          // Create instance
          await this.prisma.requirementInstance.create({
            data: {
              requirementId: req.id,
              periodStart: period.start,
              periodEnd: period.end,
              periodLabel: period.label,
              submissionDeadline,
              processingDeadline,
              status: RequirementInstanceStatus.PENDING,
            },
          });
          created++;
        } catch (err: any) {
          errors.push(`Failed to create instance for ${req.name}: ${err.message}`);
        }
      }
    }

    return { created, skipped, errors };
  }

  /**
   * List requirement instances with filters
   */
  async listInstances(
    filters: InstanceFiltersDto,
    orgId: string | null | undefined,
  ): Promise<InstanceResponse[]> {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    const where: any = {
      requirement: { pharmacy: { orgId: resolvedOrgId } },
    };

    if (filters.requirementId) where.requirementId = filters.requirementId;
    if (filters.pharmacyId) where.requirement = { ...where.requirement, pharmacyId: filters.pharmacyId };
    if (filters.status) where.status = filters.status;
    if (filters.periodLabel) where.periodLabel = filters.periodLabel;

    if (filters.yearMonth) {
      const [year, month] = filters.yearMonth.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59);
      where.periodStart = { lte: monthEnd };
      where.periodEnd = { gte: monthStart };
    }

    if (filters.overdueOnly) {
      where.status = RequirementInstanceStatus.OVERDUE;
    }

    const instances = await this.prisma.requirementInstance.findMany({
      where,
      include: {
        requirement: {
          include: {
            pharmacy: { select: { id: true, name: true, code: true } },
            vendor: { select: { id: true, name: true } },
            invoiceType: { select: { id: true, name: true } },
          },
        },
        invoice: {
          select: { id: true, invoiceNumber: true, status: true },
        },
      },
      orderBy: [{ submissionDeadline: 'asc' }, { requirement: { pharmacy: { name: 'asc' } } }],
    });

    return instances.map((i) => this.mapInstanceToResponse(i));
  }

  /**
   * Get a single instance
   */
  async getInstance(id: string, orgId: string | null | undefined): Promise<InstanceResponse> {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    const instance = await this.prisma.requirementInstance.findFirst({
      where: { id, requirement: { pharmacy: { orgId: resolvedOrgId } } },
      include: {
        requirement: {
          include: {
            pharmacy: { select: { id: true, name: true, code: true } },
            vendor: { select: { id: true, name: true } },
            invoiceType: { select: { id: true, name: true } },
          },
        },
        invoice: {
          select: { id: true, invoiceNumber: true, status: true },
        },
      },
    });
    if (!instance) {
      throw new NotFoundException('Instance not found');
    }
    return this.mapInstanceToResponse(instance);
  }

  /**
   * Link an invoice to a requirement instance
   */
  async linkInvoice(
    instanceId: string,
    invoiceId: string,
    orgId: string | null | undefined,
  ): Promise<InstanceResponse> {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    // Verify instance exists
    const instance = await this.prisma.requirementInstance.findFirst({
      where: { id: instanceId, requirement: { pharmacy: { orgId: resolvedOrgId } } },
      include: { requirement: true },
    });
    if (!instance) {
      throw new NotFoundException('Instance not found');
    }

    // Verify invoice exists and belongs to same pharmacy
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        pharmacyId: instance.requirement.pharmacyId,
      },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found or does not belong to the same pharmacy');
    }

    // Update instance
    const now = new Date();
    const isSubmitted = invoice.submittedAt !== null;
    const processedStatuses: InvoiceStatus[] = [
      InvoiceStatus.APPROVED,
      InvoiceStatus.SCHEDULED,
      InvoiceStatus.PAID,
    ];
    const isProcessed = processedStatuses.includes(invoice.status);

    let newStatus = instance.status;
    if (isProcessed) {
      newStatus = RequirementInstanceStatus.PROCESSED;
    } else if (isSubmitted) {
      newStatus = RequirementInstanceStatus.SUBMITTED;
    }

    const submissionMet = isSubmitted
      ? (invoice.submittedAt! <= instance.submissionDeadline)
      : null;
    const processingMet = isProcessed
      ? (invoice.approvedAt ? invoice.approvedAt <= instance.processingDeadline : true)
      : null;

    const updated = await this.prisma.requirementInstance.update({
      where: { id: instanceId },
      data: {
        invoiceId,
        status: newStatus,
        submittedAt: invoice.submittedAt,
        processedAt: invoice.approvedAt,
        submissionMet,
        processingMet,
        lastEvaluatedAt: now,
      },
      include: {
        requirement: {
          include: {
            pharmacy: { select: { id: true, name: true, code: true } },
            vendor: { select: { id: true, name: true } },
            invoiceType: { select: { id: true, name: true } },
          },
        },
        invoice: {
          select: { id: true, invoiceNumber: true, status: true },
        },
      },
    });

    return this.mapInstanceToResponse(updated);
  }

  /**
   * Unlink an invoice from a requirement instance
   */
  async unlinkInvoice(instanceId: string, orgId: string | null | undefined): Promise<InstanceResponse> {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    const instance = await this.prisma.requirementInstance.findFirst({
      where: { id: instanceId, requirement: { pharmacy: { orgId: resolvedOrgId } } },
    });
    if (!instance) {
      throw new NotFoundException('Instance not found');
    }

    const now = new Date();
    const isPastSubmissionDeadline = now > instance.submissionDeadline;

    const updated = await this.prisma.requirementInstance.update({
      where: { id: instanceId },
      data: {
        invoiceId: null,
        status: isPastSubmissionDeadline
          ? RequirementInstanceStatus.OVERDUE
          : RequirementInstanceStatus.PENDING,
        submittedAt: null,
        processedAt: null,
        submissionMet: null,
        processingMet: null,
        lastEvaluatedAt: now,
      },
      include: {
        requirement: {
          include: {
            pharmacy: { select: { id: true, name: true, code: true } },
            vendor: { select: { id: true, name: true } },
            invoiceType: { select: { id: true, name: true } },
          },
        },
        invoice: {
          select: { id: true, invoiceNumber: true, status: true },
        },
      },
    });

    return this.mapInstanceToResponse(updated);
  }

  /**
   * Evaluate all instances and update statuses
   */
  async evaluateInstances(orgId: string | null | undefined, yearMonth?: string): Promise<{
    evaluated: number;
    overdue: number;
    missed: number;
  }> {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    const now = new Date();

    // Auto-generate instances for current month if none exist yet (handles new year rollover)
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const endMonth = `${now.getFullYear()}-12`;
    try {
      await this.generateInstances(currentMonth, endMonth, undefined, resolvedOrgId);
    } catch {
      // Don't fail evaluation if generation fails
    }

    // Build where clause
    const where: any = {
      requirement: { pharmacy: { orgId: resolvedOrgId }, isActive: true },
      status: { in: [RequirementInstanceStatus.PENDING, RequirementInstanceStatus.OVERDUE] },
    };

    if (yearMonth) {
      const [year, month] = yearMonth.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59);
      where.periodStart = { lte: monthEnd };
      where.periodEnd = { gte: monthStart };
    }

    const instances = await this.prisma.requirementInstance.findMany({
      where,
    });

    let overdue = 0;
    let missed = 0;

    for (const instance of instances) {
      const isPastSubmission = now > instance.submissionDeadline;
      const isPastProcessing = now > instance.processingDeadline;

      let newStatus = instance.status;

      if (!instance.invoiceId) {
        // No invoice linked
        if (isPastProcessing) {
          newStatus = RequirementInstanceStatus.MISSED;
          missed++;
        } else if (isPastSubmission) {
          newStatus = RequirementInstanceStatus.OVERDUE;
          overdue++;
        }
      }

      if (newStatus !== instance.status) {
        await this.prisma.requirementInstance.update({
          where: { id: instance.id },
          data: {
            status: newStatus,
            lastEvaluatedAt: now,
          },
        });
      }
    }

    return { evaluated: instances.length, overdue, missed };
  }

  /**
   * Get compliance summary by pharmacy
   */
  async getComplianceSummary(
    orgId: string | null | undefined,
    yearMonth?: string,
  ): Promise<ComplianceSummary[]> {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    // Get all pharmacies in org
    const pharmacies = await this.prisma.pharmacy.findMany({
      where: { orgId: resolvedOrgId, isActive: true },
      select: { id: true, name: true, code: true },
    });

    // Build period filter
    const periodFilter: any = {};
    if (yearMonth) {
      const [year, month] = yearMonth.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59);
      periodFilter.periodStart = { lte: monthEnd };
      periodFilter.periodEnd = { gte: monthStart };
    }

    const summaries: ComplianceSummary[] = [];

    for (const pharmacy of pharmacies) {
      const instances = await this.prisma.requirementInstance.findMany({
        where: {
          requirement: { pharmacyId: pharmacy.id, isActive: true },
          ...periodFilter,
        },
      });

      const pending = instances.filter(
        (i) => i.status === RequirementInstanceStatus.PENDING,
      ).length;
      const submitted = instances.filter(
        (i) => i.status === RequirementInstanceStatus.SUBMITTED,
      ).length;
      const processed = instances.filter(
        (i) => i.status === RequirementInstanceStatus.PROCESSED,
      ).length;
      const overdue = instances.filter(
        (i) => i.status === RequirementInstanceStatus.OVERDUE,
      ).length;
      const missed = instances.filter(
        (i) => i.status === RequirementInstanceStatus.MISSED,
      ).length;

      const totalRequirements = instances.length;
      const compliant = processed + submitted;
      const complianceRate = totalRequirements > 0
        ? Math.round((compliant / totalRequirements) * 100)
        : 100;

      summaries.push({
        pharmacyId: pharmacy.id,
        pharmacyName: pharmacy.name,
        pharmacyCode: pharmacy.code,
        totalRequirements,
        pending,
        submitted,
        processed,
        overdue,
        missed,
        complianceRate,
      });
    }

    return summaries.sort((a, b) => a.complianceRate - b.complianceRate);
  }

  // ========== PHARMACY USER METHODS ==========

  /**
   * Get requirement instances for a specific pharmacy (for pharmacy users)
   */
  async getPharmacyInstances(
    pharmacyId: string,
    yearMonth?: string,
    status?: RequirementInstanceStatus,
  ): Promise<InstanceResponse[]> {
    const where: any = {
      requirement: { pharmacyId, isActive: true },
    };

    if (status) {
      where.status = status;
    }

    if (yearMonth) {
      const [year, month] = yearMonth.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59);
      where.periodStart = { lte: monthEnd };
      where.periodEnd = { gte: monthStart };
    }

    const instances = await this.prisma.requirementInstance.findMany({
      where,
      include: {
        requirement: {
          include: {
            pharmacy: { select: { id: true, name: true, code: true } },
            vendor: { select: { id: true, name: true } },
            invoiceType: { select: { id: true, name: true } },
          },
        },
        invoice: {
          select: { id: true, invoiceNumber: true, status: true },
        },
      },
      orderBy: [{ submissionDeadline: 'asc' }],
    });

    return instances.map((i) => this.mapInstanceToResponse(i));
  }

  /**
   * Get requirements summary for a pharmacy (for dashboard widget)
   */
  async getPharmacyRequirementsSummary(
    pharmacyId: string,
  ): Promise<PharmacyRequirementsSummary> {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { id: true, name: true, code: true },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    // Get current month instances
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const instances = await this.prisma.requirementInstance.findMany({
      where: {
        requirement: { pharmacyId, isActive: true },
        periodStart: { lte: monthEnd },
        periodEnd: { gte: monthStart },
      },
    });

    const pending = instances.filter(
      (i) => i.status === RequirementInstanceStatus.PENDING && i.submissionDeadline >= now,
    ).length;
    const overdue = instances.filter(
      (i) =>
        i.status === RequirementInstanceStatus.OVERDUE ||
        (i.status === RequirementInstanceStatus.PENDING && i.submissionDeadline < now),
    ).length;
    const submitted = instances.filter(
      (i) => i.status === RequirementInstanceStatus.SUBMITTED,
    ).length;
    const processed = instances.filter(
      (i) => i.status === RequirementInstanceStatus.PROCESSED,
    ).length;

    return {
      pharmacyId: pharmacy.id,
      pharmacyName: pharmacy.name,
      pharmacyCode: pharmacy.code,
      pending,
      overdue,
      submitted,
      processed,
      totalThisMonth: instances.length,
    };
  }

  /**
   * Verify pharmacy access for a user
   */
  async verifyPharmacyAccess(pharmacyId: string, userId: string): Promise<boolean> {
    const membership = await this.prisma.pharmacyMember.findFirst({
      where: { pharmacyId, userId },
    });
    return !!membership;
  }

  async verifyManagerAssignment(pharmacyId: string, userId: string): Promise<boolean> {
    const assignment = await this.prisma.managerPharmacy.findUnique({
      where: { userId_pharmacyId: { userId, pharmacyId } },
    });
    return !!assignment;
  }

  /**
   * Auto-link an invoice to a matching requirement instance.
   * Called when an invoice is created or its status changes.
   * Returns the linked instance if found, null otherwise.
   */
  async autoLinkInvoice(invoice: {
    id: string;
    pharmacyId: string;
    vendorId: string | null;
    invoiceTypeId: string | null;
    invoiceDate: Date | null;
    submittedAt: Date | null;
    approvedAt: Date | null;
    status: InvoiceStatus;
  }): Promise<InstanceResponse | null> {
    // Find matching requirement instances that:
    // 1. Belong to the same pharmacy
    // 2. Have no invoice linked yet
    // 3. Match vendor/invoiceType if the requirement has constraints
    // 4. Have a period that contains the invoice date

    const invoiceDate = invoice.invoiceDate || new Date();

    // Find unlinked instances for this pharmacy
    const instances = await this.prisma.requirementInstance.findMany({
      where: {
        invoiceId: null, // Not yet linked
        requirement: {
          pharmacyId: invoice.pharmacyId,
          isActive: true,
        },
        periodStart: { lte: invoiceDate },
        periodEnd: { gte: invoiceDate },
      },
      include: {
        requirement: {
          include: {
            pharmacy: { select: { id: true, name: true, code: true } },
            vendor: { select: { id: true, name: true } },
            invoiceType: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { submissionDeadline: 'asc' }, // Prefer earlier deadlines
    });

    // Find the best matching instance
    let bestMatch: typeof instances[0] | null = null;

    for (const instance of instances) {
      const req = instance.requirement;

      // If requirement has vendor constraint, invoice must match
      if (req.vendorId && req.vendorId !== invoice.vendorId) {
        continue;
      }

      // If requirement has invoiceType constraint, invoice must match
      if (req.invoiceTypeId && req.invoiceTypeId !== invoice.invoiceTypeId) {
        continue;
      }

      // This instance matches - prefer exact matches over general ones
      if (!bestMatch) {
        bestMatch = instance;
      } else {
        // Prefer more specific matches (with vendor/invoiceType constraints)
        const currentScore = (req.vendorId ? 1 : 0) + (req.invoiceTypeId ? 1 : 0);
        const bestScore =
          (bestMatch.requirement.vendorId ? 1 : 0) +
          (bestMatch.requirement.invoiceTypeId ? 1 : 0);
        if (currentScore > bestScore) {
          bestMatch = instance;
        }
      }
    }

    if (!bestMatch) {
      return null;
    }

    // Link the invoice to the instance
    const now = new Date();
    const isSubmitted = invoice.submittedAt !== null;
    const processedStatuses: InvoiceStatus[] = [
      InvoiceStatus.APPROVED,
      InvoiceStatus.SCHEDULED,
      InvoiceStatus.PAID,
    ];
    const isProcessed = processedStatuses.includes(invoice.status);

    let newStatus: RequirementInstanceStatus = bestMatch.status;
    if (isProcessed) {
      newStatus = RequirementInstanceStatus.PROCESSED;
    } else if (isSubmitted) {
      newStatus = RequirementInstanceStatus.SUBMITTED;
    }

    const submissionMet = isSubmitted
      ? invoice.submittedAt! <= bestMatch.submissionDeadline
      : null;
    const processingMet = isProcessed
      ? invoice.approvedAt
        ? invoice.approvedAt <= bestMatch.processingDeadline
        : true
      : null;

    const updated = await this.prisma.requirementInstance.update({
      where: { id: bestMatch.id },
      data: {
        invoiceId: invoice.id,
        status: newStatus,
        submittedAt: invoice.submittedAt,
        processedAt: invoice.approvedAt,
        submissionMet,
        processingMet,
        lastEvaluatedAt: now,
      },
      include: {
        requirement: {
          include: {
            pharmacy: { select: { id: true, name: true, code: true } },
            vendor: { select: { id: true, name: true } },
            invoiceType: { select: { id: true, name: true } },
          },
        },
        invoice: {
          select: { id: true, invoiceNumber: true, status: true },
        },
      },
    });

    return this.mapInstanceToResponse(updated);
  }

  /**
   * Auto-link all existing unlinked invoices to matching requirement instances.
   * Called once to fix historical data.
   */
  async autoLinkAllInvoices(orgId: string | null | undefined): Promise<{
    linked: number;
    skipped: number;
    errors: string[];
  }> {
    const resolvedOrgId = await this.resolveOrgId(orgId);

    // Get all invoices that are not yet linked to any requirement instance
    const invoices = await this.prisma.invoice.findMany({
      where: {
        pharmacy: { orgId: resolvedOrgId },
        requirementInstances: { none: {} }, // No linked instances
      },
      orderBy: { invoiceDate: 'asc' },
    });

    let linked = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const invoice of invoices) {
      try {
        const result = await this.autoLinkInvoice({
          id: invoice.id,
          pharmacyId: invoice.pharmacyId,
          vendorId: invoice.vendorId,
          invoiceTypeId: invoice.invoiceTypeId,
          invoiceDate: invoice.invoiceDate,
          submittedAt: invoice.submittedAt,
          approvedAt: invoice.approvedAt,
          status: invoice.status,
        });
        if (result) {
          linked++;
        } else {
          skipped++;
        }
      } catch (e: any) {
        errors.push(`Invoice ${invoice.invoiceNumber || invoice.id}: ${e.message}`);
      }
    }

    return { linked, skipped, errors };
  }

  /**
   * Update requirement instance status when its linked invoice status changes.
   * Called from InvoiceService when invoice status is updated.
   */
  async updateInstanceForInvoice(invoice: {
    id: string;
    submittedAt: Date | null;
    approvedAt: Date | null;
    status: InvoiceStatus;
  }): Promise<void> {
    // Find instance linked to this invoice
    const instance = await this.prisma.requirementInstance.findFirst({
      where: { invoiceId: invoice.id },
    });

    if (!instance) {
      return; // No linked instance
    }

    const now = new Date();
    const isSubmitted = invoice.submittedAt !== null;
    const processedStatuses: InvoiceStatus[] = [
      InvoiceStatus.APPROVED,
      InvoiceStatus.SCHEDULED,
      InvoiceStatus.PAID,
    ];
    const isProcessed = processedStatuses.includes(invoice.status);

    let newStatus: RequirementInstanceStatus = instance.status;
    if (isProcessed) {
      newStatus = RequirementInstanceStatus.PROCESSED;
    } else if (isSubmitted) {
      newStatus = RequirementInstanceStatus.SUBMITTED;
    }

    const submissionMet = isSubmitted
      ? invoice.submittedAt! <= instance.submissionDeadline
      : null;
    const processingMet = isProcessed
      ? invoice.approvedAt
        ? invoice.approvedAt <= instance.processingDeadline
        : true
      : null;

    await this.prisma.requirementInstance.update({
      where: { id: instance.id },
      data: {
        status: newStatus,
        submittedAt: invoice.submittedAt,
        processedAt: invoice.approvedAt,
        submissionMet,
        processingMet,
        lastEvaluatedAt: now,
      },
    });
  }

  // Helper methods

  private mapToResponse(req: any): RequirementResponse {
    return {
      id: req.id,
      pharmacyId: req.pharmacyId,
      pharmacy: req.pharmacy,
      vendorId: req.vendorId,
      vendor: req.vendor,
      invoiceTypeId: req.invoiceTypeId,
      invoiceType: req.invoiceType,
      name: req.name,
      description: req.description,
      frequency: req.frequency,
      submissionDueDay: req.submissionDueDay,
      processingDueDay: req.processingDueDay,
      applicableMonths: req.applicableMonths,
      isActive: req.isActive,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
    };
  }

  private mapInstanceToResponse(instance: any): InstanceResponse {
    return {
      id: instance.id,
      requirementId: instance.requirementId,
      requirement: {
        id: instance.requirement.id,
        name: instance.requirement.name,
        pharmacy: instance.requirement.pharmacy,
        vendor: instance.requirement.vendor,
        invoiceType: instance.requirement.invoiceType,
      },
      invoiceId: instance.invoiceId,
      invoice: instance.invoice,
      periodStart: instance.periodStart,
      periodEnd: instance.periodEnd,
      periodLabel: instance.periodLabel,
      submissionDeadline: instance.submissionDeadline,
      processingDeadline: instance.processingDeadline,
      status: instance.status,
      submittedAt: instance.submittedAt,
      processedAt: instance.processedAt,
      submissionMet: instance.submissionMet,
      processingMet: instance.processingMet,
      lastEvaluatedAt: instance.lastEvaluatedAt,
      notes: instance.notes,
      createdAt: instance.createdAt,
    };
  }

  private getPeriodsForRange(
    frequency: RequirementFrequency,
    startMonth: string,
    endMonth: string,
    applicableMonths: string | null,
  ): { start: Date; end: Date; label: string }[] {
    const periods: { start: Date; end: Date; label: string }[] = [];
    const [startYear, startMo] = startMonth.split('-').map(Number);
    const [endYear, endMo] = endMonth.split('-').map(Number);

    const applicableSet = applicableMonths
      ? new Set(applicableMonths.split(',').map(Number))
      : null;

    let currentYear = startYear;
    let currentMonth = startMo;

    while (
      currentYear < endYear ||
      (currentYear === endYear && currentMonth <= endMo)
    ) {
      let periodStart: Date;
      let periodEnd: Date;
      let periodLabel: string;

      switch (frequency) {
        case RequirementFrequency.WEEKLY:
          // For weekly, generate 4-5 instances per month
          const weeksInMonth = this.getWeeksInMonth(currentYear, currentMonth);
          for (let week = 1; week <= weeksInMonth; week++) {
            const { start, end } = this.getWeekDates(currentYear, currentMonth, week);
            periods.push({
              start,
              end,
              label: `Week ${week}, ${this.getMonthName(currentMonth)} ${currentYear}`,
            });
          }
          break;

        case RequirementFrequency.MONTHLY:
          periodStart = new Date(currentYear, currentMonth - 1, 1);
          periodEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);
          periodLabel = `${this.getMonthName(currentMonth)} ${currentYear}`;
          periods.push({ start: periodStart, end: periodEnd, label: periodLabel });
          break;

        case RequirementFrequency.QUARTERLY:
          if (applicableSet && applicableSet.has(currentMonth)) {
            const quarterNum = Math.ceil(currentMonth / 3);
            const qStart = (quarterNum - 1) * 3 + 1;
            periodStart = new Date(currentYear, qStart - 1, 1);
            periodEnd = new Date(currentYear, qStart + 2, 0, 23, 59, 59);
            periodLabel = `Q${quarterNum} ${currentYear}`;
            periods.push({ start: periodStart, end: periodEnd, label: periodLabel });
          }
          break;

        case RequirementFrequency.ANNUALLY:
          if (applicableSet && applicableSet.has(currentMonth)) {
            periodStart = new Date(currentYear, 0, 1);
            periodEnd = new Date(currentYear, 11, 31, 23, 59, 59);
            periodLabel = `${currentYear}`;
            periods.push({ start: periodStart, end: periodEnd, label: periodLabel });
          }
          break;
      }

      // Move to next month
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    return periods;
  }

  private calculateDeadline(
    periodStart: Date,
    dueDay: number,
    frequency: RequirementFrequency,
  ): Date {
    const year = periodStart.getFullYear();
    const month = periodStart.getMonth();

    // For weekly, deadline is within the week
    if (frequency === RequirementFrequency.WEEKLY) {
      // Due day is day of week (1=Monday, 7=Sunday)
      const weekStart = periodStart.getTime();
      const dueOffset = (dueDay - 1) * 24 * 60 * 60 * 1000;
      return new Date(weekStart + dueOffset);
    }

    // For monthly, quarterly, annual - deadline is the dueDay of the period's last month
    const lastMonth = frequency === RequirementFrequency.QUARTERLY
      ? month + 2
      : frequency === RequirementFrequency.ANNUALLY
        ? 11
        : month;

    const daysInMonth = new Date(year, lastMonth + 1, 0).getDate();
    const actualDay = Math.min(dueDay, daysInMonth);

    return new Date(year, lastMonth, actualDay, 23, 59, 59);
  }

  private getMonthName(month: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return months[month - 1];
  }

  private getWeeksInMonth(year: number, month: number): number {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const firstDayOfWeek = firstDay.getDay();
    return Math.ceil((daysInMonth + firstDayOfWeek) / 7);
  }

  private getWeekDates(
    year: number,
    month: number,
    weekNum: number,
  ): { start: Date; end: Date } {
    const firstOfMonth = new Date(year, month - 1, 1);
    const firstDayOfWeek = firstOfMonth.getDay();
    const startDay = (weekNum - 1) * 7 - firstDayOfWeek + 1;
    const endDay = startDay + 6;

    const daysInMonth = new Date(year, month, 0).getDate();

    const start = new Date(year, month - 1, Math.max(1, startDay));
    const end = new Date(year, month - 1, Math.min(daysInMonth, endDay), 23, 59, 59);

    return { start, end };
  }
}
