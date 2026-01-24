import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractionService } from './extraction.service';
import { ExtractionController } from './extraction.controller';
import { AI_EXTRACTOR_PROVIDER } from './providers';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { StorageModule } from '../storage';
import { PrismaService } from '../prisma.service';

const logger = new Logger('ExtractionModule');

@Module({
  imports: [StorageModule],
  controllers: [ExtractionController],
  providers: [
    PrismaService,
    ExtractionService,
    GeminiProvider,
    OpenAIProvider,
    {
      provide: AI_EXTRACTOR_PROVIDER,
      useFactory: (
        configService: ConfigService,
        geminiProvider: GeminiProvider,
        openaiProvider: OpenAIProvider,
      ) => {
        const aiProvider = configService.get<string>('AI_PROVIDER') || 'openai';

        switch (aiProvider.toLowerCase()) {
          case 'openai':
            logger.log('Using OpenAI provider');
            return openaiProvider;
          case 'gemini':
            logger.log('Using Gemini AI provider');
            return geminiProvider;
          default:
            logger.log(`Unknown provider ${aiProvider}, defaulting to OpenAI`);
            return openaiProvider;
        }
      },
      inject: [ConfigService, GeminiProvider, OpenAIProvider],
    },
  ],
  exports: [ExtractionService],
})
export class ExtractionModule {}
