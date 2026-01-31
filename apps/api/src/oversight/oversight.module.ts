import { Module } from '@nestjs/common';
import { OversightInvoicesController } from './oversight-invoices.controller';
import { OversightOpsController } from './oversight-ops.controller';
import { OversightService } from './oversight.service';
import { PrismaService } from '../prisma.service';
import { AdminModule } from '../admin/admin.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { SlaModule } from '../sla/sla.module';

@Module({
  imports: [AdminModule, ExtractionModule, SlaModule],
  controllers: [OversightInvoicesController, OversightOpsController],
  providers: [OversightService, PrismaService],
})
export class OversightModule {}
