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
  createdAt: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
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

  if (loading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!user) {
    return null;
  }

  const selectedPharmacy = pharmacies.find(p => p.id === selectedPharmacyId);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="text-gray-600 mt-1">
            Manage and track invoices for {selectedPharmacy?.name || 'your pharmacy'}
          </p>
        </div>
        <Link
          href={`/dashboard/pharmacy/invoices/new?pharmacyId=${selectedPharmacyId}`}
          className="btn-primary"
        >
          + New Invoice
        </Link>
      </div>

      {/* Pharmacy Selector */}
      {pharmacies.length > 1 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Pharmacy
          </label>
          <select
            value={selectedPharmacyId}
            onChange={(e) => setSelectedPharmacyId(e.target.value)}
            className="input-field max-w-md"
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="card p-4">
            <div className="text-2xl font-bold text-gray-600">{stats.statusCounts?.DRAFT || 0}</div>
            <div className="text-sm text-gray-500">Draft</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.statusCounts?.SUBMITTED || 0}</div>
            <div className="text-sm text-gray-500">Submitted</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-green-600">{stats.statusCounts?.APPROVED || 0}</div>
            <div className="text-sm text-gray-500">Approved</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-emerald-600">{stats.statusCounts?.PAID || 0}</div>
            <div className="text-sm text-gray-500">Paid</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-orange-600">{stats.upcomingDue || 0}</div>
            <div className="text-sm text-gray-500">Due Soon</div>
          </div>
        </div>
      )}

      {/* Filters */}
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

      {/* Invoice List */}
      <div className="card overflow-hidden">
        {loadingInvoices ? (
          <div className="p-6 text-center text-gray-500">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Invoices Found</h3>
            <p className="text-gray-600 mb-4">
              {statusFilter ? 'No invoices match the selected filter.' : 'Get started by creating your first invoice.'}
            </p>
            <Link
              href={`/dashboard/pharmacy/invoices/new?pharmacyId=${selectedPharmacyId}`}
              className="btn-primary"
            >
              Create Invoice
            </Link>
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vendor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
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
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{invoice.invoiceNumber}</div>
                      <div className="text-sm text-gray-500">{formatDate(invoice.invoiceDate)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{invoice.vendor.name}</div>
                      <div className="text-xs text-gray-500">{invoice.vendor.code}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invoice.invoiceType.name}
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
                      <Link
                        href={`/dashboard/pharmacy/invoices/${invoice.id}`}
                        className="text-primary hover:text-primary-dark mr-3"
                      >
                        View
                      </Link>
                      {['DRAFT', 'NEEDS_INFO'].includes(invoice.status) && (
                        <Link
                          href={`/dashboard/pharmacy/invoices/${invoice.id}/edit`}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Edit
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} invoices
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchInvoices(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="btn-secondary text-sm disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => fetchInvoices(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="btn-secondary text-sm disabled:opacity-50"
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
