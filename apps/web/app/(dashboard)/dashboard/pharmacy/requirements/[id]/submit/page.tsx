'use client';

import { useAuth } from '../../../../../../../components/AuthProvider';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../../../lib/api';
import Link from 'next/link';

type Instance = {
  id: string;
  requirementId: string;
  requirement: {
    id: string;
    name: string;
    pharmacy: { id: string; name: string; code: string };
    vendor: { id: string; name: string } | null;
    invoiceType: { id: string; name: string } | null;
  };
  periodLabel: string;
  submissionDeadline: string;
  processingDeadline: string;
  status: string;
};

type Vendor = { id: string; name: string; code: string };
type InvoiceType = { id: string; name: string };
type DocumentType = 'INVOICE' | 'STATEMENT' | 'CREDIT_MEMO' | 'OTHER';
type ExtractedData = {
  vendorName?: string;
  invoiceNumber?: string;
  accountNumber?: string;
  documentType?: DocumentType;
  invoiceDate?: string;
  dueDate?: string;
  paymentTerms?: string;
  amount?: number;
  currency?: string;
};
type Confidence = {
  vendorName?: number;
  invoiceNumber?: number;
  accountNumber?: number;
  invoiceDate?: number;
  dueDate?: number;
  amount?: number;
};
type TempFileData = {
  tempFilePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

const formatDate = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

export default function SubmitRequirementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const instanceId = params.id as string;
  const pharmacyId = searchParams.get('pharmacyId') || '';

  // Instance data
  const [instance, setInstance] = useState<Instance | null>(null);
  const [loadingInstance, setLoadingInstance] = useState(true);

  // File upload
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Extraction results
  const [tempFileData, setTempFileData] = useState<TempFileData | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [invoiceTypes, setInvoiceTypes] = useState<InvoiceType[]>([]);
  const [matchedVendorId, setMatchedVendorId] = useState<string>('');
  const [matchedInvoiceTypeId, setMatchedInvoiceTypeId] = useState<string>('');

  // New vendor creation
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorCode, setNewVendorCode] = useState('');
  const [creatingVendor, setCreatingVendor] = useState(false);

  // Due upon receipt
  const [dueUponReceipt, setDueUponReceipt] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    vendorId: '',
    invoiceTypeId: '',
    invoiceNumber: '',
    accountNumber: '',
    documentType: 'INVOICE' as DocumentType,
    invoiceDate: '',
    dueDate: '',
    amount: '',
    currency: 'USD',
    description: '',
    notes: '',
  });

  const [submitting, setSubmitting] = useState(false);

  // Load instance details
  useEffect(() => {
    async function fetchInstance() {
      try {
        const res = await apiFetch(`/v1/requirements/instances/${instanceId}`);
        if (res.ok) {
          const data = await res.json();
          setInstance(data);
          // Pre-fill vendor and invoice type from requirement
          if (data.requirement.vendor) {
            setFormData(prev => ({ ...prev, vendorId: data.requirement.vendor.id }));
          }
          if (data.requirement.invoiceType) {
            setFormData(prev => ({ ...prev, invoiceTypeId: data.requirement.invoiceType.id }));
          }
        } else {
          setError('Failed to load requirement details');
        }
      } catch {
        setError('Failed to load requirement details');
      } finally {
        setLoadingInstance(false);
      }
    }
    if (user && instanceId) {
      fetchInstance();
    }
  }, [user, instanceId]);

  // Auth check
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Handle drag events
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Please upload a PDF, image (JPG, PNG), or Word document');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setFile(selectedFile);
    setError('');
  };

  // Upload and extract
  const handleUploadAndParse = async () => {
    if (!file || !pharmacyId) {
      setError('Please upload a file');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formDataObj = new FormData();
      formDataObj.append('file', file);
      formDataObj.append('pharmacyId', pharmacyId);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'}/extraction/extract-only`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('pharmaopsflow_token')}`,
          },
          body: formDataObj,
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Upload failed');
      }

      const data = await res.json();

      setTempFileData({
        tempFilePath: data.tempFilePath,
        originalName: data.originalName,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
      });
      setExtractedData(data.extractedData);
      setConfidence(data.confidence);
      setVendors(data.vendors || []);
      setInvoiceTypes(data.invoiceTypes || []);
      setMatchedVendorId(data.matchedVendorId || '');
      setMatchedInvoiceTypeId(data.matchedInvoiceTypeId || '');

      // Handle Due upon Receipt
      const isDueUponReceipt = data.extractedData?.dueDate === 'DUE_UPON_RECEIPT' ||
        data.extractedData?.paymentTerms?.toLowerCase().includes('due upon receipt');
      setDueUponReceipt(isDueUponReceipt);

      // Check if vendor needs to be created
      if (data.extractedData?.vendorName && !data.matchedVendorId) {
        setShowNewVendor(true);
        setNewVendorName(data.extractedData.vendorName);
        const code = data.extractedData.vendorName
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .split(' ')
          .map((w: string) => w.charAt(0).toUpperCase())
          .join('')
          .substring(0, 6) || 'NEW';
        setNewVendorCode(code);
      }

      // Pre-fill form - prefer requirement's vendor/type, fallback to extracted
      const reqVendorId = instance?.requirement.vendor?.id;
      const reqInvoiceTypeId = instance?.requirement.invoiceType?.id;
      const defaultInvoiceTypeId = reqInvoiceTypeId || data.matchedInvoiceTypeId ||
        (data.invoiceTypes || []).find((t: InvoiceType) => t.name === 'Vendor Invoice')?.id || '';

      // Build notes
      const notesParts: string[] = [];
      if (data.extractedData?.paymentTerms) notesParts.push(`Payment Terms: ${data.extractedData.paymentTerms}`);
      if (data.extractedData?.payableTo) notesParts.push(`Payable to: ${data.extractedData.payableTo}`);

      setFormData({
        vendorId: reqVendorId || data.matchedVendorId || '',
        invoiceTypeId: defaultInvoiceTypeId,
        invoiceNumber: data.extractedData?.invoiceNumber || '',
        accountNumber: data.extractedData?.accountNumber || '',
        documentType: data.extractedData?.documentType || 'INVOICE',
        invoiceDate: data.extractedData?.invoiceDate || '',
        dueDate: isDueUponReceipt ? '' : (data.extractedData?.dueDate || ''),
        amount: data.extractedData?.amount?.toString() || '',
        currency: data.extractedData?.currency || 'USD',
        description: '',
        notes: notesParts.join('\n'),
      });
    } catch (err: any) {
      setError(err.message || 'Failed to upload and parse invoice');
    } finally {
      setUploading(false);
    }
  };

  // Create new vendor
  const handleCreateVendor = async () => {
    if (!newVendorName.trim() || !newVendorCode.trim()) {
      setError('Please enter vendor name and code');
      return;
    }

    setCreatingVendor(true);
    setError('');

    try {
      const res = await apiFetch('/invoices/vendors', {
        method: 'POST',
        body: JSON.stringify({
          name: newVendorName.trim(),
          externalRef: newVendorCode.trim().toUpperCase() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to create vendor');
      }

      const newVendor = await res.json();
      setVendors([...vendors, newVendor]);
      setFormData({ ...formData, vendorId: newVendor.id });
      setShowNewVendor(false);
      setNewVendorName('');
      setNewVendorCode('');
    } catch (err: any) {
      setError(err.message || 'Failed to create vendor');
    } finally {
      setCreatingVendor(false);
    }
  };

  // Submit invoice and link to requirement
  const handleSubmit = async (asDraft: boolean = false) => {
    if (!tempFileData || !instance) {
      setError('No file uploaded. Please upload a file first.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Prepare notes
      let notes = formData.notes || '';
      if (dueUponReceipt && !notes.includes('Due upon Receipt')) {
        notes = notes ? `${notes}\nDue upon Receipt` : 'Due upon Receipt';
      }

      // Create invoice from temp file
      const createPayload = {
        pharmacyId,
        tempFilePath: tempFileData.tempFilePath,
        originalName: tempFileData.originalName,
        mimeType: tempFileData.mimeType,
        sizeBytes: tempFileData.sizeBytes,
        vendorId: formData.vendorId || undefined,
        invoiceTypeId: formData.invoiceTypeId || undefined,
        invoiceNumber: formData.invoiceNumber || undefined,
        accountNumber: formData.accountNumber || undefined,
        invoiceDate: formData.invoiceDate || undefined,
        dueDate: dueUponReceipt ? formData.invoiceDate : (formData.dueDate || undefined),
        amount: formData.amount ? parseFloat(formData.amount) : undefined,
        currency: formData.currency,
        description: formData.description || undefined,
        notes: notes || undefined,
        submit: !asDraft,
      };

      const res = await apiFetch('/extraction/create-from-temp', {
        method: 'POST',
        body: JSON.stringify(createPayload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to create invoice');
      }

      const invoice = await res.json();

      // Link the invoice to the requirement instance
      const linkRes = await apiFetch(`/v1/requirements/instances/${instance.id}/link`, {
        method: 'POST',
        body: JSON.stringify({ invoiceId: invoice.id }),
      });

      if (!linkRes.ok) {
        console.warn('Failed to link invoice to requirement, but invoice was created');
      }

      // Redirect back to invoices page
      router.push(`/dashboard/pharmacy/invoices?pharmacyId=${pharmacyId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to save invoice');
    } finally {
      setSubmitting(false);
    }
  };

  // Confidence color helper
  const getConfidenceColor = (score: number | undefined) => {
    if (score === undefined) return 'text-gray-400';
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceLabel = (score: number | undefined) => {
    if (score === undefined) return '';
    return `${Math.round(score * 100)}%`;
  };

  if (loading || loadingInstance) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user || !instance) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <Link
          href={`/dashboard/pharmacy/invoices?pharmacyId=${pharmacyId}`}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          &larr; Back to Invoices
        </Link>
      </div>

      {/* Requirement Info */}
      <div className="card p-4 mb-4 bg-blue-50 border-blue-200">
        <h2 className="font-semibold text-gray-900 mb-2">Submitting Invoice For:</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-gray-500 uppercase">Requirement</div>
            <div className="font-medium">{instance.requirement.name}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase">Period</div>
            <div className="font-medium">{instance.periodLabel}</div>
          </div>
          {instance.requirement.vendor && (
            <div>
              <div className="text-xs text-gray-500 uppercase">Expected Vendor</div>
              <div className="font-medium">{instance.requirement.vendor.name}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-gray-500 uppercase">Due By</div>
            <div className="font-medium text-orange-600">{formatDate(instance.submissionDeadline)}</div>
          </div>
        </div>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-4">Upload Invoice</h1>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Upload File */}
      {!tempFileData && (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-base font-semibold mb-3">Upload Invoice Document</h2>

          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
              dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-left">
                  <p className="font-medium text-gray-900 text-sm">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button onClick={() => setFile(null)} className="text-sm text-red-600 hover:text-red-800 ml-2">Remove</button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-2">
                <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-gray-600 text-sm">
                  Drag and drop your invoice here, or{' '}
                  <label className="text-blue-600 hover:text-blue-800 cursor-pointer">
                    browse
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx" onChange={handleFileChange} />
                  </label>
                </p>
                <p className="text-xs text-gray-500 mt-1">PDF, images, or Word documents (max 10MB)</p>
              </div>
            )}
          </div>

          <div className="mt-4">
            <button
              onClick={() => { if (!uploading) handleUploadAndParse(); }}
              disabled={!file || uploading}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Parsing Invoice with AI...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>Upload & Parse with AI</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Review and Edit */}
      {tempFileData && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Review & Edit Invoice Details</h2>
            {extractedData && <span className="text-xs text-green-600 font-medium">AI extracted</span>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Vendor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vendor
                {confidence?.vendorName !== undefined && (
                  <span className={`ml-2 text-xs ${getConfidenceColor(confidence.vendorName)}`}>
                    ({getConfidenceLabel(confidence.vendorName)} confidence)
                  </span>
                )}
              </label>
              {instance.requirement.vendor && (
                <p className="text-xs text-blue-600 mb-1">
                  Expected: {instance.requirement.vendor.name}
                </p>
              )}
              <select
                value={formData.vendorId}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setShowNewVendor(true);
                  } else {
                    setFormData({ ...formData, vendorId: e.target.value });
                    setShowNewVendor(false);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select vendor...</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
                ))}
                <option value="__new__">+ Create New Vendor</option>
              </select>

              {showNewVendor && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 mb-2">Create New Vendor</p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newVendorName}
                      onChange={(e) => setNewVendorName(e.target.value)}
                      placeholder="Vendor Name"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                    <input
                      type="text"
                      value={newVendorCode}
                      onChange={(e) => setNewVendorCode(e.target.value.toUpperCase())}
                      placeholder="Vendor Code (e.g., ACME)"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleCreateVendor} disabled={creatingVendor} className="flex-1 py-2 px-3 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {creatingVendor ? 'Creating...' : 'Create Vendor'}
                      </button>
                      <button onClick={() => setShowNewVendor(false)} className="py-2 px-3 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Invoice Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Type</label>
              <select
                value={formData.invoiceTypeId}
                onChange={(e) => setFormData({ ...formData, invoiceTypeId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select type...</option>
                {invoiceTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Document Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
              <select
                value={formData.documentType}
                onChange={(e) => setFormData({ ...formData, documentType: e.target.value as DocumentType })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="INVOICE">Invoice</option>
                <option value="STATEMENT">Statement</option>
                <option value="CREDIT_MEMO">Credit Memo</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Invoice Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Number
                {confidence?.invoiceNumber !== undefined && (
                  <span className={`ml-2 text-xs ${getConfidenceColor(confidence.invoiceNumber)}`}>
                    ({getConfidenceLabel(confidence.invoiceNumber)} confidence)
                  </span>
                )}
              </label>
              <input
                type="text"
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="e.g., INV-2024-001"
              />
            </div>

            {/* Account Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account #
                {confidence?.accountNumber !== undefined && (
                  <span className={`ml-2 text-xs ${getConfidenceColor(confidence.accountNumber)}`}>
                    ({getConfidenceLabel(confidence.accountNumber)} confidence)
                  </span>
                )}
              </label>
              <input
                type="text"
                value={formData.accountNumber}
                onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="e.g., ACC-12345"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount
                {confidence?.amount !== undefined && (
                  <span className={`ml-2 text-xs ${getConfidenceColor(confidence.amount)}`}>
                    ({getConfidenceLabel(confidence.amount)} confidence)
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Invoice Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
              <input
                type="date"
                value={formData.invoiceDate}
                onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              {!dueUponReceipt && (
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              )}
              {dueUponReceipt && (
                <p className="text-sm text-amber-600 italic py-2">Payment due immediately upon receipt</p>
              )}
            </div>

            {/* Due upon Receipt checkbox - spans both columns */}
            <div className="md:col-span-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="dueUponReceipt"
                  checked={dueUponReceipt}
                  onChange={(e) => {
                    setDueUponReceipt(e.target.checked);
                    if (e.target.checked) setFormData({ ...formData, dueDate: '' });
                  }}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="dueUponReceipt" className="ml-2 text-sm text-gray-600">Due upon Receipt</label>
              </div>
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Brief description of the invoice"
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes (optional)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Internal notes (not visible to vendors)..."
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting}
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </button>
            <button
              onClick={() => handleSubmit(true)}
              disabled={submitting}
              className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              Save as Draft
            </button>
            <button
              onClick={() => {
                setTempFileData(null);
                setFile(null);
                setExtractedData(null);
                setConfidence(null);
                setShowNewVendor(false);
                setDueUponReceipt(false);
              }}
              disabled={submitting}
              className="py-2 px-4 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Start Over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
