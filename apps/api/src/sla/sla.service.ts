import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SlaEventType, InvoiceStatus } from '@prisma/client';

export interface SlaEvaluationResult {
  yearMonth: string;
  pharmaciesEvaluated: number;
  submissionViolations: number;
  processingViolations: number;
  remindersSent: number;
}

export interface PharmacySlaStatus {
  pharmacyId: string;
  pharmacyName: string;
  pharmacyCode: string;
  yearMonth: string;
  expectedCount: number;
  submittedCount: number;
  processedCount: number;
  isMet: boolean;
  submissionDeadlineMet: boolean;
  processingDeadlineMet: boolean;
  events: {
    eventType: SlaEventType;
    createdAt: Date;
    notes: string | null;
  }[];
}

@Injectable()
export class SlaService {
  private readonly ORG_TIMEZONE = process.env.ORG_TIMEZONE || 'America/New_York';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get SLA due days for a pharmacy, falling back to org defaults
   */
  private async getDueDays(pharmacyId: string): Promise<{ submissionDueDay: number; processingDueDay: number }> {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { submissionDueDay: true, processingDueDay: true },
    });

    return {
      submissionDueDay: pharmacy?.submissionDueDay ?? 5,
      processingDueDay: pharmacy?.processingDueDay ?? 10,
    };
  }

  /**
   * Get current date in org timezone
   */
  private getCurrentDate(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: this.ORG_TIMEZONE }));
  }

  /**
   * Get year-month string from date (YYYY-MM)
   */
  private getYearMonth(date: Date = this.getCurrentDate()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Get deadline date for a given yearMonth and day
   */
  private getDeadlineDate(yearMonth: string, day: number): Date {
    const [year, month] = yearMonth.split('-').map(Number);
    return new Date(year, month - 1, day, 23, 59, 59);
  }

  /**
   * Run SLA evaluation for a specific yearMonth (idempotent)
   * This is the main entry point called by n8n or cron
   */
  async runEvaluation(yearMonth?: string): Promise<SlaEvaluationResult> {
    const evalMonth = yearMonth || this.getYearMonth();
    const currentDate = this.getCurrentDate();
    const currentDay = currentDate.getDate();

    // Get all active pharmacies
    const pharmacies = await this.prisma.pharmacy.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, orgId: true },
    });

    let submissionViolations = 0;
    let processingViolations = 0;
    let remindersSent = 0;

    for (const pharmacy of pharmacies) {
      // Ensure monthly requirement record exists
      await this.ensureMonthlyRequirement(pharmacy.id, evalMonth);

      const dueDays = await this.getDueDays(pharmacy.id);

      // Check submission deadline (pharmacy-specific day)
      if (currentDay >= dueDays.submissionDueDay) {
        const hadSubmissionViolation = await this.checkSubmissionDeadline(pharmacy.id, evalMonth, dueDays.submissionDueDay);
        if (hadSubmissionViolation) submissionViolations++;
      }

      // Check processing deadline (pharmacy-specific day)
      if (currentDay >= dueDays.processingDueDay) {
        const hadProcessingViolation = await this.checkProcessingDeadline(pharmacy.id, evalMonth, dueDays.processingDueDay);
        if (hadProcessingViolation) processingViolations++;
      }
    }

    return {
      yearMonth: evalMonth,
      pharmaciesEvaluated: pharmacies.length,
      submissionViolations,
      processingViolations,
      remindersSent,
    };
  }

  /**
   * Send reminders for upcoming deadlines
   * Called by n8n on 3rd/4th (for submission) and 8th/9th (for processing)
   */
  async sendReminders(type: 'submission' | 'processing'): Promise<number> {
    const yearMonth = this.getYearMonth();
    const eventType = type === 'submission'
      ? SlaEventType.SUBMISSION_REMINDER_SENT
      : SlaEventType.PROCESSING_REMINDER_SENT;

    // Get pharmacies that haven't met the deadline
    const pharmacies = await this.prisma.pharmacy.findMany({
      where: { isActive: true },
      include: {
        monthlyRequirements: {
          where: { yearMonth },
        },
      },
    });

    let remindersSent = 0;

    for (const pharmacy of pharmacies) {
      const req = pharmacy.monthlyRequirements[0];
      const needsReminder = type === 'submission'
        ? !req || req.submittedCount < req.expectedCount
        : !req || req.processedCount < req.expectedCount;

      if (needsReminder) {
        // Check if reminder already sent (idempotent)
        const existingReminder = await this.prisma.slaEvent.findFirst({
          where: {
            pharmacyId: pharmacy.id,
            yearMonth,
            eventType,
          },
        });

        if (!existingReminder) {
          const dueDays = await this.getDueDays(pharmacy.id);

          await this.prisma.slaEvent.create({
            data: {
              pharmacyId: pharmacy.id,
              yearMonth,
              eventType,
              notes: `${type} reminder sent for ${yearMonth}`,
            },
          });

          // Log notification (in production, would trigger actual notification)
          await this.prisma.notificationLog.create({
            data: {
              pharmacyId: pharmacy.id,
              type: 'sla_reminder',
              channel: 'in_app',
              subject: `${type === 'submission' ? 'Invoice Submission' : 'Invoice Processing'} Reminder`,
              body: `Reminder: ${type === 'submission' ? 'Invoice submissions' : 'Invoice processing'} due by ${type === 'submission' ? dueDays.submissionDueDay : dueDays.processingDueDay}th of the month.`,
              metadata: { yearMonth, type },
            },
          });

          remindersSent++;
        }
      }
    }

    return remindersSent;
  }

  /**
   * Get SLA summary for managers
   */
  async getSummary(orgId: string, yearMonth?: string, assignedPharmacyIds?: string[]): Promise<{
    yearMonth: string;
    totalPharmacies: number;
    compliant: number;
    nonCompliant: number;
    pending: number;
    pharmacies: PharmacySlaStatus[];
  }> {
    const evalMonth = yearMonth || this.getYearMonth();
    const now = new Date();

    // Calculate date range for the month
    const [yearStr, monthStr] = evalMonth.split('-');
    const startDate = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
    const endDate = new Date(parseInt(yearStr), parseInt(monthStr), 0, 23, 59, 59);

    const pharmacyWhere: any = { orgId, isActive: true };
    if (assignedPharmacyIds) {
      pharmacyWhere.id = { in: assignedPharmacyIds };
    }

    const pharmacies = await this.prisma.pharmacy.findMany({
      where: pharmacyWhere,
      include: {
        slaEvents: {
          where: { yearMonth: evalMonth },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Get all requirement instances for the month period across all pharmacies in this org
    const requirementInstances = await this.prisma.requirementInstance.findMany({
      where: {
        requirement: {
          isActive: true,
          pharmacy: { orgId },
        },
        periodStart: { lte: endDate },
        periodEnd: { gte: startDate },
      },
      include: {
        requirement: {
          select: { pharmacyId: true },
        },
      },
    });

    const pharmacyStatuses: PharmacySlaStatus[] = pharmacies.map((pharmacy) => {
      // Get requirement instances for this pharmacy
      const instances = requirementInstances.filter(
        (i) => i.requirement.pharmacyId === pharmacy.id
      );

      // Count instances by status
      const expectedCount = instances.length; // 0 if no requirements defined
      const submittedCount = instances.filter(
        (i) => ['SUBMITTED', 'PROCESSED'].includes(i.status)
      ).length;
      const processedCount = instances.filter(
        (i) => i.status === 'PROCESSED'
      ).length;

      // Count missed deadlines: PENDING instances where submissionDeadline has passed
      const submissionMissedCount = instances.filter(
        (i) => i.status === 'PENDING' && i.submissionDeadline && new Date(i.submissionDeadline) < now
      ).length;

      // Processing SLA: consider late submissions that were processed promptly.
      // If pharmacy submitted late but manager processed within the processing window
      // (processingDueDay - submissionDueDay days from submission), count processing as met.
      const processingDueDay = pharmacy.processingDueDay ?? 10;
      const submissionDueDay = pharmacy.submissionDueDay ?? 5;
      const processingWindowDays = processingDueDay - submissionDueDay; // days allowed for manager to process

      const processingMissedCount = instances.filter((i) => {
        if (i.status !== 'SUBMITTED') return false;
        if (!i.processingDeadline) return false;
        const originalDeadlinePassed = new Date(i.processingDeadline) < now;
        if (!originalDeadlinePassed) return false;

        // If submitted late, give manager a processing window from submission date
        if (i.submittedAt && i.submissionDeadline && new Date(i.submittedAt) > new Date(i.submissionDeadline)) {
          const extendedDeadline = new Date(i.submittedAt);
          extendedDeadline.setDate(extendedDeadline.getDate() + Math.max(processingWindowDays, 5));
          // If extended deadline hasn't passed yet, processing is still on time
          return extendedDeadline < now;
        }

        return true; // Original deadline passed and submission was on time
      }).length;

      // Submission deadline is met if all instances are submitted or no pending instances have missed their deadline
      const submissionDeadlineMet = submissionMissedCount === 0;

      // Processing deadline is met if all instances are processed or no submitted instances have missed their deadline
      const processingDeadlineMet = processingMissedCount === 0;

      // SLA is met only if:
      // 1. There are requirements defined (expectedCount > 0)
      // 2. All requirements are processed
      // 3. No missed deadlines (submission can be missed by pharmacy, but processing must be met by manager)
      const isMet = expectedCount > 0 && processedCount >= expectedCount && submissionDeadlineMet && processingDeadlineMet;

      return {
        pharmacyId: pharmacy.id,
        pharmacyName: pharmacy.name,
        pharmacyCode: pharmacy.code,
        yearMonth: evalMonth,
        expectedCount,
        submittedCount,
        processedCount,
        isMet,
        submissionDeadlineMet,
        processingDeadlineMet,
        events: pharmacy.slaEvents.map((e) => ({
          eventType: e.eventType,
          createdAt: e.createdAt,
          notes: e.notes,
        })),
      };
    });

    const compliant = pharmacyStatuses.filter((p) => p.isMet).length;
    const nonCompliant = pharmacyStatuses.filter(
      (p) => !p.isMet && (!p.submissionDeadlineMet || !p.processingDeadlineMet)
    ).length;
    const pending = pharmacyStatuses.length - compliant - nonCompliant;

    return {
      yearMonth: evalMonth,
      totalPharmacies: pharmacies.length,
      compliant,
      nonCompliant,
      pending,
      pharmacies: pharmacyStatuses,
    };
  }

  /**
   * Get SLA status for a specific pharmacy
   */
  async getPharmacyStatus(pharmacyId: string, yearMonth?: string): Promise<PharmacySlaStatus> {
    const evalMonth = yearMonth || this.getYearMonth();
    const now = new Date();

    // Calculate date range for the month
    const [yearStr, monthStr] = evalMonth.split('-');
    const startDate = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
    const endDate = new Date(parseInt(yearStr), parseInt(monthStr), 0, 23, 59, 59);

    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      include: {
        slaEvents: {
          where: { yearMonth: evalMonth },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    // Get requirement instances for this pharmacy and month period
    const instances = await this.prisma.requirementInstance.findMany({
      where: {
        requirement: {
          pharmacyId,
          isActive: true,
        },
        periodStart: { lte: endDate },
        periodEnd: { gte: startDate },
      },
    });

    // Count instances by status
    const expectedCount = instances.length; // 0 if no requirements defined
    const submittedCount = instances.filter(
      (i) => ['SUBMITTED', 'PROCESSED'].includes(i.status)
    ).length;
    const processedCount = instances.filter(
      (i) => i.status === 'PROCESSED'
    ).length;

    // Count missed deadlines: PENDING instances where submissionDeadline has passed
    const submissionMissedCount = instances.filter(
      (i) => i.status === 'PENDING' && i.submissionDeadline && new Date(i.submissionDeadline) < now
    ).length;

    // Processing SLA: consider late submissions that were processed promptly.
    const dueDays = await this.getDueDays(pharmacyId);
    const processingWindowDays = dueDays.processingDueDay - dueDays.submissionDueDay;

    const processingMissedCount = instances.filter((i) => {
      if (i.status !== 'SUBMITTED') return false;
      if (!i.processingDeadline) return false;
      const originalDeadlinePassed = new Date(i.processingDeadline) < now;
      if (!originalDeadlinePassed) return false;

      // If submitted late, give manager a processing window from submission date
      if (i.submittedAt && i.submissionDeadline && new Date(i.submittedAt) > new Date(i.submissionDeadline)) {
        const extendedDeadline = new Date(i.submittedAt);
        extendedDeadline.setDate(extendedDeadline.getDate() + Math.max(processingWindowDays, 5));
        return extendedDeadline < now;
      }

      return true;
    }).length;

    // Submission deadline is met if no pending instances have missed their deadline
    const submissionDeadlineMet = submissionMissedCount === 0;

    // Processing deadline is met if no submitted instances have missed their deadline
    const processingDeadlineMet = processingMissedCount === 0;

    // SLA is met only if:
    // 1. There are requirements defined (expectedCount > 0)
    // 2. All requirements are processed
    // 3. No missed deadlines
    const isMet = expectedCount > 0 && processedCount >= expectedCount && submissionDeadlineMet && processingDeadlineMet;

    return {
      pharmacyId: pharmacy.id,
      pharmacyName: pharmacy.name,
      pharmacyCode: pharmacy.code,
      yearMonth: evalMonth,
      expectedCount,
      submittedCount,
      processedCount,
      isMet,
      submissionDeadlineMet,
      processingDeadlineMet,
      events: pharmacy.slaEvents.map((e) => ({
        eventType: e.eventType,
        createdAt: e.createdAt,
        notes: e.notes,
      })),
    };
  }

  /**
   * Get recent SLA alerts for a pharmacy (for dashboard)
   */
  async getPharmacyAlerts(pharmacyId: string, limit = 5): Promise<any[]> {
    const events = await this.prisma.slaEvent.findMany({
      where: { pharmacyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const notifications = await this.prisma.notificationLog.findMany({
      where: { pharmacyId },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });

    // Combine and sort by date
    const combined = [
      ...events.map((e) => ({
        type: 'sla_event',
        eventType: e.eventType,
        message: e.notes,
        createdAt: e.createdAt,
      })),
      ...notifications.map((n) => ({
        type: 'notification',
        eventType: n.type,
        message: n.subject,
        createdAt: n.sentAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return combined.slice(0, limit);
  }

  /**
   * Update invoice counts when invoice status changes
   * Called from InvoiceService on status transitions
   */
  async updateInvoiceCounts(pharmacyId: string, yearMonth: string): Promise<void> {
    // Calculate date range for the month
    const [yearStr, monthStr] = yearMonth.split('-');
    const startDate = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
    const endDate = new Date(parseInt(yearStr), parseInt(monthStr), 0, 23, 59, 59);
    const now = new Date();

    // Get requirement instances for this pharmacy and month period
    const requirementInstances = await this.prisma.requirementInstance.findMany({
      where: {
        requirement: {
          pharmacyId,
          isActive: true,
        },
        periodStart: { lte: endDate },
        periodEnd: { gte: startDate },
      },
    });

    // Count requirement instances for this month
    const expectedCount = requirementInstances.length || 1; // Default to 1 if no requirements defined

    // Count submitted: instances that are SUBMITTED or PROCESSED
    // A PENDING instance that missed its submission deadline counts as NOT submitted (a miss)
    const submittedInstanceCount = requirementInstances.filter(
      (i) => ['SUBMITTED', 'PROCESSED'].includes(i.status)
    ).length;

    // Count processed: instances that are PROCESSED
    const processedInstanceCount = requirementInstances.filter(
      (i) => i.status === 'PROCESSED'
    ).length;

    // Count missed submission deadlines: PENDING instances where submissionDeadline has passed
    const missedSubmissionCount = requirementInstances.filter(
      (i) => i.status === 'PENDING' && i.submissionDeadline && new Date(i.submissionDeadline) < now
    ).length;

    // Count missed processing deadlines, accounting for late submissions
    const dueDays = await this.getDueDays(pharmacyId);
    const processingWindowDays = dueDays.processingDueDay - dueDays.submissionDueDay;

    const missedProcessingCount = requirementInstances.filter((i) => {
      if (i.status !== 'SUBMITTED') return false;
      if (!i.processingDeadline) return false;
      const originalDeadlinePassed = new Date(i.processingDeadline) < now;
      if (!originalDeadlinePassed) return false;

      // If submitted late, give manager a processing window from submission date
      if (i.submittedAt && i.submissionDeadline && new Date(i.submittedAt) > new Date(i.submissionDeadline)) {
        const extendedDeadline = new Date(i.submittedAt);
        extendedDeadline.setDate(extendedDeadline.getDate() + Math.max(processingWindowDays, 5));
        return extendedDeadline < now;
      }

      return true;
    }).length;

    // Also count actual invoices as a fallback (for orgs without requirement definitions)
    const submittedInvoiceCount = await this.prisma.invoice.count({
      where: {
        pharmacyId,
        submittedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const processedInvoiceCount = await this.prisma.invoice.count({
      where: {
        pharmacyId,
        status: {
          in: [InvoiceStatus.APPROVED, InvoiceStatus.SCHEDULED, InvoiceStatus.PAID],
        },
        approvedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Use requirement instance counts if requirements are defined, otherwise use invoice counts
    const submittedCount = requirementInstances.length > 0 ? submittedInstanceCount : submittedInvoiceCount;
    const processedCount = requirementInstances.length > 0 ? processedInstanceCount : processedInvoiceCount;

    // SLA is met only if all requirements are processed AND no missed deadlines
    const isMet = processedCount >= expectedCount && missedSubmissionCount === 0 && missedProcessingCount === 0;

    // Upsert monthly requirement
    await this.prisma.monthlyInvoiceRequirement.upsert({
      where: {
        pharmacyId_yearMonth: { pharmacyId, yearMonth },
      },
      create: {
        pharmacyId,
        yearMonth,
        expectedCount,
        submittedCount,
        processedCount,
        isMet,
      },
      update: {
        expectedCount,
        submittedCount,
        processedCount,
        isMet,
      },
    });
  }

  /**
   * Ensure monthly requirement record exists for a pharmacy
   */
  private async ensureMonthlyRequirement(pharmacyId: string, yearMonth: string): Promise<void> {
    await this.prisma.monthlyInvoiceRequirement.upsert({
      where: {
        pharmacyId_yearMonth: { pharmacyId, yearMonth },
      },
      create: {
        pharmacyId,
        yearMonth,
        expectedCount: 1,
      },
      update: {},
    });
  }

  /**
   * Check submission deadline and record violations
   * Returns true if there was a violation
   */
  private async checkSubmissionDeadline(pharmacyId: string, yearMonth: string, submissionDueDay?: number): Promise<boolean> {
    const req = await this.prisma.monthlyInvoiceRequirement.findUnique({
      where: {
        pharmacyId_yearMonth: { pharmacyId, yearMonth },
      },
    });

    if (!req || req.submittedCount >= req.expectedCount) {
      return false; // No violation
    }

    // Check if violation already recorded (idempotent)
    const existingViolation = await this.prisma.slaEvent.findFirst({
      where: {
        pharmacyId,
        yearMonth,
        eventType: SlaEventType.SUBMISSION_MISSED,
      },
    });

    if (!existingViolation) {
      await this.prisma.slaEvent.create({
        data: {
          pharmacyId,
          yearMonth,
          eventType: SlaEventType.SUBMISSION_MISSED,
          notes: `Submission deadline missed: ${req.submittedCount}/${req.expectedCount} invoices submitted by ${submissionDueDay ?? 5}th`,
          metadata: {
            expected: req.expectedCount,
            actual: req.submittedCount,
            deadline: submissionDueDay ?? 5,
          },
        },
      });

      // Log notification
      await this.prisma.notificationLog.create({
        data: {
          pharmacyId,
          type: 'sla_violation',
          channel: 'in_app',
          subject: 'Invoice Submission Deadline Missed',
          body: `Submission deadline missed for ${yearMonth}. Expected: ${req.expectedCount}, Submitted: ${req.submittedCount}`,
          metadata: { yearMonth, type: 'submission' },
        },
      });

      return true;
    }

    return false;
  }

  /**
   * Check processing deadline and record violations
   * Returns true if there was a violation
   */
  private async checkProcessingDeadline(pharmacyId: string, yearMonth: string, processingDueDay?: number): Promise<boolean> {
    const req = await this.prisma.monthlyInvoiceRequirement.findUnique({
      where: {
        pharmacyId_yearMonth: { pharmacyId, yearMonth },
      },
    });

    if (!req || req.processedCount >= req.expectedCount) {
      return false; // No violation
    }

    // Check if violation already recorded (idempotent)
    const existingViolation = await this.prisma.slaEvent.findFirst({
      where: {
        pharmacyId,
        yearMonth,
        eventType: SlaEventType.PROCESSING_MISSED,
      },
    });

    if (!existingViolation) {
      await this.prisma.slaEvent.create({
        data: {
          pharmacyId,
          yearMonth,
          eventType: SlaEventType.PROCESSING_MISSED,
          notes: `Processing deadline missed: ${req.processedCount}/${req.expectedCount} invoices processed by ${processingDueDay ?? 10}th`,
          metadata: {
            expected: req.expectedCount,
            actual: req.processedCount,
            deadline: processingDueDay ?? 10,
          },
        },
      });

      // Log notification
      await this.prisma.notificationLog.create({
        data: {
          pharmacyId,
          type: 'sla_violation',
          channel: 'in_app',
          subject: 'Invoice Processing Deadline Missed',
          body: `Processing deadline missed for ${yearMonth}. Expected: ${req.expectedCount}, Processed: ${req.processedCount}`,
          metadata: { yearMonth, type: 'processing' },
        },
      });

      return true;
    }

    return false;
  }
}
