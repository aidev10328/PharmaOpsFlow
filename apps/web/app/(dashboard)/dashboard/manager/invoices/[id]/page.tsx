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
  invoiceDate: string;
  dueDate: string;
  amount: string;
  status: string;
  description?: string;
  notes?: string;
  submittedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  pharmacy: { id: string; name: string; code: string; orgId: string };
  vendor: { id: string; name: string; code: string };
  invoiceType: { id: string; name: string };
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

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <Link
          href="/dashboard/manager/invoices"
          className="text-primary hover:text-primary-dark text-sm"
        >
          &larr; Back to Invoice Management
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
                  Invoice {invoice.invoiceNumber}
                </h1>
                <p className="text-gray-500">{invoice.vendor.name}</p>
              </div>
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${STATUS_COLORS[invoice.status]}`}>
                {invoice.status.replace('_', ' ')}
              </span>
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
                <p className="font-medium">{invoice.invoiceType.name}</p>
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

            {/* Manager Actions */}
            {(canApprove || canSchedule || canMarkPaid) && (
              <div className="mt-6 pt-4 border-t">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Actions</h4>
                <div className="flex flex-wrap gap-3">
                  {canApprove && (
                    <>
                      <button
                        onClick={() => handleAction('approve')}
                        disabled={processing}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setShowActionModal('needs-info')}
                        disabled={processing}
                        className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50"
                      >
                        Request Info
                      </button>
                      <button
                        onClick={() => setShowActionModal('reject')}
                        disabled={processing}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {canSchedule && (
                    <button
                      onClick={() => handleAction('schedule')}
                      disabled={processing}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      Schedule Payment
                    </button>
                  )}
                  {canMarkPaid && (
                    <button
                      onClick={() => handleAction('paid')}
                      disabled={processing}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Mark as Paid
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Files Section */}
          <div className="card p-6">
            <InvoiceFileUpload
              invoiceId={invoiceId}
              files={files}
              onFilesChange={setFiles}
              canUpload={true}
              canDelete={user.role === 'ADMIN'}
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

          {/* Vendor Info */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Vendor</h3>
            <p className="font-medium">{invoice.vendor.name}</p>
            <p className="text-sm text-gray-500">{invoice.vendor.code}</p>
          </div>

          {/* Timeline */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Activity</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
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

      {/* Action Modal */}
      {showActionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {showActionModal === 'needs-info' ? 'Request More Information' : 'Reject Invoice'}
            </h2>
            <textarea
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              rows={4}
              placeholder={showActionModal === 'needs-info'
                ? 'What information is needed?'
                : 'Reason for rejection'
              }
              className="input-field mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowActionModal(null);
                  setActionNotes('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(showActionModal)}
                disabled={processing || !actionNotes.trim()}
                className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 ${
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
