import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { InvoiceModule } from './invoice/invoice.module';
import { SlaModule } from './sla/sla.module';
import { ExtractionModule } from './extraction/extraction.module';
import { QueryModule } from './query/query.module';
import { ExploreModule } from './explore/explore.module';
import { ChatModule } from './chat/chat.module';
import { AdminModule } from './admin/admin.module';
import { OversightModule } from './oversight/oversight.module';
import { RequirementsModule } from './requirements/requirements.module';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    PharmacyModule,
    InvoiceModule,
    SlaModule,
    ExtractionModule,
    QueryModule,
    ExploreModule,
    ChatModule,
    AdminModule,
    OversightModule,
    RequirementsModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
