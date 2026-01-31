// Normalized extraction JSON schema
export interface ExtractedInvoiceData {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
  amount: number | null;
  currency: string | null; // Default: USD
  invoiceType: string | null; // RENT|ELECTRICITY|VENDOR_INVOICE|INTERNET|INSURANCE|etc
  lineItems?: Array<{
    description: string;
    amount: number | null;
  }>;
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
  knownTypes: Array<{ id: string; name: string }>,
): { invoiceTypeId: string; confidence: number } | null {
  if (!extractedType || knownTypes.length === 0) {
    return null;
  }

  const normalizedExtracted = extractedType.toLowerCase().trim();

  // Common type mappings
  const typeAliases: Record<string, string[]> = {
    'wholesale drug': ['drug', 'wholesale', 'medication', 'pharmaceutical', 'vendor_invoice'],
    'equipment': ['equipment', 'supplies', 'medical equipment'],
    'services': ['service', 'professional', 'consulting'],
    'utilities': ['utility', 'utilities', 'electricity', 'gas', 'water'],
    'rent': ['rent', 'lease', 'property'],
    'insurance': ['insurance'],
    'maintenance': ['maintenance', 'repair'],
    'other': ['other', 'misc', 'miscellaneous'],
  };

  for (const knownType of knownTypes) {
    const normalizedKnown = knownType.name.toLowerCase().trim();

    // Direct match
    if (normalizedExtracted === normalizedKnown) {
      return { invoiceTypeId: knownType.id, confidence: 1.0 };
    }

    // Alias match
    const aliases = typeAliases[normalizedKnown] || [];
    if (aliases.some((a) => normalizedExtracted.includes(a) || a.includes(normalizedExtracted))) {
      return { invoiceTypeId: knownType.id, confidence: 0.85 };
    }
  }

  return null;
}
