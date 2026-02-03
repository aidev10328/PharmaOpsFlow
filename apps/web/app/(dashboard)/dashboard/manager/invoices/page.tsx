'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../lib/api';
import Link from 'next/link';

// ─── Shared Types ────────────────────────────────────────────

type Pharmacy = { id: string; name: string; code: string };
type Vendor = { id: string; name: string; code: string };
type InvoiceType = { id: string; name: string };

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  amountPaid?: string;
  status: string;
  description?: string;
  notes?: string;
  submittedAt?: string;
  pharmacy: Pharmacy;
  vendor: Vendor;
  invoiceType: InvoiceType;
  createdAt: string;
};

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

type SummaryGroup = {
  groupKey: string;
  groupLabel: string;
  metrics: { count: number; sumAmount: number; sumPaid: number; avgAmount: number };
};

type SummaryResult = {
  overall: { count: number; sumAmount: number; sumPaid: number; avgAmount: number };
  groups: SummaryGroup[];
};

type PharmacySlaStatus = {
  pharmacyId: string;
  pharmacyName: string;
  pharmacyCode: string;
  yearMonth: string;
  expectedCount: number;
  submittedCount: number;
  processedCount: number;
  isMet: boolean;
  submissionDeadlineMet: boolean;
  processingDeadlineMet: boolean;
  events: { eventType: string; createdAt: string; notes: string | null }[];
};

type SlaSummary = {
  yearMonth: string;
  totalPharmacies: number;
  compliant: number;
  nonCompliant: number;
  pending: number;
  pharmacies: PharmacySlaStatus[];
};

// ─── Constants ───────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  NEEDS_INFO: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  SCHEDULED: 'bg-purple-100 text-purple-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
};

const COMPLIANCE_BADGES: Record<string, string> = {
  compliant: 'bg-green-100 text-green-800',
  nonCompliant: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
};

// ─── Helpers ─────────────────────────────────────────────────

const formatCurrency = (amount: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount));

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const isOverdue = (dueDate: string, status: string) => {
  if (['PAID', 'REJECTED'].includes(status)) return false;
  return new Date(dueDate) < new Date();
};

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const generateMonthOptions = () => {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    opts.push({ value, label });
  }
  return opts;
};

// ─── Main Component ──────────────────────────────────────────

