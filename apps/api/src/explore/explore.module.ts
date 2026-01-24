import { Module } from '@nestjs/common';
import { ExploreController } from './explore.controller';
import { QueryModule } from '../query/query.module';

@Module({
  imports: [QueryModule],
  controllers: [ExploreController],
})
export class ExploreModule {}
