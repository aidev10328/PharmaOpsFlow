'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
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

type InvoiceFile = {
  id: string;
  originalName: string;
  mimeType: string;
  storagePath: string;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  status: string;
  description?: string;
  pharmacy: Pharmacy;
  vendor: Vendor;
  invoiceType: InvoiceType;
  files: InvoiceFile[];
  createdAt: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-blue-50 text-blue-700',
  NEEDS_INFO: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  SCHEDULED: 'bg-violet-50 text-violet-700',
  PAID: 'bg-green-50 text-green-700',
  REJECTED: 'bg-red-50 text-red-700',
};

const STATUS_DOTS: Record<string, string> = {
  DRAFT: 'bg-slate-400',
  SUBMITTED: 'bg-blue-500',
  NEEDS_INFO: 'bg-amber-500',
  APPROVED: 'bg-emerald-500',
  SCHEDULED: 'bg-violet-500',
  PAID: 'bg-green-500',
  REJECTED: 'bg-red-500',
};

export default function PharmacyInvoicesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<string>('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [stats, setStats] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Fetch pharmacies
  useEffect(() => {
    async function fetchPharmacies() {
      try {
        const res = await apiFetch('/pharmacies');
        if (res.ok) {
          const data = await res.json();
          setPharmacies(data);
          if (data.length > 0) {
            const initialPharmacy = searchParams.get('pharmacyId') || data[0].id;
            setSelectedPharmacyId(initialPharmacy);
          }
        }
      } catch (e) {
        console.error('Failed to fetch pharmacies:', e);
      }
    }
    if (user) {
      fetchPharmacies();
    }
  }, [user, searchParams]);

  // Fetch invoices when pharmacy or filter changes
  const fetchInvoices = useCallback(async (page = 1) => {
    if (!selectedPharmacyId) return;

    setLoadingInvoices(true);
    try {
      let url = `/invoices?pharmacyId=${selectedPharmacyId}&page=${page}&limit=10`;
      if (statusFilter) {
        url += `&status=${statusFilter}`;
      }

      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.data);
        setPagination(data.pagination);
      }
    } catch (e) {
      console.error('Failed to fetch invoices:', e);
    } finally {
      setLoadingInvoices(false);
    }
  }, [selectedPharmacyId, statusFilter]);

  useEffect(() => {
    if (selectedPharmacyId) {
      fetchInvoices();
    }
  }, [selectedPharmacyId, statusFilter, fetchInvoices]);

  // Fetch stats
  useEffect(() => {
    async function fetchStats() {
      if (!selectedPharmacyId) return;
      try {
        const res = await apiFetch(`/invoices/stats?pharmacyId=${selectedPharmacyId}`);
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {
        console.error('Failed to fetch stats:', e);
      }
    }
    if (selectedPharmacyId) {
      fetchStats();
    }
  }, [selectedPharmacyId]);

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

  const handleDeleteDraft = async (invoiceId: string) => {
    if (!confirm('Are you sure you want to delete this draft invoice?')) return;

    setDeletingId(invoiceId);
    try {
      const res = await apiFetch(`/invoices/${invoiceId}`, { method: 'DELETE' });
      if (res.ok) {
        // Refresh the list
        fetchInvoices(pagination?.page || 1);
      } else {
        const errData = await res.json();
        alert(errData.message || 'Failed to delete invoice');
      }
    } catch (err) {
      console.error('Failed to delete invoice:', err);
      alert('Failed to delete invoice');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const selectedPharmacy = pharmacies.find(p => p.id === selectedPharmacyId);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage and track invoices for {selectedPharmacy?.name || 'your pharmacy'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/pharmacy/invoices/upload"
            className="btn-accent gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload Invoice
          </Link>
          <Link
            href={`/dashboard/pharmacy/invoices/new?pharmacyId=${selectedPharmacyId}`}
            className="btn-primary gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Invoice
          </Link>
        </div>
      </div>

      {/* Pharmacy Selector */}
      {pharmacies.length > 1 && (
        <div>
          <select
            value={selectedPharmacyId}
            onChange={(e) => setSelectedPharmacyId(e.target.value)}
            className="input-field max-w-sm"
          >
            {pharmacies.map((pharmacy) => (
              <option key={pharmacy.id} value={pharmacy.id}>
                {pharmacy.code} - {pharmacy.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900 leading-none">{stats.statusCounts?.DRAFT || 0}</div>
              <div className="text-xs text-gray-500 font-medium mt-0.5">Draft</div>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900 leading-none">{stats.statusCounts?.SUBMITTED || 0}</div>
              <div className="text-xs text-gray-500 font-medium mt-0.5">Submitted</div>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900 leading-none">{stats.statusCounts?.APPROVED || 0}</div>
              <div className="text-xs text-gray-500 font-medium mt-0.5">Approved</div>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900 leading-none">{stats.statusCounts?.PAID || 0}</div>
              <div className="text-xs text-gray-500 font-medium mt-0.5">Paid</div>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900 leading-none">{stats.upcomingDue || 0}</div>
              <div className="text-xs text-gray-500 font-medium mt-0.5">Due Soon</div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-gray-500">Filter:</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field max-w-[180px] !py-2"
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
        {statusFilter && (
          <button
            onClick={() => setStatusFilter('')}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Invoice Table */}
      <div className="card overflow-hidden">
        {loadingInvoices ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3 text-gray-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm">Loading invoices...</span>
            </div>
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-gray-300 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">No invoices found</h3>
            <p className="text-sm text-gray-500 mb-4">
              {statusFilter ? 'No invoices match the selected filter.' : 'Get started by creating your first invoice.'}
            </p>
            <Link
              href={`/dashboard/pharmacy/invoices/new?pharmacyId=${selectedPharmacyId}`}
              className="btn-primary text-sm"
            >
              Create Invoice
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Invoice #
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Vendor
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                      Type
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                      Invoice Date
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                      Due Date
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-sm text-gray-900">
                          {invoice.invoiceNumber || <span className="text-gray-400 italic font-normal">Draft</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="text-sm text-gray-900">
                          {invoice.vendor?.name || <span className="text-gray-400 italic">Not set</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <span className="text-sm text-gray-600">
                          {invoice.invoiceType?.name || <span className="text-gray-400 italic">Not set</span>}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <span className="text-sm text-gray-600">
                          {invoice.invoiceDate ? formatDate(invoice.invoiceDate) : <span className="text-gray-400">-</span>}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <div className={`text-sm ${invoice.dueDate && isOverdue(invoice.dueDate, invoice.status) ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                          {invoice.dueDate ? formatDate(invoice.dueDate) : <span className="text-gray-400">-</span>}
                          {invoice.dueDate && isOverdue(invoice.dueDate, invoice.status) && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 uppercase">
                              Overdue
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-sm font-semibold text-gray-900 tabular-nums">
                          {invoice.amount != null ? formatCurrency(invoice.amount) : <span className="text-gray-400 font-normal">-</span>}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[invoice.status] || 'bg-gray-100 text-gray-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[invoice.status] || 'bg-gray-400'}`} />
                          {invoice.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {invoice.files && invoice.files.length > 0 && (
                            <a
                              href={`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'}/invoice-files/${invoice.files[0].id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title={`View ${invoice.files[0].originalName}`}
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                              </svg>
                            </a>
                          )}
                          <Link
                            href={`/dashboard/pharmacy/invoices/${invoice.id}`}
                            className="text-sm font-medium text-primary-600 hover:text-primary-800 px-2 py-1 rounded hover:bg-primary-50 transition-colors"
                          >
                            View
                          </Link>
                          {['DRAFT', 'NEEDS_INFO'].includes(invoice.status) && (
                            <Link
                              href={`/dashboard/pharmacy/invoices/${invoice.id}/edit`}
                              className="text-sm font-medium text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
                            >
                              Edit
                            </Link>
                          )}
                          {invoice.status === 'DRAFT' && (
                            <button
                              onClick={() => handleDeleteDraft(invoice.id)}
                              disabled={deletingId === invoice.id}
                              className="text-sm font-medium text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Delete draft"
                            >
                              {deletingId === invoice.id ? '...' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between bg-slate-50/50">
                <div className="text-xs text-gray-500">
                  Showing <span className="font-medium text-gray-700">{((pagination.page - 1) * pagination.limit) + 1}</span> to <span className="font-medium text-gray-700">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span className="font-medium text-gray-700">{pagination.total}</span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => fetchInvoices(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="btn-secondary !py-1.5 !px-3 text-xs disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => fetchInvoices(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="btn-secondary !py-1.5 !px-3 text-xs disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
