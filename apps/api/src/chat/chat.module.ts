import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { QueryModule } from '../query/query.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [QueryModule],
  controllers: [ChatController],
  providers: [PrismaService, ChatService],
  exports: [ChatService],
})
export class ChatModule {}
