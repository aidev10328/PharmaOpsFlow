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

type DocumentType = 'INVOICE' | 'STATEMENT' | 'CREDIT_MEMO' | 'OTHER';

type Invoice = {
  id: string;
  invoiceNumber: string;
  accountNumber?: string;
  documentType?: DocumentType;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  status: string;
  entryMethod: 'MANUAL' | 'AI_EXTRACTION';
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

export default function InvoiceDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [files, setFiles] = useState<InvoiceFile[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [invoiceTypes, setInvoiceTypes] = useState<InvoiceType[]>([]);
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [dueUponReceipt, setDueUponReceipt] = useState(false);

  // Form data for editing
  const [formData, setFormData] = useState({
    vendorId: '',
    invoiceTypeId: '',
    invoiceNumber: '',
    accountNumber: '',
    documentType: 'INVOICE' as DocumentType,
    invoiceDate: '',
    dueDate: '',
    amount: '',
    description: '',
    notes: '',
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

  // Pre-fill form from invoice data
  useEffect(() => {
    if (invoice) {
      // Default to "Vendor Invoice" type if none is set
      const defaultInvoiceTypeId = invoice.invoiceType?.id ||
        invoiceTypes.find((t) => t.name === 'Vendor Invoice')?.id || '';

      setFormData({
        vendorId: invoice.vendor?.id || '',
        invoiceTypeId: defaultInvoiceTypeId,
        invoiceNumber: invoice.invoiceNumber || '',
        accountNumber: invoice.accountNumber || '',
        documentType: invoice.documentType || 'INVOICE',
        invoiceDate: invoice.invoiceDate ? invoice.invoiceDate.split('T')[0] : '',
        dueDate: invoice.dueDate ? invoice.dueDate.split('T')[0] : '',
        amount: invoice.amount ? String(Number(invoice.amount)) : '',
        description: invoice.description || '',
        notes: invoice.notes || '',
      });
    }
  }, [invoice, invoiceTypes]);

  useEffect(() => {
    if (user && invoiceId) {
      fetchInvoice();
      fetchFiles();
      fetchOptions();
    }
  }, [user, invoiceId, fetchInvoice, fetchFiles, fetchOptions]);

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(amount));
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not set';
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

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!invoice) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch(`/invoices/${invoiceId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          vendorId: formData.vendorId || undefined,
          invoiceTypeId: formData.invoiceTypeId || undefined,
          invoiceNumber: formData.invoiceNumber || undefined,
          accountNumber: formData.accountNumber || undefined,
          documentType: formData.documentType || undefined,
          invoiceDate: formData.invoiceDate || undefined,
          dueDate: formData.dueDate || undefined,
          amount: formData.amount ? parseFloat(formData.amount) : undefined,
          description: formData.description || undefined,
          notes: formData.notes || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to save changes');
      }

      setSuccess('Invoice saved successfully!');
      await fetchInvoice();
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!invoice) return;
    setError(null);
    setSuccess(null);

    // Validate mandatory fields before submit
    const missingFields: string[] = [];
    if (!formData.vendorId) missingFields.push('Vendor');
    if (!formData.invoiceTypeId) missingFields.push('Invoice Type');
    if (!formData.invoiceNumber && !formData.accountNumber) missingFields.push('Invoice Number or Account Number');
    if (!formData.amount || parseFloat(formData.amount) <= 0) missingFields.push('Amount');
    if (!formData.invoiceDate) missingFields.push('Invoice Date');
    if (!formData.dueDate) missingFields.push('Due Date');

    if (missingFields.length > 0) {
      setError(`Please fill in required fields: ${missingFields.join(', ')}`);
      return;
    }

    setSubmitting(true);

    try {
      // First save the current form data
      const saveRes = await apiFetch(`/invoices/${invoiceId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          vendorId: formData.vendorId,
          invoiceTypeId: formData.invoiceTypeId,
          invoiceNumber: formData.invoiceNumber || undefined,
          accountNumber: formData.accountNumber || undefined,
          documentType: formData.documentType || undefined,
          invoiceDate: formData.invoiceDate,
          dueDate: formData.dueDate,
          amount: parseFloat(formData.amount),
          description: formData.description || undefined,
          notes: formData.notes || undefined,
        }),
      });

      if (!saveRes.ok) {
        const errorData = await saveRes.json();
        throw new Error(errorData.message || 'Failed to save changes');
      }

      // Then submit the invoice
      const res = await apiFetch(`/invoices/${invoiceId}/submit`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Submit failed');
      }
      setSuccess('Invoice submitted successfully!');
      await fetchInvoice();
    } catch (err: any) {
      setError(err.message || 'Failed to submit invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const isOverdue = (dueDate: string, status: string) => {
    if (['PAID', 'REJECTED'].includes(status)) return false;
    return new Date(dueDate) < new Date();
  };

  // Permissions
  const isEditable = invoice && ['DRAFT', 'NEEDS_INFO'].includes(invoice.status);
  const canUpload = invoice && ['DRAFT', 'NEEDS_INFO', 'SUBMITTED'].includes(invoice.status);
  const canDelete = invoice && ['DRAFT'].includes(invoice.status);

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

  // Field component for consistent styling (compact)
  const Field = ({ label, value, required }: { label: string; value: string | React.ReactNode; required?: boolean }) => (
    <div>
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</span>
      <p className="text-xs font-medium text-gray-900 mt-0.5">{value || <span className="text-gray-400 italic">Not set</span>}</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header - Compact */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/pharmacy/invoices?pharmacyId=${invoice.pharmacy.id}`}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900">
                {invoice.invoiceNumber || 'Draft Invoice'}
              </h1>
              <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${STATUS_COLORS[invoice.status]}`}>
                {invoice.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {invoice.pharmacy.name} {invoice.vendor && `• ${invoice.vendor.name}`}
            </p>
          </div>
        </div>
        {invoice.entryMethod === 'AI_EXTRACTION' ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-violet-100 text-violet-700">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            AI
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-600">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Manual
          </span>
        )}
      </div>

      {/* Alerts - Compact */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded text-xs mb-4">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-3 py-2 rounded text-xs mb-4">
          {success}
        </div>
      )}

      {/* Status Alert Banner for Rejected/Needs Info - Compact */}
      {invoice && (invoice.status === 'REJECTED' || invoice.status === 'NEEDS_INFO') && (() => {
        const statusEvent = invoice.events?.find(
          (e: InvoiceEvent) => e.eventType === invoice.status || e.eventType === 'NEEDS_INFO' || e.eventType === 'REJECTED'
        );
        const isRejected = invoice.status === 'REJECTED';
        return (
          <div className={`mb-4 px-3 py-2 rounded border ${isRejected ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 mt-0.5">
                {isRejected ? (
                  <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <h3 className={`text-xs font-semibold ${isRejected ? 'text-red-800' : 'text-yellow-800'}`}>
                  {isRejected ? 'Invoice Rejected' : 'More Information Required'}
                </h3>
                {statusEvent?.notes && (
                  <p className={`text-xs mt-0.5 ${isRejected ? 'text-red-700' : 'text-yellow-700'}`}>
                    <span className="font-medium">Reason: </span>{statusEvent.notes}
                  </p>
                )}
                {statusEvent && (
                  <p className={`text-[10px] mt-1 ${isRejected ? 'text-red-600' : 'text-yellow-600'}`}>
                    By {statusEvent.user?.firstName || statusEvent.user?.email || 'Manager'} on {formatDateTime(statusEvent.createdAt)}
                  </p>
                )}
                {!isRejected && (
                  <p className={`text-xs mt-1 ${isRejected ? 'text-red-700' : 'text-yellow-700'}`}>
                    Please update the invoice with the requested information and resubmit.
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Invoice Details Card - Compact */}
          <div className="card">
            <div className="px-4 py-2.5 border-b flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Invoice Details</h2>
              {isEditable && (
                <span className="text-[10px] text-gray-500">* = required</span>
              )}
            </div>
            <div className="p-4">
              {isEditable ? (
                /* Editable Form - Compact */
                <div className="space-y-3">
                  {/* Row 1: Vendor & Invoice Type */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Vendor <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="vendorId"
                        value={formData.vendorId}
                        onChange={handleFormChange}
                        className="input-field text-xs py-1.5"
                      >
                        <option value="">Select vendor</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Invoice Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="invoiceTypeId"
                        value={formData.invoiceTypeId}
                        onChange={handleFormChange}
                        className="input-field text-xs py-1.5"
                      >
                        <option value="">Select type</option>
                        {invoiceTypes.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Document Type */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Document Type
                      </label>
                      <select
                        name="documentType"
                        value={formData.documentType}
                        onChange={handleFormChange}
                        className="input-field text-xs py-1.5"
                      >
                        <option value="INVOICE">Invoice</option>
                        <option value="STATEMENT">Statement</option>
                        <option value="CREDIT_MEMO">Credit Memo</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 3: Invoice Number & Account Number */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Invoice Number
                      </label>
                      <input
                        type="text"
                        name="invoiceNumber"
                        value={formData.invoiceNumber}
                        onChange={handleFormChange}
                        placeholder="e.g., INV-2024-001"
                        className="input-field text-xs py-1.5"
                      />
                      <p className="text-[10px] text-gray-500 mt-0.5">At least Invoice # or Account # required</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Account Number
                      </label>
                      <input
                        type="text"
                        name="accountNumber"
                        value={formData.accountNumber}
                        onChange={handleFormChange}
                        placeholder="e.g., ACC-12345"
                        className="input-field text-xs py-1.5"
                      />
                    </div>
                  </div>

                  {/* Row 3: Amount */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Amount (USD) <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none z-10 text-xs">$</span>
                        <input
                          type="number"
                          name="amount"
                          value={formData.amount}
                          onChange={handleFormChange}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          className="input-field text-xs py-1.5"
                          style={{ paddingLeft: '1.5rem' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 4: Dates */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Invoice Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        name="invoiceDate"
                        value={formData.invoiceDate}
                        onChange={handleFormChange}
                        className="input-field text-xs py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Due Date <span className="text-red-500">*</span>
                      </label>
                      {!dueUponReceipt ? (
                        <input
                          type="date"
                          name="dueDate"
                          value={formData.dueDate}
                          onChange={handleFormChange}
                          className="input-field text-xs py-1.5"
                        />
                      ) : (
                        <p className="text-xs text-amber-600 italic py-1.5">Payment due immediately upon receipt</p>
                      )}
                      {/* Due upon Receipt checkbox */}
                      <div className="flex items-center mt-1.5">
                        <input
                          type="checkbox"
                          id="dueUponReceipt"
                          checked={dueUponReceipt}
                          onChange={(e) => {
                            setDueUponReceipt(e.target.checked);
                            if (e.target.checked) {
                              // Set due date to invoice date (or today) when "due upon receipt" is checked
                              const dueDate = formData.invoiceDate || new Date().toISOString().split('T')[0];
                              setFormData(prev => ({ ...prev, dueDate }));
                            }
                          }}
                          className="h-3.5 w-3.5 text-blue-600 border-gray-300 rounded"
                        />
                        <label htmlFor="dueUponReceipt" className="ml-1.5 text-[11px] text-gray-600">Due upon Receipt</label>
                      </div>
                    </div>
                  </div>

                  {/* Row 5: Description */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
                      Description
                    </label>
                    <input
                      type="text"
                      name="description"
                      value={formData.description}
                      onChange={handleFormChange}
                      placeholder="Brief description of the invoice"
                      className="input-field text-xs py-1.5"
                    />
                  </div>

                  {/* Row 6: Notes */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
                      Internal Notes
                    </label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleFormChange}
                      rows={2}
                      placeholder="Internal notes (not visible to vendors)"
                      className="input-field text-xs py-1.5"
                    />
                  </div>

                  {/* Action Buttons - Compact */}
                  <div className="flex justify-end gap-2 pt-3 border-t">
                    <Link
                      href={`/dashboard/pharmacy/invoices?pharmacyId=${invoice.pharmacy.id}`}
                      className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center"
                    >
                      Cancel
                    </Link>
                    <button
                      onClick={handleSave}
                      disabled={saving || submitting}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      {saving ? 'Saving...' : 'Save Draft'}
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={saving || submitting}
                      className="btn-accent text-xs px-3 py-1.5"
                    >
                      {submitting ? 'Submitting...' : 'Submit for Approval'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Read-only View - Compact */
                <div className="space-y-3">
                  {/* Row 1: Key Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide">Amount</span>
                      <p className="text-base font-bold text-gray-900 mt-0.5">{formatCurrency(invoice.amount)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide">Invoice Date</span>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatDate(invoice.invoiceDate)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide">Due Date</span>
                      <p className={`text-sm font-semibold mt-0.5 ${isOverdue(invoice.dueDate, invoice.status) ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatDate(invoice.dueDate)}
                        {isOverdue(invoice.dueDate, invoice.status) && (
                          <span className="text-[9px] ml-1 px-1 py-0.5 bg-red-100 text-red-600 rounded">!</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide">Type</span>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{invoice.invoiceType?.name || 'Not set'}</p>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Field label="Vendor" value={invoice.vendor?.name} />
                      <Field label="Invoice Number" value={invoice.invoiceNumber} />
                      <Field label="Account Number" value={invoice.accountNumber} />
                      <Field label="Document Type" value={invoice.documentType?.replace('_', ' ') || 'Invoice'} />
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Field label="Pharmacy" value={invoice.pharmacy.name} />
                      <Field label="Description" value={invoice.description} />
                      <Field label="Internal Notes" value={invoice.notes} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Files Section - Compact */}
          <div className="card p-4">
            <InvoiceFileUpload
              invoiceId={invoiceId}
              files={files}
              onFilesChange={setFiles}
              canUpload={!!canUpload}
              canDelete={!!canDelete}
            />
          </div>
        </div>

        {/* Sidebar - Compact */}
        <div className="space-y-4">
          {/* Status Card */}
          <div className="card p-3">
            <h3 className="text-xs font-medium text-gray-900 mb-2">Status</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Current</span>
                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${STATUS_COLORS[invoice.status]}`}>
                  {invoice.status.replace('_', ' ')}
                </span>
              </div>
              {invoice.submittedAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Submitted</span>
                  <span className="text-gray-700">{formatDateTime(invoice.submittedAt)}</span>
                </div>
              )}
              {invoice.approvedAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Approved</span>
                  <span className="text-gray-700">{formatDateTime(invoice.approvedAt)}</span>
                </div>
              )}
              {invoice.paidAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Paid</span>
                  <span className="text-gray-700">{formatDateTime(invoice.paidAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Pharmacy Info */}
          <div className="card p-3">
            <h3 className="text-xs font-medium text-gray-900 mb-1.5">Pharmacy</h3>
            <p className="text-xs font-medium">{invoice.pharmacy.name}</p>
            <p className="text-[10px] text-gray-500">{invoice.pharmacy.code}</p>
          </div>

          {/* Vendor Info */}
          {invoice.vendor && (
            <div className="card p-3">
              <h3 className="text-xs font-medium text-gray-900 mb-1.5">Vendor</h3>
              <p className="text-xs font-medium">{invoice.vendor.name}</p>
              <p className="text-[10px] text-gray-500">{invoice.vendor.code}</p>
            </div>
          )}

          {/* Activity Timeline - Compact */}
          <div className="card p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-gray-900">Activity</h3>
              {invoice.events.length > 3 && (
                <button
                  onClick={() => setShowTimeline(!showTimeline)}
                  className="text-[10px] text-primary hover:text-primary-dark"
                >
                  {showTimeline ? 'Less' : `All (${invoice.events.length})`}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {(showTimeline ? invoice.events : invoice.events.slice(0, 3)).map((event, idx) => (
                <div key={event.id} className="flex gap-2">
                  <div className="flex-shrink-0">
                    <div className={`w-1.5 h-1.5 mt-1.5 rounded-full ${idx === 0 ? 'bg-primary' : 'bg-gray-300'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900">
                      {event.eventType.replace('_', ' ')}
                    </p>
                    {event.notes && (
                      <p className="text-[10px] text-gray-600 truncate">{event.notes}</p>
                    )}
                    <p className="text-[10px] text-gray-500">
                      {event.user.firstName || event.user.email} • {formatDateTime(event.createdAt)}
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
