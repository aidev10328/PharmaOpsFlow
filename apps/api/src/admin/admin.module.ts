import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ReferenceController } from './reference.controller';
import { AdminService } from './admin.service';
import { ReferenceService } from './reference.service';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [AdminController, ReferenceController],
  providers: [AdminService, ReferenceService, AuditLogService, PrismaService],
  exports: [AdminService, ReferenceService, AuditLogService],
})
export class AdminModule {}
