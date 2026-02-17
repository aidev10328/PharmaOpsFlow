import { Injectable, Logger } from '@nestjs/common';
import { AIExtractorProvider } from './ai-provider.interface';
import {
  ExtractionContext,
  ExtractionResult,
  ExtractedInvoiceData,
  ExtractionConfidence,
} from '../types';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pdfToPng } = require('pdf-to-png-converter');

const EXTRACTION_PROMPT = `You are an expert invoice data extraction system. Analyze the provided invoice image or PDF and extract the following information.

IMPORTANT: Return ONLY valid JSON, no additional text or markdown formatting.

DOCUMENT TYPE DETECTION:
First, determine what type of document this is and set documentType accordingly:
- "INVOICE": A standard invoice for one transaction or with detailed line items
- "STATEMENT": A summary document listing multiple invoices (often shows aging buckets like "Current", "1-30 days", "61-90 days", "Over 90 days"), account statement, or remittance advice
- "CREDIT_MEMO": A credit memo or refund document
- "OTHER": If it doesn't fit the above categories

Extract these fields:
- vendorName: The company/vendor name on the invoice (the one billing you, NOT the payer/customer)
- invoiceNumber: The invoice number/ID (for statements, use the Statement Reference or Stmt Ref)
- accountNumber: The customer's account number (also called "Customer Number", "Customer #", "Cust No") with the vendor. CRITICAL RULES:
  1. This MUST be a NUMERIC or ALPHANUMERIC code like "88009267", "ABC-12345", "1234567890"
  2. In tables, look for columns labeled "Account #" or "Customer #" - the VALUE is in the DATA ROW below the header, NOT the header itself
  3. NEVER extract words like "Service", "NUMBER", "Invoice", "Date", "Amount" or company names
  4. The account number typically has 5-15 digits/characters and appears near the top of the document
  5. If you see "Account # | Due Date | Total Due" followed by "88009267 | 5/10/2020 | $111.06", extract "88009267" as the account number
- documentType: "INVOICE", "STATEMENT", "CREDIT_MEMO", or "OTHER"
- invoiceDate: The invoice date in YYYY-MM-DD format
- dueDate: The payment due date in YYYY-MM-DD format. If it says "Due upon Receipt" or "Payable upon Receipt", use "DUE_UPON_RECEIPT"
- paymentTerms: Payment terms like "Net 30", "Net 60", "Due upon Receipt", "2% 10 Net 30", etc. Extract any discount terms if present.
- amount: The TOTAL/GRAND TOTAL amount as a number (no currency symbols). For statements, use "Amount Due" or "Total Balance"
- currency: The currency code (default USD)
- invoiceType: Classify expense category as one of: RENT, ELECTRICITY, VENDOR_INVOICE, INTERNET, INSURANCE, WHOLESALE_DRUG, EQUIPMENT, SERVICES, UTILITIES, MAINTENANCE, OTHER
- payableTo: The name/entity to make payment to. Look for "Payable to:", "Pay to:", "Make checks payable to:", etc.
- paymentAddress: The address where payment should be sent. Look for "Send Payment to:", "Remit to:", "Payment Address:", etc. Include the full address.
- notes: Any important notes or special instructions (optional)

Also provide confidence scores (0.0 to 1.0) for each main field based on how clearly the information was visible and readable.

Known vendors in the system (use exact name if matched):
{{KNOWN_VENDORS}}

Known invoice types in the system:
{{KNOWN_INVOICE_TYPES}}

Return JSON in this exact format:
{
  "extracted": {
    "vendorName": string | null,
    "invoiceNumber": string | null,
    "accountNumber": string | null,
    "documentType": "INVOICE" | "STATEMENT" | "CREDIT_MEMO" | "OTHER",
    "invoiceDate": "YYYY-MM-DD" | null,
    "dueDate": "YYYY-MM-DD" | "DUE_UPON_RECEIPT" | null,
    "paymentTerms": string | null,
    "amount": number | null,
    "currency": "USD",
    "invoiceType": string | null,
    "payableTo": string | null,
    "paymentAddress": string | null,
    "notes": string | null
  },
  "confidence": {
    "vendorName": number,
    "invoiceNumber": number,
    "invoiceDate": number,
    "dueDate": number,
    "amount": number,
    "invoiceType": number
  }
}`;

@Injectable()
export class OpenAIProvider implements AIExtractorProvider {
  private readonly logger = new Logger(OpenAIProvider.name);

