import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractionService } from './extraction.service';
import { ExtractionController } from './extraction.controller';
import { AI_EXTRACTOR_PROVIDER } from './providers';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { GoogleDocumentAIProvider } from './providers/google-document-ai.provider';
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
    OllamaProvider,
    GoogleDocumentAIProvider,
    {
      provide: AI_EXTRACTOR_PROVIDER,
      useFactory: (
        configService: ConfigService,
        geminiProvider: GeminiProvider,
        openaiProvider: OpenAIProvider,
        ollamaProvider: OllamaProvider,
        googleDocAIProvider: GoogleDocumentAIProvider,
      ) => {
        // Invoice extraction requires vision capabilities
        // Use AI_EXTRACTION_PROVIDER if set, otherwise fall back to AI_PROVIDER
        const extractionProvider = configService.get<string>('AI_EXTRACTION_PROVIDER')
          || configService.get<string>('AI_PROVIDER')
          || 'openai';

        // Check if local Ollama extraction is explicitly enabled
        const useLocalExtraction = configService.get<string>('USE_LOCAL_EXTRACTION') === 'true';

        // Google Document AI has highest priority if configured
        if (extractionProvider.toLowerCase() === 'google-document-ai' || extractionProvider.toLowerCase() === 'document-ai') {
          if (googleDocAIProvider.isConfigured()) {
            logger.log('Using Google Document AI provider for extraction (highest accuracy)');
            return googleDocAIProvider;
          }
          logger.warn('Google Document AI selected but not configured, falling back to other providers');
        }

        if (extractionProvider.toLowerCase() === 'ollama') {
          if (useLocalExtraction) {
            // Use local Ollama with vision model (LLaVA)
            logger.log('Using Ollama provider for extraction (local vision model)');
            return ollamaProvider;
          }
          // Fall back to cloud providers for better accuracy
          if (googleDocAIProvider.isConfigured()) {
            logger.log('Ollama selected but using Google Document AI for extraction (better accuracy)');
            return googleDocAIProvider;
          }
          if (configService.get<string>('OPENAI_API_KEY')) {
            logger.log('Ollama selected but using OpenAI for extraction (better accuracy)');
            return openaiProvider;
          }
          if (configService.get<string>('GEMINI_API_KEY')) {
            logger.log('Ollama selected but using Gemini for extraction (better accuracy)');
            return geminiProvider;
          }
          // No cloud keys available, use local Ollama
          logger.log('Using Ollama provider for extraction (no cloud API keys)');
          return ollamaProvider;
        }

        switch (extractionProvider.toLowerCase()) {
          case 'openai':
            logger.log('Using OpenAI provider for extraction');
            return openaiProvider;
          case 'gemini':
            logger.log('Using Gemini AI provider for extraction');
            return geminiProvider;
          default:
            // Check if Google Document AI is configured as a default fallback
            if (googleDocAIProvider.isConfigured()) {
              logger.log('Using Google Document AI provider for extraction');
              return googleDocAIProvider;
            }
            logger.log(`Unknown provider ${extractionProvider}, defaulting to OpenAI`);
            return openaiProvider;
        }
      },
      inject: [ConfigService, GeminiProvider, OpenAIProvider, OllamaProvider, GoogleDocumentAIProvider],
    },
  ],
  exports: [ExtractionService],
})
export class ExtractionModule {}
