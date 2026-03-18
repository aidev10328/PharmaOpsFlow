'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '../../../../../lib/api';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const InvoiceCalendarView = dynamic(() => import('../../../../../components/invoice/InvoiceCalendarView'), { ssr: false });

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [actionInvoiceId, setActionInvoiceId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'needs_info' | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const isManager = user?.role === 'COMPANY_MANAGER' || user?.role === 'ADMIN';

  // Default sort by due date
  const sortConfig: SortConfig = { field: 'dueDate', direction: 'asc' };

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

      const fetchLimit = viewMode === 'calendar' ? 200 : 10;
      let url = `/invoices?pharmacyId=${selectedPharmacyId}&page=${page}&limit=${fetchLimit}`;
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
      const now = new Date();
      const unfilled = instances.filter((i) => !i.invoiceId && ['PENDING', 'OVERDUE'].includes(i.status));
      const pendingUploadCount = unfilled.filter(
        (i) => new Date(i.submissionDeadline) >= now
      ).length;
      const overdueCount = unfilled.filter(
        (i) => new Date(i.submissionDeadline) < now
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
        total: pendingUploadCount + overdueCount + Object.values(invoiceStats.statusCounts || {}).reduce((a: number, b: any) => a + (b || 0), 0) - (isManager ? draftCount : 0),
      });
    } catch (e) {
      console.error('Failed to fetch data:', e);
    } finally {
      setLoadingData(false);
    }
  }, [selectedPharmacyId, monthFilter, statusFilter, isManager, viewMode]);

  useEffect(() => {
    if (selectedPharmacyId) {
      fetchData();
    }
  }, [selectedPharmacyId, monthFilter, statusFilter, fetchData]);

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

  const handleDeleteDraft = async (invoiceId: string) => {
    setDeletingId(invoiceId);
    setConfirmDeleteId(null);
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

  const handleManagerAction = async () => {
    if (!actionInvoiceId || !actionType) return;
    setActionLoading(true);
    try {
      const endpoint = actionType === 'approve'
        ? `/invoices/${actionInvoiceId}/approve`
        : actionType === 'reject'
          ? `/invoices/${actionInvoiceId}/reject`
          : `/invoices/${actionInvoiceId}/needs-info`;
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: actionNotes || undefined }),
      });
      if (res.ok) {
        setActionInvoiceId(null);
        setActionType(null);
        setActionNotes('');
        fetchData(pagination?.page || 1);
      } else {
        const errData = await res.json();
        alert(errData.message || `Failed to ${actionType} invoice`);
      }
    } catch (err) {
      console.error(`Failed to ${actionType} invoice:`, err);
      alert(`Failed to ${actionType} invoice`);
    } finally {
      setActionLoading(false);
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
  const now = new Date();
  const filteredPendingInstances = statusFilter === 'PENDING_UPLOAD'
    ? sortedPendingInstances.filter(i => new Date(i.submissionDeadline) >= now)
    : statusFilter === 'OVERDUE_INSTANCE'
      ? sortedPendingInstances.filter(i => i.status === 'OVERDUE' || new Date(i.submissionDeadline) < now)
      : statusFilter === ''
        ? sortedPendingInstances
        : [];

  return (
    <div className="max-w-7xl mx-auto space-y-3">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Invoices</h1>
          <p className="text-xs text-gray-500">
            {selectedPharmacy?.name || 'Your pharmacy'}
          </p>
        </div>
        {!isManager && (
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/pharmacy/invoices/new?pharmacyId=${selectedPharmacyId}`}
              className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-white text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 transition-all shadow-sm gap-1 h-8"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Invoice
            </Link>
            <Link
              href={`/dashboard/pharmacy/invoices/bulk-upload?pharmacyId=${selectedPharmacyId}`}
              className="btn-primary text-xs px-3 py-1.5 gap-1 h-8"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Bulk Upload
            </Link>
          </div>
        )}
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        {pharmacies.length > 1 && (
          <select
            value={selectedPharmacyId}
            onChange={(e) => setSelectedPharmacyId(e.target.value)}
            className="input-field max-w-[200px] text-xs !py-1.5"
          >
            {pharmacies.map((pharmacy) => (
              <option key={pharmacy.id} value={pharmacy.id}>
                {pharmacy.code} - {pharmacy.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Month:</span>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="input-field text-xs !py-1.5 !w-auto"
          />
        </div>

        {/* View Toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 ml-auto">
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
      </div>

      {/* Stats Cards - Compact */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
        <button
          onClick={() => setStatusFilter('')}
          className={`card p-2 text-left transition-all ${!statusFilter ? 'ring-2 ring-primary-500 bg-primary-50' : 'hover:bg-gray-50'}`}
        >
          <div className="text-base font-bold text-gray-900">{stats.total}</div>
          <div className="text-[10px] text-gray-500">Total</div>
        </button>
        <button
          onClick={() => setStatusFilter('PENDING_UPLOAD')}
          className={`card p-2 text-left transition-all border-yellow-200 ${statusFilter === 'PENDING_UPLOAD' ? 'ring-2 ring-yellow-500 bg-yellow-50' : (stats.pendingUpload > 0 ? 'bg-yellow-50' : 'hover:bg-gray-50')}`}
        >
          <div className="text-base font-bold text-yellow-600">{stats.pendingUpload}</div>
          <div className="text-[10px] text-yellow-700">Pending</div>
        </button>
        <button
          onClick={() => setStatusFilter('OVERDUE_INSTANCE')}
          className={`card p-2 text-left transition-all ${
            stats.overdue > 0
              ? `!border-2 !border-red-400 !bg-red-600 text-white shadow-lg ${statusFilter === 'OVERDUE_INSTANCE' ? 'ring-2 ring-red-300' : 'animate-pulse'}`
              : `!border-2 !border-red-300 !bg-red-50 ${statusFilter === 'OVERDUE_INSTANCE' ? 'ring-2 ring-red-500' : 'hover:!bg-red-100'}`
          }`}
        >
          <div className="flex items-center gap-1">
            <svg className={`w-3 h-3 ${stats.overdue > 0 ? 'text-white' : 'text-red-400'}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className={`text-base font-bold ${stats.overdue > 0 ? 'text-white' : 'text-red-600'}`}>{stats.overdue}</div>
          </div>
          <div className={`text-[10px] font-semibold ${stats.overdue > 0 ? 'text-red-100' : 'text-red-600'}`}>Overdue</div>
        </button>
        {!isManager && (
          <button
            onClick={() => setStatusFilter('DRAFT')}
            className={`card p-2 text-left transition-all ${statusFilter === 'DRAFT' ? 'ring-2 ring-slate-400 bg-slate-50' : 'hover:bg-gray-50'}`}
          >
            <div className="text-base font-bold text-slate-600">{stats.draft}</div>
            <div className="text-[10px] text-gray-500">Draft</div>
          </button>
        )}
        <button
          onClick={() => setStatusFilter('SUBMITTED')}
          className={`card p-2 text-left transition-all ${statusFilter === 'SUBMITTED' ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
        >
          <div className="text-base font-bold text-blue-600">{stats.submitted}</div>
          <div className="text-[10px] text-gray-500">Submitted</div>
        </button>
        <button
          onClick={() => setStatusFilter('PAID')}
          className={`card p-2 text-left transition-all ${statusFilter === 'PAID' ? 'ring-2 ring-green-500 bg-green-50' : 'hover:bg-gray-50'}`}
        >
          <div className="text-base font-bold text-green-600">{stats.paid}</div>
          <div className="text-[10px] text-gray-500">Paid</div>
        </button>
      </div>

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <InvoiceCalendarView
          invoices={sortedInvoices}
          pendingInstances={filteredPendingInstances}
          monthFilter={monthFilter}
          selectedPharmacyId={selectedPharmacyId}
          isManager={isManager}
          formatCurrency={formatCurrency}
          onMonthChange={setMonthFilter}
        />
      )}

      {/* Invoice List - Two Panel Card Layout */}
      {viewMode === 'list' && (
        loadingData ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2 text-gray-400">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs">Loading invoices...</span>
            </div>
          </div>
        ) : filteredPendingInstances.length === 0 && sortedInvoices.length === 0 ? (
          <div className="card py-12 text-center">
            <svg className="w-10 h-10 mx-auto text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">No invoices for this month</h3>
            <p className="text-xs text-gray-500">
              {statusFilter ? 'No invoices match the selected filter.' : 'No pending requirements or invoices for this period.'}
            </p>
          </div>
        ) : (() => {
          const actionItems = [
            ...(!isManager ? filteredPendingInstances.map(inst => ({ type: 'instance' as const, data: inst })) : []),
          ];
          const inProgressItems = sortedInvoices
            .filter(inv => (!isManager || inv.status !== 'DRAFT') && ['DRAFT', 'SUBMITTED', 'APPROVED', 'SCHEDULED', 'NEEDS_INFO'].includes(inv.status))
            .map(inv => ({ type: 'invoice' as const, data: inv }));
          const completedItems = sortedInvoices
            .filter(inv => (!isManager || inv.status !== 'DRAFT') && ['PAID', 'REJECTED'].includes(inv.status))
            .map(inv => ({ type: 'invoice' as const, data: inv }));

          return (
            <div className="card p-0 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
              {/* Left Panel - Action Required */}
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider">Action Required</h3>
                  <span className="text-[10px] text-white bg-amber-500 px-1.5 py-0.5 rounded-full font-bold">{actionItems.length}</span>
                </div>

                {actionItems.length === 0 ? (
                  <div className="card p-4 text-center border-dashed">
                    <svg className="w-6 h-6 mx-auto text-emerald-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-[11px] text-gray-400">All caught up!</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {actionItems.map((item) => {
                      if (item.type === 'instance') {
                        const inst = item.data as RequirementInstance;
                        const daysUntil = getDaysUntil(inst.submissionDeadline);
                        const isOverdueInstance = inst.status === 'OVERDUE' || daysUntil < 0;
                        const isUrgent = daysUntil <= 3 && daysUntil >= 0;
                        return (
                          <div
                            key={`inst-${inst.id}`}
                            className={`border-b border-gray-100 last:border-b-0 border-l-[3px] transition-all hover:bg-gray-50/50 ${
                              isOverdueInstance ? 'border-l-red-500 bg-red-50/30' : isUrgent ? 'border-l-orange-400 bg-orange-50/20' : 'border-l-yellow-400'
                            }`}
                          >
                            <div className="flex items-center gap-3 px-3 py-2.5">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[11px] font-semibold text-gray-900 truncate">{inst.requirement.name}</span>
                                  <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold bg-yellow-100 text-yellow-700 flex-shrink-0">REQ</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                  <span>{inst.requirement.vendor?.name || 'Any vendor'}</span>
                                  <span className="text-gray-300">|</span>
                                  <span>{inst.periodLabel}</span>
                                </div>
                              </div>
                              <div className="flex items-center flex-shrink-0">
                                <div className="w-24 text-right mr-3">
                                  <div className={`text-[10px] font-medium ${isOverdueInstance ? 'text-red-600' : isUrgent ? 'text-orange-600' : 'text-gray-500'}`}>
                                    {formatDate(inst.submissionDeadline)}
                                  </div>
                                  {isOverdueInstance && (
                                    <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1 rounded">{daysUntil}d overdue</span>
                                  )}
                                  {isUrgent && !isOverdueInstance && (
                                    <span className="text-[9px] font-medium text-orange-600">{daysUntil}d left</span>
                                  )}
                                </div>
                                <div className="w-20 flex items-center justify-end gap-0.5">
                                  <Link
                                    href={`/dashboard/pharmacy/invoices/new?pharmacyId=${selectedPharmacyId}&instanceId=${inst.id}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors shadow-sm"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                    Upload
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      } else {
                        const inv = item.data as Invoice;
                        const linkedInstance = inv.requirementInstances?.[0];
                        const hasLinkedInstance = !!linkedInstance;
                        return (
                          <div
                            key={inv.id}
                            className={`border-b border-gray-100 last:border-b-0 border-l-[3px] transition-all hover:bg-gray-50/50 ${
                              inv.status === 'NEEDS_INFO' ? 'border-l-amber-500 bg-amber-50/20' : 'border-l-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-3 px-3 py-2.5">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[11px] font-semibold text-gray-900 truncate">
                                    {inv.vendor?.name || 'Unknown Vendor'}
                                  </span>
                                  {inv.entryMethod === 'AI_EXTRACTION' && (
                                    <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold bg-violet-50 text-violet-600 flex-shrink-0">AI</span>
                                  )}
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0 ${STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-700'}`}>
                                    <span className={`w-1 h-1 rounded-full ${STATUS_DOTS[inv.status] || 'bg-gray-400'}`} />
                                    {inv.status === 'NEEDS_INFO' ? 'Needs Info' : 'Draft'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                  <span>{inv.invoiceNumber || 'No number'}</span>
                                  {inv.dueDate && (
                                    <>
                                      <span className="text-gray-300">|</span>
                                      <span>Due {formatDate(inv.dueDate)}</span>
                                    </>
                                  )}
                                  {linkedInstance && (
                                    <>
                                      <span className="text-gray-300">|</span>
                                      <span className="text-blue-600">{linkedInstance.requirement.name}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center flex-shrink-0 ml-2">
                                <span className="text-xs font-bold text-gray-900 tabular-nums w-24 text-right">{inv.amount != null ? formatCurrency(inv.amount) : ''}</span>
                                <div className="w-7 flex items-center justify-center ml-2">
                                  {inv.files && inv.files.length > 0 && (
                                    <button
                                      onClick={async () => {
                                        try {
                                          const res = await apiFetch(`/invoice-files/${inv.files[0].id}/download`);
                                          if (!res.ok) throw new Error('Failed to get file');
                                          const data = await res.json();
                                          window.open(data.downloadUrl, '_blank');
                                        } catch { alert('Failed to open file'); }
                                      }}
                                      className="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                                      title="View file"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                                <div className="w-8 flex items-center justify-center">
                                  <Link
                                    href={`/dashboard/pharmacy/invoices/${inv.id}`}
                                    className="inline-flex items-center px-1 py-1 rounded-md text-[10px] font-medium text-primary-600 hover:bg-primary-50 transition-colors"
                                  >
                                    Edit
                                  </Link>
                                </div>
                                <div className="w-14 flex items-center justify-center">
                                  {!isManager && inv.status === 'DRAFT' && (
                                    <button
                                      onClick={() => handleSubmitDraft(inv.id)}
                                      disabled={submittingId === inv.id}
                                      className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                    >
                                      {submittingId === inv.id ? '...' : 'Submit'}
                                    </button>
                                  )}
                                </div>
                                <div className="w-7 flex items-center justify-center relative">
                                  {!isManager && inv.status === 'DRAFT' && !hasLinkedInstance && (
                                    <>
                                      <button
                                        onClick={() => setConfirmDeleteId(confirmDeleteId === inv.id ? null : inv.id)}
                                        disabled={deletingId === inv.id}
                                        className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                                        title="Delete draft"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                      {confirmDeleteId === inv.id && (
                                        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-red-200 rounded-lg shadow-lg p-3 w-48">
                                          <p className="text-xs text-gray-700 mb-2">Delete this draft?</p>
                                          <div className="flex items-center gap-2">
                                            <button onClick={() => handleDeleteDraft(inv.id)} className="text-[11px] font-medium text-white bg-red-600 hover:bg-red-700 px-2.5 py-1 rounded transition-colors">Delete</button>
                                            <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] font-medium text-gray-600 hover:text-gray-800 px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    })}
                  </div>
                )}
              </div>

              {/* Right Panel - In Progress & Completed */}
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider">In Progress</h3>
                  <span className="text-[10px] text-white bg-blue-500 px-1.5 py-0.5 rounded-full font-bold">{inProgressItems.length}</span>
                </div>

                {inProgressItems.length === 0 && completedItems.length === 0 ? (
                  <div className="card p-4 text-center border-dashed">
                    <p className="text-[11px] text-gray-400">No invoices submitted yet</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {inProgressItems.map(({ data: inv }) => {
                      const invoice = inv as Invoice;
                      const linkedInstance = invoice.requirementInstances?.[0];
                      const hasLinkedInstance = !!linkedInstance;
                      const statusLabel = invoice.status === 'DRAFT' ? 'Draft' : invoice.status === 'SUBMITTED' ? 'Submitted' : invoice.status === 'APPROVED' ? 'Approved' : 'Scheduled';
                      return (
                        <div
                          key={invoice.id}
                          className={`border-b border-gray-100 last:border-b-0 border-l-[3px] transition-all hover:bg-gray-50/50 ${
                            invoice.status === 'DRAFT' ? 'border-l-slate-400' :
                            invoice.status === 'SUBMITTED' ? 'border-l-blue-500' :
                            invoice.status === 'APPROVED' ? 'border-l-emerald-500' :
                            'border-l-violet-500'
                          }`}
                        >
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[11px] font-semibold text-gray-900 truncate">
                                  {invoice.vendor?.name || 'Unknown Vendor'}
                                </span>
                                {invoice.entryMethod === 'AI_EXTRACTION' && (
                                  <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold bg-violet-50 text-violet-600 flex-shrink-0">AI</span>
                                )}
                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0 ${STATUS_COLORS[invoice.status] || 'bg-gray-100 text-gray-700'}`}>
                                  <span className={`w-1 h-1 rounded-full ${STATUS_DOTS[invoice.status] || 'bg-gray-400'}`} />
                                  {statusLabel}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                <span>{invoice.invoiceNumber || 'No number'}</span>
                                {invoice.dueDate && (
                                  <>
                                    <span className="text-gray-300">|</span>
                                    <span className={`${isOverdue(invoice.dueDate, invoice.status) ? 'text-red-500 font-medium' : ''}`}>
                                      Due {formatDate(invoice.dueDate)}
                                    </span>
                                  </>
                                )}
                                {linkedInstance && (
                                  <>
                                    <span className="text-gray-300">|</span>
                                    <span className="text-blue-600">{linkedInstance.requirement.name}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center flex-shrink-0 ml-2">
                              <span className="text-xs font-bold text-gray-900 tabular-nums w-24 text-right">{invoice.amount != null ? formatCurrency(invoice.amount) : ''}</span>
                              <div className="w-7 flex items-center justify-center ml-2">
                                {invoice.files && invoice.files.length > 0 && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        const res = await apiFetch(`/invoice-files/${invoice.files[0].id}/download`);
                                        if (!res.ok) throw new Error('Failed to get file');
                                        const data = await res.json();
                                        window.open(data.downloadUrl, '_blank');
                                      } catch { alert('Failed to open file'); }
                                    }}
                                    className="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                                    title="View file"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                              <div className="w-8 flex items-center justify-center">
                                <Link
                                  href={`/dashboard/pharmacy/invoices/${invoice.id}`}
                                  className="inline-flex items-center px-1 py-1 rounded-md text-[10px] font-medium text-primary-600 hover:bg-primary-50 transition-colors"
                                >
                                  {invoice.status === 'DRAFT' ? 'Edit' : 'View'}
                                </Link>
                              </div>
                              <div className="w-14 flex items-center justify-center">
                                {!isManager && invoice.status === 'DRAFT' && (
                                  <button
                                    onClick={() => handleSubmitDraft(invoice.id)}
                                    disabled={submittingId === invoice.id}
                                    className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                  >
                                    {submittingId === invoice.id ? '...' : 'Submit'}
                                  </button>
                                )}
                                {isManager && invoice.status === 'SUBMITTED' && (
                                  <button
                                    onClick={() => { setActionInvoiceId(invoice.id); setActionType('approve'); setActionNotes(''); }}
                                    className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                                  >
                                    Approve
                                  </button>
                                )}
                              </div>
                              <div className="w-7 flex items-center justify-center relative">
                                {!isManager && invoice.status === 'DRAFT' && !hasLinkedInstance && (
                                  <>
                                    <button
                                      onClick={() => setConfirmDeleteId(confirmDeleteId === invoice.id ? null : invoice.id)}
                                      disabled={deletingId === invoice.id}
                                      className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                                      title="Delete draft"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                    {confirmDeleteId === invoice.id && (
                                      <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-red-200 rounded-lg shadow-lg p-3 w-48">
                                        <p className="text-xs text-gray-700 mb-2">Delete this draft?</p>
                                        <div className="flex items-center gap-2">
                                          <button onClick={() => handleDeleteDraft(invoice.id)} className="text-[11px] font-medium text-white bg-red-600 hover:bg-red-700 px-2.5 py-1 rounded transition-colors">Delete</button>
                                          <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] font-medium text-gray-600 hover:text-gray-800 px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}
                                {isManager && invoice.status === 'SUBMITTED' && (
                                  <button
                                    onClick={() => { setActionInvoiceId(invoice.id); setActionType('reject'); setActionNotes(''); }}
                                    className="inline-flex items-center px-1 py-1 rounded-md text-[10px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    Reject
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Completed Section */}
                    {completedItems.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <h3 className="text-xs font-bold text-green-800 uppercase tracking-wider">Completed</h3>
                          <span className="text-[10px] text-white bg-green-500 px-1.5 py-0.5 rounded-full font-bold">{completedItems.length}</span>
                        </div>
                        {completedItems.map(({ data: inv }) => {
                          const invoice = inv as Invoice;
                          return (
                            <div
                              key={invoice.id}
                              className={`border-b border-gray-100 last:border-b-0 border-l-[3px] transition-all hover:bg-gray-50/50 opacity-75 hover:opacity-100 ${
                                invoice.status === 'PAID' ? 'border-l-green-500' : 'border-l-red-400'
                              }`}
                            >
                              <div className="flex items-center gap-3 px-3 py-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="text-[11px] font-semibold text-gray-700 truncate">
                                      {invoice.vendor?.name || 'Unknown Vendor'}
                                    </span>
                                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0 ${STATUS_COLORS[invoice.status] || 'bg-gray-100 text-gray-700'}`}>
                                      <span className={`w-1 h-1 rounded-full ${STATUS_DOTS[invoice.status] || 'bg-gray-400'}`} />
                                      {invoice.status === 'PAID' ? 'Paid' : 'Rejected'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                    <span>{invoice.invoiceNumber || 'No number'}</span>
                                    {invoice.dueDate && (
                                      <>
                                        <span className="text-gray-300">|</span>
                                        <span>{formatDate(invoice.dueDate)}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center flex-shrink-0 ml-2">
                                  <span className="text-xs font-bold text-gray-700 tabular-nums w-24 text-right">{invoice.amount != null ? formatCurrency(invoice.amount) : ''}</span>
                                  <div className="w-7 ml-2" />
                                  <div className="w-8 flex items-center justify-center">
                                    <Link
                                      href={`/dashboard/pharmacy/invoices/${invoice.id}`}
                                      className="inline-flex items-center px-1 py-1 rounded-md text-[10px] font-medium text-primary-600 hover:bg-primary-50 transition-colors"
                                    >
                                      View
                                    </Link>
                                  </div>
                                  <div className="w-14" />
                                  <div className="w-7" />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-gray-400">Page {pagination.page} of {pagination.totalPages}</span>
                    <div className="flex gap-1">
                      <button onClick={() => fetchData(pagination.page - 1)} disabled={pagination.page <= 1} className="btn-secondary !py-1 !px-2 text-[10px] disabled:opacity-40">Prev</button>
                      <button onClick={() => fetchData(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="btn-secondary !py-1 !px-2 text-[10px] disabled:opacity-40">Next</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          );
        })()
      )}

      {/* Manager Action Modal */}
      {actionInvoiceId && actionType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setActionInvoiceId(null); setActionType(null); }}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {actionType === 'approve' && 'Approve Invoice'}
              {actionType === 'reject' && 'Reject Invoice'}
              {actionType === 'needs_info' && 'Request More Information'}
            </h3>
            <textarea
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder={actionType === 'approve' ? 'Optional notes...' : 'Provide a reason (required)...'}
              className="input-field w-full h-24 text-sm mb-3"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setActionInvoiceId(null); setActionType(null); }}
                className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleManagerAction}
                disabled={actionLoading || ((actionType === 'reject' || actionType === 'needs_info') && !actionNotes.trim())}
                className={`text-sm font-medium text-white px-3 py-1.5 rounded transition-colors disabled:opacity-50 ${
                  actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' :
                  actionType === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                  'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {actionLoading ? 'Processing...' : actionType === 'approve' ? 'Approve' : actionType === 'reject' ? 'Reject' : 'Request Info'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