  readonly name = 'OpenAI';
  readonly providerType = 'OPENAI' as const;

  private get apiKey(): string | undefined {
    return process.env.OPENAI_API_KEY;
  }

  private get model(): string {
    return process.env.OPENAI_MODEL || 'gpt-4o';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async extractInvoiceFromFile(context: ExtractionContext): Promise<ExtractionResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI provider is not configured. Set OPENAI_API_KEY environment variable.');
    }

    const startTime = Date.now();

    try {
      // Build the prompt with context
      let prompt = EXTRACTION_PROMPT;

      if (context.knownVendors && context.knownVendors.length > 0) {
        const vendorList = context.knownVendors.map((v) => `- ${v.name}`).join('\n');
        prompt = prompt.replace('{{KNOWN_VENDORS}}', vendorList);
      } else {
        prompt = prompt.replace('{{KNOWN_VENDORS}}', '(none provided)');
      }

      if (context.knownInvoiceTypes && context.knownInvoiceTypes.length > 0) {
        const typeList = context.knownInvoiceTypes.map((t) => `- ${t.name}`).join('\n');
        prompt = prompt.replace('{{KNOWN_INVOICE_TYPES}}', typeList);
      } else {
        prompt = prompt.replace('{{KNOWN_INVOICE_TYPES}}', '(use default types)');
      }

      // Fetch the file content
      const fileResponse = await fetch(context.downloadUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download file: ${fileResponse.status}`);
      }

      const fileBuffer = await fileResponse.arrayBuffer();
      const base64Data = Buffer.from(fileBuffer).toString('base64');

      // Determine media type
      const mimeType = context.mimeType;
      const supportedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const isPdf = mimeType === 'application/pdf';

      let openaiResponse: Response;

      if (isPdf) {
        // Handle PDF - first try text extraction, then fall back to image conversion
        this.logger.log('Processing PDF file');
        const pdfText = await this.extractTextFromPdf(Buffer.from(fileBuffer));

        if (pdfText && pdfText.trim().length >= 50) {
          // PDF has extractable text - use text-based extraction
          this.logger.log('Using text-based extraction for PDF');
          const textPrompt = prompt + `\n\nHere is the invoice text content:\n\n${pdfText}`;

          openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini', // Use cheaper model for text extraction
              messages: [
                {
                  role: 'user',
                  content: textPrompt,
                },
              ],
              max_tokens: 4096,
              temperature: 0.1,
            }),
          });
        } else {
          // PDF is scanned/image-based - convert to image and use Vision
          this.logger.log('PDF appears to be scanned/image-based, converting to image for Vision API');
          const pdfImage = await this.convertPdfToImage(Buffer.from(fileBuffer));

          if (!pdfImage) {
            throw new Error('Failed to convert PDF to image. Please try uploading an image (JPG, PNG) instead.');
          }

          const imageUrl = `data:image/png;base64,${pdfImage.toString('base64')}`;

          openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
              model: this.model,
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: prompt,
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: imageUrl,
                        detail: 'high',
                      },
                    },
                  ],
                },
              ],
              max_tokens: 4096,
              temperature: 0.1,
            }),
          });
        }
      } else {
        // Handle images using Vision
        let imageMimeType = mimeType;
        if (!supportedImageTypes.includes(mimeType)) {
          imageMimeType = 'image/png';
        }

        const imageUrl = `data:${imageMimeType};base64,${base64Data}`;

        openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: prompt,
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: imageUrl,
                      detail: 'high',
                    },
                  },
                ],
              },
            ],
            max_tokens: 4096,
            temperature: 0.1,
          }),
        });
      }

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        this.logger.error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
        throw new Error(`OpenAI API error: ${openaiResponse.status}`);
      }

      const openaiData = await openaiResponse.json();

      // Extract text from response
      const responseText = openaiData.choices?.[0]?.message?.content || '';

      // Parse JSON from response
      const result = this.parseExtractionResponse(responseText);

      return {
        ...result,
        processingMs: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(`Extraction failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private parseExtractionResponse(responseText: string): ExtractionResult {
    // Try to extract JSON from the response
    let jsonText = responseText.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    try {
      const parsed = JSON.parse(jsonText);

      // Validate and normalize the response
      const dueDate = parsed.extracted?.dueDate;
      const extracted: ExtractedInvoiceData = {
        vendorName: parsed.extracted?.vendorName ?? null,
        invoiceNumber: parsed.extracted?.invoiceNumber ?? null,
        accountNumber: this.normalizeAccountNumber(parsed.extracted?.accountNumber),
        documentType: parsed.extracted?.documentType ?? 'INVOICE',
        invoiceDate: this.normalizeDate(parsed.extracted?.invoiceDate),
        dueDate: dueDate === 'DUE_UPON_RECEIPT' ? 'DUE_UPON_RECEIPT' : this.normalizeDate(dueDate),
        paymentTerms: parsed.extracted?.paymentTerms ?? null,
        amount: this.normalizeAmount(parsed.extracted?.amount),
        currency: parsed.extracted?.currency || 'USD',
        invoiceType: parsed.extracted?.invoiceType ?? null,
        payableTo: parsed.extracted?.payableTo ?? null,
        paymentAddress: parsed.extracted?.paymentAddress ?? null,
        notes: parsed.extracted?.notes ?? undefined,
      };

      const confidence: ExtractionConfidence = {
        vendorName: this.normalizeConfidence(parsed.confidence?.vendorName),
        invoiceNumber: this.normalizeConfidence(parsed.confidence?.invoiceNumber),
        invoiceDate: this.normalizeConfidence(parsed.confidence?.invoiceDate),
        dueDate: this.normalizeConfidence(parsed.confidence?.dueDate),
        amount: this.normalizeConfidence(parsed.confidence?.amount),
        invoiceType: this.normalizeConfidence(parsed.confidence?.invoiceType),
      };

      return {
        extracted,
        confidence,
        rawText: responseText,
      };
    } catch (error) {
      this.logger.error(`Failed to parse extraction response: ${error.message}`);
      this.logger.debug(`Raw response: ${responseText}`);

      // Return empty extraction with low confidence
      return {
        extracted: {
          vendorName: null,
          invoiceNumber: null,
          invoiceDate: null,
          dueDate: null,
          amount: null,
          currency: 'USD',
          invoiceType: null,
        },
        confidence: {
          vendorName: 0,
          invoiceNumber: 0,
          invoiceDate: 0,
          dueDate: 0,
          amount: 0,
          invoiceType: 0,
        },
        rawText: responseText,
      };
    }
  }

  private normalizeDate(value: unknown): string | null {
    if (!value) return null;
    if (typeof value !== 'string') return null;

    // Try to parse and reformat the date
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return null;
      return date.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }

  private normalizeAmount(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // Remove currency symbols and commas
      const cleaned = value.replace(/[$,]/g, '').trim();
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private normalizeConfidence(value: unknown): number {
    if (typeof value !== 'number') return 0;
    return Math.max(0, Math.min(1, value));
  }

  private normalizeAccountNumber(value: unknown): string | null {
    if (!value) return null;
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();

    // Reject if it's a common non-account-number word
    const invalidValues = ['service', 'n/a', 'na', 'none', 'null', 'undefined', ''];
    if (invalidValues.includes(trimmed.toLowerCase())) {
      return null;
    }

    // Account numbers should contain at least one digit and be reasonably short
    if (!/\d/.test(trimmed)) {
      return null; // No digits = probably not an account number
    }

    // Should be reasonable length (4-30 chars)
    if (trimmed.length < 4 || trimmed.length > 30) {
      return null;
    }

    return trimmed;
  }

  private async extractTextFromPdf(buffer: Buffer): Promise<string> {
    try {
      const data = await pdfParse(buffer);
      return data.text || '';
    } catch (error) {
      this.logger.error(`PDF text extraction failed: ${error.message}`);
      return '';
    }
  }

  private async convertPdfToImage(buffer: Buffer): Promise<Buffer | null> {
    try {
      this.logger.log('Converting PDF to PNG image');
      const pngPages = await pdfToPng(buffer, {
        disableFontFace: true,
        useSystemFonts: true,
        viewportScale: 2.0, // Higher quality for better OCR
        pagesToProcess: [1], // Only process first page
      });

      if (pngPages && pngPages.length > 0 && pngPages[0].content) {
        this.logger.log('PDF successfully converted to PNG');
        return pngPages[0].content;
      }

      this.logger.warn('PDF conversion returned no pages');
      return null;
    } catch (error) {
      this.logger.error(`PDF to image conversion failed: ${error.message}`);
      return null;
    }
  }
}
