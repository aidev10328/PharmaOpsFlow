'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';

type ExtractedData = {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  amount: number | null;
  currency: string | null;
  invoiceType: string | null;
  lineItems?: Array<{ description: string; amount: number | null }>;
  notes?: string | null;
};

type Confidence = {
  vendorName: number;
  invoiceNumber: number;
  invoiceDate: number;
  dueDate: number;
  amount: number;
  invoiceType: number;
};

type Extraction = {
  id: string;
  provider: string;
  model: string;
  status: string;
  extractedJson: ExtractedData;
  confidenceJson: Confidence;
  processingMs: number;
  createdAt: string;
  invoiceFile: {
    id: string;
    originalName: string;
    mimeType: string;
  };
};

type Vendor = {
  id: string;
  name: string;
  code: string;
};

type InvoiceType = {
  id: string;
  name: string;
};

type Props = {
  invoiceId: string;
  extraction: Extraction | null;
  onApply?: () => void;
  onRetry?: () => void;
};

const CONFIDENCE_THRESHOLDS = {
  amount: 0.85,
  dueDate: 0.85,
  invoiceType: 0.70,
  vendorName: 0.70,
  invoiceNumber: 0.80,
  invoiceDate: 0.80,
};

export default function ExtractionReviewPanel({
  invoiceId,
  extraction,
  onApply,
  onRetry,
}: Props) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [invoiceTypes, setInvoiceTypes] = useState<InvoiceType[]>([]);
  const [formData, setFormData] = useState<{
    vendorId: string;
    invoiceTypeId: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    amount: string;
    currency: string;
  }>({
    vendorId: '',
    invoiceTypeId: '',
    invoiceNumber: '',
    invoiceDate: '',
    dueDate: '',
    amount: '',
    currency: 'USD',
  });
  const [applying, setApplying] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load vendors and invoice types
  useEffect(() => {
    async function loadOptions() {
      try {
        const [vendorsRes, typesRes] = await Promise.all([
          apiFetch('/invoices/vendors'),
          apiFetch('/invoices/types'),
        ]);

        if (vendorsRes.ok) {
          setVendors(await vendorsRes.json());
        }
        if (typesRes.ok) {
          setInvoiceTypes(await typesRes.json());
        }
      } catch (e) {
        console.error('Failed to load options:', e);
      }
    }
    loadOptions();
  }, []);

  // Pre-fill form from extraction
  useEffect(() => {
    if (extraction?.extractedJson) {
      const extracted = extraction.extractedJson;

      // Find matching vendor
      const matchedVendor = vendors.find(
        (v) => v.name.toLowerCase() === extracted.vendorName?.toLowerCase()
      );

      // Find matching invoice type
      const matchedType = invoiceTypes.find(
        (t) => t.name.toLowerCase() === extracted.invoiceType?.toLowerCase()
      );

      setFormData({
        vendorId: matchedVendor?.id || '',
        invoiceTypeId: matchedType?.id || '',
        invoiceNumber: extracted.invoiceNumber || '',
        invoiceDate: extracted.invoiceDate || '',
        dueDate: extracted.dueDate || '',
        amount: extracted.amount?.toString() || '',
        currency: extracted.currency || 'USD',
      });
    }
  }, [extraction, vendors, invoiceTypes]);

  const getConfidenceColor = (field: keyof Confidence) => {
    if (!extraction?.confidenceJson) return 'bg-gray-200';
    const confidence = extraction.confidenceJson[field];
    const threshold = CONFIDENCE_THRESHOLDS[field];

    if (confidence >= threshold) return 'bg-green-500';
    if (confidence >= threshold * 0.8) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getConfidenceLabel = (field: keyof Confidence) => {
    if (!extraction?.confidenceJson) return 'N/A';
    const confidence = extraction.confidenceJson[field];
    return `${Math.round(confidence * 100)}%`;
  };

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch(`/extraction/invoices/${invoiceId}/apply-extraction`, {
        method: 'POST',
        body: JSON.stringify({
          vendorId: formData.vendorId || undefined,
          invoiceTypeId: formData.invoiceTypeId || undefined,
          invoiceNumber: formData.invoiceNumber || undefined,
          invoiceDate: formData.invoiceDate || undefined,
          dueDate: formData.dueDate || undefined,
          amount: formData.amount ? parseFloat(formData.amount) : undefined,
          currency: formData.currency || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to apply extraction');
      }

      setSuccess('Extraction applied successfully!');
      onApply?.();
    } catch (err: any) {
      setError(err.message || 'Failed to apply extraction');
    } finally {
      setApplying(false);
    }
  };

  const handleRetry = async () => {
    if (!extraction) return;

    setRetrying(true);
    setError(null);

    try {
      const res = await apiFetch(`/extraction/invoice-extractions/${extraction.id}/retry`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to retry extraction');
      }

      onRetry?.();
    } catch (err: any) {
      setError(err.message || 'Failed to retry extraction');
    } finally {
      setRetrying(false);
    }
  };

  if (!extraction) {
    return (
      <div className="card p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">AI Extraction</h3>
        <p className="text-sm text-gray-500">No extraction data available.</p>
      </div>
    );
  }

  const extracted = extraction.extractedJson;
  const confidence = extraction.confidenceJson;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-900">AI Extraction Review</h3>
        <span className={`px-2 py-1 text-xs rounded-full ${
          extraction.status === 'SUCCESS'
            ? 'bg-green-100 text-green-800'
            : extraction.status === 'FAILED'
            ? 'bg-red-100 text-red-800'
            : 'bg-yellow-100 text-yellow-800'
        }`}>
          {extraction.status}
        </span>
      </div>

      {/* Extraction info */}
      <div className="text-xs text-gray-500 mb-4">
        <p>Source: {extraction.invoiceFile.originalName}</p>
        <p>Provider: {extraction.provider} ({extraction.model})</p>
        <p>Processed: {new Date(extraction.createdAt).toLocaleString()}</p>
        {extraction.processingMs && <p>Time: {(extraction.processingMs / 1000).toFixed(2)}s</p>}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-3 py-2 rounded-lg text-sm mb-4">
          {success}
        </div>
      )}

      {extraction.status === 'SUCCESS' && (
        <div className="space-y-4">
          {/* Vendor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Vendor</label>
              <span className={`w-2 h-2 rounded-full ${getConfidenceColor('vendorName')}`} title={getConfidenceLabel('vendorName')} />
            </div>
            <select
              value={formData.vendorId}
              onChange={(e) => setFormData({ ...formData, vendorId: e.target.value })}
              className="input-field text-sm"
            >
              <option value="">Select vendor...</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.code})
                </option>
              ))}
            </select>
            {extracted.vendorName && !formData.vendorId && (
              <p className="text-xs text-yellow-600 mt-1">
                Extracted: &quot;{extracted.vendorName}&quot; (no match found)
              </p>
            )}
          </div>

          {/* Invoice Type */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Invoice Type</label>
              <span className={`w-2 h-2 rounded-full ${getConfidenceColor('invoiceType')}`} title={getConfidenceLabel('invoiceType')} />
            </div>
            <select
              value={formData.invoiceTypeId}
              onChange={(e) => setFormData({ ...formData, invoiceTypeId: e.target.value })}
              className="input-field text-sm"
            >
              <option value="">Select type...</option>
              {invoiceTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {extracted.invoiceType && !formData.invoiceTypeId && (
              <p className="text-xs text-yellow-600 mt-1">
                Extracted: &quot;{extracted.invoiceType}&quot; (no match found)
              </p>
            )}
          </div>

          {/* Invoice Number */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Invoice Number</label>
              <span className={`w-2 h-2 rounded-full ${getConfidenceColor('invoiceNumber')}`} title={getConfidenceLabel('invoiceNumber')} />
            </div>
            <input
              type="text"
              value={formData.invoiceNumber}
              onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
              className="input-field text-sm"
              placeholder="Invoice number"
            />
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Amount</label>
              <span className={`w-2 h-2 rounded-full ${getConfidenceColor('amount')}`} title={getConfidenceLabel('amount')} />
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="input-field text-sm flex-1"
                placeholder="0.00"
              />
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="input-field text-sm w-24"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          {/* Invoice Date */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Invoice Date</label>
              <span className={`w-2 h-2 rounded-full ${getConfidenceColor('invoiceDate')}`} title={getConfidenceLabel('invoiceDate')} />
            </div>
            <input
              type="date"
              value={formData.invoiceDate}
              onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
              className="input-field text-sm"
            />
          </div>

          {/* Due Date */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Due Date</label>
              <span className={`w-2 h-2 rounded-full ${getConfidenceColor('dueDate')}`} title={getConfidenceLabel('dueDate')} />
            </div>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="input-field text-sm"
            />
          </div>

          {/* Line Items (read-only display) */}
          {extracted.lineItems && extracted.lineItems.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-2 block">Line Items</label>
              <div className="bg-gray-50 rounded-lg p-2 text-xs max-h-32 overflow-y-auto">
                {extracted.lineItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1 border-b border-gray-200 last:border-0">
                    <span className="truncate flex-1">{item.description}</span>
                    <span className="ml-2 font-medium">
                      {item.amount !== null ? `$${item.amount.toFixed(2)}` : '-'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confidence Legend */}
          <div className="pt-4 border-t">
            <p className="text-xs text-gray-500 mb-2">Confidence Legend:</p>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" /> High
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-500" /> Medium
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" /> Low
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <button
              onClick={handleApply}
              disabled={applying}
              className="btn-primary flex-1"
            >
              {applying ? 'Applying...' : 'Apply to Invoice'}
            </button>
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="btn-secondary"
            >
              {retrying ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        </div>
      )}

      {extraction.status === 'FAILED' && (
        <div className="space-y-4">
          <p className="text-sm text-red-600">
            Extraction failed. Please try again or enter data manually.
          </p>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="btn-primary w-full"
          >
            {retrying ? 'Retrying...' : 'Retry Extraction'}
          </button>
        </div>
      )}

      {extraction.status === 'PENDING' && (
        <div className="text-center py-4">
          <svg className="animate-spin h-6 w-6 text-primary mx-auto mb-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-gray-600">Processing...</p>
        </div>
      )}
    </div>
  );
}
