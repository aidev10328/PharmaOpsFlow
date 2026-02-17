'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';
import InvoiceFileUpload from '../../../../../../components/invoice/InvoiceFileUpload';

type InvoiceFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string;
  createdAt: string;
  uploadedBy: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
};

type InvoiceEvent = {
  id: string;
  eventType: string;
  notes?: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
};

type LineItem = {
  description: string;
  quantity?: number | null;
  rate?: number | null;
  amount: number | null;
};

type ExtractedData = {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  paymentTerms?: string | null;
  amount: number | null;
  currency: string | null;
  invoiceType: string | null;
  lineItems?: LineItem[];
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
  code?: string;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  status: string;
  description?: string;
  notes?: string;
  submittedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  needsReview?: boolean;
  extractionStatus?: string;
  extractedAt?: string;
  lastExtractionId?: string;
  pharmacy: { id: string; name: string; code: string; orgId: string };
  vendor?: { id: string; name: string; code: string };
  invoiceType?: { id: string; name: string };
  files: InvoiceFile[];
  events: InvoiceEvent[];
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  NEEDS_INFO: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  SCHEDULED: 'bg-purple-100 text-purple-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
};

const CONFIDENCE_THRESHOLDS: Record<string, number> = {
  amount: 0.85,
  dueDate: 0.85,
  invoiceType: 0.70,
  vendorName: 0.70,
  invoiceNumber: 0.80,
  invoiceDate: 0.80,
};

