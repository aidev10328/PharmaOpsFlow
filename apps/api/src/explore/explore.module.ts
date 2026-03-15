import { Module } from '@nestjs/common';
import { ExploreController } from './explore.controller';
import { QueryModule } from '../query/query.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [QueryModule],
  controllers: [ExploreController],
  providers: [PrismaService],
})
export class ExploreModule {}
