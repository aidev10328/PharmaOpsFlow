import { Module } from '@nestjs/common';
import { SlaService } from './sla.service';
import { SlaController } from './sla.controller';
import { PrismaService } from '../prisma.service';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AdminModule],
  controllers: [SlaController],
  providers: [SlaService, PrismaService],
  exports: [SlaService],
})
export class SlaModule {}
