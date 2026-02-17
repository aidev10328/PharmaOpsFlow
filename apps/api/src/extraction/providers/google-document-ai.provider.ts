import { Injectable, Logger } from '@nestjs/common';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { AIExtractorProvider } from './ai-provider.interface';
import {
  ExtractionContext,
  ExtractionResult,
  ExtractedInvoiceData,
  ExtractionConfidence,
  DocumentType,
} from '../types';

/**
 * Google Document AI Provider for invoice extraction
 * Uses the pre-trained Invoice Parser processor for highest accuracy
 *
 * Required environment variables:
 * - GOOGLE_CLOUD_PROJECT_ID: Your GCP project ID
 * - GOOGLE_DOCUMENT_AI_LOCATION: Processor location (e.g., 'us' or 'eu')
 * - GOOGLE_DOCUMENT_AI_PROCESSOR_ID: The Invoice Parser processor ID
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON (or use workload identity)
 */
@Injectable()
export class GoogleDocumentAIProvider implements AIExtractorProvider {
  private readonly logger = new Logger(GoogleDocumentAIProvider.name);
  private client: DocumentProcessorServiceClient | null = null;

  readonly name = 'Google Document AI';
  readonly providerType = 'OTHER' as const;

  private get projectId(): string | undefined {
    return process.env.GOOGLE_CLOUD_PROJECT_ID;
  }

  private get location(): string {
    return process.env.GOOGLE_DOCUMENT_AI_LOCATION || 'us';
  }

  private get processorId(): string | undefined {
    return process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;
  }

  isConfigured(): boolean {
    return !!(this.projectId && this.processorId);
  }

  private getClient(): DocumentProcessorServiceClient {
    if (!this.client) {
      this.client = new DocumentProcessorServiceClient();
    }
    return this.client;
  }

