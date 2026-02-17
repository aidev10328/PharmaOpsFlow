import { Injectable, Logger } from '@nestjs/common';
import { AIExtractorProvider } from './ai-provider.interface';
import {
  ExtractionContext,
  ExtractionResult,
  ExtractedInvoiceData,
  ExtractionConfidence,
} from '../types';

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
export class GeminiProvider implements AIExtractorProvider {
  private readonly logger = new Logger(GeminiProvider.name);

  readonly name = 'Gemini';
  readonly providerType = 'GEMINI' as const;

  private get apiKey(): string | undefined {
    return process.env.GEMINI_API_KEY;
  }

  private get model(): string {
    return process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async extractInvoiceFromFile(context: ExtractionContext): Promise<ExtractionResult> {
    if (!this.isConfigured()) {
      throw new Error('Gemini provider is not configured. Set GEMINI_API_KEY environment variable.');
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
      let mimeType = context.mimeType;
      if (!mimeType.startsWith('image/') && !mimeType.startsWith('application/pdf')) {
        mimeType = 'application/octet-stream';
      }

      // Call Gemini API
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Data,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              topP: 0.8,
              maxOutputTokens: 4096,
            },
          }),
        },
      );

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        this.logger.error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
        throw new Error(`Gemini API error: ${geminiResponse.status}`);
      }

      const geminiData = await geminiResponse.json();

      // Extract text from response
      const responseText =
        geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

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

}
