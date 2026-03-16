'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import dynamic from 'next/dynamic';

const InvoiceCalendarView = dynamic(() => import('../../../../../../components/invoice/InvoiceCalendarView'), { ssr: false });

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

type SortConfig = {
  field: string;
  direction: 'asc' | 'desc';
};

function SortableHeader({
  label,
  field,
  sortConfig,
  onSort,
  className = ''
}: {
  label: string;
  field: string;
  sortConfig: SortConfig;
  onSort: (field: string) => void;
  className?: string;
}) {
  const isActive = sortConfig.field === field;
  return (
    <th
      className={`px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px] cursor-pointer hover:bg-gray-200 select-none ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${isActive ? 'text-primary-600' : 'text-gray-300'}`}>
          {isActive ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '▼'}
        </span>
      </div>
    </th>
  );
}

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

  // Sorting state
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'dueDate', direction: 'desc' });

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const currentMonthStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };
  const [calendarMonth, setCalendarMonth] = useState(currentMonthStr());

  const formatCurrencyFn = (amount: string | number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount));

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
      params.set('limit', viewMode === 'calendar' ? '200' : '10');
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
  }, [pharmacyFilter, statusFilter, overdueFilter, needsReviewFilter, invoiceTypeFilter, vendorFilter, dateFrom, dateTo, viewMode]);

  useEffect(() => {
    if (user?.role === 'ADMIN') fetchInvoices(1);
  }, [user, fetchInvoices]);

  const handleSearch = () => { setPage(1); fetchInvoices(1); };
  const handleClear = () => {
    setPharmacyFilter(''); setStatusFilter(''); setOverdueFilter(false);
    setNeedsReviewFilter(false); setInvoiceTypeFilter(''); setVendorFilter('');
    setDateFrom(''); setDateTo('');
  };

  const handleSort = (field: string) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Sort invoices client-side
  const sortedInvoices = useMemo(() => {
    const data = [...invoices];
    data.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (sortConfig.field) {
        case 'invoiceNumber':
          aVal = a.invoiceNumber || '';
          bVal = b.invoiceNumber || '';
          break;
        case 'pharmacy':
          aVal = a.pharmacy?.name || '';
          bVal = b.pharmacy?.name || '';
          break;
        case 'vendor':
          aVal = a.vendor?.name || '';
          bVal = b.vendor?.name || '';
          break;
        case 'invoiceType':
          aVal = a.invoiceType?.name || '';
          bVal = b.invoiceType?.name || '';
          break;
        case 'amount':
          aVal = Number(a.amount) || 0;
          bVal = Number(b.amount) || 0;
          break;
        case 'dueDate':
          aVal = a.dueDate ? new Date(a.dueDate).getTime() : 0;
          bVal = b.dueDate ? new Date(b.dueDate).getTime() : 0;
          break;
        case 'status':
          aVal = a.status || '';
          bVal = b.status || '';
          break;
        default:
          aVal = a[sortConfig.field];
          bVal = b[sortConfig.field];
      }
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [invoices, sortConfig]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2 text-gray-400">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading...</span>
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
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-heading font-bold text-gray-900">Invoice Oversight</h1>
        <p className="text-xs text-gray-500">All invoices across all pharmacies — {totalCount} total</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}

      {/* Filters */}
      <div className="card p-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select value={pharmacyFilter} onChange={e => setPharmacyFilter(e.target.value)} className="input-field text-xs py-1.5">
            <option value="">All Pharmacies</option>
            {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field text-xs py-1.5">
            <option value="">All Statuses</option>
            {['DRAFT', 'SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'SCHEDULED', 'PAID', 'REJECTED'].map(s =>
              <option key={s} value={s}>{s}</option>
            )}
          </select>
          <select value={invoiceTypeFilter} onChange={e => setInvoiceTypeFilter(e.target.value)} className="input-field text-xs py-1.5">
            <option value="">All Types</option>
            {invoiceTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} className="input-field text-xs py-1.5">
            <option value="">All Vendors</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field text-xs py-1.5" placeholder="Due from" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field text-xs py-1.5" placeholder="Due to" />
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={overdueFilter} onChange={e => setOverdueFilter(e.target.checked)} className="rounded border-gray-300 text-primary-600" />
            <span className="text-xs text-gray-700">Overdue only</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={needsReviewFilter} onChange={e => setNeedsReviewFilter(e.target.checked)} className="rounded border-gray-300 text-primary-600" />
            <span className="text-xs text-gray-700">Needs review</span>
          </label>
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={handleSearch} className="btn-primary text-xs px-3 py-1.5">Apply</button>
          <button onClick={handleClear} className="text-xs px-3 py-1.5 rounded text-gray-600 hover:bg-gray-100">Clear</button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-3">
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            List
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'calendar' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Calendar
          </button>
        </div>
        {viewMode === 'calendar' && (
          <input
            type="month"
            value={calendarMonth}
            onChange={e => setCalendarMonth(e.target.value)}
            className="input-field text-xs py-1.5 px-3"
          />
        )}
      </div>

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <InvoiceCalendarView
          invoices={sortedInvoices}
          monthFilter={calendarMonth}
          isManager={true}
          formatCurrency={formatCurrencyFn}
          basePath="/dashboard/admin/oversight/invoices"
          onMonthChange={setCalendarMonth}
        />
      )}

      {/* Table */}
      {viewMode === 'list' && <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <SortableHeader label="Invoice #" field="invoiceNumber" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Pharmacy" field="pharmacy" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Vendor" field="vendor" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell" />
                <SortableHeader label="Type" field="invoiceType" sortConfig={sortConfig} onSort={handleSort} className="hidden lg:table-cell" />
                <SortableHeader label="Amount" field="amount" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Due" field="dueDate" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell" />
                <SortableHeader label="Status" field="status" sortConfig={sortConfig} onSort={handleSort} />
                <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px] hidden lg:table-cell">Review</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loadingData ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Loading...</td></tr>
              ) : sortedInvoices.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No invoices match the filters.</td></tr>
              ) : sortedInvoices.map((inv: any) => (
                <tr
                  key={inv.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/dashboard/admin/oversight/invoices/${inv.id}`)}
                >
                  <td className="px-3 py-2 font-medium text-primary-600">
                    {inv.invoiceNumber || inv.id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 text-gray-900">
                    {inv.pharmacy?.name || '-'}
                    <span className="text-[10px] text-gray-400 ml-1">({inv.pharmacy?.code})</span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 hidden md:table-cell">{inv.vendor?.name || '-'}</td>
                  <td className="px-3 py-2 text-gray-500 hidden lg:table-cell">{inv.invoiceType?.name || '-'}</td>
                  <td className="px-3 py-2 text-gray-900">
                    {inv.amount != null ? `$${Number(inv.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td className={`px-3 py-2 hidden md:table-cell ${isOverdue(inv.dueDate) && inv.status !== 'PAID' && inv.status !== 'REJECTED' ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-700'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {inv.needsReview && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">Review</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-3 py-2 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages} ({totalCount} total)
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => fetchInvoices(page - 1)}
                disabled={page <= 1}
                className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <button
                onClick={() => fetchInvoices(page + 1)}
                disabled={page >= totalPages}
                className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}
