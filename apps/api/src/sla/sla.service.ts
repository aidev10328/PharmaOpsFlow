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
  // SLA configuration (can be overridden via environment)
  private readonly SUBMISSION_DUE_DAY = parseInt(process.env.SUBMISSION_DUE_DAY || '5', 10);
  private readonly PROCESSING_DUE_DAY = parseInt(process.env.PROCESSING_DUE_DAY || '10', 10);
  private readonly ORG_TIMEZONE = process.env.ORG_TIMEZONE || 'America/New_York';

  constructor(private readonly prisma: PrismaService) {}

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

      // Check submission deadline (5th of month)
      if (currentDay >= this.SUBMISSION_DUE_DAY) {
        const hadSubmissionViolation = await this.checkSubmissionDeadline(pharmacy.id, evalMonth);
        if (hadSubmissionViolation) submissionViolations++;
      }

      // Check processing deadline (10th of month)
      if (currentDay >= this.PROCESSING_DUE_DAY) {
        const hadProcessingViolation = await this.checkProcessingDeadline(pharmacy.id, evalMonth);
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
              body: `Reminder: ${type === 'submission' ? 'Invoice submissions' : 'Invoice processing'} due by ${type === 'submission' ? this.SUBMISSION_DUE_DAY : this.PROCESSING_DUE_DAY}th of the month.`,
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
  async getSummary(orgId: string, yearMonth?: string): Promise<{
    yearMonth: string;
    totalPharmacies: number;
    compliant: number;
    nonCompliant: number;
    pending: number;
    pharmacies: PharmacySlaStatus[];
  }> {
    const evalMonth = yearMonth || this.getYearMonth();
    const currentDate = this.getCurrentDate();
    const currentDay = currentDate.getDate();

    const pharmacies = await this.prisma.pharmacy.findMany({
      where: { orgId, isActive: true },
      include: {
        monthlyRequirements: {
          where: { yearMonth: evalMonth },
        },
        slaEvents: {
          where: { yearMonth: evalMonth },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const pharmacyStatuses: PharmacySlaStatus[] = pharmacies.map((pharmacy) => {
      const req = pharmacy.monthlyRequirements[0];
      const submissionDeadlinePassed = currentDay >= this.SUBMISSION_DUE_DAY;
      const processingDeadlinePassed = currentDay >= this.PROCESSING_DUE_DAY;

      return {
        pharmacyId: pharmacy.id,
        pharmacyName: pharmacy.name,
        pharmacyCode: pharmacy.code,
        yearMonth: evalMonth,
        expectedCount: req?.expectedCount ?? 1,
        submittedCount: req?.submittedCount ?? 0,
        processedCount: req?.processedCount ?? 0,
        isMet: req?.isMet ?? false,
        submissionDeadlineMet: submissionDeadlinePassed
          ? (req?.submittedCount ?? 0) >= (req?.expectedCount ?? 1)
          : true, // Not yet due
        processingDeadlineMet: processingDeadlinePassed
          ? (req?.processedCount ?? 0) >= (req?.expectedCount ?? 1)
          : true, // Not yet due
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
    const currentDate = this.getCurrentDate();
    const currentDay = currentDate.getDate();

    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      include: {
        monthlyRequirements: {
          where: { yearMonth: evalMonth },
        },
        slaEvents: {
          where: { yearMonth: evalMonth },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    const req = pharmacy.monthlyRequirements[0];
    const submissionDeadlinePassed = currentDay >= this.SUBMISSION_DUE_DAY;
    const processingDeadlinePassed = currentDay >= this.PROCESSING_DUE_DAY;

    return {
      pharmacyId: pharmacy.id,
      pharmacyName: pharmacy.name,
      pharmacyCode: pharmacy.code,
      yearMonth: evalMonth,
      expectedCount: req?.expectedCount ?? 1,
      submittedCount: req?.submittedCount ?? 0,
      processedCount: req?.processedCount ?? 0,
      isMet: req?.isMet ?? false,
      submissionDeadlineMet: submissionDeadlinePassed
        ? (req?.submittedCount ?? 0) >= (req?.expectedCount ?? 1)
        : true,
      processingDeadlineMet: processingDeadlinePassed
        ? (req?.processedCount ?? 0) >= (req?.expectedCount ?? 1)
        : true,
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
    // Count submitted invoices for this month
    const [yearStr, monthStr] = yearMonth.split('-');
    const startDate = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
    const endDate = new Date(parseInt(yearStr), parseInt(monthStr), 0, 23, 59, 59);

    const submittedCount = await this.prisma.invoice.count({
      where: {
        pharmacyId,
        submittedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const processedCount = await this.prisma.invoice.count({
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

    // Upsert monthly requirement
    const req = await this.prisma.monthlyInvoiceRequirement.upsert({
      where: {
        pharmacyId_yearMonth: { pharmacyId, yearMonth },
      },
      create: {
        pharmacyId,
        yearMonth,
        expectedCount: 1,
        submittedCount,
        processedCount,
        isMet: processedCount >= 1,
      },
      update: {
        submittedCount,
        processedCount,
        isMet: processedCount >= 1,
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
  private async checkSubmissionDeadline(pharmacyId: string, yearMonth: string): Promise<boolean> {
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
          notes: `Submission deadline missed: ${req.submittedCount}/${req.expectedCount} invoices submitted by ${this.SUBMISSION_DUE_DAY}th`,
          metadata: {
            expected: req.expectedCount,
            actual: req.submittedCount,
            deadline: this.SUBMISSION_DUE_DAY,
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
  private async checkProcessingDeadline(pharmacyId: string, yearMonth: string): Promise<boolean> {
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
          notes: `Processing deadline missed: ${req.processedCount}/${req.expectedCount} invoices processed by ${this.PROCESSING_DUE_DAY}th`,
          metadata: {
            expected: req.expectedCount,
            actual: req.processedCount,
            deadline: this.PROCESSING_DUE_DAY,
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