  async extractInvoiceFromFile(context: ExtractionContext): Promise<ExtractionResult> {
    const startTime = Date.now();

    if (!this.isConfigured()) {
      throw new Error('Google Document AI is not configured. Please set GOOGLE_CLOUD_PROJECT_ID and GOOGLE_DOCUMENT_AI_PROCESSOR_ID');
    }

    try {
      this.logger.log(`Processing invoice with Google Document AI`);

      // Fetch the file content
      const fileResponse = await fetch(context.downloadUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download file: ${fileResponse.status}`);
      }

      const fileBuffer = await fileResponse.arrayBuffer();
      const content = Buffer.from(fileBuffer).toString('base64');

      // Build the processor name
      const processorName = `projects/${this.projectId}/locations/${this.location}/processors/${this.processorId}`;

      // Process the document
      const client = this.getClient();
      const [result] = await client.processDocument({
        name: processorName,
        rawDocument: {
          content,
          mimeType: context.mimeType,
        },
      });

      const { document } = result;

      if (!document) {
        throw new Error('No document returned from Document AI');
      }

      // Log document info for debugging multi-page issues
      const pageCount = document.pages?.length || 0;
      const entityCount = document.entities?.length || 0;
      this.logger.log(`Document has ${pageCount} pages and ${entityCount} entities`);

      // Log entity types for debugging
      const entityTypes = [...new Set((document.entities || []).map((e: any) => e.type))];
      this.logger.log(`Entity types found: ${entityTypes.join(', ')}`);

      // Log all entities with their page references for debugging
      const entities = document.entities || [];
      let lineItemCount = 0;
      for (const entity of entities) {
        if (entity.type === 'line_item') {
          lineItemCount++;
          const pageRefs = entity.pageAnchor?.pageRefs || [];
          const pages = pageRefs.map((r: any) => r.page || 0);
          const propCount = entity.properties?.length || 0;
          const propTypes = (entity.properties || []).map((p: any) => p.type).join(', ');
          // Log first 5 line items in detail
          if (lineItemCount <= 5) {
            this.logger.log(`Line item ${lineItemCount} on page(s) ${pages.join(',')}: ${propCount} properties [${propTypes}]`);
            this.logger.log(`  Mention text: "${entity.mentionText?.substring(0, 150)}"`);
            // Log each property's value
            for (const prop of entity.properties || []) {
              this.logger.log(`  - ${prop.type}: "${prop.mentionText?.substring(0, 80)}"`);
            }
          }
        }
      }
      this.logger.log(`Total line_item entities found: ${lineItemCount}`);

      // Log total amount entity
      const totalAmountEntity = entities.find((e: any) => e.type === 'total_amount' || e.type === 'net_amount' || e.type === 'amount_due');
      if (totalAmountEntity) {
        this.logger.log(`Total amount entity: "${totalAmountEntity.mentionText}", normalized: ${JSON.stringify(totalAmountEntity.normalizedValue)}`);
      } else {
        this.logger.warn('No total_amount/net_amount/amount_due entity found');
      }

      // Extract data from the document entities
      const extracted = this.parseDocumentEntities(document, context);
      const confidence = this.calculateConfidence(document);

      const processingMs = Date.now() - startTime;
      this.logger.log(`Document AI extraction completed in ${processingMs}ms`);

      return {
        extracted,
        confidence,
        rawText: document.text || undefined,
        processingMs,
      };
    } catch (error) {
      this.logger.error(`Google Document AI extraction failed: ${error.message}`);
      throw error;
    }
  }

  private parseDocumentEntities(document: any, context: ExtractionContext): ExtractedInvoiceData {
    const entities = document.entities || [];
    const rawText = document.text || '';

    // Detect if this is a statement/remittance document (not a regular invoice)
    const isStatement = this.detectStatementDocument(rawText, entities);

    // Helper to find entity by type
    const findEntity = (type: string): any => {
      return entities.find((e: any) => e.type === type);
    };

    // Helper to get entity value
    const getValue = (entity: any): string | null => {
      if (!entity) return null;
      return entity.mentionText || entity.normalizedValue?.text || null;
    };

    // Helper to get money value
    const getMoneyValue = (entity: any): number | null => {
      if (!entity) return null;

      // Try normalized value first (more reliable)
      if (entity.normalizedValue?.moneyValue?.units) {
        const units = parseInt(entity.normalizedValue.moneyValue.units, 10);
        const nanos = entity.normalizedValue.moneyValue.nanos || 0;
        return units + nanos / 1e9;
      }

      // Fall back to text parsing
      const text = entity.mentionText || '';
      const cleaned = text.replace(/[$,\s]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    };

    // Helper to get date value
    const getDateValue = (entity: any): string | null => {
      if (!entity) return null;

      // Try normalized value first
      if (entity.normalizedValue?.dateValue) {
        const { year, month, day } = entity.normalizedValue.dateValue;
        if (year && month && day) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }

      // Fall back to text parsing
      const text = entity.mentionText || '';
      return this.normalizeDate(text);
    };

    // Extract basic invoice fields
    const vendorName = getValue(findEntity('supplier_name')) ||
                       getValue(findEntity('vendor_name')) ||
                       getValue(findEntity('remit_to_name'));

    const invoiceNumber = getValue(findEntity('invoice_id')) ||
                          getValue(findEntity('invoice_number'));

    // Extract account number (customer's account with the vendor)
    const accountNumber = getValue(findEntity('receiver_account_number')) ||
                          getValue(findEntity('customer_id')) ||
                          getValue(findEntity('account_number')) ||
                          getValue(findEntity('customer_account')) ||
                          this.extractAccountNumberFromText(rawText);

    const invoiceDate = getDateValue(findEntity('invoice_date'));

    const dueDate = getDateValue(findEntity('due_date')) ||
                    getDateValue(findEntity('payment_due_date'));

    const paymentTerms = getValue(findEntity('payment_terms')) ||
                         getValue(findEntity('net_amount_due_date'));

    let totalAmount = getMoneyValue(findEntity('total_amount')) ||
                      getMoneyValue(findEntity('net_amount')) ||
                      getMoneyValue(findEntity('amount_due'));

    const currency = getValue(findEntity('currency')) || 'USD';

    // If no total amount was found from entities, try to find it in raw text
    // This handles account statements and other non-standard formats
    if (totalAmount === null) {
      const textBasedTotal = this.extractTotalFromText(rawText);
      if (textBasedTotal !== null) {
        totalAmount = textBasedTotal;
        this.logger.log(`Extracted total from raw text: $${totalAmount}`);
      }
    }

    // Classify invoice type based on entities and content
    const invoiceType = this.classifyInvoiceType(document, vendorName, context);

    // Determine document type
    const documentType: DocumentType = isStatement ? 'STATEMENT' : 'INVOICE';
    this.logger.log(`Document type: ${documentType}`);

    // Extract payment details
    const payableTo = getValue(findEntity('payee_name')) ||
                      getValue(findEntity('remit_to_name')) ||
                      this.extractPayableToFromText(rawText);

    const paymentAddress = getValue(findEntity('remit_to_address')) ||
                           getValue(findEntity('payment_address')) ||
                           this.extractPaymentAddressFromText(rawText);

    return {
      vendorName,
      invoiceNumber,
      accountNumber,
      documentType,
      invoiceDate,
      dueDate: this.checkDueUponReceipt(paymentTerms, dueDate),
      paymentTerms,
      amount: totalAmount,
      currency,
      invoiceType,
      payableTo,
      paymentAddress,
      notes: undefined,
    };
  }

  private calculateConfidence(document: any): ExtractionConfidence {
    const entities = document.entities || [];

    const getConfidence = (type: string): number => {
      const entity = entities.find((e: any) => e.type === type);
      return entity?.confidence || 0;
    };

    return {
      vendorName: getConfidence('supplier_name') || getConfidence('vendor_name') || 0.5,
      invoiceNumber: getConfidence('invoice_id') || getConfidence('invoice_number') || 0.5,
      invoiceDate: getConfidence('invoice_date') || 0.5,
      dueDate: getConfidence('due_date') || getConfidence('payment_due_date') || 0.5,
      amount: getConfidence('total_amount') || getConfidence('net_amount') || 0.5,
      invoiceType: 0.7, // Invoice type is classified, not extracted directly
    };
  }

  private classifyInvoiceType(document: any, vendorName: string | null, context: ExtractionContext): string {
    const text = (document.text || '').toLowerCase();

    // Keywords for classification
    const typeKeywords: Record<string, string[]> = {
      'RENT': ['rent', 'lease', 'property', 'landlord', 'tenant'],
      'ELECTRICITY': ['electricity', 'electric', 'power', 'kwh', 'utility'],
      'UTILITIES': ['water', 'gas', 'sewage', 'utility'],
      'INTERNET': ['internet', 'wifi', 'broadband', 'network', 'telecom'],
      'INSURANCE': ['insurance', 'policy', 'premium', 'coverage'],
      'WHOLESALE_DRUG': ['drug', 'pharmaceutical', 'medication', 'rx', 'pharmacy supply', 'mckesson', 'cardinal', 'amerisource'],
      'EQUIPMENT': ['equipment', 'device', 'medical equipment', 'supplies'],
      'SERVICES': ['service', 'consulting', 'professional', 'labor', 'maintenance'],
      'MAINTENANCE': ['maintenance', 'repair', 'cleaning', 'janitorial'],
    };

    // Check vendor name first
    if (vendorName) {
      const lowerVendor = vendorName.toLowerCase();
      for (const [type, keywords] of Object.entries(typeKeywords)) {
        if (keywords.some(k => lowerVendor.includes(k))) {
          return type;
        }
      }
    }

    // Check document text
    for (const [type, keywords] of Object.entries(typeKeywords)) {
      const matchCount = keywords.filter(k => text.includes(k)).length;
      if (matchCount >= 2) {
        return type;
      }
    }

    // Default to VENDOR_INVOICE
    return 'VENDOR_INVOICE';
  }

  private checkDueUponReceipt(paymentTerms: string | null, dueDate: string | null): string | null {
    if (paymentTerms) {
      const lower = paymentTerms.toLowerCase();
      if (lower.includes('upon receipt') || lower.includes('due immediately') || lower.includes('payable upon')) {
        return 'DUE_UPON_RECEIPT';
      }
    }
    return dueDate;
  }

  private normalizeDate(value: string | null): string | null {
    if (!value) return null;

    try {
      // Try common date formats
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        // Try parsing MM/DD/YYYY format
        const parts = value.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (parts) {
          const [, month, day, year] = parts;
          const fullYear = year.length === 2 ? `20${year}` : year;
          return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return null;
      }
      return date.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }

  /**
   * Extract "Payable to" / payee name from raw OCR text
   */
  private extractPayableToFromText(text: string): string | null {
    if (!text) return null;

    const patterns = [
      /(?:payable\s*to|pay\s*to|make\s*(?:checks?\s*)?payable\s*to)\s*[:\s]*([A-Za-z0-9\s\.,&'-]+?)(?:\n|$|Send|Payment)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const payee = match[1].trim();
        // Validate it looks like a company/person name (not too short, not too long)
        if (payee.length >= 3 && payee.length <= 100) {
          this.logger.log(`Extracted payable to from text: ${payee}`);
          return payee;
        }
      }
    }

    return null;
  }

  /**
   * Extract payment address from raw OCR text
   */
  private extractPaymentAddressFromText(text: string): string | null {
    if (!text) return null;

    const patterns = [
      /(?:send\s*payment\s*to|remit\s*to|payment\s*address)\s*[:\s]*([A-Za-z0-9\s\.,#'-]+(?:\n[A-Za-z0-9\s\.,#'-]+){0,3})/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Clean up the address - replace multiple spaces/newlines with single space
        const address = match[1].trim().replace(/\s+/g, ' ');
        // Validate it looks like an address (contains numbers, reasonable length)
        if (address.length >= 10 && address.length <= 200 && /\d/.test(address)) {
          this.logger.log(`Extracted payment address from text: ${address}`);
          return address;
        }
      }
    }

    return null;
  }

  /**
   * Extract account number from raw OCR text
   * Looks for patterns like "Account #: 12345" or "Acct: 12345" or "Customer ID: ABC123"
   */
  private extractAccountNumberFromText(text: string): string | null {
    if (!text) return null;

    // Invalid values that should never be account numbers
    const invalidValues = new Set([
      'number', 'invoice', 'date', 'amount', 'total', 'due', 'service',
      'description', 'item', 'qty', 'quantity', 'price', 'name', 'address',
      'phone', 'fax', 'email', 'terms', 'payment', 'balance', 'credit',
      'n/a', 'na', 'none', 'null', 'undefined', 'vendor', 'customer',
    ]);

    // Patterns for account numbers - STRICT: require separator (: or #) before the value
    // The value must contain at least one digit
    const accountPatterns = [
      // Account # / Account No / Account Number followed by : or # then the value
      /account\s*(?:#|no\.?|number)\s*[:\s#]+\s*(\d[\w\-]{3,19})/i,
      /acct\.?\s*(?:#|no\.?)\s*[:\s#]+\s*(\d[\w\-]{3,19})/i,
      // Customer # / Customer ID / Customer Number / Customer No
      /customer\s*(?:#|id|no\.?|number)\s*[:\s#]+\s*(\d[\w\-]{3,19})/i,
      // Ship-to Customer with value
      /ship-to\s*customer\s*[:\s#]+\s*(\d[\w\-]{3,19})/i,
      // Bill-to account
      /bill-?to\s*(?:acct|account)\s*[:\s#]+\s*(\d[\w\-]{3,19})/i,
      // Client / Member / Subscriber IDs
      /(?:client|member|subscriber)\s*(?:#|id|no\.?)\s*[:\s#]+\s*(\d[\w\-]{3,19})/i,
      // Store / Location / Site IDs
      /(?:store|location|site)\s*(?:#|id|no\.?)\s*[:\s#]+\s*(\d[\w\-]{3,19})/i,
      // DEA / NPI (pharmacy-specific)
      /(?:dea|npi)\s*(?:#|no\.?)?\s*[:\s#]+\s*([A-Z]?\d{6,14})/i,
      // Table format: "Account #" header followed by newline and number
      /account\s*#\s*[\n\r]+\s*(\d{5,15})/i,
      // Standalone patterns for clearly labeled account numbers
      /(?:^|\n)\s*account\s*#?\s*:\s*(\d{5,20})\s*(?:$|\n)/im,
    ];

    for (const pattern of accountPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const accountNum = match[1].trim();

        // Skip if it's an invalid word
        if (invalidValues.has(accountNum.toLowerCase())) {
          continue;
        }

        // Must contain at least one digit
        if (!/\d/.test(accountNum)) {
          continue;
        }

        // Must be reasonable length (4-20 chars)
        if (accountNum.length < 4 || accountNum.length > 20) {
          continue;
        }

        // Skip if it looks like a date (MM/DD/YYYY or similar)
        if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(accountNum)) {
          continue;
        }

        // Skip if it's all letters (likely a word, not an account number)
        if (/^[A-Za-z]+$/.test(accountNum)) {
          continue;
        }

        this.logger.log(`Extracted account number from text: ${accountNum}`);
        return accountNum;
      }
    }

    return null;
  }

  /**
   * Extract total amount from raw OCR text
   * This handles account statements and non-standard invoice formats
   * Handles various layouts including tables where labels and values are separated
   */
  private extractTotalFromText(text: string): number | null {
    if (!text) return null;

    // Method 1: Direct patterns where amount immediately follows label
    const directPatterns = [
      /total\s*due[:\s]+\$?([\d,]+\.?\d+)/i,
      /balance\s*due[:\s]+\$?([\d,]+\.?\d+)/i,
      /amount\s*due[:\s]+\$?([\d,]+\.?\d+)/i,
    ];

    for (const pattern of directPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const cleaned = match[1].replace(/,/g, '');
        const amount = parseFloat(cleaned);
        if (!isNaN(amount) && amount > 0) {
          this.logger.log(`Found total using direct pattern: ${amount}`);
          return Math.round(amount * 100) / 100;
        }
      }
    }

    // Method 2: Table layout - find "Total Due" section and extract amounts nearby
    // OCR often separates labels from values in tables
    const totalDueIndex = text.toLowerCase().indexOf('total due');
    if (totalDueIndex >= 0) {
      // Get text around "Total Due" (200 chars after)
      const contextAfter = text.substring(totalDueIndex, totalDueIndex + 200);

      // Find all money amounts in this context
      const amountPattern = /\b(\d{1,3}(?:,\d{3})*\.?\d{0,2})\b/g;
      const amounts: number[] = [];
      let match;
      while ((match = amountPattern.exec(contextAfter)) !== null) {
        const cleaned = match[1].replace(/,/g, '');
        const amount = parseFloat(cleaned);
        // Filter out small amounts and dates (like 0.00, years like 2023)
        if (!isNaN(amount) && amount > 10 && amount < 1000000) {
          amounts.push(amount);
        }
      }

      this.logger.log(`Amounts found near "Total Due": ${JSON.stringify(amounts)}`);

      // For account statements, the total is often repeated or is one of the larger amounts
      // Look for the last reasonable total amount (often appears at end of summary)
      if (amounts.length > 0) {
        // Find amounts that appear more than once (likely the total)
        const countMap = new Map<number, number>();
        for (const amt of amounts) {
          countMap.set(amt, (countMap.get(amt) || 0) + 1);
        }

        // Find repeated amounts (total often appears twice)
        for (const [amt, count] of countMap.entries()) {
          if (count >= 2 && amt > 100) {
            this.logger.log(`Found repeated amount (likely total): ${amt}`);
            return Math.round(amt * 100) / 100;
          }
        }

        // Otherwise, take the largest reasonable amount
        const maxAmount = Math.max(...amounts.filter(a => a < 100000));
        if (maxAmount > 0) {
          this.logger.log(`Using largest amount near Total Due: ${maxAmount}`);
          return Math.round(maxAmount * 100) / 100;
        }
      }
    }

    // Method 3: Look for "Total Due" followed by amount pattern anywhere
    const flexiblePattern = /total\s*due[\s\S]{0,50}?([\d,]+\.\d{2})/i;
    const flexMatch = text.match(flexiblePattern);
    if (flexMatch && flexMatch[1]) {
      const cleaned = flexMatch[1].replace(/,/g, '');
      const amount = parseFloat(cleaned);
      if (!isNaN(amount) && amount > 0) {
        this.logger.log(`Found total using flexible pattern: ${amount}`);
        return Math.round(amount * 100) / 100;
      }
    }

    return null;
  }

  /**
   * Detect if document is a Statement/Remittance (not a regular invoice)
   * Statements list multiple invoices and should not have line items extracted
   */
  private detectStatementDocument(text: string, entities: any[]): boolean {
    const lowerText = text.toLowerCase();

    // Check for statement-specific keywords
    const statementKeywords = [
      'statement & remittance',
      'statement and remittance',
      'account statement',
      'statement of account',
      'remittance advice',
      'payment remittance',
      'stmt ref',
      'statement date',
      'statement reference',
    ];

    for (const keyword of statementKeywords) {
      if (lowerText.includes(keyword)) {
        this.logger.log(`Detected statement document by keyword: "${keyword}"`);
        return true;
      }
    }

    // Check for aging buckets (common in statements)
    const agingPatterns = [
      /current\s+future\s+1-30\s*days/i,
      /1-30\s*days\s+31-60\s*days/i,
      /31-60\s*days\s+61-90\s*days/i,
      /61-90\s*days\s+over\s*90\s*days/i,
      /past\s*due.*current\s*due/i,
    ];

    for (const pattern of agingPatterns) {
      if (pattern.test(text)) {
        this.logger.log(`Detected statement document by aging bucket pattern`);
        return true;
      }
    }

    // Check if document has many invoice_id references (multiple invoices listed)
    const invoiceIdEntities = entities.filter((e: any) =>
      e.type === 'invoice_id' || e.type === 'invoice_number'
    );
    if (invoiceIdEntities.length > 3) {
      this.logger.log(`Detected statement document: ${invoiceIdEntities.length} invoice IDs found`);
      return true;
    }

    // Check for "Ship-to Customer" or "Bill-To" with account numbers (common in wholesale statements)
    if (/ship-to\s*customer.*\d{7,}/i.test(text) || /bill-to\s*acct\s*#/i.test(text)) {
      this.logger.log(`Detected statement document by Ship-to Customer or Bill-To pattern`);
      return true;
    }

    return false;
  }
}