export default function InvoiceDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [files, setFiles] = useState<InvoiceFile[]>([]);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [invoiceTypes, setInvoiceTypes] = useState<InvoiceType[]>([]);
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  // New vendor creation
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [creatingVendor, setCreatingVendor] = useState(false);

  // Form data for extraction review
  const [formData, setFormData] = useState({
    vendorId: '',
    invoiceTypeId: '',
    invoiceNumber: '',
    invoiceDate: '',
    dueDate: '',
    amount: '',
    currency: 'USD',
    lineItems: [] as LineItem[],
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const fetchInvoice = useCallback(async () => {
    try {
      const res = await apiFetch(`/invoices/${invoiceId}`);
      if (res.ok) {
        const data = await res.json();
        setInvoice(data);
      } else {
        setError('Invoice not found');
      }
    } catch (e) {
      setError('Failed to load invoice');
    } finally {
      setLoadingInvoice(false);
    }
  }, [invoiceId]);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await apiFetch(`/invoices/${invoiceId}/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (e) {
      console.error('Failed to load files:', e);
    }
  }, [invoiceId]);

  const fetchExtraction = useCallback(async () => {
    try {
      const res = await apiFetch(`/extraction/invoices/${invoiceId}/extraction`);
      if (res.ok) {
        const data = await res.json();
        setExtraction(data.extraction);
      }
    } catch (e) {
      console.error('Failed to load extraction:', e);
    }
  }, [invoiceId]);

  const fetchOptions = useCallback(async () => {
    try {
      const [vendorsRes, typesRes] = await Promise.all([
        apiFetch('/invoices/vendors'),
        apiFetch('/invoices/types'),
      ]);
      if (vendorsRes.ok) setVendors(await vendorsRes.json());
      if (typesRes.ok) setInvoiceTypes(await typesRes.json());
    } catch (e) {
      console.error('Failed to load options:', e);
    }
  }, []);

  // Pre-fill form from extraction
  useEffect(() => {
    if (extraction?.extractedJson && vendors.length > 0 && invoiceTypes.length > 0) {
      const extracted = extraction.extractedJson;
      const matchedVendor = vendors.find(
        (v) => v.name.toLowerCase() === extracted.vendorName?.toLowerCase()
      );
      const matchedType = invoiceTypes.find(
        (t) => t.name.toLowerCase() === extracted.invoiceType?.toLowerCase() ||
               t.code?.toLowerCase() === extracted.invoiceType?.toLowerCase()
      );

      setFormData({
        vendorId: matchedVendor?.id || '',
        invoiceTypeId: matchedType?.id || '',
        invoiceNumber: extracted.invoiceNumber || '',
        invoiceDate: extracted.invoiceDate || '',
        dueDate: extracted.dueDate === 'DUE_UPON_RECEIPT' ? '' : (extracted.dueDate || ''),
        amount: extracted.amount?.toString() || '',
        currency: extracted.currency || 'USD',
        lineItems: extracted.lineItems || [],
      });
    }
  }, [extraction, vendors, invoiceTypes]);

  const triggerExtraction = async () => {
    setExtracting(true);
    setError(null);
    try {
      const res = await apiFetch(`/extraction/invoices/${invoiceId}/extract`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setExtraction(data.extraction);
        await fetchInvoice();
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Extraction failed');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to trigger extraction');
    } finally {
      setExtracting(false);
    }
  };

  useEffect(() => {
    if (user && invoiceId) {
      fetchInvoice();
      fetchFiles();
      fetchExtraction();
      fetchOptions();
    }
  }, [user, invoiceId, fetchInvoice, fetchFiles, fetchExtraction, fetchOptions]);

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(amount));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSubmit = async () => {
    if (!invoice) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/invoices/${invoiceId}/submit`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Submit failed');
      }
      await fetchInvoice();
    } catch (err: any) {
      setError(err.message || 'Failed to submit invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyExtraction = async () => {
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
      await fetchInvoice();
      await fetchExtraction();
    } catch (err: any) {
      setError(err.message || 'Failed to apply extraction');
    } finally {
      setApplying(false);
    }
  };

  const handleRetryExtraction = async () => {
    if (!extraction) return;
    setExtracting(true);
    setError(null);
    try {
      const res = await apiFetch(`/extraction/invoice-extractions/${extraction.id}/retry`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to retry extraction');
      }
      await fetchInvoice();
      await fetchExtraction();
    } catch (err: any) {
      setError(err.message || 'Failed to retry extraction');
    } finally {
      setExtracting(false);
    }
  };

  const handleCreateVendor = async () => {
    if (!newVendorName.trim()) {
      setError('Please enter a vendor name');
      return;
    }
    setCreatingVendor(true);
    setError(null);
    try {
      const res = await apiFetch('/invoices/vendors', {
        method: 'POST',
        body: JSON.stringify({ name: newVendorName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create vendor');
      }
      const newVendor = await res.json();
      setVendors([...vendors, newVendor]);
      setFormData({ ...formData, vendorId: newVendor.id });
      setShowNewVendor(false);
      setNewVendorName('');
    } catch (err: any) {
      setError(err.message || 'Failed to create vendor');
    } finally {
      setCreatingVendor(false);
    }
  };

  const isOverdue = (dueDate: string, status: string) => {
    if (['PAID', 'REJECTED'].includes(status)) return false;
    return new Date(dueDate) < new Date();
  };

  const getConfidenceColor = (field: keyof Confidence) => {
    if (!extraction?.confidenceJson) return 'bg-gray-300';
    const confidence = extraction.confidenceJson[field];
    const threshold = CONFIDENCE_THRESHOLDS[field] || 0.8;
    if (confidence >= threshold) return 'bg-green-500';
    if (confidence >= threshold * 0.8) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getConfidencePercent = (field: keyof Confidence) => {
    if (!extraction?.confidenceJson) return 0;
    return Math.round(extraction.confidenceJson[field] * 100);
  };

  // Edit permissions: Managers/Admins can edit any status, pharmacy users only DRAFT/NEEDS_INFO/REJECTED
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'COMPANY_MANAGER';
  const pharmacyEditableStatuses = ['DRAFT', 'NEEDS_INFO', 'REJECTED'];
  const canEdit = invoice && (isManagerOrAdmin || pharmacyEditableStatuses.includes(invoice.status));
  const canSubmit = invoice && (invoice.status === 'DRAFT' || invoice.status === 'REJECTED');
  const canUpload = invoice && ['DRAFT', 'NEEDS_INFO', 'SUBMITTED'].includes(invoice.status);
  const canDelete = invoice && ['DRAFT'].includes(invoice.status);
  const needsExtraction = invoice && files.length > 0 && !extraction && invoice.extractionStatus !== 'PENDING';
  const hasExtraction = extraction && extraction.status === 'SUCCESS';
  // Hide confidence percentages once invoice data has been saved (has vendor, type, and amount)
  const invoiceDataSaved = invoice && invoice.vendor && invoice.invoiceType && invoice.amount;

  if (loading || loadingInvoice) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!user) return null;

  if (error && !invoice) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="card p-6 text-center">
          <p className="text-red-600">{error}</p>
          <Link href="/dashboard/pharmacy/invoices" className="btn-primary mt-4">
            Back to Invoices
          </Link>
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/pharmacy/invoices?pharmacyId=${invoice.pharmacy.id}`}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {invoice.invoiceNumber || 'New Invoice'}
            </h1>
            <p className="text-sm text-gray-500">
              {invoice.pharmacy.name} &bull; {invoice.vendor?.name || 'No vendor'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 text-sm font-medium rounded-full ${STATUS_COLORS[invoice.status]}`}>
            {invoice.status.replace('_', ' ')}
          </span>
          {invoice.needsReview && (
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
              Needs Review
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg mb-6">
          {success}
        </div>
      )}

      {/* Key Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Amount</span>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(invoice.amount)}</p>
        </div>
        <div className="card p-4">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Invoice Date</span>
          <p className="text-lg font-semibold text-gray-900 mt-1">{formatDate(invoice.invoiceDate)}</p>
        </div>
        <div className="card p-4">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Due Date</span>
          <p className={`text-lg font-semibold mt-1 ${isOverdue(invoice.dueDate, invoice.status) ? 'text-red-600' : 'text-gray-900'}`}>
            {formatDate(invoice.dueDate)}
            {isOverdue(invoice.dueDate, invoice.status) && (
              <span className="text-xs ml-2 px-2 py-0.5 bg-red-100 rounded">OVERDUE</span>
            )}
          </p>
        </div>
        <div className="card p-4">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Type</span>
          <p className="text-lg font-semibold text-gray-900 mt-1">{invoice.invoiceType?.name || 'Not set'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Extraction Section */}
          {files.length > 0 && (
            <div className="card">
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">AI Extraction</h3>
                    {extraction && (
                      <p className="text-xs text-gray-500">
                        {extraction.provider} ({extraction.model}) &bull; {(extraction.processingMs / 1000).toFixed(1)}s
                      </p>
                    )}
                  </div>
                </div>
                {extraction && (
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    extraction.status === 'SUCCESS' ? 'bg-green-100 text-green-800' :
                    extraction.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {extraction.status}
                  </span>
                )}
              </div>

              {needsExtraction && (
                <div className="p-6 text-center">
                  <p className="text-gray-600 mb-4">Extract invoice data automatically using AI</p>
                  <button
                    onClick={triggerExtraction}
                    disabled={extracting}
                    className="btn-primary"
                  >
                    {extracting ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Extracting...
                      </span>
                    ) : 'Extract Invoice Data'}
                  </button>
                </div>
              )}

              {extraction?.status === 'PENDING' && (
                <div className="p-8 text-center">
                  <svg className="animate-spin h-8 w-8 text-primary mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-gray-600">Processing invoice...</p>
                </div>
              )}

              {extraction?.status === 'FAILED' && (
                <div className="p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <p className="text-red-600 mb-4">Extraction failed. Please try again.</p>
                  <button onClick={handleRetryExtraction} disabled={extracting} className="btn-primary">
                    {extracting ? 'Retrying...' : 'Retry Extraction'}
                  </button>
                </div>
              )}

              {hasExtraction && (
                <div className="p-4">
                  {/* Extracted Fields Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* Vendor */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-medium text-gray-700">Vendor</label>
                        {!invoiceDataSaved && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <span className={`w-2 h-2 rounded-full ${getConfidenceColor('vendorName')}`}></span>
                            {getConfidencePercent('vendorName')}%
                          </span>
                        )}
                      </div>
                      <select
                        value={formData.vendorId}
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setShowNewVendor(true);
                            setNewVendorName(extraction.extractedJson.vendorName || '');
                          } else {
                            setFormData({ ...formData, vendorId: e.target.value });
                            setShowNewVendor(false);
                          }
                        }}
                        className="input-field"
                      >
                        <option value="">Select vendor...</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                        <option value="__new__">+ Create New Vendor</option>
                      </select>
                      {extraction.extractedJson.vendorName && !formData.vendorId && !showNewVendor && (
                        <p className="text-xs text-amber-600 mt-1">
                          Extracted: &quot;{extraction.extractedJson.vendorName}&quot; (no match)
                        </p>
                      )}
                      {showNewVendor && (
                        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm font-medium text-blue-800 mb-2">Create New Vendor</p>
                          <input
                            type="text"
                            value={newVendorName}
                            onChange={(e) => setNewVendorName(e.target.value)}
                            placeholder="Vendor Name"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-2"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleCreateVendor}
                              disabled={creatingVendor}
                              className="flex-1 py-2 px-3 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                              {creatingVendor ? 'Creating...' : 'Create Vendor'}
                            </button>
                            <button
                              onClick={() => setShowNewVendor(false)}
                              className="py-2 px-3 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Invoice Type */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-medium text-gray-700">Invoice Type</label>
                        {!invoiceDataSaved && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <span className={`w-2 h-2 rounded-full ${getConfidenceColor('invoiceType')}`}></span>
                            {getConfidencePercent('invoiceType')}%
                          </span>
                        )}
                      </div>
                      <select
                        value={formData.invoiceTypeId}
                        onChange={(e) => setFormData({ ...formData, invoiceTypeId: e.target.value })}
                        className="input-field"
                      >
                        <option value="">Select type...</option>
                        {invoiceTypes.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      {extraction.extractedJson.invoiceType && !formData.invoiceTypeId && (
                        <p className="text-xs text-amber-600 mt-1">
                          Extracted: &quot;{extraction.extractedJson.invoiceType}&quot; (no match)
                        </p>
                      )}
                    </div>

                    {/* Invoice Number */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-medium text-gray-700">Invoice Number</label>
                        {!invoiceDataSaved && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <span className={`w-2 h-2 rounded-full ${getConfidenceColor('invoiceNumber')}`}></span>
                            {getConfidencePercent('invoiceNumber')}%
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={formData.invoiceNumber}
                        onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                        className="input-field"
                        placeholder="Invoice number"
                      />
                    </div>

                    {/* Amount */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-medium text-gray-700">Amount</label>
                        {!invoiceDataSaved && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <span className={`w-2 h-2 rounded-full ${getConfidenceColor('amount')}`}></span>
                            {getConfidencePercent('amount')}%
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            className="input-field pl-7"
                            placeholder="0.00"
                          />
                        </div>
                        <select
                          value={formData.currency}
                          onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                          className="input-field w-24"
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
                        <label className="text-sm font-medium text-gray-700">Invoice Date</label>
                        {!invoiceDataSaved && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <span className={`w-2 h-2 rounded-full ${getConfidenceColor('invoiceDate')}`}></span>
                            {getConfidencePercent('invoiceDate')}%
                          </span>
                        )}
                      </div>
                      <input
                        type="date"
                        value={formData.invoiceDate}
                        onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                        className="input-field"
                      />
                    </div>

                    {/* Due Date */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-medium text-gray-700">Due Date</label>
                        {!invoiceDataSaved && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <span className={`w-2 h-2 rounded-full ${getConfidenceColor('dueDate')}`}></span>
                            {getConfidencePercent('dueDate')}%
                          </span>
                        )}
                      </div>
                      <input
                        type="date"
                        value={formData.dueDate}
                        onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                        className="input-field"
                      />
                      {extraction.extractedJson.dueDate === 'DUE_UPON_RECEIPT' && (
                        <p className="text-xs text-blue-600 mt-1">Due upon receipt</p>
                      )}
                      {extraction.extractedJson.paymentTerms && (
                        <p className="text-xs text-gray-500 mt-1">
                          Terms: {extraction.extractedJson.paymentTerms}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Line Items Table */}
                  {formData.lineItems && formData.lineItems.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Line Items</h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-20">Qty</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24">Rate</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-28">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {formData.lineItems.map((item, idx) => (
                              <tr key={idx}>
                                <td className="px-4 py-2 text-sm text-gray-900">{item.description || '-'}</td>
                                <td className="px-4 py-2 text-sm text-gray-600 text-right">
                                  {item.quantity != null ? item.quantity : '-'}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-600 text-right">
                                  {item.rate != null ? `$${item.rate.toFixed(2)}` : '-'}
                                </td>
                                <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">
                                  {item.amount != null ? `$${item.amount.toFixed(2)}` : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50">
                            <tr>
                              <td colSpan={3} className="px-4 py-2 text-sm font-medium text-gray-700 text-right">Total</td>
                              <td className="px-4 py-2 text-sm font-bold text-gray-900 text-right">
                                ${formData.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Confidence Legend & Actions */}
                  <div className="flex items-center justify-between pt-4 border-t">
                    {!invoiceDataSaved ? (
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span> High
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-yellow-500"></span> Medium
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-500"></span> Low
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-green-600">
                        Data saved to invoice
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleRetryExtraction}
                        disabled={extracting}
                        className="btn-secondary"
                      >
                        {extracting ? 'Retrying...' : 'Retry'}
                      </button>
                      <button
                        onClick={handleApplyExtraction}
                        disabled={applying}
                        className="btn-primary"
                      >
                        {applying ? 'Applying...' : 'Apply to Invoice'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Files Section */}
          <div className="card p-6">
            <InvoiceFileUpload
              invoiceId={invoiceId}
              files={files}
              onFilesChange={setFiles}
              canUpload={!!canUpload}
              canDelete={!!canDelete}
            />
          </div>

          {/* Notes & Description */}
          {(invoice.description || invoice.notes) && (
            <div className="card p-6">
              {invoice.description && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Description</h4>
                  <p className="text-gray-600">{invoice.description}</p>
                </div>
              )}
              {invoice.notes && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Internal Notes</h4>
                  <p className="text-gray-600">{invoice.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions Card */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Actions</h3>
            <div className="space-y-2">
              {canEdit && (
                <Link
                  href={`/dashboard/pharmacy/invoices/${invoiceId}/edit`}
                  className="btn-secondary w-full text-center block"
                >
                  Edit Invoice
                </Link>
              )}
              {canSubmit && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn-primary w-full"
                >
                  {submitting ? 'Submitting...' : 'Submit for Approval'}
                </button>
              )}
            </div>
          </div>

          {/* Pharmacy Info */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Pharmacy</h3>
            <p className="font-medium">{invoice.pharmacy.name}</p>
            <p className="text-sm text-gray-500">{invoice.pharmacy.code}</p>
          </div>

          {/* Vendor Info */}
          {invoice.vendor && (
            <div className="card p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Vendor</h3>
              <p className="font-medium">{invoice.vendor.name}</p>
              <p className="text-sm text-gray-500">{invoice.vendor.code}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-900">Activity</h3>
              {invoice.events.length > 3 && (
                <button
                  onClick={() => setShowTimeline(!showTimeline)}
                  className="text-xs text-primary hover:text-primary-dark"
                >
                  {showTimeline ? 'Show less' : `Show all (${invoice.events.length})`}
                </button>
              )}
            </div>
            <div className="space-y-3">
              {(showTimeline ? invoice.events : invoice.events.slice(0, 3)).map((event, idx) => (
                <div key={event.id} className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className={`w-2 h-2 mt-2 rounded-full ${idx === 0 ? 'bg-primary' : 'bg-gray-300'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {event.eventType.replace('_', ' ')}
                    </p>
                    {event.notes && (
                      <p className="text-sm text-gray-600 truncate">{event.notes}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      {event.user.firstName || event.user.email} &bull; {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
