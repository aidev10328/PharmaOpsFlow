'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

type Instance = {
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
  invoice: { id: string; invoiceNumber: string | null; status: string } | null;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  submissionDeadline: string;
  processingDeadline: string;
  status: 'PENDING' | 'SUBMITTED' | 'PROCESSED' | 'OVERDUE' | 'MISSED';
  submittedAt: string | null;
  processedAt: string | null;
  submissionMet: boolean | null;
  processingMet: boolean | null;
};

type Pharmacy = { id: string; name: string; code: string };

type SortConfig = {
  field: string;
  direction: 'asc' | 'desc';
};

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700',
  SUBMITTED: 'bg-blue-50 text-blue-700',
  PROCESSED: 'bg-emerald-50 text-emerald-700',
  OVERDUE: 'bg-orange-50 text-orange-700',
  MISSED: 'bg-red-50 text-red-700',
};

const formatDate = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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

export default function InstancesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [instances, setInstances] = useState<Instance[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [filterPharmacy, setFilterPharmacy] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>(currentMonth());

  // Pagination and sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'submissionDeadline', direction: 'asc' });
  const itemsPerPage = 10;

  // Evaluation
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      router.push('/dashboard');
      return;
    }
  }, [user, loading, router]);

  const fetchInstances = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterPharmacy) params.set('pharmacyId', filterPharmacy);
      if (filterStatus) params.set('status', filterStatus);
      if (filterMonth) params.set('yearMonth', filterMonth);
      const res = await apiFetch(`/v1/requirements/instances?${params.toString()}`);
      if (res.ok) setInstances(await res.json());
    } catch { setError('Failed to load instances'); }
  }, [filterPharmacy, filterStatus, filterMonth]);

  const fetchPharmacies = async () => {
    try {
      const res = await apiFetch('/v1/admin/pharmacies');
      if (res.ok) setPharmacies(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      Promise.all([fetchInstances(), fetchPharmacies()])
        .finally(() => setLoadingData(false));
    }
  }, [user, fetchInstances]);

  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      fetchInstances();
    }
  }, [filterPharmacy, filterStatus, filterMonth, fetchInstances, user]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterPharmacy, filterStatus, filterMonth]);

  const handleSort = (field: string) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
    setCurrentPage(1);
  };

  // Sort and paginate data
  const sortedAndPaginatedData = useMemo(() => {
    const sorted = [...instances].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortConfig.field) {
        case 'pharmacy':
          aVal = a.requirement.pharmacy?.code || '';
          bVal = b.requirement.pharmacy?.code || '';
          break;
        case 'requirement':
          aVal = a.requirement.name || '';
          bVal = b.requirement.name || '';
          break;
        case 'period':
          aVal = a.periodLabel || '';
          bVal = b.periodLabel || '';
          break;
        case 'submissionDeadline':
          aVal = new Date(a.submissionDeadline).getTime();
          bVal = new Date(b.submissionDeadline).getTime();
          break;
        case 'status':
          const statusOrder = { PENDING: 1, OVERDUE: 2, SUBMITTED: 3, PROCESSED: 4, MISSED: 5 };
          aVal = statusOrder[a.status] || 0;
          bVal = statusOrder[b.status] || 0;
          break;
        default:
          aVal = new Date(a.submissionDeadline).getTime();
          bVal = new Date(b.submissionDeadline).getTime();
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });

    const startIndex = (currentPage - 1) * itemsPerPage;
    return sorted.slice(startIndex, startIndex + itemsPerPage);
  }, [instances, sortConfig, currentPage]);

  const totalPages = Math.ceil(instances.length / itemsPerPage);

  const handleEvaluate = async () => {
    setEvaluating(true);
    setError(null);
    setSuccess(null);
    try {
      const params = filterMonth ? `?yearMonth=${filterMonth}` : '';
      const res = await apiFetch(`/v1/requirements/evaluate${params}`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed'); }
      const result = await res.json();
      setSuccess(`Evaluated ${result.evaluated} instances: ${result.overdue} overdue, ${result.missed} missed.`);
      fetchInstances();
    } catch (e: any) { setError(e.message); }
    finally { setEvaluating(false); }
  };

  if (loading || loadingData) {
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

  if (!user || !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-heading font-bold text-gray-900">Instances</h1>
          <p className="text-xs text-gray-500">Track fulfillment of invoice requirements by period ({instances.length} total)</p>
        </div>
        <button onClick={handleEvaluate} disabled={evaluating} className="btn-primary text-xs px-3 py-1.5">
          {evaluating ? 'Evaluating...' : 'Run Evaluation'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs">{success}</div>}

      {/* Filters */}
      <div className="card p-3">
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[130px]">
            <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Month</label>
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="input-field text-xs py-1.5" />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Pharmacy</label>
            <select value={filterPharmacy} onChange={e => setFilterPharmacy(e.target.value)} className="input-field text-xs py-1.5">
              <option value="">All Pharmacies</option>
              {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
            </select>
          </div>
          <div className="w-28">
            <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field text-xs py-1.5">
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="PROCESSED">Processed</option>
              <option value="OVERDUE">Overdue</option>
              <option value="MISSED">Missed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <SortableHeader label="Pharmacy" field="pharmacy" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
                <SortableHeader label="Requirement" field="requirement" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
                <SortableHeader label="Period" field="period" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
                <SortableHeader label="Deadlines" field="submissionDeadline" sortConfig={sortConfig} onSort={handleSort} className="text-left hidden md:table-cell" />
                <SortableHeader label="Status" field="status" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
                <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">Invoice</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sortedAndPaginatedData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                    No instances found. Create requirements to auto-generate instances.
                  </td>
                </tr>
              ) : sortedAndPaginatedData.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-900">{i.requirement.pharmacy.code}</td>
                  <td className="px-3 py-2 text-gray-900">
                    <div className="font-medium">{i.requirement.name}</div>
                    {i.requirement.vendor && <div className="text-[10px] text-gray-400">{i.requirement.vendor.name}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{i.periodLabel}</td>
                  <td className="px-3 py-2 text-gray-500 text-[10px] hidden md:table-cell">
                    <div>Sub: {formatDate(i.submissionDeadline)}</div>
                    <div>Proc: {formatDate(i.processingDeadline)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[i.status] || 'bg-gray-100 text-gray-600'}`}>
                      {i.status}
                    </span>
                    {i.submissionMet === false && <span className="ml-1 text-[10px] text-red-500" title="Submission deadline missed">!</span>}
                    {i.processingMet === false && <span className="ml-1 text-[10px] text-red-500" title="Processing deadline missed">!!</span>}
                  </td>
                  <td className="px-3 py-2">
                    {i.invoice ? (
                      <Link href={`/dashboard/pharmacy/invoices/${i.invoiceId}`} className="text-primary-600 hover:underline text-[10px]">
                        {i.invoice.invoiceNumber || 'View'}
                      </Link>
                    ) : (
                      <span className="text-[10px] text-gray-400">Not linked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="text-[11px] text-gray-500">
              Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, instances.length)} of {instances.length}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 text-[11px] font-medium rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="px-2 text-[11px] text-gray-600">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-[11px] font-medium rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
