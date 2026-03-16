'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../../../../../lib/api';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const InvoiceCalendarView = dynamic(() => import('../../../../../components/invoice/InvoiceCalendarView'), { ssr: false });

type SortConfig = {
  field: string;
  direction: 'asc' | 'desc';
};

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
  vendors: Vendor[];
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

// ─── Vendor Autocomplete Component ────────────────────────────

function VendorAutocomplete({ value, onChange, vendors }: { value: string; onChange: (val: string) => void; vendors: Vendor[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = value.length >= 3
    ? vendors.filter(v => v.name.toLowerCase().includes(value.toLowerCase()))
    : [];

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        placeholder="Type 3+ letters..."
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (value.length >= 3) setOpen(true); }}
        className="input-field text-xs py-1.5 w-full"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => { onChange(v.name); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-primary-50 hover:text-primary-700 truncate"
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
      {open && value.length >= 3 && filtered.length === 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-xs text-gray-400">
          No vendors found
        </div>
      )}
    </div>
  );
}

// ─── Sortable Header Component ────────────────────────────────

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
      className={`px-3 py-2 font-semibold text-gray-700 uppercase text-[11px] cursor-pointer hover:bg-gray-200 select-none ${className}`}
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

// ─── Main Component ──────────────────────────────────────────

export default function ManagerOperationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Top-level tab
  const [mainTab, setMainTab] = useState<'invoices' | 'analytics' | 'compliance'>('invoices');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // ─── Invoices Tab State ──────────────────────────────────
  const [invoiceSubTab, setInvoiceSubTab] = useState<'pending' | 'all'>('pending');
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionDate, setActionDate] = useState('');
  const [actionType, setActionType] = useState<'review' | 'schedule' | 'paid'>('review');
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  // Filters (shared between invoices "all" sub-tab and analytics tab)
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ pharmacies: [], invoiceTypes: [], vendors: [], statuses: [] });
  const [filters, setFilters] = useState({
    pharmacyId: '',
    invoiceTypeId: '',
    statusIn: [] as string[],
    overdueOnly: false,
    needsReview: false,
    month: currentMonth(), // Default to current month
    vendorNameContains: '',
    dueDateFrom: '',
    dueDateTo: '',
    amountMin: '',
    amountMax: '',
    overdueSubmitted: false,
    notProcessedInTime: false,
  });
  const [activeChips, setActiveChips] = useState<FilterChip[]>([]);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceLimit] = useState(10);
  const [invoiceSortConfig, setInvoiceSortConfig] = useState<SortConfig>({ field: 'dueDate', direction: 'asc' });
  const [invoiceTotalCount, setInvoiceTotalCount] = useState(0);
  const [loadingAllInvoices, setLoadingAllInvoices] = useState(false);

  // ─── Analytics Tab State ─────────────────────────────────
  const [groupBy, setGroupBy] = useState<string>('status');
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [analyticsInvoices, setAnalyticsInvoices] = useState<Invoice[]>([]);
  const [loadingAnalyticsInvoices, setLoadingAnalyticsInvoices] = useState(false);

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
      if (filters.statusIn.length > 0) params.append('status', filters.statusIn.join(','));
      if (filters.overdueOnly) params.append('overdueOnly', 'true');
      if (filters.needsReview) params.append('needsReview', 'true');
      if (filters.month) params.append('month', filters.month);
      if (filters.vendorNameContains) params.append('vendorNameContains', filters.vendorNameContains);
      if (filters.dueDateFrom) params.append('dueDateFrom', filters.dueDateFrom);
      if (filters.dueDateTo) params.append('dueDateTo', filters.dueDateTo);
      if (filters.amountMin) params.append('amountMin', filters.amountMin);
      if (filters.amountMax) params.append('amountMax', filters.amountMax);
      params.append('page', String(invoicePage));
      params.append('limit', viewMode === 'calendar' ? '200' : String(invoiceLimit));

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
  }, [filters, invoicePage, invoiceLimit, viewMode]);

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
      if (filters.statusIn.length > 0) params.append('status', filters.statusIn.join(','));
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

  // ─── Analytics: Fetch Invoices (when no grouping) ─────────
  const fetchAnalyticsInvoices = useCallback(async () => {
    setLoadingAnalyticsInvoices(true);
    try {
      const params = new URLSearchParams();
      if (filters.pharmacyId) params.append('pharmacyId', filters.pharmacyId);
      if (filters.invoiceTypeId) params.append('invoiceTypeId', filters.invoiceTypeId);
      if (filters.statusIn.length > 0) params.append('status', filters.statusIn.join(','));
      if (filters.overdueOnly || filters.overdueSubmitted) params.append('overdueOnly', 'true');
      if (filters.month) params.append('month', filters.month);
      if (filters.vendorNameContains) params.append('vendorNameContains', filters.vendorNameContains);
      if (filters.amountMin) params.append('amountMin', filters.amountMin);
      if (filters.amountMax) params.append('amountMax', filters.amountMax);
      params.append('limit', '50');

      const res = await apiFetch(`/explore/invoices?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAnalyticsInvoices(data.rows || []);
      }
    } catch (e) {
      console.error('Failed to fetch analytics invoices:', e);
    } finally {
      setLoadingAnalyticsInvoices(false);
    }
  }, [filters]);

  useEffect(() => {
    if (user && mainTab === 'analytics') {
      fetchSummaryData();
      if (!groupBy) {
        fetchAnalyticsInvoices();
      }
    }
  }, [user, mainTab, fetchSummaryData, groupBy, fetchAnalyticsInvoices]);

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

  const [runningEval, setRunningEval] = useState(false);
  const [evalMessage, setEvalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const runEvaluation = async () => {
    setRunningEval(true);
    setEvalMessage(null);
    try {
      const res = await apiFetch(`/v1/sla/run?yearMonth=${selectedMonth}`, { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        setEvalMessage({ type: 'success', text: `Evaluated ${result.pharmaciesEvaluated} pharmacies: ${result.submissionViolations} submission violations, ${result.processingViolations} processing violations` });
        await fetchCompliance();
      } else {
        const data = await res.json().catch(() => ({}));
        setEvalMessage({ type: 'error', text: data.message || 'Evaluation failed' });
      }
    } catch (e) {
      setEvalMessage({ type: 'error', text: 'Failed to run evaluation' });
    } finally {
      setRunningEval(false);
    }
  };

  // ─── Invoice Actions ─────────────────────────────────────
  const handleAction = async (action: 'approve' | 'needs-info' | 'reject' | 'schedule' | 'paid', invoiceId: string) => {
    if ((action === 'needs-info' || action === 'reject') && !actionNotes.trim()) {
      alert('Please provide notes for this action');
      return;
    }
    if (action === 'schedule' && !actionDate) {
      alert('Please select a scheduled payment date');
      return;
    }
    if (action === 'paid' && !actionDate) {
      alert('Please select the payment date');
      return;
    }
    setProcessingAction(`${action}-${invoiceId}`);
    try {
      const body: Record<string, any> = {};
      if (actionNotes) body.notes = actionNotes;
      if (action === 'schedule' && actionDate) body.scheduledDate = actionDate;
      if (action === 'paid' && actionDate) body.paidDate = actionDate;

      const res = await apiFetch(`/invoices/${invoiceId}/${action}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const approvedInvoice = action === 'approve' ? (selectedInvoice || allInvoices.find(i => i.id === invoiceId) || pendingInvoices.find(i => i.id === invoiceId)) : null;
        setActionNotes('');
        setActionDate('');
        setSelectedInvoice(null);
        setActionType('review');
        await Promise.all([fetchPendingInvoices(), fetchAllInvoices(), fetchStats()]);

        // After approval, immediately show schedule modal
        if (action === 'approve' && approvedInvoice) {
          setSelectedInvoice({ ...approvedInvoice, status: 'APPROVED' });
          setActionType('schedule');
          setActionNotes('');
          setActionDate('');
        }
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

  const openActionModal = (invoice: Invoice, type: 'review' | 'schedule' | 'paid') => {
    setSelectedInvoice(invoice);
    setActionType(type);
    setActionNotes('');
    setActionDate('');
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
    if (filters.overdueSubmitted) chips.push({ key: 'overdueSubmitted', label: 'Overdue Submitted', value: true });
    if (filters.notProcessedInTime) chips.push({ key: 'notProcessedInTime', label: 'Not Processed In Time', value: true });
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
      if (key === 'overdueSubmitted') f.overdueSubmitted = false;
      if (key === 'notProcessedInTime') f.notProcessedInTime = false;
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
      month: currentMonth(), vendorNameContains: '', dueDateFrom: '', dueDateTo: '', amountMin: '', amountMax: '',
      overdueSubmitted: false, notProcessedInTime: false,
    });
  };

  const toggleStatus = (status: string) => {
    setFilters(prev => ({
      ...prev,
      statusIn: prev.statusIn.includes(status) ? prev.statusIn.filter(s => s !== status) : [...prev.statusIn, status],
    }));
    setInvoicePage(1); // Reset to first page when filter changes
  };

  // ─── Compliance Helpers ──────────────────────────────────
  const getPharmacyStatus = (p: PharmacySlaStatus): 'compliant' | 'nonCompliant' | 'pending' => {
    if (p.isMet) return 'compliant';
    if (!p.submissionDeadlineMet || !p.processingDeadlineMet) return 'nonCompliant';
    return 'pending';
  };

  const getStatusLabel = (s: string) => (s === 'compliant' ? 'Compliant' : s === 'nonCompliant' ? 'Non-Compliant' : 'Pending');

  // ─── Invoice Sorting ─────────────────────────────────────
  const handleInvoiceSort = (field: string) => {
    setInvoiceSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortInvoices = (invoiceList: Invoice[]) => {
    return [...invoiceList].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (invoiceSortConfig.field) {
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
        case 'amount':
          aVal = Number(a.amount) || 0;
          bVal = Number(b.amount) || 0;
          break;
        case 'dueDate':
          aVal = new Date(a.dueDate).getTime();
          bVal = new Date(b.dueDate).getTime();
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
        return invoiceSortConfig.direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return invoiceSortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  };

  const sortedPendingInvoices = useMemo(() => sortInvoices(pendingInvoices.filter(inv => inv.status !== 'DRAFT')), [pendingInvoices, invoiceSortConfig]);
  const sortedAllInvoices = useMemo(() => sortInvoices(allInvoices.filter(inv => inv.status !== 'DRAFT')), [allInvoices, invoiceSortConfig]);
  const sortedAnalyticsInvoices = useMemo(() => sortInvoices(analyticsInvoices.filter(inv => inv.status !== 'DRAFT')), [analyticsInvoices, invoiceSortConfig]);

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
      {/* Page Header - Compact */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Operations</h1>
          <p className="text-xs text-gray-500">
            Manage invoices, analytics & compliance
          </p>
        </div>
        <Link href="/dashboard/manager/chat" className="btn-primary text-xs px-3 py-1.5">
          AI Chat
        </Link>
      </div>

      {/* ─── Main Tabs - Prominent ──────────────────────────────────── */}
      <div className="mb-4">
        <nav className="flex gap-2">
          {([
            { key: 'invoices', label: 'Invoices', count: pendingInvoices.length > 0 ? pendingInvoices.length : undefined },
            { key: 'analytics', label: 'Analytics' },
            { key: 'compliance', label: 'Compliance' },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all ${
                mainTab === tab.key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              }`}
            >
              {tab.label}
              {tab.key === 'invoices' && pendingInvoices.length > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full ${
                  mainTab === 'invoices' ? 'bg-white text-primary-600' : 'bg-red-500 text-white'
                }`}>
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
          {/* Month Selector Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input
                type="month"
                value={filters.month}
                onChange={e => { setFilters(prev => ({ ...prev, month: e.target.value })); setInvoicePage(1); }}
                className="input-field text-sm py-1.5 px-3 font-medium"
              />
            </div>
            <span className="text-xs text-gray-500">
              Showing invoices for {filters.month ? new Date(filters.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'all time'}
            </span>
          </div>

          {/* Invoice Stats Bar - Compact (No Draft for manager) */}
          {stats && (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
              {[
                { label: 'Submitted', count: stats.statusCounts?.SUBMITTED || 0, color: 'text-blue-600', accent: 'border-l-2 border-l-blue-500' },
                { label: 'Needs Info', count: stats.statusCounts?.NEEDS_INFO || 0, color: 'text-yellow-600' },
                { label: 'Approved', count: stats.statusCounts?.APPROVED || 0, color: 'text-green-600' },
                { label: 'Scheduled', count: stats.statusCounts?.SCHEDULED || 0, color: 'text-purple-600' },
                { label: 'Paid', count: stats.statusCounts?.PAID || 0, color: 'text-emerald-600' },
                { label: 'Rejected', count: stats.statusCounts?.REJECTED || 0, color: 'text-red-600' },
              ].map(s => (
                <div key={s.label} className={`card p-2 ${s.accent || ''}`}>
                  <div className={`text-base font-bold ${s.color}`}>{s.count}</div>
                  <div className="text-[10px] text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Invoice Sub-Tabs + View Toggle */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex bg-gray-100 rounded p-0.5">
              <button
                onClick={() => setInvoiceSubTab('pending')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  invoiceSubTab === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Pending ({pendingInvoices.length})
              </button>
              <button
                onClick={() => setInvoiceSubTab('all')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  invoiceSubTab === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                All Invoices
              </button>
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

          {/* Filter Panel (All Invoices sub-tab) - Compact */}
          {invoiceSubTab === 'all' && (
            <>
              <div className="card p-3 mb-3">
                {/* Row 1: Main Filters */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-700 mb-1">Pharmacy</label>
                    <select
                      value={filters.pharmacyId}
                      onChange={e => { setFilters(prev => ({ ...prev, pharmacyId: e.target.value })); setInvoicePage(1); }}
                      className="input-field text-xs py-1.5 w-full"
                    >
                      <option value="">All</option>
                      {filterOptions.pharmacies.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-700 mb-1">Invoice Type</label>
                    <select
                      value={filters.invoiceTypeId}
                      onChange={e => { setFilters(prev => ({ ...prev, invoiceTypeId: e.target.value })); setInvoicePage(1); }}
                      className="input-field text-xs py-1.5 w-full"
                    >
                      <option value="">All</option>
                      {filterOptions.invoiceTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-700 mb-1">Vendor</label>
                    <VendorAutocomplete
                      value={filters.vendorNameContains}
                      onChange={val => { setFilters(prev => ({ ...prev, vendorNameContains: val })); setInvoicePage(1); }}
                      vendors={filterOptions.vendors}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-700 mb-1">Min $</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={filters.amountMin}
                      onChange={e => { setFilters(prev => ({ ...prev, amountMin: e.target.value })); setInvoicePage(1); }}
                      className="input-field text-xs py-1.5 w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-700 mb-1">Max $</label>
                    <input
                      type="number"
                      placeholder="∞"
                      value={filters.amountMax}
                      onChange={e => { setFilters(prev => ({ ...prev, amountMax: e.target.value })); setInvoicePage(1); }}
                      className="input-field text-xs py-1.5 w-full"
                    />
                  </div>
                </div>

                {/* Row 2: Status + Quick Filters */}
                <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-medium text-gray-700">Status:</label>
                    <div className="flex flex-wrap gap-1">
                      {['SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'SCHEDULED', 'PAID', 'REJECTED'].map(status => (
                        <button
                          key={status}
                          onClick={() => toggleStatus(status)}
                          className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${
                            filters.statusIn.includes(status) ? STATUS_COLORS[status] : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {status.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-auto">
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.overdueOnly}
                        onChange={e => { setFilters(prev => ({ ...prev, overdueOnly: e.target.checked })); setInvoicePage(1); }}
                        className="rounded border-gray-300 text-primary focus:ring-primary w-3 h-3"
                      />
                      <span className="ml-1.5 text-xs text-gray-700">Overdue</span>
                    </label>
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.needsReview}
                        onChange={e => { setFilters(prev => ({ ...prev, needsReview: e.target.checked })); setInvoicePage(1); }}
                        className="rounded border-gray-300 text-primary focus:ring-primary w-3 h-3"
                      />
                      <span className="ml-1.5 text-xs text-gray-700">Needs Review</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Active Filter Chips - Compact */}
              {activeChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <span className="text-xs text-gray-500">Filters:</span>
                  {activeChips.map(chip => (
                    <span key={chip.key} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full text-[10px]">
                      <span className="font-medium">{chip.label}:</span> {String(chip.value)}
                      <button onClick={() => removeChip(chip.key)} className="ml-0.5 hover:text-primary-900">×</button>
                    </span>
                  ))}
                  <button onClick={clearAllFilters} className="text-[10px] text-gray-500 hover:text-gray-700 underline">Clear</button>
                </div>
              )}
            </>
          )}

          {/* Calendar View */}
          {viewMode === 'calendar' && (
            <InvoiceCalendarView
              invoices={invoiceSubTab === 'pending' ? sortedPendingInvoices : sortedAllInvoices}
              monthFilter={filters.month || new Date().toISOString().slice(0, 7)}
              isManager={true}
              formatCurrency={formatCurrency}
              basePath="/dashboard/manager/invoices"
              onMonthChange={(m) => setFilters(prev => ({ ...prev, month: m }))}
            />
          )}

          {/* Invoice Table */}
          {viewMode === 'list' && <InvoiceTable
            invoices={invoiceSubTab === 'pending' ? sortedPendingInvoices : sortedAllInvoices}
            loading={invoiceSubTab === 'pending' ? loadingInvoices : loadingAllInvoices}
            emptyTitle={invoiceSubTab === 'pending' ? 'No Pending Invoices' : 'No Invoices Found'}
            emptyMessage={invoiceSubTab === 'pending' ? 'All caught up! No invoices need your action.' : 'No invoices match the selected filters.'}
            onAction={handleAction}
            onReview={(invoice) => openActionModal(invoice, 'review')}
            onSchedule={(invoice) => openActionModal(invoice, 'schedule')}
            onPaid={(invoice) => openActionModal(invoice, 'paid')}
            processingAction={processingAction}
            sortConfig={invoiceSortConfig}
            onSort={handleInvoiceSort}
          />}

          {/* Pagination (All Invoices) - Compact */}
          {invoiceSubTab === 'all' && invoiceTotalCount > invoiceLimit && (
            <div className="flex items-center justify-between mt-3 px-2">
              <div className="text-[11px] text-gray-500">
                {(invoicePage - 1) * invoiceLimit + 1}-{Math.min(invoicePage * invoiceLimit, invoiceTotalCount)} of {invoiceTotalCount}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setInvoicePage(p => Math.max(1, p - 1))} disabled={invoicePage === 1} className="btn-secondary text-[11px] py-1 px-2 disabled:opacity-50">Prev</button>
                <button onClick={() => setInvoicePage(p => p + 1)} disabled={invoicePage * invoiceLimit >= invoiceTotalCount} className="btn-secondary text-[11px] py-1 px-2 disabled:opacity-50">Next</button>
              </div>
            </div>
          )}

          {/* Action Modal - Review / Schedule / Paid */}
          {selectedInvoice && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl max-w-xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="px-4 py-3 border-b">
                  <h2 className="text-sm font-semibold text-gray-900">
                    {actionType === 'schedule' ? 'Schedule Payment' : actionType === 'paid' ? 'Mark as Paid' : 'Review Invoice'}
                  </h2>
                  {actionType === 'schedule' && selectedInvoice.status === 'APPROVED' && (
                    <p className="text-[10px] text-gray-500 mt-0.5">Invoice approved. Schedule a payment date or cancel to keep as Approved.</p>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase">Invoice #</span>
                      <p className="text-xs font-medium">{selectedInvoice.invoiceNumber}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase">Amount</span>
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(selectedInvoice.amount)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase">Pharmacy</span>
                      <p className="text-xs font-medium">{selectedInvoice.pharmacy.name}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase">Vendor</span>
                      <p className="text-xs font-medium">{selectedInvoice.vendor.name}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase">Invoice Date</span>
                      <p className="text-xs">{formatDate(selectedInvoice.invoiceDate)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase">Due Date</span>
                      <p className={`text-xs ${isOverdue(selectedInvoice.dueDate, selectedInvoice.status) ? 'text-red-600 font-medium' : ''}`}>
                        {formatDate(selectedInvoice.dueDate)}
                        {isOverdue(selectedInvoice.dueDate, selectedInvoice.status) && ' !'}
                      </p>
                    </div>
                  </div>
                  {selectedInvoice.description && (
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase">Description</span>
                      <p className="text-xs">{selectedInvoice.description}</p>
                    </div>
                  )}
                  {selectedInvoice.notes && (
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase">Notes</span>
                      <p className="text-xs text-gray-700">{selectedInvoice.notes}</p>
                    </div>
                  )}

                  {/* Date picker for Schedule / Paid */}
                  {(actionType === 'schedule' || actionType === 'paid') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {actionType === 'schedule' ? 'Scheduled Payment Date *' : 'Payment Date *'}
                      </label>
                      <input
                        type="date"
                        value={actionDate}
                        onChange={e => setActionDate(e.target.value)}
                        className="input-field text-xs py-1.5"
                        required
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {actionType === 'review' ? 'Action Notes' : 'Notes'}{actionType === 'review' ? ' (required for Needs Info/Reject)' : ' (optional)'}
                    </label>
                    <textarea
                      value={actionNotes}
                      onChange={e => setActionNotes(e.target.value)}
                      rows={2}
                      placeholder={actionType === 'review' ? 'Notes (required for Needs Info/Reject)' : 'Optional notes'}
                      className="input-field text-xs py-1.5"
                    />
                  </div>
                </div>
                <div className="px-4 py-3 border-t bg-gray-50 flex justify-between">
                  <button onClick={() => { setSelectedInvoice(null); setActionNotes(''); setActionDate(''); setActionType('review'); }} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                  <div className="flex gap-1.5">
                    {actionType === 'review' && (
                      <>
                        <button onClick={() => handleAction('reject', selectedInvoice.id)} disabled={processingAction !== null} className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-xs">Reject</button>
                        <button onClick={() => handleAction('needs-info', selectedInvoice.id)} disabled={processingAction !== null} className="px-3 py-1.5 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50 text-xs">Needs Info</button>
                        <button onClick={() => handleAction('approve', selectedInvoice.id)} disabled={processingAction !== null} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-xs">Approve</button>
                      </>
                    )}
                    {actionType === 'schedule' && (
                      <button onClick={() => handleAction('schedule', selectedInvoice.id)} disabled={processingAction !== null || !actionDate} className="px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 text-xs">Schedule Payment</button>
                    )}
                    {actionType === 'paid' && (
                      <button onClick={() => handleAction('paid', selectedInvoice.id)} disabled={processingAction !== null || !actionDate} className="px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 text-xs">Mark as Paid</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* ANALYTICS TAB - Compact                           */}
      {/* ═══════════════════════════════════════════════════ */}
      {mainTab === 'analytics' && (
        <>
          {/* Month Selector Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input
                type="month"
                value={filters.month}
                onChange={e => setFilters(prev => ({ ...prev, month: e.target.value }))}
                className="input-field text-sm py-1.5 px-3 font-medium"
              />
            </div>
            <span className="text-xs text-gray-500">
              Analytics for {filters.month ? new Date(filters.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'all time'}
            </span>
          </div>

          {/* Analytics Controls - Compact */}
          <div className="card p-3 mb-4">
            {/* Row 1: Main Filters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-gray-700 mb-1">Pharmacy</label>
                <select
                  value={filters.pharmacyId}
                  onChange={e => setFilters(prev => ({ ...prev, pharmacyId: e.target.value }))}
                  className="input-field text-xs py-1.5 w-full"
                >
                  <option value="">All</option>
                  {filterOptions.pharmacies.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-700 mb-1">Invoice Type</label>
                <select
                  value={filters.invoiceTypeId}
                  onChange={e => setFilters(prev => ({ ...prev, invoiceTypeId: e.target.value }))}
                  className="input-field text-xs py-1.5 w-full"
                >
                  <option value="">All</option>
                  {filterOptions.invoiceTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-700 mb-1">Vendor</label>
                <VendorAutocomplete
                  value={filters.vendorNameContains}
                  onChange={val => setFilters(prev => ({ ...prev, vendorNameContains: val }))}
                  vendors={filterOptions.vendors}
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-700 mb-1">Group By</label>
                <select
                  value={groupBy}
                  onChange={e => setGroupBy(e.target.value)}
                  className="input-field text-xs py-1.5 w-full"
                >
                  <option value="">No grouping</option>
                  <option value="pharmacy">Pharmacy</option>
                  <option value="invoiceType">Invoice Type</option>
                  <option value="status">Status</option>
                  <option value="vendor">Vendor</option>
                </select>
              </div>
            </div>

            {/* Row 2: Status Filters */}
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
              <label className="text-[10px] font-medium text-gray-700">Status:</label>
              <div className="flex flex-wrap gap-1">
                {['SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'SCHEDULED', 'PAID', 'REJECTED'].map(status => (
                  <button
                    key={status}
                    onClick={() => toggleStatus(status)}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${
                      filters.statusIn.includes(status) ? STATUS_COLORS[status] : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {status.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 3: Quick Filters - Overdue & Processing */}
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.overdueSubmitted}
                  onChange={e => setFilters(prev => ({ ...prev, overdueSubmitted: e.target.checked }))}
                  className="rounded border-gray-300 text-primary focus:ring-primary w-3 h-3"
                />
                <span className="ml-1.5 text-xs text-gray-700">Overdue Submitted</span>
              </label>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.notProcessedInTime}
                  onChange={e => setFilters(prev => ({ ...prev, notProcessedInTime: e.target.checked }))}
                  className="rounded border-gray-300 text-primary focus:ring-primary w-3 h-3"
                />
                <span className="ml-1.5 text-xs text-gray-700">Not Processed In Time</span>
              </label>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.overdueOnly}
                  onChange={e => setFilters(prev => ({ ...prev, overdueOnly: e.target.checked }))}
                  className="rounded border-gray-300 text-primary focus:ring-primary w-3 h-3"
                />
                <span className="ml-1.5 text-xs text-gray-700">Overdue (Past Due Date)</span>
              </label>
            </div>
          </div>

          {/* Active Filter Chips - Compact */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="text-xs text-gray-500">Filters:</span>
              {activeChips.map(chip => (
                <span key={chip.key} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full text-[10px]">
                  <span className="font-medium">{chip.label}:</span> {String(chip.value)}
                  <button onClick={() => removeChip(chip.key)} className="ml-0.5 hover:text-primary-900">×</button>
                </span>
              ))}
              <button onClick={clearAllFilters} className="text-[10px] text-gray-500 hover:text-gray-700 underline">Clear</button>
            </div>
          )}

          {loadingSummary ? (
            <div className="card p-6 text-center text-gray-500 text-xs">Loading analytics...</div>
          ) : summary ? (() => {
            // Exclude DRAFT from overall stats for manager view
            const draftGroup = summary.groups.find(g => g.groupKey === 'DRAFT');
            const adjustedOverall = draftGroup ? {
              count: summary.overall.count - draftGroup.metrics.count,
              sumAmount: summary.overall.sumAmount - draftGroup.metrics.sumAmount,
              sumPaid: summary.overall.sumPaid - draftGroup.metrics.sumPaid,
              avgAmount: summary.overall.avgAmount,
            } : summary.overall;
            return (
            <div className="space-y-4">
              {/* Overall Stats - Compact */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="card p-3">
                  <div className="text-lg font-bold text-gray-900">{adjustedOverall.count}</div>
                  <div className="text-[10px] text-gray-500">Total Invoices</div>
                </div>
                <div className="card p-3">
                  <div className="text-lg font-bold text-primary-600">{formatCurrency(adjustedOverall.sumAmount)}</div>
                  <div className="text-[10px] text-gray-500">Total Amount</div>
                </div>
                <div className="card p-3">
                  <div className="text-lg font-bold text-green-600">{formatCurrency(adjustedOverall.sumPaid)}</div>
                  <div className="text-[10px] text-gray-500">Total Paid</div>
                </div>
                <div className="card p-3">
                  <div className="text-lg font-bold text-red-600">{formatCurrency(adjustedOverall.sumAmount - adjustedOverall.sumPaid)}</div>
                  <div className="text-[10px] text-gray-500">Total Unpaid</div>
                </div>
              </div>

              {/* Grouped Data - Compact */}
              {groupBy && summary.groups.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-200">
                    <h3 className="text-xs font-semibold text-gray-900">
                      By {groupBy}
                    </h3>
                  </div>
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-100 border-b-2 border-gray-300">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">{groupBy}</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700 uppercase text-[11px]">Count</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700 uppercase text-[11px]">Total</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700 uppercase text-[11px]">Paid</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700 uppercase text-[11px]">Unpaid</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {summary.groups.filter(group => group.groupKey !== 'DRAFT').map(group => (
                        <tr key={group.groupKey} className="hover:bg-gray-50">
                          <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">{group.groupLabel}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">{group.metrics.count}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">{formatCurrency(group.metrics.sumAmount)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-right text-green-600">{formatCurrency(group.metrics.sumPaid)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-right text-red-600">{formatCurrency(group.metrics.sumAmount - group.metrics.sumPaid)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Invoice List (when no grouping) */}
              {!groupBy && (
                <div className="card overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-200">
                    <h3 className="text-xs font-semibold text-gray-900">
                      All Invoices {analyticsInvoices.length > 0 && `(${analyticsInvoices.length})`}
                    </h3>
                  </div>
                  {loadingAnalyticsInvoices ? (
                    <div className="p-4 text-center text-gray-500 text-xs">Loading invoices...</div>
                  ) : sortedAnalyticsInvoices.length === 0 ? (
                    <div className="p-4 text-center text-gray-400 text-xs">No invoices found</div>
                  ) : (
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-100 border-b-2 border-gray-300">
                        <tr>
                          <SortableHeader label="Invoice" field="invoiceNumber" sortConfig={invoiceSortConfig} onSort={handleInvoiceSort} className="text-left" />
                          <SortableHeader label="Pharmacy" field="pharmacy" sortConfig={invoiceSortConfig} onSort={handleInvoiceSort} className="text-left" />
                          <SortableHeader label="Vendor" field="vendor" sortConfig={invoiceSortConfig} onSort={handleInvoiceSort} className="text-left" />
                          <SortableHeader label="Amount" field="amount" sortConfig={invoiceSortConfig} onSort={handleInvoiceSort} className="text-right" />
                          <th className="px-3 py-2 text-right font-semibold text-gray-700 uppercase text-[11px]">Paid</th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-700 uppercase text-[11px]">Unpaid</th>
                          <SortableHeader label="Status" field="status" sortConfig={invoiceSortConfig} onSort={handleInvoiceSort} className="text-left" />
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {sortedAnalyticsInvoices.map(invoice => (
                          <tr key={invoice.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 whitespace-nowrap">
                              <Link href={`/dashboard/manager/invoices/${invoice.id}`} className="font-medium text-primary-600 hover:text-primary-800">
                                {invoice.invoiceNumber || 'Draft'}
                              </Link>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-900">{invoice.pharmacy?.name || '-'}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-900 truncate max-w-[100px]">{invoice.vendor?.name || '-'}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">{formatCurrency(invoice.amount)}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-right text-green-600">{formatCurrency(invoice.amountPaid || 0)}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-right text-red-600">{formatCurrency(Number(invoice.amount) - Number(invoice.amountPaid || 0))}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${STATUS_COLORS[invoice.status] || 'bg-gray-100 text-gray-800'}`}>
                                {invoice.status.replace('_', ' ')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
            );
          })() : (
            <div className="card p-6 text-center text-gray-400 text-xs">No analytics data available</div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* COMPLIANCE TAB - Compact                          */}
      {/* ═══════════════════════════════════════════════════ */}
      {mainTab === 'compliance' && (
        <>
          {/* Compliance Header Controls - Compact */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="input-field py-1 text-xs"
              >
                {generateMonthOptions().map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button onClick={runEvaluation} disabled={runningEval} className="btn-dark text-xs px-3 py-1.5 whitespace-nowrap disabled:opacity-50">
                {runningEval ? 'Running...' : 'Run Evaluation'}
              </button>
            </div>
          </div>

          {complianceError && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded text-xs mb-4">
              {complianceError}
            </div>
          )}
          {evalMessage && (
            <div className={`px-3 py-2 rounded text-xs mb-4 border ${evalMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
              {evalMessage.text}
            </div>
          )}

          {loadingCompliance ? (
            <div className="card p-6 text-center text-gray-500 text-xs">Loading compliance data...</div>
          ) : slaSummary ? (
            <>
              {/* Summary Cards - Compact */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                <div className="card p-3">
                  <div className="text-lg font-bold text-gray-900">{slaSummary.totalPharmacies}</div>
                  <div className="text-[10px] text-gray-500">Total Pharmacies</div>
                </div>
                <div className="card p-3">
                  <div className="text-lg font-bold text-green-600">{slaSummary.compliant}</div>
                  <div className="text-[10px] text-gray-500">Compliant</div>
                </div>
                <div className="card p-3">
                  <div className="text-lg font-bold text-red-600">{slaSummary.nonCompliant}</div>
                  <div className="text-[10px] text-gray-500">Non-Compliant</div>
                </div>
                <div className="card p-3">
                  <div className="text-lg font-bold text-yellow-600">{slaSummary.pending}</div>
                  <div className="text-[10px] text-gray-500">Pending</div>
                </div>
              </div>

              {/* Compliance Progress Bar - Compact */}
              <div className="card p-3 mb-4">
                <h3 className="text-xs font-semibold text-gray-900 mb-2">Compliance Rate</h3>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all rounded-full"
                      style={{
                        width: `${slaSummary.totalPharmacies > 0
                          ? (slaSummary.compliant / slaSummary.totalPharmacies) * 100
                          : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-900">
                    {slaSummary.totalPharmacies > 0
                      ? Math.round((slaSummary.compliant / slaSummary.totalPharmacies) * 100)
                      : 0}%
                  </span>
                </div>
              </div>

              {/* Pharmacy Compliance Table - Admin Style */}
              <div className="card overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-gray-900">Pharmacy Compliance — {selectedMonth}</h3>
                  <span className="text-[10px] text-gray-500">{slaSummary.pharmacies.length} pharmacies</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-100 border-b-2 border-gray-300">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">Pharmacy</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px] hidden sm:table-cell">Code</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px] hidden md:table-cell">Expected</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px] hidden md:table-cell">Submitted</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px] hidden lg:table-cell">Processed</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">Rate</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">Submission</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">Processing</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {slaSummary.pharmacies.length === 0 ? (
                        <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No data for this month.</td></tr>
                      ) : slaSummary.pharmacies.map(p => {
                        const rate = p.expectedCount > 0 ? Math.round((p.processedCount / p.expectedCount) * 100) : 0;
                        const submissionMissed = p.expectedCount > 0 && !p.submissionDeadlineMet ? p.expectedCount - p.submittedCount : 0;
                        const processingMissed = p.expectedCount > 0 && !p.processingDeadlineMet ? p.expectedCount - p.processedCount : 0;
                        const pending = p.submittedCount - p.processedCount;
                        return (
                          <tr key={p.pharmacyId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-900">{p.pharmacyName}</td>
                            <td className="px-3 py-2 font-mono text-gray-500 hidden sm:table-cell">{p.pharmacyCode}</td>
                            <td className="px-3 py-2 text-gray-500 hidden md:table-cell">{p.expectedCount}</td>
                            <td className="px-3 py-2 text-gray-500 hidden md:table-cell">{p.submittedCount}</td>
                            <td className="px-3 py-2 text-gray-500 hidden lg:table-cell">{p.processedCount}</td>
                            <td className="px-3 py-2">
                              <span className={`font-semibold ${rate >= 100 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                {rate}%
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${submissionMissed > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                {submissionMissed > 0 ? `${submissionMissed} miss` : 'Met'}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${processingMissed > 0 ? 'bg-red-50 text-red-700' : pending > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                {processingMissed > 0 ? `${processingMissed} miss` : pending > 0 ? `${pending} pend` : 'Met'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SLA Events */}
              {slaSummary.pharmacies.some(p => p.events.length > 0) && (
                <div className="card overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b">
                    <h3 className="text-xs font-semibold text-gray-900">
                      SLA Events ({slaSummary.pharmacies.reduce((sum, p) => sum + p.events.length, 0)})
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-100 border-b-2 border-gray-300">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">Date</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">Pharmacy</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">Event Type</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px] hidden md:table-cell">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {slaSummary.pharmacies.flatMap(p =>
                          p.events.map((evt, idx) => (
                            <tr key={`${p.pharmacyId}-${idx}`} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-500">{new Date(evt.createdAt).toLocaleString()}</td>
                              <td className="px-3 py-2 text-gray-900">{p.pharmacyName} <span className="text-[10px] text-gray-400">({p.pharmacyCode})</span></td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                  evt.eventType.includes('MISSED') ? (evt.eventType.includes('SUBMISSION') ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700') : 'bg-blue-50 text-blue-700'
                                }`}>
                                  {evt.eventType.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-500 hidden md:table-cell">{evt.notes || '-'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card p-6 text-center text-gray-400 text-xs">No compliance data available</div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Invoice Table Sub-Component - Compact ─────────────────────────────

function InvoiceTable({
  invoices,
  loading: isLoading,
  emptyTitle,
  emptyMessage,
  onAction,
  onReview,
  onSchedule,
  onPaid,
  processingAction,
  sortConfig,
  onSort,
}: {
  invoices: Invoice[];
  loading: boolean;
  emptyTitle: string;
  emptyMessage: string;
  onAction: (action: 'approve' | 'needs-info' | 'reject' | 'schedule' | 'paid', id: string) => void;
  onReview: (invoice: Invoice) => void;
  onSchedule: (invoice: Invoice) => void;
  onPaid: (invoice: Invoice) => void;
  processingAction: string | null;
  sortConfig: SortConfig;
  onSort: (field: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="card p-6 text-center">
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-xs">Loading invoices...</span>
        </div>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="card p-6 text-center">
        <div className="text-gray-300 mb-3">
          <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xs font-semibold text-gray-900 mb-0.5">{emptyTitle}</h3>
        <p className="text-[10px] text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100 border-b-2 border-gray-300">
            <tr>
              <SortableHeader label="Invoice" field="invoiceNumber" sortConfig={sortConfig} onSort={onSort} className="text-left" />
              <SortableHeader label="Pharmacy" field="pharmacy" sortConfig={sortConfig} onSort={onSort} className="text-left" />
              <SortableHeader label="Vendor" field="vendor" sortConfig={sortConfig} onSort={onSort} className="text-left" />
              <SortableHeader label="Amount" field="amount" sortConfig={sortConfig} onSort={onSort} className="text-right" />
              <SortableHeader label="Due" field="dueDate" sortConfig={sortConfig} onSort={onSort} className="text-left" />
              <SortableHeader label="Status" field="status" sortConfig={sortConfig} onSort={onSort} className="text-left" />
              <th className="px-3 py-2 text-right font-semibold text-gray-700 uppercase text-[11px]">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {invoices.map(invoice => (
              <tr key={invoice.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{invoice.invoiceNumber || <span className="text-gray-400 italic font-normal">Draft</span>}</div>
                  <div className="text-[10px] text-gray-500">{invoice.invoiceType?.name || '-'}</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="text-gray-900">{invoice.pharmacy?.name || '-'}</div>
                  <div className="text-[10px] text-gray-500">{invoice.pharmacy?.code || ''}</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="text-gray-900 truncate max-w-[100px]">{invoice.vendor?.name || '-'}</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right font-medium text-gray-900">
                  {formatCurrency(invoice.amount)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className={`${isOverdue(invoice.dueDate, invoice.status) ? 'text-red-600 font-medium' : 'text-gray-900'}`}>
                    {formatDate(invoice.dueDate)}
                    {isOverdue(invoice.dueDate, invoice.status) && (
                      <span className="ml-1 text-[9px] font-bold text-red-600">!</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${STATUS_COLORS[invoice.status] || 'bg-gray-100 text-gray-800'}`}>
                    {invoice.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  <div className="flex justify-end gap-1.5">
                    <Link href={`/dashboard/manager/invoices/${invoice.id}`} className="text-[11px] font-medium text-primary-600 hover:text-primary-800 px-1.5 py-0.5 rounded hover:bg-primary-50">
                      View
                    </Link>
                    {invoice.status === 'SUBMITTED' && (
                      <>
                        <button
                          onClick={() => onAction('approve', invoice.id)}
                          disabled={processingAction === `approve-${invoice.id}`}
                          className="text-[11px] font-medium text-white bg-green-600 hover:bg-green-700 px-2 py-0.5 rounded disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => onReview(invoice)}
                          className="text-[11px] font-medium text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => onReview(invoice)}
                          className="text-[11px] font-medium text-white bg-yellow-500 hover:bg-yellow-600 px-2 py-0.5 rounded"
                        >
                          Info?
                        </button>
                      </>
                    )}
                    {invoice.status === 'APPROVED' && (
                      <button
                        onClick={() => onSchedule(invoice)}
                        className="text-[11px] font-medium text-white bg-purple-600 hover:bg-purple-700 px-2 py-0.5 rounded"
                      >
                        Schedule
                      </button>
                    )}
                    {invoice.status === 'SCHEDULED' && (
                      <button
                        onClick={() => onPaid(invoice)}
                        className="text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-0.5 rounded"
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
