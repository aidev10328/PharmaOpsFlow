'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

type Vendor = { id: string; name: string; code: string };
type InvoiceType = { id: string; name: string };
type ExtractedData = {
  vendorName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  amount?: number;
  currency?: string;
  invoiceType?: string;
};
type Confidence = {
  vendorName?: number;
  invoiceNumber?: number;
  invoiceDate?: number;
  dueDate?: number;
  amount?: number;
};

export default function UploadInvoicePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // State
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Extraction results
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [invoiceTypes, setInvoiceTypes] = useState<InvoiceType[]>([]);
  const [matchedVendorId, setMatchedVendorId] = useState<string>('');
  const [matchedInvoiceTypeId, setMatchedInvoiceTypeId] = useState<string>('');

  // Form data (editable)
  const [formData, setFormData] = useState({
    vendorId: '',
    invoiceTypeId: '',
    invoiceNumber: '',
    invoiceDate: '',
    dueDate: '',
    amount: '',
    currency: 'USD',
    notes: '',
  });

  const [submitting, setSubmitting] = useState(false);

  // Load pharmacies
  useEffect(() => {
    if (!loading && user) {
      loadPharmacies();
    }
  }, [loading, user]);

  const loadPharmacies = async () => {
    try {
      const res = await apiFetch('/pharmacies');
      if (res.ok) {
        const data = await res.json();
        setPharmacies(data);
        if (data.length === 1) {
          setSelectedPharmacyId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load pharmacies:', err);
    }
  };

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
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
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

  // Upload and parse
  const handleUploadAndParse = async () => {
    if (!file || !selectedPharmacyId) {
      setError('Please select a pharmacy and upload a file');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formDataObj = new FormData();
      formDataObj.append('file', file);
      formDataObj.append('pharmacyId', selectedPharmacyId);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'}/extraction/upload-and-parse`,
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

      // Store results
      setInvoiceId(data.invoice.id);
      setExtractedData(data.extractedData);
      setConfidence(data.confidence);
      setVendors(data.vendors || []);
      setInvoiceTypes(data.invoiceTypes || []);
      setMatchedVendorId(data.matchedVendorId || '');
      setMatchedInvoiceTypeId(data.matchedInvoiceTypeId || '');

      // Pre-fill form with extracted data
      if (data.extractedData) {
        setFormData({
          vendorId: data.matchedVendorId || '',
          invoiceTypeId: data.matchedInvoiceTypeId || '',
          invoiceNumber: data.extractedData.invoiceNumber || '',
          invoiceDate: data.extractedData.invoiceDate || '',
          dueDate: data.extractedData.dueDate || '',
          amount: data.extractedData.amount?.toString() || '',
          currency: data.extractedData.currency || 'USD',
          notes: '',
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload and parse invoice');
    } finally {
      setUploading(false);
    }
  };

  // Submit invoice
  const handleSubmit = async (asDraft: boolean = false) => {
    if (!invoiceId) return;

    setSubmitting(true);
    setError('');

    try {
      // Update invoice with form data
      const updateRes = await apiFetch(`/invoices/${invoiceId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          vendorId: formData.vendorId || null,
          invoiceTypeId: formData.invoiceTypeId || null,
          invoiceNumber: formData.invoiceNumber || null,
          invoiceDate: formData.invoiceDate || null,
          dueDate: formData.dueDate || null,
          amount: formData.amount ? parseFloat(formData.amount) : null,
          currency: formData.currency,
          notes: formData.notes || null,
        }),
      });

      if (!updateRes.ok) {
        const errData = await updateRes.json();
        throw new Error(errData.message || 'Failed to update invoice');
      }

      // Submit if not saving as draft
      if (!asDraft) {
        const submitRes = await apiFetch(`/invoices/${invoiceId}/submit`, {
          method: 'POST',
        });

        if (!submitRes.ok) {
          const errData = await submitRes.json();
          throw new Error(errData.message || 'Failed to submit invoice');
        }
      }

      // Redirect to invoice list
      router.push('/dashboard/pharmacy/invoices');
    } catch (err: any) {
      setError(err.message || 'Failed to save invoice');
    } finally {
      setSubmitting(false);
    }
  };

  // Confidence color
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

  // Auth check
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href="/dashboard/pharmacy/invoices"
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          ← Back to Invoices
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Upload Invoice</h1>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Select Pharmacy and Upload File */}
      {!invoiceId && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">
            Step 1: Upload Invoice Document
          </h2>

          {/* Pharmacy Selection */}
          {pharmacies.length > 1 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Pharmacy
              </label>
              <select
                value={selectedPharmacyId}
                onChange={(e) => setSelectedPharmacyId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a pharmacy...</option>
                {pharmacies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* File Upload */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {file ? (
              <div>
                <div className="text-green-600 mb-2">
                  <svg
                    className="w-12 h-12 mx-auto"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <button
                  onClick={() => setFile(null)}
                  className="mt-2 text-sm text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <svg
                  className="w-12 h-12 mx-auto text-gray-400 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-gray-600 mb-2">
                  Drag and drop your invoice here, or{' '}
                  <label className="text-blue-600 hover:text-blue-800 cursor-pointer">
                    browse
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx"
                      onChange={handleFileChange}
                    />
                  </label>
                </p>
                <p className="text-sm text-gray-500">
                  Supports PDF, images (JPG, PNG), and Word documents (max 10MB)
                </p>
              </div>
            )}
          </div>

          {/* Upload Button */}
          <div className="mt-6">
            <button
              onClick={handleUploadAndParse}
              disabled={!file || !selectedPharmacyId || uploading}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Parsing Invoice with AI...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  <span>Upload & Parse with AI</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Review and Edit Extracted Data */}
      {invoiceId && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">
            Step 2: Review & Edit Invoice Details
          </h2>

          {extractedData && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 font-medium">
                ✓ AI successfully extracted invoice data. Please review and make
                any corrections below.
              </p>
            </div>
          )}

          {!extractedData && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-700">
                AI extraction failed. Please fill in the invoice details manually.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vendor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vendor
                {confidence?.vendorName !== undefined && (
                  <span
                    className={`ml-2 text-xs ${getConfidenceColor(confidence.vendorName)}`}
                  >
                    ({getConfidenceLabel(confidence.vendorName)} confidence)
                  </span>
                )}
              </label>
              {extractedData?.vendorName && !matchedVendorId && (
                <p className="text-xs text-gray-500 mb-1">
                  Detected: "{extractedData.vendorName}"
                </p>
              )}
              <select
                value={formData.vendorId}
                onChange={(e) =>
                  setFormData({ ...formData, vendorId: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select vendor...</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Invoice Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Type
              </label>
              <select
                value={formData.invoiceTypeId}
                onChange={(e) =>
                  setFormData({ ...formData, invoiceTypeId: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select type...</option>
                {invoiceTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Invoice Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Number
                {confidence?.invoiceNumber !== undefined && (
                  <span
                    className={`ml-2 text-xs ${getConfidenceColor(confidence.invoiceNumber)}`}
                  >
                    ({getConfidenceLabel(confidence.invoiceNumber)} confidence)
                  </span>
                )}
              </label>
              <input
                type="text"
                value={formData.invoiceNumber}
                onChange={(e) =>
                  setFormData({ ...formData, invoiceNumber: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., INV-2024-001"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount
                {confidence?.amount !== undefined && (
                  <span
                    className={`ml-2 text-xs ${getConfidenceColor(confidence.amount)}`}
                  >
                    ({getConfidenceLabel(confidence.amount)} confidence)
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
                <select
                  value={formData.currency}
                  onChange={(e) =>
                    setFormData({ ...formData, currency: e.target.value })
                  }
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="CAD">CAD</option>
                </select>
              </div>
            </div>

            {/* Invoice Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Date
                {confidence?.invoiceDate !== undefined && (
                  <span
                    className={`ml-2 text-xs ${getConfidenceColor(confidence.invoiceDate)}`}
                  >
                    ({getConfidenceLabel(confidence.invoiceDate)} confidence)
                  </span>
                )}
              </label>
              <input
                type="date"
                value={formData.invoiceDate}
                onChange={(e) =>
                  setFormData({ ...formData, invoiceDate: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
                {confidence?.dueDate !== undefined && (
                  <span
                    className={`ml-2 text-xs ${getConfidenceColor(confidence.dueDate)}`}
                  >
                    ({getConfidenceLabel(confidence.dueDate)} confidence)
                  </span>
                )}
              </label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) =>
                  setFormData({ ...formData, dueDate: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Any additional notes..."
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting}
              className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </button>
            <button
              onClick={() => handleSubmit(true)}
              disabled={submitting}
              className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save as Draft
            </button>
            <button
              onClick={() => {
                setInvoiceId(null);
                setFile(null);
                setExtractedData(null);
              }}
              disabled={submitting}
              className="py-3 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Start Over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
