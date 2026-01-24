import { Module, Global } from '@nestjs/common';
import { InvoiceQueryService } from './invoice-query.service';
import { PrismaService } from '../prisma.service';

@Global()
@Module({
  providers: [InvoiceQueryService, PrismaService],
  exports: [InvoiceQueryService],
})
export class QueryModule {}
