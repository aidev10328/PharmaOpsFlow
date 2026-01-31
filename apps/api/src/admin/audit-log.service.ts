import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: any;
    after?: any;
  }) {
    return this.prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        before: params.before ?? undefined,
        after: params.after ?? undefined,
      },
    });
  }
}
