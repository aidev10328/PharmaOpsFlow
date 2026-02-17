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
export class OllamaProvider implements AIExtractorProvider {
  private readonly logger = new Logger(OllamaProvider.name);

  readonly name = 'Ollama (Local)';
  readonly providerType = 'OTHER' as const;

  private get baseUrl(): string {
    return process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  }

  private get visionModel(): string {
    // Use vision model for extraction (llava, bakllava, etc.)
    return process.env.OLLAMA_VISION_MODEL || 'llava';
  }

  isConfigured(): boolean {
    // Check if Ollama is running by making a simple request
    // For now, just check if the env is set or use default
    return true; // Ollama runs locally, always "configured"
  }

  async extractInvoiceFromFile(context: ExtractionContext): Promise<ExtractionResult> {
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
      const mimeType = context.mimeType;
      const isPdf = mimeType === 'application/pdf';

      let responseText: string;

      if (isPdf) {
        // For PDFs, first try text extraction
        this.logger.log('Processing PDF file');
        const pdfText = await this.extractTextFromPdf(Buffer.from(fileBuffer));

        if (pdfText && pdfText.trim().length >= 50) {
          // PDF has extractable text - use text-based extraction
          this.logger.log('Using text-based extraction for PDF');
          const textPrompt = prompt + `\n\nHere is the invoice text content:\n\n${pdfText}`;
          responseText = await this.callOllamaText(textPrompt);
        } else {
          // PDF is scanned/image-based - convert to image and use vision model
          this.logger.log('PDF appears to be scanned, converting to image for vision extraction');
          const pdfImage = await this.convertPdfToImage(Buffer.from(fileBuffer));

          if (pdfImage) {
            const base64Data = pdfImage.toString('base64');
            this.logger.log(`Using vision model (${this.visionModel}) for scanned PDF`);
            responseText = await this.callOllamaVision(prompt, base64Data);
          } else {
            // Fallback if PDF conversion fails
            this.logger.warn('PDF to image conversion failed, attempting text extraction');
            responseText = await this.callOllamaText(prompt + '\n\nNote: Unable to extract text from PDF. Please provide any visible information.');
          }
        }
      } else {
        // Handle images using vision model
        const base64Data = Buffer.from(fileBuffer).toString('base64');
        this.logger.log(`Using vision model (${this.visionModel}) for image extraction`);
        responseText = await this.callOllamaVision(prompt, base64Data);
      }

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

  private async callOllamaText(prompt: string): Promise<string> {
    const textModel = process.env.OLLAMA_MODEL || 'llama3.2';

    this.logger.log(`Calling Ollama text model (${textModel})`);

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: textModel,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 2000,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Ollama API error: ${error}`);
      throw new Error('Failed to extract invoice data with local LLM');
    }

    const data = await response.json();
    return data.response || '';
  }

  private async callOllamaVision(prompt: string, imageBase64: string): Promise<string> {
    this.logger.log(`Calling Ollama vision model (${this.visionModel})`);

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.visionModel,
        prompt,
        images: [imageBase64],
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 2000,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Ollama Vision API error: ${error}`);
      throw new Error('Failed to extract invoice data with local vision model');
    }

    const data = await response.json();
    return data.response || '';
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

    // Local models sometimes output multiple JSON objects - merge them
    const mergedData = this.mergeMultipleJsonObjects(jsonText);

