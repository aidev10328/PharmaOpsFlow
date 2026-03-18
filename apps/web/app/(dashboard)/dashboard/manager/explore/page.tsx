'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../lib/api';
import Link from 'next/link';

type Pharmacy = { id: string; name: string; code: string };
type InvoiceType = { id: string; name: string };
type FilterOptions = {
  pharmacies: Pharmacy[];
  invoiceTypes: InvoiceType[];
  statuses: string[];
};

type FilterChip = {
  key: string;
  label: string;
  value: string | boolean;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  amountPaid: string;
  status: string;
  pharmacy: Pharmacy;
  vendor: { id: string; name: string; code: string };
  invoiceType: InvoiceType;
};

type SummaryGroup = {
  groupKey: string;
  groupLabel: string;
  metrics: {
    count: number;
    sumAmount: number;
    sumPaid: number;
    avgAmount: number;
  };
};

type SummaryResult = {
  overall: { count: number; sumAmount: number; sumPaid: number; avgAmount: number };
  groups: SummaryGroup[];
};

type SlaSummaryResult = {
  month: string;
  totals: {
    totalPharmacies: number;
    compliantPharmacies: number;
    submissionMissedTotal: number;
    processingMissedTotal: number;
  };
  pharmacies: {
    pharmacyId: string;
    pharmacyCode: string;
    pharmacyName: string;
    totalInvoices: number;
    submissionMissed: number;
    processingMissed: number;
  }[];
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

export default function ManagerExplorePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Filters
  const [filters, setFilters] = useState({
    pharmacyId: '',
    invoiceTypeId: '',
    statusIn: [] as string[],
    overdueOnly: false,
    needsReview: false,
    month: '',
    vendorNameContains: '',
    dueDateFrom: '',
    dueDateTo: '',
    amountMin: '',
    amountMax: '',
  });

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'summary' | 'sla'>('list');
  const [groupBy, setGroupBy] = useState<string>('');

  // Filter options
  const [options, setOptions] = useState<FilterOptions>({
    pharmacies: [],
    invoiceTypes: [],
    statuses: [],
  });

  // Results
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [slaSummary, setSlaSummary] = useState<SlaSummaryResult | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingData, setLoadingData] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Active filter chips
  const [activeChips, setActiveChips] = useState<FilterChip[]>([]);

  // Auth check
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch filter options
  useEffect(() => {
    async function fetchOptions() {
      try {
        const res = await apiFetch('/explore/options');
        if (res.ok) {
          const data = await res.json();
          setOptions(data);
        }
      } catch (e) {
        console.error('Failed to fetch options:', e);
      }
    }
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      fetchOptions();
    }
  }, [user]);

  // Build filter chips from current filters
  useEffect(() => {
    const chips: FilterChip[] = [];

    if (filters.pharmacyId) {
      const pharmacy = options.pharmacies.find(p => p.id === filters.pharmacyId);
      chips.push({ key: 'pharmacyId', label: 'Pharmacy', value: pharmacy?.name || filters.pharmacyId });
    }
    if (filters.invoiceTypeId) {
      const invType = options.invoiceTypes.find(t => t.id === filters.invoiceTypeId);
      chips.push({ key: 'invoiceTypeId', label: 'Type', value: invType?.name || filters.invoiceTypeId });
    }
    if (filters.statusIn.length > 0) {
      chips.push({ key: 'statusIn', label: 'Status', value: filters.statusIn.join(', ') });
    }
    if (filters.overdueOnly) {
      chips.push({ key: 'overdueOnly', label: 'Overdue', value: true });
    }
    if (filters.needsReview) {
      chips.push({ key: 'needsReview', label: 'Needs Review', value: true });
    }
    if (filters.month) {
      chips.push({ key: 'month', label: 'Month', value: filters.month });
    }
    if (filters.vendorNameContains) {
      chips.push({ key: 'vendorNameContains', label: 'Vendor', value: filters.vendorNameContains });
    }
    if (filters.dueDateFrom || filters.dueDateTo) {
      chips.push({
        key: 'dueDateRange',
        label: 'Due Date',
        value: `${filters.dueDateFrom || '...'} to ${filters.dueDateTo || '...'}`,
      });
    }
    if (filters.amountMin || filters.amountMax) {
      chips.push({
        key: 'amountRange',
        label: 'Amount',
        value: `$${filters.amountMin || '0'} - $${filters.amountMax || '∞'}`,
      });
    }

    setActiveChips(chips);
  }, [filters, options]);

  // Remove a filter chip
  const removeChip = (key: string) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      if (key === 'pharmacyId') newFilters.pharmacyId = '';
      if (key === 'invoiceTypeId') newFilters.invoiceTypeId = '';
      if (key === 'statusIn') newFilters.statusIn = [];
      if (key === 'overdueOnly') newFilters.overdueOnly = false;
      if (key === 'needsReview') newFilters.needsReview = false;
      if (key === 'month') newFilters.month = '';
      if (key === 'vendorNameContains') newFilters.vendorNameContains = '';
      if (key === 'dueDateRange') {
        newFilters.dueDateFrom = '';
        newFilters.dueDateTo = '';
      }
      if (key === 'amountRange') {
        newFilters.amountMin = '';
        newFilters.amountMax = '';
      }
      return newFilters;
    });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setFilters({
      pharmacyId: '',
      invoiceTypeId: '',
      statusIn: [],
      overdueOnly: false,
      needsReview: false,
      month: '',
      vendorNameContains: '',
      dueDateFrom: '',
      dueDateTo: '',
      amountMin: '',
      amountMax: '',
    });
  };

  // Fetch data based on view mode
  const fetchData = useCallback(async () => {
    setLoadingData(true);
    try {
      const params = new URLSearchParams();

      if (filters.pharmacyId) params.append('pharmacyId', filters.pharmacyId);
      if (filters.invoiceTypeId) params.append('invoiceTypeId', filters.invoiceTypeId);
      if (filters.statusIn.length > 0) params.append('statusIn', filters.statusIn.join(','));
      if (filters.overdueOnly) params.append('overdueOnly', 'true');
      if (filters.needsReview) params.append('needsReview', 'true');
      if (filters.month) params.append('month', filters.month);
      if (filters.vendorNameContains) params.append('vendorNameContains', filters.vendorNameContains);
      if (filters.dueDateFrom) params.append('dueDateFrom', filters.dueDateFrom);
      if (filters.dueDateTo) params.append('dueDateTo', filters.dueDateTo);
      if (filters.amountMin) params.append('amountMin', filters.amountMin);
      if (filters.amountMax) params.append('amountMax', filters.amountMax);

      if (viewMode === 'list') {
        params.append('page', String(page));
        params.append('limit', String(limit));
        const res = await apiFetch(`/explore/invoices?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setInvoices(data.rows || []);
          setTotalCount(data.totalCount || 0);
        }
      } else if (viewMode === 'summary') {
        if (groupBy) params.append('groupBy', groupBy);
        const res = await apiFetch(`/explore/summary?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setSummary(data);
        }
      } else if (viewMode === 'sla') {
        const month = filters.month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const res = await apiFetch(`/explore/sla?month=${month}`);
        if (res.ok) {
          const data = await res.json();
          setSlaSummary(data);
        }
      }
    } catch (e) {
      console.error('Failed to fetch data:', e);
    } finally {
      setLoadingData(false);
    }
  }, [filters, viewMode, groupBy, page, limit]);

  // Fetch data on filter or view change
  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      fetchData();
    }
  }, [user, fetchData]);

  // Format helpers
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

  const isOverdue = (dueDate: string, status: string) => {
    if (['PAID', 'REJECTED'].includes(status)) return false;
    return new Date(dueDate) < new Date();
  };

  // Toggle status filter
  const toggleStatus = (status: string) => {
    setFilters(prev => ({
      ...prev,
      statusIn: prev.statusIn.includes(status)
        ? prev.statusIn.filter(s => s !== status)
        : [...prev.statusIn, status],
    }));
  };

  if (loading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!user || !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Invoice Explorer</h1>
          <p className="text-gray-600 mt-1">
            Filter and analyze invoices across your organization
          </p>
        </div>
        <Link href="/dashboard/manager/chat" className="btn-primary">
          Try AI Assistant
        </Link>
      </div>

      {/* View Mode Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setViewMode('list')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              viewMode === 'list'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Invoice List
          </button>
          <button
            onClick={() => setViewMode('summary')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              viewMode === 'summary'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setViewMode('sla')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              viewMode === 'sla'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            SLA Compliance
          </button>
        </nav>
      </div>

      {/* Filters Panel */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {/* Pharmacy */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pharmacy</label>
            <select
              value={filters.pharmacyId}
              onChange={(e) => setFilters(prev => ({ ...prev, pharmacyId: e.target.value }))}
              className="input-field text-sm"
            >
              <option value="">All Pharmacies</option>
              {options.pharmacies.map(p => (
                <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
              ))}
            </select>
          </div>

          {/* Invoice Type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Type</label>
            <select
              value={filters.invoiceTypeId}
              onChange={(e) => setFilters(prev => ({ ...prev, invoiceTypeId: e.target.value }))}
              className="input-field text-sm"
            >
              <option value="">All Types</option>
              {options.invoiceTypes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Month */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
            <input
              type="month"
              value={filters.month}
              onChange={(e) => setFilters(prev => ({ ...prev, month: e.target.value }))}
              className="input-field text-sm"
            />
          </div>

          {/* Vendor Search */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vendor</label>
            <input
              type="text"
              placeholder="Search vendor..."
              value={filters.vendorNameContains}
              onChange={(e) => setFilters(prev => ({ ...prev, vendorNameContains: e.target.value }))}
              className="input-field text-sm"
            />
          </div>

          {/* Amount Range */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount Min</label>
            <input
              type="number"
              placeholder="Min $"
              value={filters.amountMin}
              onChange={(e) => setFilters(prev => ({ ...prev, amountMin: e.target.value }))}
              className="input-field text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount Max</label>
            <input
              type="number"
              placeholder="Max $"
              value={filters.amountMax}
              onChange={(e) => setFilters(prev => ({ ...prev, amountMax: e.target.value }))}
              className="input-field text-sm"
            />
          </div>
        </div>

        {/* Status Toggle Buttons */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-gray-700 mb-2">Status</label>
          <div className="flex flex-wrap gap-2">
            {['DRAFT', 'SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'SCHEDULED', 'PAID', 'REJECTED'].map(status => (
              <button
                key={status}
                onClick={() => toggleStatus(status)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  filters.statusIn.includes(status)
                    ? STATUS_COLORS[status]
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Filters */}
        <div className="mt-4 flex flex-wrap gap-4">
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={filters.overdueOnly}
              onChange={(e) => setFilters(prev => ({ ...prev, overdueOnly: e.target.checked }))}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="ml-2 text-sm text-gray-700">Overdue Only</span>
          </label>
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={filters.needsReview}
              onChange={(e) => setFilters(prev => ({ ...prev, needsReview: e.target.checked }))}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="ml-2 text-sm text-gray-700">Needs Review</span>
          </label>

          {/* Group By (for summary view) */}
          {viewMode === 'summary' && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">Group by:</label>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                className="input-field text-sm max-w-xs"
              >
                <option value="">No grouping</option>
                <option value="pharmacy">Pharmacy</option>
                <option value="invoiceType">Invoice Type</option>
                <option value="status">Status</option>
                <option value="vendor">Vendor</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Active Filter Chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm text-gray-500">Active filters:</span>
          {activeChips.map(chip => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
            >
              <span className="font-medium">{chip.label}:</span> {String(chip.value)}
              <button
                onClick={() => removeChip(chip.key)}
                className="ml-1 hover:text-primary-dark"
              >
                ×
              </button>
            </span>
          ))}
          <button
            onClick={clearAllFilters}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Results */}
      {loadingData ? (
        <div className="card p-8 text-center text-gray-500">Loading...</div>
      ) : viewMode === 'list' ? (
        <>
          {/* Invoice List View */}
          <div className="card overflow-hidden">
            {invoices.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-500">No invoices match your filters</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100 border-b-2 border-gray-300">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase text-[11px]">Invoice</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase text-[11px]">Pharmacy</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase text-[11px]">Vendor</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase text-[11px]">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase text-[11px]">Due Date</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase text-[11px]">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase text-[11px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoices.map(invoice => (
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
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[invoice.status]}`}>
                          {invoice.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <Link
                          href={`/dashboard/manager/invoices/${invoice.id}`}
                          className="text-primary hover:text-primary-dark"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalCount > limit && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-500">
                Showing {((page - 1) * limit) + 1} - {Math.min(page * limit, totalCount)} of {totalCount}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * limit >= totalCount}
                  className="btn-secondary disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : viewMode === 'summary' ? (
        <>
          {/* Summary View */}
          {summary && (
            <div className="space-y-6">
              {/* Overall Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card p-4">
                  <div className="text-2xl font-bold text-gray-900">{summary.overall.count}</div>
                  <div className="text-sm text-gray-500">Total Invoices</div>
                </div>
                <div className="card p-4">
                  <div className="text-2xl font-bold text-primary">{formatCurrency(summary.overall.sumAmount)}</div>
                  <div className="text-sm text-gray-500">Total Amount</div>
                </div>
                <div className="card p-4">
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(summary.overall.sumPaid)}</div>
                  <div className="text-sm text-gray-500">Total Paid</div>
                </div>
                <div className="card p-4">
                  <div className="text-2xl font-bold text-accent">{formatCurrency(summary.overall.avgAmount)}</div>
                  <div className="text-sm text-gray-500">Avg Amount</div>
                </div>
              </div>

              {/* Grouped Data */}
              {summary.groups.length > 0 && (
                <div className="card overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100 border-b-2 border-gray-300">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase text-[11px]">
                          {groupBy || 'Group'}
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase text-[11px]">Count</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase text-[11px]">Total</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase text-[11px]">Paid</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase text-[11px]">Average</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {summary.groups.map(group => (
                        <tr key={group.groupKey} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                            {group.groupLabel}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                            {group.metrics.count}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                            {formatCurrency(group.metrics.sumAmount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-600">
                            {formatCurrency(group.metrics.sumPaid)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                            {formatCurrency(group.metrics.avgAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* SLA View */}
          {slaSummary && (
            <div className="space-y-6">
              {/* SLA Overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card p-4">
                  <div className="text-2xl font-bold text-gray-900">{slaSummary.month}</div>
                  <div className="text-sm text-gray-500">Period</div>
                </div>
                <div className="card p-4">
                  <div className="text-2xl font-bold text-green-600">
                    {slaSummary.totals.compliantPharmacies}/{slaSummary.totals.totalPharmacies}
                  </div>
                  <div className="text-sm text-gray-500">Compliant Pharmacies</div>
                </div>
                <div className="card p-4">
                  <div className="text-2xl font-bold text-red-600">{slaSummary.totals.submissionMissedTotal}</div>
                  <div className="text-sm text-gray-500">Submission Misses</div>
                </div>
                <div className="card p-4">
                  <div className="text-2xl font-bold text-orange-600">{slaSummary.totals.processingMissedTotal}</div>
                  <div className="text-sm text-gray-500">Processing Misses</div>
                </div>
              </div>

              {/* Pharmacy Breakdown */}
              <div className="card overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100 border-b-2 border-gray-300">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase text-[11px]">Pharmacy</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase text-[11px]">Invoices</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase text-[11px]">Submission Missed</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase text-[11px]">Processing Missed</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase text-[11px]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {slaSummary.pharmacies.map(pharmacy => {
                      const isCompliant = pharmacy.submissionMissed === 0 && pharmacy.processingMissed === 0;
                      return (
                        <tr key={pharmacy.pharmacyId} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium text-gray-900">{pharmacy.pharmacyName}</div>
                            <div className="text-sm text-gray-500">{pharmacy.pharmacyCode}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                            {pharmacy.totalInvoices}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                            <span className={pharmacy.submissionMissed > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}>
                              {pharmacy.submissionMissed}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                            <span className={pharmacy.processingMissed > 0 ? 'text-orange-600 font-medium' : 'text-gray-500'}>
                              {pharmacy.processingMissed}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              isCompliant ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {isCompliant ? 'Compliant' : 'Non-Compliant'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
