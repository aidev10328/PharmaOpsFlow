import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PrismaService } from '../prisma.service';
import { SupportService } from './support.service';
import { SupportController, SupportAdminController } from './support.controller';
import {
  ISSUE_STRUCTURING_SERVICE,
  DeterministicStructuringService,
} from './issue-structuring.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  ],
  controllers: [SupportController, SupportAdminController],
  providers: [
    SupportService,
    PrismaService,
    {
      provide: ISSUE_STRUCTURING_SERVICE,
      useClass: DeterministicStructuringService,
    },
  ],
  exports: [SupportService],
})
export class SupportModule {}
