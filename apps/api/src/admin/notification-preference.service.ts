import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NotificationType } from '@prisma/client';
import { UpdateNotificationPreferenceDto } from './dto';

const NOTIFICATION_DEFAULTS: Record<
  NotificationType,
  { description: string; channels: string[]; recipientRoles: string[]; config: Record<string, any> | null; enabled: boolean }
> = {
  SLA_SUBMISSION_REMINDER: {
    description: 'Reminder sent before the invoice submission deadline',
    channels: ['in_app'],
    recipientRoles: ['ADMIN', 'PHARMACY_ADMIN'],
    config: { reminderDaysBefore: 2 },
    enabled: true,
  },
  SLA_PROCESSING_REMINDER: {
    description: 'Reminder sent before the invoice processing deadline',
    channels: ['in_app'],
    recipientRoles: ['ADMIN', 'PHARMACY_ADMIN'],
    config: { reminderDaysBefore: 2 },
    enabled: true,
  },
  SLA_SUBMISSION_VIOLATION: {
    description: 'Alert when a pharmacy misses the submission deadline',
    channels: ['in_app'],
    recipientRoles: ['ADMIN'],
    config: null,
    enabled: true,
  },
  SLA_PROCESSING_VIOLATION: {
    description: 'Alert when invoices are not processed by the deadline',
    channels: ['in_app'],
    recipientRoles: ['ADMIN'],
    config: null,
    enabled: true,
  },
  INVOICE_SUBMITTED: {
    description: 'Notification when a new invoice is submitted',
    channels: ['in_app'],
    recipientRoles: ['ADMIN', 'PHARMACY_ADMIN'],
    config: null,
    enabled: true,
  },
  INVOICE_APPROVED: {
    description: 'Notification when an invoice is approved',
    channels: ['in_app'],
    recipientRoles: ['PHARMACY_ADMIN', 'PHARMACY_USER'],
    config: null,
    enabled: true,
  },
  INVOICE_REJECTED: {
    description: 'Notification when an invoice is rejected',
    channels: ['in_app'],
    recipientRoles: ['PHARMACY_ADMIN', 'PHARMACY_USER'],
    config: null,
    enabled: true,
  },
  INVOICE_OVERDUE: {
    description: 'Alert when an invoice passes its due date without payment',
    channels: ['in_app'],
    recipientRoles: ['ADMIN', 'PHARMACY_ADMIN'],
    config: { daysAfterDue: 1 },
    enabled: true,
  },
  AI_EXTRACTION_FAILED: {
    description: 'Alert when AI document extraction fails',
    channels: ['in_app'],
    recipientRoles: ['ADMIN'],
    config: null,
    enabled: true,
  },
  USER_REGISTERED: {
    description: 'Notification when a new user is created',
    channels: ['in_app'],
    recipientRoles: ['ADMIN'],
    config: null,
    enabled: false,
  },
  PHARMACY_DEACTIVATED: {
    description: 'Alert when a pharmacy is deactivated',
    channels: ['in_app'],
    recipientRoles: ['ADMIN'],
    config: null,
    enabled: true,
  },
};

// Types that are currently wired and functional
const IMPLEMENTED_TYPES: Set<NotificationType> = new Set([
  NotificationType.SLA_SUBMISSION_REMINDER,
  NotificationType.SLA_PROCESSING_REMINDER,
  NotificationType.SLA_SUBMISSION_VIOLATION,
  NotificationType.SLA_PROCESSING_VIOLATION,
]);

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveOrgId(orgId?: string): Promise<string> {
    if (orgId) return orgId;
    // Fallback: find the first org
    const org = await this.prisma.org.findFirst({ select: { id: true } });
    if (!org) throw new NotFoundException('No organization found');
    return org.id;
  }

  async getPreferences(orgId?: string) {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    let prefs = await this.prisma.notificationPreference.findMany({
      where: { orgId: resolvedOrgId },
      orderBy: { notificationType: 'asc' },
    });

    // Lazy-seed: create defaults for any missing notification types
    const existingTypes = new Set(prefs.map((p) => p.notificationType));
    const allTypes = Object.values(NotificationType);
    const missing = allTypes.filter((t) => !existingTypes.has(t));

    if (missing.length > 0) {
      await this.prisma.notificationPreference.createMany({
        data: missing.map((notificationType) => {
          const defaults = NOTIFICATION_DEFAULTS[notificationType];
          return {
            orgId: resolvedOrgId,
            notificationType,
            enabled: defaults.enabled,
            channels: defaults.channels,
            config: defaults.config,
            recipientRoles: defaults.recipientRoles,
            description: defaults.description,
          };
        }),
      });
      prefs = await this.prisma.notificationPreference.findMany({
        where: { orgId: resolvedOrgId },
        orderBy: { notificationType: 'asc' },
      });
    }

    return prefs.map((p) => ({
      ...p,
      implemented: IMPLEMENTED_TYPES.has(p.notificationType),
    }));
  }

  async updatePreference(
    orgId: string | undefined,
    notificationType: NotificationType,
    dto: UpdateNotificationPreferenceDto,
  ) {
    const resolvedOrgId = await this.resolveOrgId(orgId);
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { orgId_notificationType: { orgId: resolvedOrgId, notificationType } },
    });

    if (!existing) {
      throw new NotFoundException(`Notification preference not found for type ${notificationType}`);
    }

    // Ensure in_app is always included in channels
    let channels = dto.channels;
    if (channels && !channels.includes('in_app')) {
      channels = ['in_app', ...channels];
    }

    return this.prisma.notificationPreference.update({
      where: { id: existing.id },
      data: {
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(channels && { channels }),
        ...(dto.config !== undefined && { config: dto.config }),
        ...(dto.recipientRoles && { recipientRoles: dto.recipientRoles }),
      },
    });
  }

  async isNotificationEnabled(orgId: string, notificationType: NotificationType): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { orgId_notificationType: { orgId, notificationType } },
    });
    // Default to enabled if no preference exists yet
    return pref ? pref.enabled : true;
  }

  async getPreference(orgId: string, notificationType: NotificationType) {
    return this.prisma.notificationPreference.findUnique({
      where: { orgId_notificationType: { orgId, notificationType } },
    });
  }
}
