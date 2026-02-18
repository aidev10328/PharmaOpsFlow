'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
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
  accountNumber?: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  status: string;
  entryMethod: 'MANUAL' | 'AI_EXTRACTION';
  description?: string;
  pharmacy: Pharmacy;
  vendor: Vendor;
  invoiceType: InvoiceType;
  files: InvoiceFile[];
  createdAt: string;
  requirementInstances?: {
    id: string;
    requirement: {
      id: string;
      name: string;
    };
    periodLabel: string;
  }[];
};

type RequirementInstance = {
  id: string;
  requirementId: string;
  requirement: {
    id: string;
    name: string;
    pharmacy: { id: string; name: string; code: string };
    vendor: { id: string; name: string } | null;
    invoiceType: { id: string; name: string } | null;
  };
  invoiceId: string | null;
  periodLabel: string;
  submissionDeadline: string;
  status: 'PENDING' | 'SUBMITTED' | 'PROCESSED' | 'OVERDUE' | 'MISSED';
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type SortConfig = {
  field: string;
  direction: 'asc' | 'desc';
};

const STATUS_COLORS: Record<string, string> = {
  PENDING_UPLOAD: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-blue-50 text-blue-700',
  NEEDS_INFO: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  SCHEDULED: 'bg-violet-50 text-violet-700',
  PAID: 'bg-green-50 text-green-700',
  REJECTED: 'bg-red-50 text-red-700',
  OVERDUE: 'bg-orange-50 text-orange-700 border-orange-200',
};

const STATUS_DOTS: Record<string, string> = {
  PENDING_UPLOAD: 'bg-yellow-500',
  DRAFT: 'bg-slate-400',
  SUBMITTED: 'bg-blue-500',
  NEEDS_INFO: 'bg-amber-500',
  APPROVED: 'bg-emerald-500',
  SCHEDULED: 'bg-violet-500',
  PAID: 'bg-green-500',
  REJECTED: 'bg-red-500',
  OVERDUE: 'bg-orange-500',
};

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const getDaysUntil = (deadline: string) => {
  const now = new Date();
  const due = new Date(deadline);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

function SortableHeader({
  label,
  field,
  sortConfig,
  onSort,
  className = '',
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
      className={`px-2 py-2 font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none ${className}`}
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

export default function PharmacyInvoicesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<string>('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pendingInstances, setPendingInstances] = useState<RequirementInstance[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [monthFilter, setMonthFilter] = useState<string>(getCurrentMonth());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // Sorting state
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'dueDate', direction: 'asc' });

  // Stats for current month
  const [stats, setStats] = useState({
    pendingUpload: 0,
    overdue: 0,
    draft: 0,
    submitted: 0,
    approved: 0,
    paid: 0,
    total: 0,
  });

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

  // Fetch data when pharmacy or filters change
  const fetchData = useCallback(async (page = 1) => {
    if (!selectedPharmacyId) return;

    setLoadingData(true);
    try {
      // Fetch pending requirement instances for the month
      const instancesRes = await apiFetch(
        `/v1/requirements/pharmacy/${selectedPharmacyId}/instances?yearMonth=${monthFilter}`
      );
      let instances: RequirementInstance[] = [];
      if (instancesRes.ok) {
        instances = await instancesRes.json();
        // Filter to only show pending/overdue instances (not yet filled)
        const pending = instances.filter(
          (i) => ['PENDING', 'OVERDUE'].includes(i.status) && !i.invoiceId
        );
        setPendingInstances(pending);
      }

      // Build invoice query with month filter
      const [year, month] = monthFilter.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const monthEnd = new Date(year, month, 0).toISOString().split('T')[0];

      let url = `/invoices?pharmacyId=${selectedPharmacyId}&page=${page}&limit=10`;
      url += `&invoiceDateFrom=${monthStart}&invoiceDateTo=${monthEnd}`;
      if (statusFilter && statusFilter !== 'PENDING_UPLOAD' && statusFilter !== 'OVERDUE_INSTANCE') {
        url += `&status=${statusFilter}`;
      }

      const invoicesRes = await apiFetch(url);
      let monthInvoices: Invoice[] = [];
      if (invoicesRes.ok) {
        const data = await invoicesRes.json();
        monthInvoices = data.data || [];
        setPagination(data.pagination);
      }
      setInvoices(monthInvoices);

      // Calculate stats for the selected month only
      const pendingUploadCount = instances.filter(
        (i) => i.status === 'PENDING' && !i.invoiceId
      ).length;
      const overdueCount = instances.filter(
        (i) => i.status === 'OVERDUE' && !i.invoiceId
      ).length;

      // Get invoice stats for the selected month
      const statsRes = await apiFetch(
        `/invoices/stats?pharmacyId=${selectedPharmacyId}&month=${monthFilter}`
      );
      let invoiceStats: any = {};
      if (statsRes.ok) {
        invoiceStats = await statsRes.json();
      }

      const draftCount = invoiceStats.statusCounts?.DRAFT || 0;

      setStats({
        pendingUpload: pendingUploadCount,
        overdue: overdueCount,
        draft: draftCount,
        submitted: invoiceStats.statusCounts?.SUBMITTED || 0,
        approved: (invoiceStats.statusCounts?.APPROVED || 0) + (invoiceStats.statusCounts?.SCHEDULED || 0),
        paid: invoiceStats.statusCounts?.PAID || 0,
        total: pendingUploadCount + overdueCount + Object.values(invoiceStats.statusCounts || {}).reduce((a: number, b: any) => a + (b || 0), 0),
      });
    } catch (e) {
      console.error('Failed to fetch data:', e);
    } finally {
      setLoadingData(false);
    }
  }, [selectedPharmacyId, monthFilter, statusFilter]);

  useEffect(() => {
    if (selectedPharmacyId) {
      fetchData();
    }
  }, [selectedPharmacyId, monthFilter, statusFilter, fetchData]);

  const handleSort = (field: string) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

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
        fetchData(pagination?.page || 1);
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

  const handleSubmitDraft = async (invoiceId: string) => {
    setSubmittingId(invoiceId);
    try {
      const res = await apiFetch(`/invoices/${invoiceId}/submit`, { method: 'POST' });
      if (res.ok) {
        fetchData(pagination?.page || 1);
      } else {
        const errData = await res.json();
        alert(errData.message || 'Failed to submit invoice');
      }
    } catch (err) {
      console.error('Failed to submit invoice:', err);
      alert('Failed to submit invoice');
    } finally {
      setSubmittingId(null);
    }
  };

  // Sort invoices
  const sortedInvoices = useMemo(() => {
    return [...invoices].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortConfig.field) {
        case 'invoiceNumber':
          aVal = a.invoiceNumber || '';
          bVal = b.invoiceNumber || '';
          break;
        case 'accountNumber':
          aVal = a.accountNumber || '';
          bVal = b.accountNumber || '';
          break;
        case 'vendor':
          aVal = a.vendor?.name || '';
          bVal = b.vendor?.name || '';
          break;
        case 'invoiceDate':
          aVal = new Date(a.invoiceDate).getTime();
          bVal = new Date(b.invoiceDate).getTime();
          break;
        case 'dueDate':
          aVal = new Date(a.dueDate).getTime();
          bVal = new Date(b.dueDate).getTime();
          break;
        case 'amount':
          aVal = Number(a.amount) || 0;
          bVal = Number(b.amount) || 0;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          aVal = a.invoiceNumber || '';
          bVal = b.invoiceNumber || '';
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [invoices, sortConfig]);

  // Sort pending instances
  const sortedPendingInstances = useMemo(() => {
    return [...pendingInstances].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortConfig.field) {
        case 'vendor':
          aVal = a.requirement.vendor?.name || '';
          bVal = b.requirement.vendor?.name || '';
          break;
        case 'dueDate':
          aVal = new Date(a.submissionDeadline).getTime();
          bVal = new Date(b.submissionDeadline).getTime();
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          aVal = a.requirement.name || '';
          bVal = b.requirement.name || '';
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [pendingInstances, sortConfig]);

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

  // Filter display based on status filter
  const filteredPendingInstances = statusFilter === 'PENDING_UPLOAD'
    ? sortedPendingInstances.filter(i => i.status === 'PENDING')
    : statusFilter === 'OVERDUE_INSTANCE'
      ? sortedPendingInstances.filter(i => i.status === 'OVERDUE')
      : statusFilter === ''
        ? sortedPendingInstances
        : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage invoices for {selectedPharmacy?.name || 'your pharmacy'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/pharmacy/invoices/upload?pharmacyId=${selectedPharmacyId}`}
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
            Manual Entry
          </Link>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        {pharmacies.length > 1 && (
          <select
            value={selectedPharmacyId}
            onChange={(e) => setSelectedPharmacyId(e.target.value)}
            className="input-field max-w-[200px] !py-2"
          >
            {pharmacies.map((pharmacy) => (
              <option key={pharmacy.id} value={pharmacy.id}>
                {pharmacy.code} - {pharmacy.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Month:</span>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="input-field !py-2 !w-auto"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <button
          onClick={() => setStatusFilter('')}
          className={`card p-3 text-left transition-all ${!statusFilter ? 'ring-2 ring-primary-500 bg-primary-50' : 'hover:bg-gray-50'}`}
        >
          <div className="text-xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total</div>
        </button>
        <button
          onClick={() => setStatusFilter('PENDING_UPLOAD')}
          className={`card p-3 text-left transition-all border-yellow-200 ${statusFilter === 'PENDING_UPLOAD' ? 'ring-2 ring-yellow-500 bg-yellow-50' : (stats.pendingUpload > 0 ? 'bg-yellow-50' : 'hover:bg-gray-50')}`}
        >
          <div className="text-xl font-bold text-yellow-600">{stats.pendingUpload}</div>
          <div className="text-xs text-yellow-700 mt-0.5">Pending Upload</div>
        </button>
        <button
          onClick={() => setStatusFilter('OVERDUE_INSTANCE')}
          className={`card p-3 text-left transition-all border-orange-200 ${statusFilter === 'OVERDUE_INSTANCE' ? 'ring-2 ring-orange-500 bg-orange-50' : (stats.overdue > 0 ? 'bg-orange-50' : 'hover:bg-gray-50')}`}
        >
          <div className="text-xl font-bold text-orange-600">{stats.overdue}</div>
          <div className="text-xs text-orange-700 mt-0.5">Overdue</div>
        </button>
        <button
          onClick={() => setStatusFilter('DRAFT')}
          className={`card p-3 text-left transition-all ${statusFilter === 'DRAFT' ? 'ring-2 ring-slate-400 bg-slate-50' : 'hover:bg-gray-50'}`}
        >
          <div className="text-xl font-bold text-slate-600">{stats.draft}</div>
          <div className="text-xs text-gray-500 mt-0.5">Draft</div>
        </button>
        <button
          onClick={() => setStatusFilter('SUBMITTED')}
          className={`card p-3 text-left transition-all ${statusFilter === 'SUBMITTED' ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
        >
          <div className="text-xl font-bold text-blue-600">{stats.submitted}</div>
          <div className="text-xs text-gray-500 mt-0.5">Submitted</div>
        </button>
        <button
          onClick={() => setStatusFilter('PAID')}
          className={`card p-3 text-left transition-all ${statusFilter === 'PAID' ? 'ring-2 ring-green-500 bg-green-50' : 'hover:bg-gray-50'}`}
        >
          <div className="text-xl font-bold text-green-600">{stats.paid}</div>
          <div className="text-xs text-gray-500 mt-0.5">Paid</div>
        </button>
      </div>

      {/* Invoice List */}
      <div className="card overflow-hidden">
        {loadingData ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3 text-gray-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm">Loading invoices...</span>
            </div>
          </div>
        ) : filteredPendingInstances.length === 0 && sortedInvoices.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-gray-300 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">No invoices for this month</h3>
            <p className="text-sm text-gray-500 mb-4">
              {statusFilter ? 'No invoices match the selected filter.' : 'No pending requirements or invoices for this period.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200">
                    <th className="px-2 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">
                      Ref
                    </th>
                    <SortableHeader label="Invoice #" field="invoiceNumber" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
                    <SortableHeader label="Account #" field="accountNumber" sortConfig={sortConfig} onSort={handleSort} className="text-left hidden lg:table-cell" />
                    <SortableHeader label="Vendor" field="vendor" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
                    <SortableHeader label="Inv Date" field="invoiceDate" sortConfig={sortConfig} onSort={handleSort} className="text-left hidden md:table-cell" />
                    <SortableHeader label="Due Date" field="dueDate" sortConfig={sortConfig} onSort={handleSort} className="text-left hidden sm:table-cell" />
                    <SortableHeader label="Amount" field="amount" sortConfig={sortConfig} onSort={handleSort} className="text-right" />
                    <SortableHeader label="Status" field="status" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
                    <th className="px-2 py-2 text-right font-semibold text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {/* Pending Requirement Instances */}
                  {filteredPendingInstances.map((instance) => {
                    const daysUntil = getDaysUntil(instance.submissionDeadline);
                    const isOverdueInstance = instance.status === 'OVERDUE' || daysUntil < 0;
                    const isUrgent = daysUntil <= 3 && daysUntil >= 0;

                    return (
                      <tr
                        key={`instance-${instance.id}`}
                        className={`transition-colors ${isOverdueInstance ? 'bg-orange-50/50' : isUrgent ? 'bg-yellow-50/50' : 'hover:bg-slate-50/50'}`}
                      >
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-gray-900 truncate max-w-[100px]" title={instance.requirement.name}>
                              {instance.requirement.name}
                            </span>
                            <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-semibold bg-yellow-100 text-yellow-700 flex-shrink-0">
                              REQ
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-500">{instance.periodLabel}</div>
                        </td>
                        <td className="px-2 py-2">
                          <span className="text-gray-400 italic">-</span>
                        </td>
                        <td className="px-2 py-2 hidden lg:table-cell">
                          <span className="text-gray-400 italic">-</span>
                        </td>
                        <td className="px-2 py-2">
                          <span className="text-gray-900 truncate max-w-[100px] block">
                            {instance.requirement.vendor?.name || <span className="text-gray-400 italic">Any</span>}
                          </span>
                        </td>
                        <td className="px-2 py-2 hidden md:table-cell">
                          <span className="text-gray-400 italic">-</span>
                        </td>
                        <td className="px-2 py-2 hidden sm:table-cell">
                          <div className={`${isOverdueInstance ? 'text-red-600 font-medium' : isUrgent ? 'text-orange-600 font-medium' : 'text-gray-600'}`}>
                            {formatDate(instance.submissionDeadline)}
                            {isOverdueInstance && <span className="ml-1 text-[9px] font-bold">!</span>}
                            {isUrgent && !isOverdueInstance && <span className="ml-1 text-[9px]">({daysUntil}d)</span>}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <span className="text-gray-400 italic">-</span>
                        </td>
                        <td className="px-2 py-2">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isOverdueInstance ? STATUS_COLORS.OVERDUE : STATUS_COLORS.PENDING_UPLOAD}`}>
                            <span className={`w-1 h-1 rounded-full ${isOverdueInstance ? STATUS_DOTS.OVERDUE : STATUS_DOTS.PENDING_UPLOAD}`} />
                            {isOverdueInstance ? 'OVERDUE' : 'PENDING'}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/dashboard/pharmacy/requirements/${instance.id}/submit?pharmacyId=${selectedPharmacyId}`}
                              className="text-[10px] font-medium text-white bg-primary-600 hover:bg-primary-700 px-2 py-1 rounded transition-colors"
                              title="Upload invoice document"
                            >
                              Upload
                            </Link>
                            <Link
                              href={`/dashboard/pharmacy/invoices/new?pharmacyId=${selectedPharmacyId}&instanceId=${instance.id}`}
                              className="text-[10px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded transition-colors"
                              title="Manual invoice entry"
                            >
                              Manual
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Regular Invoices */}
                  {sortedInvoices.map((invoice) => {
                    const linkedInstance = invoice.requirementInstances?.[0];
                    const hasLinkedInstance = !!linkedInstance;

                    return (
                    <tr key={invoice.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Ref - show requirement name if linked */}
                      <td className="px-2 py-2">
                        {linkedInstance ? (
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-gray-900 truncate max-w-[100px]" title={linkedInstance.requirement.name}>
                              {linkedInstance.requirement.name}
                            </span>
                            <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-semibold bg-blue-100 text-blue-700 flex-shrink-0">
                              REQ
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">-</span>
                        )}
                      </td>
                      {/* Invoice # */}
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-gray-900">
                            {invoice.invoiceNumber || <span className="text-gray-400 italic font-normal">Draft</span>}
                          </span>
                          {invoice.entryMethod === 'AI_EXTRACTION' ? (
                            <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-violet-50 text-violet-600" title="AI extraction">
                              AI
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-500" title="Manual entry">
                              M
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Account # */}
                      <td className="px-2 py-2 hidden lg:table-cell">
                        <span className="text-gray-600">
                          {invoice.accountNumber || <span className="text-gray-400 italic">-</span>}
                        </span>
                      </td>
                      {/* Vendor */}
                      <td className="px-2 py-2">
                        <span className="text-gray-900 truncate max-w-[100px] block">
                          {invoice.vendor?.name || <span className="text-gray-400 italic">Not set</span>}
                        </span>
                      </td>
                      {/* Invoice Date */}
                      <td className="px-2 py-2 hidden md:table-cell">
                        <span className="text-gray-600">
                          {invoice.invoiceDate ? formatDate(invoice.invoiceDate) : <span className="text-gray-400 italic">-</span>}
                        </span>
                      </td>
                      {/* Due Date */}
                      <td className="px-2 py-2 hidden sm:table-cell">
                        <div className={`${invoice.dueDate && isOverdue(invoice.dueDate, invoice.status) ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                          {invoice.dueDate ? formatDate(invoice.dueDate) : <span className="text-gray-400">-</span>}
                          {invoice.dueDate && isOverdue(invoice.dueDate, invoice.status) && (
                            <span className="ml-1 text-[9px] font-bold text-red-600">!</span>
                          )}
                        </div>
                      </td>
                      {/* Amount */}
                      <td className="px-2 py-2 text-right">
                        <span className="font-medium text-gray-900 tabular-nums">
                          {invoice.amount != null ? formatCurrency(invoice.amount) : <span className="text-gray-400 font-normal">-</span>}
                        </span>
                      </td>
                      {/* Status */}
                      <td className="px-2 py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[invoice.status] || 'bg-gray-100 text-gray-700'}`}>
                          <span className={`w-1 h-1 rounded-full ${STATUS_DOTS[invoice.status] || 'bg-gray-400'}`} />
                          {invoice.status.replace('_', ' ')}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {invoice.files && invoice.files.length > 0 && (
                            <a
                              href={`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'}/invoice-files/${invoice.files[0].id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title={`View ${invoice.files[0].originalName}`}
                            >
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                              </svg>
                            </a>
                          )}
                          <Link
                            href={`/dashboard/pharmacy/invoices/${invoice.id}`}
                            className="text-[11px] font-medium text-primary-600 hover:text-primary-800 px-1.5 py-0.5 rounded hover:bg-primary-50 transition-colors"
                          >
                            {['DRAFT', 'NEEDS_INFO'].includes(invoice.status) ? 'Edit' : 'View'}
                          </Link>
                          {invoice.status === 'DRAFT' && (
                            <button
                              onClick={() => handleSubmitDraft(invoice.id)}
                              disabled={submittingId === invoice.id}
                              className="text-[11px] font-medium text-green-600 hover:text-green-800 px-1.5 py-0.5 rounded hover:bg-green-50 transition-colors disabled:opacity-50"
                              title="Submit for approval"
                            >
                              {submittingId === invoice.id ? '...' : 'Submit'}
                            </button>
                          )}
                          {invoice.status === 'DRAFT' && !hasLinkedInstance && (
                            <button
                              onClick={() => handleDeleteDraft(invoice.id)}
                              disabled={deletingId === invoice.id}
                              className="text-[11px] font-medium text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Delete draft"
                            >
                              {deletingId === invoice.id ? '...' : 'Del'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between bg-slate-50/50">
                <div className="text-[11px] text-gray-500">
                  Page {pagination.page} of {pagination.totalPages}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => fetchData(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="btn-secondary !py-1 !px-2 text-[11px] disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => fetchData(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="btn-secondary !py-1 !px-2 text-[11px] disabled:opacity-40"
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
