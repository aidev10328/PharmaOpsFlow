// Document type classification
export type DocumentType = 'INVOICE' | 'STATEMENT' | 'CREDIT_MEMO' | 'OTHER';

// Normalized extraction JSON schema
export interface ExtractedInvoiceData {
  vendorName: string | null;
  invoiceNumber: string | null;
  accountNumber?: string | null; // Customer account number with the vendor (optional)
  documentType?: DocumentType | null; // INVOICE, STATEMENT, CREDIT_MEMO, or OTHER
  invoiceDate: string | null; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD or "DUE_UPON_RECEIPT"
  paymentTerms?: string | null; // e.g., "Net 30", "Due upon Receipt", "2% 10 Net 30"
  amount: number | null;
  currency: string | null; // Default: USD
  invoiceType: string | null; // RENT|ELECTRICITY|VENDOR_INVOICE|INTERNET|INSURANCE|etc (expense category)
  payableTo?: string | null; // Name of entity to pay (e.g., "Payable to: TOP SYSTEM")
  paymentAddress?: string | null; // Address to send payment to
  notes?: string | null;
}

// Per-field confidence scores (0-1)
export interface ExtractionConfidence {
  vendorName: number;
  invoiceNumber: number;
  invoiceDate: number;
  dueDate: number;
  amount: number;
  invoiceType: number;
}

// Full extraction result from AI provider
export interface ExtractionResult {
  extracted: ExtractedInvoiceData;
  confidence: ExtractionConfidence;
  rawText?: string;
  processingMs?: number;
}

// Context passed to AI provider
export interface ExtractionContext {
  downloadUrl: string;
  mimeType: string;
  fileName?: string;
  orgContext?: {
    orgId: string;
    orgName?: string;
  };
  knownVendors?: Array<{
    id: string;
    name: string;
  }>;
  knownInvoiceTypes?: Array<{
    id: string;
    name: string;
  }>;
}

// Confidence thresholds for review
export const CONFIDENCE_THRESHOLDS = {
  amount: 0.85,
  dueDate: 0.85,
  invoiceType: 0.70,
  vendorName: 0.70,
  invoiceNumber: 0.80,
  invoiceDate: 0.80,
};

// Required fields for submission
export const REQUIRED_FIELDS_FOR_SUBMISSION: (keyof ExtractedInvoiceData)[] = [
  'invoiceType',
  'amount',
  'dueDate',
];

// Check if extraction needs review based on confidence
export function needsReviewCheck(
  extracted: ExtractedInvoiceData,
  confidence: ExtractionConfidence,
): boolean {
  // Check if any required field is null
  for (const field of REQUIRED_FIELDS_FOR_SUBMISSION) {
    if (extracted[field] === null || extracted[field] === undefined) {
      return true;
    }
  }

  // Check confidence thresholds
  if (confidence.amount < CONFIDENCE_THRESHOLDS.amount) return true;
  if (confidence.dueDate < CONFIDENCE_THRESHOLDS.dueDate) return true;
  if (confidence.invoiceType < CONFIDENCE_THRESHOLDS.invoiceType) return true;

  return false;
}

// Vendor matching helper
export function fuzzyMatchVendor(
  extractedName: string | null,
  knownVendors: Array<{ id: string; name: string }>,
): { vendorId: string; confidence: number } | null {
  if (!extractedName || knownVendors.length === 0) {
    return null;
  }

  const normalizedExtracted = extractedName.toLowerCase().trim();
  let bestMatch: { vendorId: string; confidence: number } | null = null;

  for (const vendor of knownVendors) {
    const normalizedVendor = vendor.name.toLowerCase().trim();

    // Exact match
    if (normalizedExtracted === normalizedVendor) {
      return { vendorId: vendor.id, confidence: 1.0 };
    }

    // Contains match
    if (
      normalizedExtracted.includes(normalizedVendor) ||
      normalizedVendor.includes(normalizedExtracted)
    ) {
      const confidence = 0.85;
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { vendorId: vendor.id, confidence };
      }
    }

    // Token-based match
    const extractedTokens = normalizedExtracted.split(/\s+/);
    const vendorTokens = normalizedVendor.split(/\s+/);
    const matchingTokens = extractedTokens.filter((t) =>
      vendorTokens.some((v) => v.includes(t) || t.includes(v)),
    );

    if (matchingTokens.length > 0) {
      const confidence = matchingTokens.length / Math.max(extractedTokens.length, vendorTokens.length);
      if (confidence >= 0.5 && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = { vendorId: vendor.id, confidence };
      }
    }
  }

  return bestMatch && bestMatch.confidence >= 0.8 ? bestMatch : null;
}

// Invoice type mapping helper
export function mapInvoiceType(
  extractedType: string | null,
  knownTypes: Array<{ id: string; name: string; code?: string }>,
): { invoiceTypeId: string; confidence: number } | null {
  if (!extractedType || knownTypes.length === 0) {
    return null;
  }

  const normalizedExtracted = extractedType.toLowerCase().trim().replace(/_/g, ' ');

  // Common type mappings (key is known type name or code, value is aliases)
  const typeAliases: Record<string, string[]> = {
    'vendor invoice': ['vendor_invoice', 'vendor', 'drug', 'wholesale', 'medication', 'pharmaceutical'],
    'wholesale drug': ['drug', 'wholesale', 'medication', 'pharmaceutical'],
    'equipment': ['equipment', 'supplies', 'medical equipment'],
    'services': ['service', 'professional', 'consulting'],
    'utilities': ['utility', 'utilities'],
    'electricity': ['electricity', 'electric', 'power'],
    'rent': ['rent', 'lease', 'property'],
    'insurance': ['insurance'],
    'maintenance': ['maintenance', 'repair'],
    'internet': ['internet', 'network', 'wifi'],
    'other': ['other', 'misc', 'miscellaneous'],
  };

  for (const knownType of knownTypes) {
    const normalizedName = knownType.name.toLowerCase().trim();
    const normalizedCode = knownType.code?.toLowerCase().trim().replace(/_/g, ' ');

    // Direct match on name
    if (normalizedExtracted === normalizedName) {
      return { invoiceTypeId: knownType.id, confidence: 1.0 };
    }

    // Direct match on code (e.g., "vendor_invoice" matches code "VENDOR_INVOICE")
    if (normalizedCode && normalizedExtracted === normalizedCode) {
      return { invoiceTypeId: knownType.id, confidence: 1.0 };
    }

    // Alias match by name
    const aliases = typeAliases[normalizedName] || [];
    if (aliases.some((a) => normalizedExtracted.includes(a) || a.includes(normalizedExtracted))) {
      return { invoiceTypeId: knownType.id, confidence: 0.85 };
    }

    // Alias match by code (if code is different from name)
    if (normalizedCode && normalizedCode !== normalizedName) {
      const codeAliases = typeAliases[normalizedCode] || [];
      if (codeAliases.some((a) => normalizedExtracted.includes(a) || a.includes(normalizedExtracted))) {
        return { invoiceTypeId: knownType.id, confidence: 0.85 };
      }
    }
  }

  return null;
}
