import { Module, forwardRef } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { InvoiceFilesController } from './invoice-files.controller';
import { InvoiceFilesService } from './invoice-files.service';
import { PrismaService } from '../prisma.service';
import { StorageModule } from '../storage';
import { SlaModule } from '../sla/sla.module';
import { ExtractionModule } from '../extraction/extraction.module';

@Module({
  imports: [
    StorageModule,
    forwardRef(() => SlaModule),
    forwardRef(() => ExtractionModule),
    MulterModule.register({
      storage: memoryStorage(), // Store in memory for processing before upload
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  ],
  controllers: [InvoiceController, InvoiceFilesController],
  providers: [InvoiceService, InvoiceFilesService, PrismaService],
  exports: [InvoiceService, InvoiceFilesService],
})
export class InvoiceModule {}
