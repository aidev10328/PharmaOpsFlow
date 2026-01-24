'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../lib/api';
import Link from 'next/link';

type Pharmacy = {
  id: string;
  name: string;
  code: string;
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
  pharmacy: Pharmacy;
  vendor: Vendor;
  invoiceType: InvoiceType;
  createdAt: string;
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

export default function ManagerInvoicesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch pending approvals
  const fetchPendingInvoices = useCallback(async () => {
    try {
      const res = await apiFetch('/invoices/pending-approval');
      if (res.ok) {
        const data = await res.json();
        setPendingInvoices(Array.isArray(data) ? data : data.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch pending invoices:', e);
    }
  }, []);

  // Fetch all invoices
  const fetchAllInvoices = useCallback(async () => {
    try {
      let url = '/invoices?limit=50';
      if (statusFilter) {
        url += `&status=${statusFilter}`;
      }
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setAllInvoices(data.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch all invoices:', e);
    }
  }, [statusFilter]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/invoices/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  }, []);

  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      Promise.all([
        fetchPendingInvoices(),
        fetchAllInvoices(),
        fetchStats(),
      ]).finally(() => setLoadingInvoices(false));
    }
  }, [user, fetchPendingInvoices, fetchAllInvoices, fetchStats]);

  useEffect(() => {
    if (user && activeTab === 'all') {
      fetchAllInvoices();
    }
  }, [statusFilter, activeTab, user, fetchAllInvoices]);

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

  const isOverdue = (dueDate: string, status: string) => {
    if (['PAID', 'REJECTED'].includes(status)) return false;
    return new Date(dueDate) < new Date();
  };

  const handleAction = async (action: 'approve' | 'needs-info' | 'reject' | 'schedule' | 'paid', invoiceId: string) => {
    if ((action === 'needs-info' || action === 'reject') && !actionNotes.trim()) {
      alert('Please provide notes for this action');
      return;
    }

    setProcessingAction(`${action}-${invoiceId}`);
    try {
      const res = await apiFetch(`/invoices/${invoiceId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ notes: actionNotes || undefined }),
      });

      if (res.ok) {
        setActionNotes('');
        setSelectedInvoice(null);
        // Refresh data
        await Promise.all([fetchPendingInvoices(), fetchAllInvoices(), fetchStats()]);
      } else {
        const errorData = await res.json();
        alert(errorData.message || 'Action failed');
      }
    } catch (e) {
      console.error('Action failed:', e);
      alert('Action failed');
    } finally {
      setProcessingAction(null);
    }
  };

  if (loading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!user || !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
    return null;
  }

  const displayInvoices = activeTab === 'pending' ? pendingInvoices : allInvoices;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Invoice Management</h1>
          <p className="text-gray-600 mt-1">
            Review and manage invoices across all pharmacies
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <div className="card p-4">
            <div className="text-2xl font-bold text-gray-600">{stats.statusCounts?.DRAFT || 0}</div>
            <div className="text-sm text-gray-500">Draft</div>
          </div>
          <div className="card p-4 border-l-4 border-l-blue-500">
            <div className="text-2xl font-bold text-blue-600">{stats.statusCounts?.SUBMITTED || 0}</div>
            <div className="text-sm text-gray-500">Pending Review</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.statusCounts?.NEEDS_INFO || 0}</div>
            <div className="text-sm text-gray-500">Needs Info</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-green-600">{stats.statusCounts?.APPROVED || 0}</div>
            <div className="text-sm text-gray-500">Approved</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-purple-600">{stats.statusCounts?.SCHEDULED || 0}</div>
            <div className="text-sm text-gray-500">Scheduled</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-emerald-600">{stats.statusCounts?.PAID || 0}</div>
            <div className="text-sm text-gray-500">Paid</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'pending'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Pending Approval ({pendingInvoices.length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'all'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            All Invoices
          </button>
        </nav>
      </div>

      {/* Status Filter for All tab */}
      {activeTab === 'all' && (
        <div className="card p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Filter by Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field max-w-xs"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="NEEDS_INFO">Needs Info</option>
              <option value="APPROVED">Approved</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="PAID">Paid</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
      )}

      {/* Invoice List */}
      <div className="card overflow-hidden">
        {loadingInvoices ? (
          <div className="p-6 text-center text-gray-500">Loading invoices...</div>
        ) : displayInvoices.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {activeTab === 'pending' ? 'No Pending Invoices' : 'No Invoices Found'}
            </h3>
            <p className="text-gray-600">
              {activeTab === 'pending' ? 'All caught up! No invoices require approval.' : 'No invoices match the selected filter.'}
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pharmacy
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vendor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{invoice.invoiceNumber}</div>
                    <div className="text-sm text-gray-500">{invoice.invoiceType.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{invoice.pharmacy.name}</div>
                    <div className="text-xs text-gray-500">{invoice.pharmacy.code}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{invoice.vendor.name}</div>
                    <div className="text-xs text-gray-500">{invoice.vendor.code}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {formatCurrency(invoice.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm ${isOverdue(invoice.dueDate, invoice.status) ? 'text-red-600 font-medium' : 'text-gray-900'}`}>
                      {formatDate(invoice.dueDate)}
                      {isOverdue(invoice.dueDate, invoice.status) && (
                        <span className="ml-2 text-xs text-red-500">OVERDUE</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[invoice.status] || 'bg-gray-100 text-gray-800'}`}>
                      {invoice.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/dashboard/manager/invoices/${invoice.id}`}
                        className="text-primary hover:text-primary-dark"
                      >
                        View
                      </Link>
                      {invoice.status === 'SUBMITTED' && (
                        <>
                          <button
                            onClick={() => handleAction('approve', invoice.id)}
                            disabled={processingAction === `approve-${invoice.id}`}
                            className="text-green-600 hover:text-green-900"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setSelectedInvoice(invoice)}
                            className="text-yellow-600 hover:text-yellow-900"
                          >
                            Review
                          </button>
                        </>
                      )}
                      {invoice.status === 'APPROVED' && (
                        <button
                          onClick={() => handleAction('schedule', invoice.id)}
                          disabled={processingAction === `schedule-${invoice.id}`}
                          className="text-purple-600 hover:text-purple-900"
                        >
                          Schedule
                        </button>
                      )}
                      {invoice.status === 'SCHEDULED' && (
                        <button
                          onClick={() => handleAction('paid', invoice.id)}
                          disabled={processingAction === `paid-${invoice.id}`}
                          className="text-emerald-600 hover:text-emerald-900"
                        >
                          Mark Paid
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Review Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Review Invoice</h2>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-gray-500">Invoice Number</span>
                  <p className="font-medium">{selectedInvoice.invoiceNumber}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Amount</span>
                  <p className="font-medium text-lg">{formatCurrency(selectedInvoice.amount)}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Pharmacy</span>
                  <p className="font-medium">{selectedInvoice.pharmacy.name}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Vendor</span>
                  <p className="font-medium">{selectedInvoice.vendor.name}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Invoice Date</span>
                  <p>{formatDate(selectedInvoice.invoiceDate)}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Due Date</span>
                  <p className={isOverdue(selectedInvoice.dueDate, selectedInvoice.status) ? 'text-red-600 font-medium' : ''}>
                    {formatDate(selectedInvoice.dueDate)}
                    {isOverdue(selectedInvoice.dueDate, selectedInvoice.status) && ' (OVERDUE)'}
                  </p>
                </div>
              </div>

              {selectedInvoice.description && (
                <div>
                  <span className="text-sm text-gray-500">Description</span>
                  <p>{selectedInvoice.description}</p>
                </div>
              )}

              {selectedInvoice.notes && (
                <div>
                  <span className="text-sm text-gray-500">Notes</span>
                  <p className="text-gray-700">{selectedInvoice.notes}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Action Notes
                </label>
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={3}
                  placeholder="Add notes for your decision (required for Needs Info or Reject)"
                  className="input-field"
                />
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50 flex justify-between">
              <button
                onClick={() => {
                  setSelectedInvoice(null);
                  setActionNotes('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => handleAction('reject', selectedInvoice.id)}
                  disabled={processingAction !== null}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleAction('needs-info', selectedInvoice.id)}
                  disabled={processingAction !== null}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50"
                >
                  Needs Info
                </button>
                <button
                  onClick={() => handleAction('approve', selectedInvoice.id)}
                  disabled={processingAction !== null}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