    try {
      // Handle nested extracted objects (local models sometimes nest incorrectly)
      let extractedData = mergedData.extracted || mergedData;
      while (extractedData?.extracted) {
        extractedData = extractedData.extracted;
      }

      let confidenceData = mergedData.confidence || {};
      // If confidence is inside extracted, pull it out
      if (extractedData?.confidence && !mergedData.confidence) {
        confidenceData = extractedData.confidence;
      }

      // Validate and normalize the response
      const dueDate = extractedData?.dueDate;

      const extracted: ExtractedInvoiceData = {
        vendorName: extractedData?.vendorName ?? null,
        invoiceNumber: extractedData?.invoiceNumber ?? null,
        accountNumber: this.normalizeAccountNumber(extractedData?.accountNumber),
        documentType: extractedData?.documentType ?? 'INVOICE',
        invoiceDate: this.normalizeDate(extractedData?.invoiceDate),
        dueDate: dueDate === 'DUE_UPON_RECEIPT' ? 'DUE_UPON_RECEIPT' : this.normalizeDate(dueDate),
        paymentTerms: extractedData?.paymentTerms ?? null,
        amount: this.normalizeAmount(extractedData?.amount),
        currency: extractedData?.currency || 'USD',
        invoiceType: extractedData?.invoiceType ?? null,
        payableTo: extractedData?.payableTo ?? null,
        paymentAddress: extractedData?.paymentAddress ?? null,
        notes: extractedData?.notes ?? undefined,
      };

      const confidence: ExtractionConfidence = {
        vendorName: this.normalizeConfidence(confidenceData?.vendorName),
        invoiceNumber: this.normalizeConfidence(confidenceData?.invoiceNumber),
        invoiceDate: this.normalizeConfidence(confidenceData?.invoiceDate),
        dueDate: this.normalizeConfidence(confidenceData?.dueDate),
        amount: this.normalizeConfidence(confidenceData?.amount),
        invoiceType: this.normalizeConfidence(confidenceData?.invoiceType),
      };

      return {
        extracted,
        confidence,
        rawText: responseText,
      };
    } catch (error) {
      this.logger.error(`Failed to parse extraction response: ${error.message}`);
      this.logger.debug(`Raw response: ${responseText}`);

      // Fallback: Try regex-based extraction for common fields
      const fallbackExtracted = this.extractFieldsWithRegex(responseText);
      if (fallbackExtracted.vendorName || fallbackExtracted.amount || fallbackExtracted.invoiceNumber) {
        this.logger.log('Using regex fallback extraction for malformed JSON');
        return {
          extracted: fallbackExtracted,
          confidence: {
            vendorName: fallbackExtracted.vendorName ? 0.5 : 0,
            invoiceNumber: fallbackExtracted.invoiceNumber ? 0.5 : 0,
            invoiceDate: fallbackExtracted.invoiceDate ? 0.5 : 0,
            dueDate: fallbackExtracted.dueDate ? 0.5 : 0,
            amount: fallbackExtracted.amount ? 0.5 : 0,
            invoiceType: fallbackExtracted.invoiceType ? 0.5 : 0,
          },
          rawText: responseText,
        };
      }

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

  private mergeMultipleJsonObjects(text: string): any {
    // Local models sometimes output multiple separate JSON objects
    // Find all top-level JSON objects and merge them
    const jsonObjects: any[] = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const jsonStr = text.substring(start, i + 1);
          try {
            // Clean the JSON string - fix common issues from local models
            const cleanedJson = this.cleanJsonString(jsonStr);
            const obj = JSON.parse(cleanedJson);
            jsonObjects.push(obj);
          } catch (e) {
            // Skip invalid JSON objects
            this.logger.debug(`Skipping invalid JSON object: ${jsonStr.substring(0, 100)}... Error: ${e.message}`);
          }
          start = -1;
        }
      }
    }

    if (jsonObjects.length === 0) {
      throw new Error('No valid JSON objects found in response');
    }

    if (jsonObjects.length === 1) {
      return jsonObjects[0];
    }

    // Merge multiple objects
    this.logger.log(`Merging ${jsonObjects.length} JSON objects from response`);
    const merged: any = { extracted: {}, confidence: {} };

    for (const obj of jsonObjects) {
      // Merge extracted data
      if (obj.extracted) {
        Object.assign(merged.extracted, obj.extracted);
      }

      // Merge confidence data
      if (obj.confidence) {
        Object.assign(merged.confidence, obj.confidence);
      }

      // Handle top-level fields (not wrapped in extracted) - always check these
      const topLevelFields = ['vendorName', 'invoiceNumber', 'invoiceDate', 'dueDate', 'amount', 'currency', 'invoiceType', 'documentType', 'paymentTerms', 'notes'];
      for (const key of topLevelFields) {
        // Only set if the value exists and is not null/undefined, and either:
        // - the merged value doesn't exist yet, OR
        // - the merged value is empty/null and the new value is not
        if (obj[key] !== undefined && obj[key] !== null) {
          const currentValue = merged.extracted[key];
          const isCurrentEmpty = currentValue === undefined || currentValue === null;

          if (isCurrentEmpty) {
            merged.extracted[key] = obj[key];
          }
        }
      }
    }

    return merged;
  }

  private cleanJsonString(jsonStr: string): string {
    let cleaned = jsonStr;

    // Fix percentage values like "rate": 8.88% -> "rate": 8.88
    cleaned = cleaned.replace(/"rate"\s*:\s*(\d+\.?\d*)%/g, '"rate": $1');

    // Fix any other percentage values
    cleaned = cleaned.replace(/:\s*(\d+\.?\d*)%/g, ': $1');

    // Fix trailing commas before closing brackets
    cleaned = cleaned.replace(/,\s*}/g, '}');
    cleaned = cleaned.replace(/,\s*]/g, ']');

    // Fix invalid objects with numeric keys like {0.95: true} -> 0.95
    // This pattern appears in malformed confidence values
    cleaned = cleaned.replace(/\{\s*(\d+\.?\d*)\s*:\s*true\s*\}/g, '$1');

    // Fix "T" suffix on amounts (like 75.00T)
    cleaned = cleaned.replace(/:\s*(\d+\.?\d*)T/g, ': $1');

    // Fix unquoted property names that are numbers (rare but possible)
    // Match patterns like { 0.95: something } -> { "0.95": something }
    cleaned = cleaned.replace(/\{\s*(\d+\.?\d*)\s*:/g, '{"$1":');

    return cleaned;
  }

  private extractFieldsWithRegex(text: string): ExtractedInvoiceData {
    // Fallback regex extraction for when JSON parsing completely fails
    const extracted: ExtractedInvoiceData = {
      vendorName: null,
      invoiceNumber: null,
      invoiceDate: null,
      dueDate: null,
      amount: null,
      currency: 'USD',
      invoiceType: null,
    };

    // Extract vendorName
    const vendorMatch = text.match(/"vendorName"\s*:\s*"([^"]+)"/);
    if (vendorMatch) extracted.vendorName = vendorMatch[1];

    // Extract invoiceNumber
    const invoiceNumMatch = text.match(/"invoiceNumber"\s*:\s*"([^"]+)"/);
    if (invoiceNumMatch) extracted.invoiceNumber = invoiceNumMatch[1];

    // Extract accountNumber
    const accountNumMatch = text.match(/"accountNumber"\s*:\s*"([^"]+)"/);
    if (accountNumMatch) extracted.accountNumber = accountNumMatch[1];

    // Extract documentType
    const docTypeMatch = text.match(/"documentType"\s*:\s*"([^"]+)"/);
    if (docTypeMatch) {
      const docType = docTypeMatch[1];
      if (['INVOICE', 'STATEMENT', 'CREDIT_MEMO', 'OTHER'].includes(docType)) {
        extracted.documentType = docType as 'INVOICE' | 'STATEMENT' | 'CREDIT_MEMO' | 'OTHER';
      }
    }

    // Extract invoiceDate
    const invoiceDateMatch = text.match(/"invoiceDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
    if (invoiceDateMatch) extracted.invoiceDate = invoiceDateMatch[1];

    // Extract dueDate
    const dueDateMatch = text.match(/"dueDate"\s*:\s*"([^"]+)"/);
    if (dueDateMatch) {
      extracted.dueDate = dueDateMatch[1] === 'DUE_UPON_RECEIPT'
        ? 'DUE_UPON_RECEIPT'
        : this.normalizeDate(dueDateMatch[1]);
    }

    // Extract amount
    const amountMatch = text.match(/"amount"\s*:\s*(\d+(?:\.\d+)?)/);
    if (amountMatch) extracted.amount = parseFloat(amountMatch[1]);

    // Extract invoiceType
    const typeMatch = text.match(/"invoiceType"\s*:\s*"([^"]+)"/);
    if (typeMatch) extracted.invoiceType = typeMatch[1];

    // Extract paymentTerms
    const termsMatch = text.match(/"paymentTerms"\s*:\s*"([^"]+)"/);
    if (termsMatch) extracted.paymentTerms = termsMatch[1];

    return extracted;
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
