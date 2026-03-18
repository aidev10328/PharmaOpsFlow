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
  metadata?: any;
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
  accountNumber?: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  status: string;
  entryMethod?: 'MANUAL' | 'AI_EXTRACTION';
  description?: string;
  notes?: string;
  submittedAt?: string;
  approvedAt?: string;
  paidAt?: string;
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

export default function ManagerInvoiceDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [files, setFiles] = useState<InvoiceFile[]>([]);
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [showActionModal, setShowActionModal] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      router.push('/dashboard');
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

  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role) && invoiceId) {
      fetchInvoice();
      fetchFiles();
    }
  }, [user, invoiceId, fetchInvoice, fetchFiles]);

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
      timeZone: 'UTC',
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

  const handleAction = async (action: string) => {
    if ((action === 'needs-info' || action === 'reject') && !actionNotes.trim()) {
      alert('Please provide notes for this action');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const res = await apiFetch(`/invoices/${invoiceId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ notes: actionNotes || undefined }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Action failed');
      }

      setActionNotes('');
      setShowActionModal(null);
      await fetchInvoice();
    } catch (err: any) {
      setError(err.message || 'Action failed');
    } finally {
      setProcessing(false);
    }
  };

  const isOverdue = (dueDate: string, status: string) => {
    if (['PAID', 'REJECTED'].includes(status)) return false;
    return new Date(dueDate) < new Date();
  };

  if (loading || loadingInvoice) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!user || !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
    return null;
  }

  if (error && !invoice) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="card p-6 text-center">
          <p className="text-red-600">{error}</p>
          <Link href="/dashboard/manager/invoices" className="btn-primary mt-4">
            Back to Invoices
          </Link>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return null;
  }

  const canApprove = invoice.status === 'SUBMITTED';
  const canSchedule = invoice.status === 'APPROVED';
  const canMarkPaid = invoice.status === 'SCHEDULED';

  // Field component for consistent styling (compact)
  const Field = ({ label, value }: { label: string; value: string | React.ReactNode }) => (
    <div>
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</span>
      <p className="text-xs font-medium text-gray-900 mt-0.5">{value || <span className="text-gray-400 italic">Not set</span>}</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header - Compact */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
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
              {invoice.pharmacy?.name || 'N/A'} {invoice.vendor && `• ${invoice.vendor.name}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
        <Link href="/dashboard/manager/invoices" className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 shadow-sm">
          Back to Invoices
        </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded text-xs mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Invoice Details Card - Compact */}
          <div className="card">
            <div className="px-4 py-2.5 border-b">
              <h2 className="text-sm font-semibold text-gray-900">Invoice Details</h2>
            </div>
            <div className="p-4 space-y-3">
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

              {/* Row 2: Invoice Details */}
              <div className="border-t pt-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Field label="Vendor" value={invoice.vendor?.name} />
                  <Field label="Invoice Number" value={invoice.invoiceNumber} />
                  <Field label="Account Number" value={invoice.accountNumber} />
                  <Field label="Pharmacy" value={invoice.pharmacy?.name} />
                </div>
              </div>

              {/* Row 3: Description & Notes */}
              <div className="border-t pt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Description" value={invoice.description} />
                  <Field label="Internal Notes" value={invoice.notes} />
                </div>
              </div>

              {/* Manager Actions - Compact */}
              {(canApprove || canSchedule || canMarkPaid) && (
                <div className="border-t pt-3">
                  <h4 className="text-xs font-medium text-gray-900 mb-2">Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    {canApprove && (
                      <>
                        <button
                          onClick={() => handleAction('approve')}
                          disabled={processing}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setShowActionModal('needs-info')}
                          disabled={processing}
                          className="px-3 py-1.5 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
                        >
                          Request Info
                        </button>
                        <button
                          onClick={() => setShowActionModal('reject')}
                          disabled={processing}
                          className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {canSchedule && (
                      <button
                        onClick={() => handleAction('schedule')}
                        disabled={processing}
                        className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                      >
                        Schedule Payment
                      </button>
                    )}
                    {canMarkPaid && (
                      <button
                        onClick={() => handleAction('paid')}
                        disabled={processing}
                        className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Mark as Paid
                      </button>
                    )}
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
              canUpload={true}
              canDelete={user.role === 'ADMIN'}
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
            <p className="text-xs font-medium">{invoice.pharmacy?.name || 'N/A'}</p>
            <p className="text-[10px] text-gray-500">{invoice.pharmacy?.code || ''}</p>
          </div>

          {/* Vendor Info */}
          {invoice.vendor && (
            <div className="card p-3">
              <h3 className="text-xs font-medium text-gray-900 mb-1.5">Vendor</h3>
              <p className="text-xs font-medium">{invoice.vendor.name}</p>
              <p className="text-[10px] text-gray-500">{invoice.vendor.code}</p>
            </div>
          )}

          {/* Timeline - Compact */}
          <div className="card p-3">
            <h3 className="text-xs font-medium text-gray-900 mb-2">Activity</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(invoice.events || []).map((event, idx) => (
                <div key={event.id} className="flex gap-2">
                  <div className="flex-shrink-0">
                    <div className={`w-1.5 h-1.5 mt-1.5 rounded-full ${
                      idx === 0 ? 'bg-primary' : 'bg-gray-300'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900">
                      {event.eventType.replace('_', ' ')}
                    </p>
                    {event.notes && (
                      <p className="text-[10px] text-gray-600 truncate">{event.notes}</p>
                    )}
                    <p className="text-[10px] text-gray-500">
                      {event.user?.firstName || event.user?.email || 'System'} &bull; {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action Modal - Compact */}
      {showActionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              {showActionModal === 'needs-info' ? 'Request More Information' : 'Reject Invoice'}
            </h2>
            <textarea
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              rows={3}
              placeholder={showActionModal === 'needs-info'
                ? 'What information is needed?'
                : 'Reason for rejection'
              }
              className="input-field text-xs py-1.5 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowActionModal(null);
                  setActionNotes('');
                }}
                className="btn-secondary text-xs px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(showActionModal)}
                disabled={processing || !actionNotes.trim()}
                className={`px-3 py-1.5 text-xs text-white rounded disabled:opacity-50 ${
                  showActionModal === 'needs-info'
                    ? 'bg-yellow-500 hover:bg-yellow-600'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {processing ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