export default function ManagerOperationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Top-level tab
  const [mainTab, setMainTab] = useState<'invoices' | 'analytics' | 'compliance'>('invoices');

  // ─── Invoices Tab State ──────────────────────────────────
  const [invoiceSubTab, setInvoiceSubTab] = useState<'pending' | 'all'>('pending');
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  // Filters (shared between invoices "all" sub-tab and analytics tab)
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ pharmacies: [], invoiceTypes: [], statuses: [] });
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
  const [activeChips, setActiveChips] = useState<FilterChip[]>([]);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceLimit] = useState(20);
  const [invoiceTotalCount, setInvoiceTotalCount] = useState(0);
  const [loadingAllInvoices, setLoadingAllInvoices] = useState(false);

  // ─── Analytics Tab State ─────────────────────────────────
  const [groupBy, setGroupBy] = useState<string>('status');
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // ─── Compliance Tab State ────────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth());
  const [slaSummary, setSlaSummary] = useState<SlaSummary | null>(null);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [complianceError, setComplianceError] = useState<string | null>(null);

  // ─── Auth Guard ──────────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // ─── Fetch Filter Options (once) ────────────────────────
  useEffect(() => {
    async function fetchOptions() {
      try {
        const res = await apiFetch('/explore/options');
        if (res.ok) setFilterOptions(await res.json());
      } catch (e) {
        console.error('Failed to fetch filter options:', e);
      }
    }
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      fetchOptions();
    }
  }, [user]);

  // ─── Invoices: Fetch Pending ─────────────────────────────
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

  // ─── Invoices: Fetch Stats ───────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/invoices/stats');
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  }, []);

  // ─── Invoices: Fetch All (with explore filters) ──────────
  const fetchAllInvoices = useCallback(async () => {
    setLoadingAllInvoices(true);
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
      params.append('page', String(invoicePage));
      params.append('limit', String(invoiceLimit));

      const res = await apiFetch(`/explore/invoices?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAllInvoices(data.rows || []);
        setInvoiceTotalCount(data.totalCount || 0);
      }
    } catch (e) {
      console.error('Failed to fetch invoices:', e);
    } finally {
      setLoadingAllInvoices(false);
    }
  }, [filters, invoicePage, invoiceLimit]);

  // ─── Initial data load ──────────────────────────────────
  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      Promise.all([fetchPendingInvoices(), fetchStats()]).finally(() => setLoadingInvoices(false));
    }
  }, [user, fetchPendingInvoices, fetchStats]);

  // Refetch all invoices when filters/page change and we're on the all tab
  useEffect(() => {
    if (user && mainTab === 'invoices' && invoiceSubTab === 'all') {
      fetchAllInvoices();
    }
  }, [user, mainTab, invoiceSubTab, fetchAllInvoices]);

  // ─── Analytics: Fetch Summary ────────────────────────────
  const fetchSummaryData = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const params = new URLSearchParams();
      if (filters.pharmacyId) params.append('pharmacyId', filters.pharmacyId);
      if (filters.invoiceTypeId) params.append('invoiceTypeId', filters.invoiceTypeId);
      if (filters.statusIn.length > 0) params.append('statusIn', filters.statusIn.join(','));
      if (filters.overdueOnly) params.append('overdueOnly', 'true');
      if (filters.month) params.append('month', filters.month);
      if (filters.vendorNameContains) params.append('vendorNameContains', filters.vendorNameContains);
      if (filters.amountMin) params.append('amountMin', filters.amountMin);
      if (filters.amountMax) params.append('amountMax', filters.amountMax);
      if (groupBy) params.append('groupBy', groupBy);

      const res = await apiFetch(`/explore/summary?${params.toString()}`);
      if (res.ok) setSummary(await res.json());
    } catch (e) {
      console.error('Failed to fetch summary:', e);
    } finally {
      setLoadingSummary(false);
    }
  }, [filters, groupBy]);

  useEffect(() => {
    if (user && mainTab === 'analytics') {
      fetchSummaryData();
    }
  }, [user, mainTab, fetchSummaryData]);

  // ─── Compliance: Fetch SLA Summary ───────────────────────
  const fetchCompliance = useCallback(async () => {
    setLoadingCompliance(true);
    setComplianceError(null);
    try {
      const res = await apiFetch(`/v1/sla/summary?yearMonth=${selectedMonth}`);
      if (res.ok) {
        setSlaSummary(await res.json());
      } else {
        const err = await res.json();
        setComplianceError(err.message || 'Failed to load SLA summary');
      }
    } catch (e) {
      setComplianceError('Failed to load SLA summary');
    } finally {
      setLoadingCompliance(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (user && mainTab === 'compliance') {
      fetchCompliance();
    }
  }, [user, mainTab, fetchCompliance]);

  const runEvaluation = async () => {
    try {
      const res = await apiFetch(`/v1/sla/run?yearMonth=${selectedMonth}`, { method: 'POST' });
      if (res.ok) await fetchCompliance();
    } catch (e) {
      console.error('Failed to run evaluation:', e);
    }
  };

  // ─── Invoice Actions ─────────────────────────────────────
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

  // ─── Filter Chips ────────────────────────────────────────
  useEffect(() => {
    const chips: FilterChip[] = [];
    if (filters.pharmacyId) {
      const p = filterOptions.pharmacies.find(p => p.id === filters.pharmacyId);
      chips.push({ key: 'pharmacyId', label: 'Pharmacy', value: p?.name || filters.pharmacyId });
    }
    if (filters.invoiceTypeId) {
      const t = filterOptions.invoiceTypes.find(t => t.id === filters.invoiceTypeId);
      chips.push({ key: 'invoiceTypeId', label: 'Type', value: t?.name || filters.invoiceTypeId });
    }
    if (filters.statusIn.length > 0) chips.push({ key: 'statusIn', label: 'Status', value: filters.statusIn.join(', ') });
    if (filters.overdueOnly) chips.push({ key: 'overdueOnly', label: 'Overdue', value: true });
    if (filters.needsReview) chips.push({ key: 'needsReview', label: 'Needs Review', value: true });
    if (filters.month) chips.push({ key: 'month', label: 'Month', value: filters.month });
    if (filters.vendorNameContains) chips.push({ key: 'vendorNameContains', label: 'Vendor', value: filters.vendorNameContains });
    if (filters.dueDateFrom || filters.dueDateTo) {
      chips.push({ key: 'dueDateRange', label: 'Due Date', value: `${filters.dueDateFrom || '...'} to ${filters.dueDateTo || '...'}` });
    }
    if (filters.amountMin || filters.amountMax) {
      chips.push({ key: 'amountRange', label: 'Amount', value: `$${filters.amountMin || '0'} - $${filters.amountMax || '∞'}` });
    }
    setActiveChips(chips);
  }, [filters, filterOptions]);

  const removeChip = (key: string) => {
    setFilters(prev => {
      const f = { ...prev };
      if (key === 'pharmacyId') f.pharmacyId = '';
      if (key === 'invoiceTypeId') f.invoiceTypeId = '';
      if (key === 'statusIn') f.statusIn = [];
      if (key === 'overdueOnly') f.overdueOnly = false;
      if (key === 'needsReview') f.needsReview = false;
      if (key === 'month') f.month = '';
      if (key === 'vendorNameContains') f.vendorNameContains = '';
      if (key === 'dueDateRange') { f.dueDateFrom = ''; f.dueDateTo = ''; }
      if (key === 'amountRange') { f.amountMin = ''; f.amountMax = ''; }
      return f;
    });
  };

  const clearAllFilters = () => {
    setFilters({
      pharmacyId: '', invoiceTypeId: '', statusIn: [], overdueOnly: false, needsReview: false,
      month: '', vendorNameContains: '', dueDateFrom: '', dueDateTo: '', amountMin: '', amountMax: '',
    });
  };

  const toggleStatus = (status: string) => {
    setFilters(prev => ({
      ...prev,
      statusIn: prev.statusIn.includes(status) ? prev.statusIn.filter(s => s !== status) : [...prev.statusIn, status],
    }));
  };

  // ─── Compliance Helpers ──────────────────────────────────
  const getPharmacyStatus = (p: PharmacySlaStatus): 'compliant' | 'nonCompliant' | 'pending' => {
    if (p.isMet) return 'compliant';
    if (!p.submissionDeadlineMet || !p.processingDeadlineMet) return 'nonCompliant';
    return 'pending';
  };

  const getStatusLabel = (s: string) => (s === 'compliant' ? 'Compliant' : s === 'nonCompliant' ? 'Non-Compliant' : 'Pending');

  // ─── Auth Loading / Guard ────────────────────────────────
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

  if (!user || !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) return null;

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Operations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage invoices, view analytics, and track SLA compliance
          </p>
        </div>
        <Link href="/dashboard/manager/chat" className="btn-primary text-sm">
          AI Chat
        </Link>
      </div>

      {/* ─── Main Tabs ──────────────────────────────────── */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {([
            { key: 'invoices', label: 'Invoices', count: pendingInvoices.length > 0 ? pendingInvoices.length : undefined },
            { key: 'analytics', label: 'Analytics' },
            { key: 'compliance', label: 'Compliance' },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key)}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                mainTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.key === 'invoices' && pendingInvoices.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                  {pendingInvoices.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* INVOICES TAB                                       */}
      {/* ═══════════════════════════════════════════════════ */}
      {mainTab === 'invoices' && (
        <>
          {/* Invoice Stats Bar */}
          {stats && (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
              {[
                { label: 'Draft', count: stats.statusCounts?.DRAFT || 0, color: 'text-gray-600' },
                { label: 'Pending', count: stats.statusCounts?.SUBMITTED || 0, color: 'text-blue-600', accent: 'border-l-4 border-l-blue-500' },
                { label: 'Needs Info', count: stats.statusCounts?.NEEDS_INFO || 0, color: 'text-yellow-600' },
                { label: 'Approved', count: stats.statusCounts?.APPROVED || 0, color: 'text-green-600' },
                { label: 'Scheduled', count: stats.statusCounts?.SCHEDULED || 0, color: 'text-purple-600' },
                { label: 'Paid', count: stats.statusCounts?.PAID || 0, color: 'text-emerald-600' },
              ].map(s => (
                <div key={s.label} className={`card p-3 ${s.accent || ''}`}>
                  <div className={`text-xl font-bold ${s.color}`}>{s.count}</div>
                  <div className="text-xs text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Invoice Sub-Tabs */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setInvoiceSubTab('pending')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  invoiceSubTab === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Pending Approval ({pendingInvoices.length})
              </button>
              <button
                onClick={() => setInvoiceSubTab('all')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  invoiceSubTab === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                All Invoices
              </button>
            </div>
          </div>

          {/* Filter Panel (All Invoices sub-tab) */}
          {invoiceSubTab === 'all' && (
            <>
              <div className="card p-4 mb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Pharmacy</label>
                    <select value={filters.pharmacyId} onChange={e => setFilters(prev => ({ ...prev, pharmacyId: e.target.value }))} className="input-field text-sm">
                      <option value="">All Pharmacies</option>
                      {filterOptions.pharmacies.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Type</label>
                    <select value={filters.invoiceTypeId} onChange={e => setFilters(prev => ({ ...prev, invoiceTypeId: e.target.value }))} className="input-field text-sm">
                      <option value="">All Types</option>
                      {filterOptions.invoiceTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
                    <input type="month" value={filters.month} onChange={e => setFilters(prev => ({ ...prev, month: e.target.value }))} className="input-field text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Vendor</label>
                    <input type="text" placeholder="Search vendor..." value={filters.vendorNameContains} onChange={e => setFilters(prev => ({ ...prev, vendorNameContains: e.target.value }))} className="input-field text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Amount Min</label>
                    <input type="number" placeholder="Min $" value={filters.amountMin} onChange={e => setFilters(prev => ({ ...prev, amountMin: e.target.value }))} className="input-field text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Amount Max</label>
                    <input type="number" placeholder="Max $" value={filters.amountMax} onChange={e => setFilters(prev => ({ ...prev, amountMax: e.target.value }))} className="input-field text-sm" />
                  </div>
                </div>

                {/* Status Toggles */}
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
                  <div className="flex flex-wrap gap-2">
                    {['DRAFT', 'SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'SCHEDULED', 'PAID', 'REJECTED'].map(status => (
                      <button
                        key={status}
                        onClick={() => toggleStatus(status)}
                        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                          filters.statusIn.includes(status) ? STATUS_COLORS[status] : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {status.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Filters */}
                <div className="mt-3 flex flex-wrap gap-4">
                  <label className="inline-flex items-center">
                    <input type="checkbox" checked={filters.overdueOnly} onChange={e => setFilters(prev => ({ ...prev, overdueOnly: e.target.checked }))} className="rounded border-gray-300 text-primary focus:ring-primary" />
                    <span className="ml-2 text-sm text-gray-700">Overdue Only</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input type="checkbox" checked={filters.needsReview} onChange={e => setFilters(prev => ({ ...prev, needsReview: e.target.checked }))} className="rounded border-gray-300 text-primary focus:ring-primary" />
                    <span className="ml-2 text-sm text-gray-700">Needs Review</span>
                  </label>
                </div>
              </div>

              {/* Active Filter Chips */}
              {activeChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="text-sm text-gray-500">Filters:</span>
                  {activeChips.map(chip => (
                    <span key={chip.key} className="inline-flex items-center gap-1 px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm">
                      <span className="font-medium">{chip.label}:</span> {String(chip.value)}
                      <button onClick={() => removeChip(chip.key)} className="ml-1 hover:text-primary-900">×</button>
                    </span>
                  ))}
                  <button onClick={clearAllFilters} className="text-sm text-gray-500 hover:text-gray-700 underline">Clear all</button>
                </div>
              )}
            </>
          )}

          {/* Invoice Table */}
          <InvoiceTable
            invoices={invoiceSubTab === 'pending' ? pendingInvoices : allInvoices}
            loading={invoiceSubTab === 'pending' ? loadingInvoices : loadingAllInvoices}
            emptyTitle={invoiceSubTab === 'pending' ? 'No Pending Invoices' : 'No Invoices Found'}
            emptyMessage={invoiceSubTab === 'pending' ? 'All caught up! No invoices require approval.' : 'No invoices match the selected filters.'}
            onAction={handleAction}
            onReview={setSelectedInvoice}
            processingAction={processingAction}
          />

          {/* Pagination (All Invoices) */}
          {invoiceSubTab === 'all' && invoiceTotalCount > invoiceLimit && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-500">
                Showing {(invoicePage - 1) * invoiceLimit + 1} - {Math.min(invoicePage * invoiceLimit, invoiceTotalCount)} of {invoiceTotalCount}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setInvoicePage(p => Math.max(1, p - 1))} disabled={invoicePage === 1} className="btn-secondary text-sm disabled:opacity-50">Previous</button>
                <button onClick={() => setInvoicePage(p => p + 1)} disabled={invoicePage * invoiceLimit >= invoiceTotalCount} className="btn-secondary text-sm disabled:opacity-50">Next</button>
              </div>
            </div>
          )}

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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Action Notes</label>
                    <textarea
                      value={actionNotes}
                      onChange={e => setActionNotes(e.target.value)}
                      rows={3}
                      placeholder="Add notes for your decision (required for Needs Info or Reject)"
                      className="input-field"
                    />
                  </div>
                </div>
                <div className="p-6 border-t bg-gray-50 flex justify-between">
                  <button onClick={() => { setSelectedInvoice(null); setActionNotes(''); }} className="btn-secondary">Cancel</button>
                  <div className="flex gap-2">
                    <button onClick={() => handleAction('reject', selectedInvoice.id)} disabled={processingAction !== null} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm">Reject</button>
                    <button onClick={() => handleAction('needs-info', selectedInvoice.id)} disabled={processingAction !== null} className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 text-sm">Needs Info</button>
                    <button onClick={() => handleAction('approve', selectedInvoice.id)} disabled={processingAction !== null} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm">Approve</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* ANALYTICS TAB                                      */}
      {/* ═══════════════════════════════════════════════════ */}
      {mainTab === 'analytics' && (
        <>
          {/* Analytics Controls */}
          <div className="card p-4 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Pharmacy</label>
                <select value={filters.pharmacyId} onChange={e => setFilters(prev => ({ ...prev, pharmacyId: e.target.value }))} className="input-field text-sm">
                  <option value="">All Pharmacies</option>
                  {filterOptions.pharmacies.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Type</label>
                <select value={filters.invoiceTypeId} onChange={e => setFilters(prev => ({ ...prev, invoiceTypeId: e.target.value }))} className="input-field text-sm">
                  <option value="">All Types</option>
                  {filterOptions.invoiceTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
                <input type="month" value={filters.month} onChange={e => setFilters(prev => ({ ...prev, month: e.target.value }))} className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Vendor</label>
                <input type="text" placeholder="Search vendor..." value={filters.vendorNameContains} onChange={e => setFilters(prev => ({ ...prev, vendorNameContains: e.target.value }))} className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Group By</label>
                <select value={groupBy} onChange={e => setGroupBy(e.target.value)} className="input-field text-sm">
                  <option value="">No grouping</option>
                  <option value="pharmacy">Pharmacy</option>
                  <option value="invoiceType">Invoice Type</option>
                  <option value="status">Status</option>
                  <option value="vendor">Vendor</option>
                </select>
              </div>
            </div>

            {/* Status Toggles */}
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
              <div className="flex flex-wrap gap-2">
                {['DRAFT', 'SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'SCHEDULED', 'PAID', 'REJECTED'].map(status => (
                  <button
                    key={status}
                    onClick={() => toggleStatus(status)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      filters.statusIn.includes(status) ? STATUS_COLORS[status] : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {status.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Active Filter Chips */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-sm text-gray-500">Filters:</span>
              {activeChips.map(chip => (
                <span key={chip.key} className="inline-flex items-center gap-1 px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm">
                  <span className="font-medium">{chip.label}:</span> {String(chip.value)}
                  <button onClick={() => removeChip(chip.key)} className="ml-1 hover:text-primary-900">×</button>
                </span>
              ))}
              <button onClick={clearAllFilters} className="text-sm text-gray-500 hover:text-gray-700 underline">Clear all</button>
            </div>
          )}

          {loadingSummary ? (
            <div className="card p-8 text-center text-gray-500">Loading analytics...</div>
          ) : summary ? (
            <div className="space-y-6">
              {/* Overall Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card p-4">
                  <div className="text-2xl font-bold text-gray-900">{summary.overall.count}</div>
                  <div className="text-sm text-gray-500">Total Invoices</div>
                </div>
                <div className="card p-4">
                  <div className="text-2xl font-bold text-primary-600">{formatCurrency(summary.overall.sumAmount)}</div>
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
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-sm font-heading font-semibold text-gray-900">
                      Breakdown by {groupBy || 'Group'}
                    </h3>
                  </div>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{groupBy || 'Group'}</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Count</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Average</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {summary.groups.map(group => (
                        <tr key={group.groupKey} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{group.groupLabel}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">{group.metrics.count}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">{formatCurrency(group.metrics.sumAmount)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-600">{formatCurrency(group.metrics.sumPaid)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">{formatCurrency(group.metrics.avgAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-8 text-center text-gray-400">No analytics data available</div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* COMPLIANCE TAB                                     */}
      {/* ═══════════════════════════════════════════════════ */}
      {mainTab === 'compliance' && (
        <>
          {/* Compliance Header Controls */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="input-field py-2 text-sm"
              >
                {generateMonthOptions().map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button onClick={runEvaluation} className="btn-secondary text-sm">
                Run Evaluation
              </button>
            </div>
          </div>

          {complianceError && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">
              {complianceError}
            </div>
          )}

          {loadingCompliance ? (
            <div className="card p-8 text-center text-gray-500">Loading compliance data...</div>
          ) : slaSummary ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="card p-4">
                  <div className="text-2xl font-bold text-gray-900">{slaSummary.totalPharmacies}</div>
                  <div className="text-sm text-gray-500">Total Pharmacies</div>
                </div>
                <div className="card p-4">
                  <div className="text-2xl font-bold text-green-600">{slaSummary.compliant}</div>
                  <div className="text-sm text-gray-500">Compliant</div>
                </div>
                <div className="card p-4">
                  <div className="text-2xl font-bold text-red-600">{slaSummary.nonCompliant}</div>
                  <div className="text-sm text-gray-500">Non-Compliant</div>
                </div>
                <div className="card p-4">
                  <div className="text-2xl font-bold text-yellow-600">{slaSummary.pending}</div>
                  <div className="text-sm text-gray-500">Pending</div>
                </div>
              </div>

              {/* Compliance Progress Bar */}
              <div className="card p-5 mb-6">
                <h3 className="text-sm font-heading font-semibold text-gray-900 mb-3">Compliance Rate</h3>
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all rounded-full"
                      style={{
                        width: `${slaSummary.totalPharmacies > 0
                          ? (slaSummary.compliant / slaSummary.totalPharmacies) * 100
                          : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-lg font-semibold text-gray-900">
                    {slaSummary.totalPharmacies > 0
                      ? Math.round((slaSummary.compliant / slaSummary.totalPharmacies) * 100)
                      : 0}%
                  </span>
                </div>
              </div>

              {/* Pharmacy Compliance Table */}
              <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-sm font-heading font-semibold text-gray-900">
                    Pharmacy Compliance Status
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pharmacy</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Processed</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Submission Deadline</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Processing Deadline</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Events</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {slaSummary.pharmacies.map(pharmacy => {
                        const status = getPharmacyStatus(pharmacy);
                        return (
                          <tr key={pharmacy.pharmacyId} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-medium text-gray-900">{pharmacy.pharmacyName}</div>
                              <div className="text-sm text-gray-500">{pharmacy.pharmacyCode}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${COMPLIANCE_BADGES[status]}`}>
                                {getStatusLabel(status)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <span className={`font-medium ${pharmacy.submittedCount >= pharmacy.expectedCount ? 'text-green-600' : 'text-gray-900'}`}>
                                {pharmacy.submittedCount}/{pharmacy.expectedCount}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <span className={`font-medium ${pharmacy.processedCount >= pharmacy.expectedCount ? 'text-green-600' : 'text-gray-900'}`}>
                                {pharmacy.processedCount}/{pharmacy.expectedCount}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              {pharmacy.submissionDeadlineMet ? (
                                <span className="text-green-600">&#10003;</span>
                              ) : (
                                <span className="text-red-600">&#10007;</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              {pharmacy.processingDeadlineMet ? (
                                <span className="text-green-600">&#10003;</span>
                              ) : (
                                <span className="text-red-600">&#10007;</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {pharmacy.events.length > 0 ? (
                                <div className="text-sm text-gray-600">
                                  {pharmacy.events.slice(0, 2).map((event, idx) => (
                                    <div key={idx} className="truncate max-w-xs">{event.eventType.replace('_', ' ')}</div>
                                  ))}
                                  {pharmacy.events.length > 2 && (
                                    <div className="text-gray-400">+{pharmacy.events.length - 2} more</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {slaSummary.pharmacies.length === 0 && (
                  <div className="px-6 py-8 text-center text-gray-500">No pharmacies found.</div>
                )}
              </div>
            </>
          ) : (
            <div className="card p-8 text-center text-gray-400">No compliance data available</div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Invoice Table Sub-Component ─────────────────────────────

function InvoiceTable({
  invoices,
  loading: isLoading,
  emptyTitle,
  emptyMessage,
  onAction,
  onReview,
  processingAction,
}: {
  invoices: Invoice[];
  loading: boolean;
  emptyTitle: string;
  emptyMessage: string;
  onAction: (action: 'approve' | 'needs-info' | 'reject' | 'schedule' | 'paid', id: string) => void;
  onReview: (invoice: Invoice) => void;
  processingAction: string | null;
}) {
  if (isLoading) {
    return (
      <div className="card p-8 text-center">
        <div className="flex items-center justify-center gap-3 text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading invoices...</span>
        </div>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="text-gray-300 mb-4">
          <svg className="w-14 h-14 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">{emptyTitle}</h3>
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pharmacy</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                    <Link href={`/dashboard/manager/invoices/${invoice.id}`} className="text-primary-600 hover:text-primary-800">
                      View
                    </Link>
                    {invoice.status === 'SUBMITTED' && (
                      <>
                        <button
                          onClick={() => onAction('approve', invoice.id)}
                          disabled={processingAction === `approve-${invoice.id}`}
                          className="text-green-600 hover:text-green-900"
                        >
                          Approve
                        </button>
                        <button onClick={() => onReview(invoice)} className="text-yellow-600 hover:text-yellow-900">
                          Review
                        </button>
                      </>
                    )}
                    {invoice.status === 'APPROVED' && (
                      <button
                        onClick={() => onAction('schedule', invoice.id)}
                        disabled={processingAction === `schedule-${invoice.id}`}
                        className="text-purple-600 hover:text-purple-900"
                      >
                        Schedule
                      </button>
                    )}
                    {invoice.status === 'SCHEDULED' && (
                      <button
                        onClick={() => onAction('paid', invoice.id)}
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
      </div>
    </div>
  );
}
