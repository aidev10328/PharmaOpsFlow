'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';
import InvoiceFileUpload from '../../../../../../components/invoice/InvoiceFileUpload';
import ExtractionReviewPanel from '../../../../../../components/invoice/ExtractionReviewPanel';

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

export default function InvoiceDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [files, setFiles] = useState<InvoiceFile[]>([]);
  const [extraction, setExtraction] = useState<any>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    }
  }, [user, invoiceId, fetchInvoice, fetchFiles, fetchExtraction]);

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

  const isOverdue = (dueDate: string, status: string) => {
    if (['PAID', 'REJECTED'].includes(status)) return false;
    return new Date(dueDate) < new Date();
  };

  const canEdit = invoice && ['DRAFT', 'NEEDS_INFO'].includes(invoice.status);
  const canSubmit = invoice && invoice.status === 'DRAFT';
  const canUpload = invoice && ['DRAFT', 'NEEDS_INFO', 'SUBMITTED'].includes(invoice.status);
  const canDelete = invoice && ['DRAFT', 'NEEDS_INFO'].includes(invoice.status);

  if (loading || loadingInvoice) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!user) {
    return null;
  }

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

  if (!invoice) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/dashboard/pharmacy/invoices?pharmacyId=${invoice.pharmacy.id}`}
          className="text-primary hover:text-primary-dark text-sm"
        >
          &larr; Back to Invoices
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div className="card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Invoice {invoice.invoiceNumber || '(Pending Extraction)'}
                </h1>
                <p className="text-gray-500">{invoice.vendor?.name || 'Vendor not set'}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${STATUS_COLORS[invoice.status]}`}>
                  {invoice.status.replace('_', ' ')}
                </span>
                {invoice.needsReview && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                    Needs Review
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-sm text-gray-500">Amount</span>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(invoice.amount)}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Invoice Date</span>
                <p className="font-medium">{formatDate(invoice.invoiceDate)}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Due Date</span>
                <p className={`font-medium ${isOverdue(invoice.dueDate, invoice.status) ? 'text-red-600' : ''}`}>
                  {formatDate(invoice.dueDate)}
                  {isOverdue(invoice.dueDate, invoice.status) && (
                    <span className="text-xs ml-1">(OVERDUE)</span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Type</span>
                <p className="font-medium">{invoice.invoiceType?.name || 'Not set'}</p>
              </div>
            </div>

            {invoice.description && (
              <div className="mt-4 pt-4 border-t">
                <span className="text-sm text-gray-500">Description</span>
                <p className="mt-1">{invoice.description}</p>
              </div>
            )}

            {invoice.notes && (
              <div className="mt-4 pt-4 border-t">
                <span className="text-sm text-gray-500">Internal Notes</span>
                <p className="mt-1 text-gray-700">{invoice.notes}</p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 pt-4 border-t flex gap-3">
              {canEdit && (
                <Link
                  href={`/dashboard/pharmacy/invoices/${invoiceId}/edit`}
                  className="btn-secondary"
                >
                  Edit Invoice
                </Link>
              )}
              {canSubmit && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn-primary"
                >
                  {submitting ? 'Submitting...' : 'Submit for Approval'}
                </button>
              )}
            </div>
          </div>

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
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Pharmacy Info */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Pharmacy</h3>
            <p className="font-medium">{invoice.pharmacy.name}</p>
            <p className="text-sm text-gray-500">{invoice.pharmacy.code}</p>
          </div>

          {/* AI Extraction */}
          {files.length > 0 && (
            <div className="space-y-4">
              {!extraction && invoice.extractionStatus !== 'PENDING' && (
                <div className="card p-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">AI Extraction</h3>
                  <p className="text-sm text-gray-500 mb-3">
                    Extract invoice data automatically using AI.
                  </p>
                  <button
                    onClick={triggerExtraction}
                    disabled={extracting}
                    className="btn-primary w-full"
                  >
                    {extracting ? 'Extracting...' : 'Extract Invoice Data'}
                  </button>
                </div>
              )}

              {(extraction || invoice.extractionStatus === 'PENDING') && (
                <ExtractionReviewPanel
                  invoiceId={invoiceId}
                  extraction={extraction}
                  onApply={() => {
                    fetchInvoice();
                    fetchExtraction();
                  }}
                  onRetry={() => {
                    fetchInvoice();
                    fetchExtraction();
                  }}
                />
              )}
            </div>
          )}

          {/* Timeline */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Activity</h3>
            <div className="space-y-3">
              {invoice.events.map((event, idx) => (
                <div key={event.id} className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className={`w-2 h-2 mt-2 rounded-full ${
                      idx === 0 ? 'bg-primary' : 'bg-gray-300'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {event.eventType.replace('_', ' ')}
                    </p>
                    {event.notes && (
                      <p className="text-sm text-gray-600">{event.notes}</p>
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
