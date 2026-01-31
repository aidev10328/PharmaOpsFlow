'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-50 text-blue-700',
  NEEDS_INFO: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  SCHEDULED: 'bg-purple-50 text-purple-700',
  PAID: 'bg-green-50 text-green-800',
  REJECTED: 'bg-red-50 text-red-700',
};

type Pharmacy = { id: string; name: string; code: string };
type InvoiceTypeOpt = { id: string; name: string };
type VendorOpt = { id: string; name: string };

export default function InvoiceOversightPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [invoices, setInvoices] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter options
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [invoiceTypes, setInvoiceTypes] = useState<InvoiceTypeOpt[]>([]);
  const [vendors, setVendors] = useState<VendorOpt[]>([]);

  // Filter state
  const [pharmacyFilter, setPharmacyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [overdueFilter, setOverdueFilter] = useState(false);
  const [needsReviewFilter, setNeedsReviewFilter] = useState(false);
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      Promise.all([
        apiFetch('/v1/admin/pharmacies').then(r => r.ok ? r.json() : []),
        apiFetch('/v1/admin/invoice-types').then(r => r.ok ? r.json() : []),
        apiFetch('/v1/admin/vendors').then(r => r.ok ? r.json() : []),
      ]).then(([ps, ts, vs]) => {
        setPharmacies(ps.map((p: any) => ({ id: p.id, name: p.name, code: p.code })));
        setInvoiceTypes(ts.map((t: any) => ({ id: t.id, name: t.name })));
        setVendors(vs.map((v: any) => ({ id: v.id, name: v.name })));
      });
    }
  }, [user]);

  const fetchInvoices = useCallback(async (p: number) => {
    setLoadingData(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('limit', '20');
      if (pharmacyFilter) params.set('pharmacyId', pharmacyFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (overdueFilter) params.set('overdueOnly', 'true');
      if (needsReviewFilter) params.set('needsReview', 'true');
      if (invoiceTypeFilter) params.set('invoiceTypeId', invoiceTypeFilter);
      if (vendorFilter) params.set('vendorId', vendorFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await apiFetch(`/v1/admin/oversight/invoices?${params}`);
      if (!res.ok) throw new Error('Failed to fetch invoices');
      const data = await res.json();
      setInvoices(data.rows || []);
      setTotalCount(data.totalCount || 0);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
    } catch (e: any) { setError(e.message); }
    finally { setLoadingData(false); }
  }, [pharmacyFilter, statusFilter, overdueFilter, needsReviewFilter, invoiceTypeFilter, vendorFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (user?.role === 'ADMIN') fetchInvoices(1);
  }, [user, fetchInvoices]);

  const handleSearch = () => { setPage(1); fetchInvoices(1); };
  const handleClear = () => {
    setPharmacyFilter(''); setStatusFilter(''); setOverdueFilter(false);
    setNeedsReviewFilter(false); setInvoiceTypeFilter(''); setVendorFilter('');
    setDateFrom(''); setDateTo('');
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

  if (!user || user.role !== 'ADMIN') return null;

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin/oversight" className="text-link text-sm">&larr; Back to Oversight</Link>
      </div>

      <div>
        <h1 className="page-title">Invoice Oversight</h1>
        <p className="text-sm text-gray-500 mt-1">All invoices across all pharmacies &mdash; {totalCount} total</p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select value={pharmacyFilter} onChange={e => setPharmacyFilter(e.target.value)} className="input-field text-sm">
            <option value="">All Pharmacies</option>
            {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field text-sm">
            <option value="">All Statuses</option>
            {['DRAFT', 'SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'SCHEDULED', 'PAID', 'REJECTED'].map(s =>
              <option key={s} value={s}>{s}</option>
            )}
          </select>
          <select value={invoiceTypeFilter} onChange={e => setInvoiceTypeFilter(e.target.value)} className="input-field text-sm">
            <option value="">All Types</option>
            {invoiceTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} className="input-field text-sm">
            <option value="">All Vendors</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field text-sm" placeholder="Due from" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field text-sm" placeholder="Due to" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={overdueFilter} onChange={e => setOverdueFilter(e.target.checked)} className="rounded border-gray-300 text-primary-600" />
            <span className="text-sm text-gray-700">Overdue only</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={needsReviewFilter} onChange={e => setNeedsReviewFilter(e.target.checked)} className="rounded border-gray-300 text-primary-600" />
            <span className="text-sm text-gray-700">Needs review</span>
          </label>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleSearch} className="btn-primary text-sm">Apply Filters</button>
          <button onClick={handleClear} className="text-sm px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-100">Clear</button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pharmacy</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Due Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Review</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loadingData ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">Loading...</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">No invoices match the filters.</td></tr>
              ) : invoices.map((inv: any) => (
                <tr
                  key={inv.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/dashboard/admin/oversight/invoices/${inv.id}`)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-primary-600">
                    {inv.invoiceNumber || inv.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {inv.pharmacy?.name || '-'}
                    <span className="text-xs text-gray-400 ml-1">({inv.pharmacy?.code})</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{inv.vendor?.name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">{inv.invoiceType?.name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {inv.amount != null ? `$${Number(inv.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td className={`px-4 py-3 text-sm hidden md:table-cell ${isOverdue(inv.dueDate) && inv.status !== 'PAID' && inv.status !== 'REJECTED' ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-700'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm hidden lg:table-cell">
                    {inv.needsReview && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">Review</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages} ({totalCount} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchInvoices(page - 1)}
                disabled={page <= 1}
                className="text-sm px-3 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => fetchInvoices(page + 1)}
                disabled={page >= totalPages}
                className="text-sm px-3 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
