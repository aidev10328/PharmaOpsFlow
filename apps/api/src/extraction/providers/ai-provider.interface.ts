import { ExtractionContext, ExtractionResult } from '../types';

export interface AIExtractorProvider {
  readonly name: string;
  readonly providerType: 'GEMINI' | 'OPENAI' | 'ANTHROPIC' | 'OTHER';

  /**
   * Extract invoice data from a file
   */
  extractInvoiceFromFile(context: ExtractionContext): Promise<ExtractionResult>;

  /**
   * Check if the provider is configured and ready
   */
  isConfigured(): boolean;
}

export const AI_EXTRACTOR_PROVIDER = Symbol('AI_EXTRACTOR_PROVIDER');
