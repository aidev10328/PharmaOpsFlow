'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

type ComplianceSummary = {
  pharmacyId: string;
  pharmacyName: string;
  pharmacyCode: string;
  totalRequirements: number;
  pending: number;
  submitted: number;
  processed: number;
  overdue: number;
  missed: number;
  complianceRate: number;
};

type SortConfig = {
  field: string;
  direction: 'asc' | 'desc';
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
      className={`px-3 py-2 font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none ${className}`}
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

export default function CompliancePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [summaries, setSummaries] = useState<ComplianceSummary[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterMonth, setFilterMonth] = useState<string>(currentMonth());

  // Pagination and sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'pharmacyName', direction: 'asc' });
  const itemsPerPage = 10;

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      router.push('/dashboard');
      return;
    }
  }, [user, loading, router]);

  const fetchSummary = useCallback(async () => {
    try {
      const params = filterMonth ? `?yearMonth=${filterMonth}` : '';
      const res = await apiFetch(`/v1/requirements/compliance/summary${params}`);
      if (res.ok) setSummaries(await res.json());
    } catch { setError('Failed to load compliance data'); }
  }, [filterMonth]);

  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      fetchSummary().finally(() => setLoadingData(false));
    }
  }, [user, fetchSummary]);

  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      setLoadingData(true);
      fetchSummary().finally(() => setLoadingData(false));
    }
  }, [filterMonth, fetchSummary, user]);

  // Reset to first page when month changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterMonth]);

  const handleSort = (field: string) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
    setCurrentPage(1);
  };

  // Sort and paginate data
  const sortedAndPaginatedData = useMemo(() => {
    const sorted = [...summaries].sort((a, b) => {
      const aVal = a[sortConfig.field as keyof ComplianceSummary];
      const bVal = b[sortConfig.field as keyof ComplianceSummary];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;
      return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
    });

    const startIndex = (currentPage - 1) * itemsPerPage;
    return sorted.slice(startIndex, startIndex + itemsPerPage);
  }, [summaries, sortConfig, currentPage]);

  const totalPages = Math.ceil(summaries.length / itemsPerPage);

  const totals = summaries.reduce((acc, s) => ({
    totalRequirements: acc.totalRequirements + s.totalRequirements,
    pending: acc.pending + s.pending,
    submitted: acc.submitted + s.submitted,
    processed: acc.processed + s.processed,
    overdue: acc.overdue + s.overdue,
    missed: acc.missed + s.missed,
  }), { totalRequirements: 0, pending: 0, submitted: 0, processed: 0, overdue: 0, missed: 0 });

  const overallRate = totals.totalRequirements > 0
    ? Math.round(((totals.processed + totals.submitted) / totals.totalRequirements) * 100)
    : 100;

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
    <div className="max-w-6xl mx-auto space-y-3">

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-heading font-bold text-gray-900">Compliance Summary</h1>
          <p className="text-xs text-gray-500">Track requirement fulfillment across pharmacies</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-600">Period:</label>
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="input-field text-xs py-1.5 w-36" />
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}

      {/* Overall Summary */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <div className="card p-2.5">
          <div className="text-[10px] text-gray-500 uppercase">Total</div>
          <div className="text-lg font-bold text-gray-900">{totals.totalRequirements}</div>
        </div>
        <div className="card p-2.5">
          <div className="text-[10px] text-gray-500 uppercase">Pending</div>
          <div className="text-lg font-bold text-yellow-600">{totals.pending}</div>
        </div>
        <div className="card p-2.5">
          <div className="text-[10px] text-gray-500 uppercase">Submitted</div>
          <div className="text-lg font-bold text-blue-600">{totals.submitted}</div>
        </div>
        <div className="card p-2.5">
          <div className="text-[10px] text-gray-500 uppercase">Processed</div>
          <div className="text-lg font-bold text-emerald-600">{totals.processed}</div>
        </div>
        <div className="card p-2.5">
          <div className="text-[10px] text-gray-500 uppercase">Overdue</div>
          <div className="text-lg font-bold text-orange-600">{totals.overdue}</div>
        </div>
        <div className="card p-2.5">
          <div className="text-[10px] text-gray-500 uppercase">Missed</div>
          <div className="text-lg font-bold text-red-600">{totals.missed}</div>
        </div>
      </div>

      {/* Compliance Rate Bar */}
      <div className="card p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-700">Overall Compliance Rate</span>
          <span className="text-xs font-bold text-gray-900">{overallRate}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full ${overallRate >= 80 ? 'bg-emerald-500' : overallRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${overallRate}%` }}
          />
        </div>
      </div>

      {/* Per-Pharmacy Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader label="Pharmacy" field="pharmacyName" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
                <SortableHeader label="Total" field="totalRequirements" sortConfig={sortConfig} onSort={handleSort} className="text-center" />
                <SortableHeader label="Pending" field="pending" sortConfig={sortConfig} onSort={handleSort} className="text-center hidden sm:table-cell" />
                <SortableHeader label="Submitted" field="submitted" sortConfig={sortConfig} onSort={handleSort} className="text-center hidden sm:table-cell" />
                <SortableHeader label="Processed" field="processed" sortConfig={sortConfig} onSort={handleSort} className="text-center hidden md:table-cell" />
                <SortableHeader label="Overdue" field="overdue" sortConfig={sortConfig} onSort={handleSort} className="text-center" />
                <SortableHeader label="Missed" field="missed" sortConfig={sortConfig} onSort={handleSort} className="text-center" />
                <SortableHeader label="Rate" field="complianceRate" sortConfig={sortConfig} onSort={handleSort} className="text-center" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sortedAndPaginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                    No compliance data available. Generate requirement instances first.
                  </td>
                </tr>
              ) : sortedAndPaginatedData.map((s) => (
                <tr key={s.pharmacyId} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{s.pharmacyName}</div>
                    <div className="text-[10px] text-gray-400">{s.pharmacyCode}</div>
                  </td>
                  <td className="px-3 py-2 text-center text-gray-700">{s.totalRequirements}</td>
                  <td className="px-3 py-2 text-center hidden sm:table-cell">
                    <span className={s.pending > 0 ? 'text-yellow-600 font-medium' : 'text-gray-400'}>{s.pending}</span>
                  </td>
                  <td className="px-3 py-2 text-center hidden sm:table-cell">
                    <span className={s.submitted > 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}>{s.submitted}</span>
                  </td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">
                    <span className={s.processed > 0 ? 'text-emerald-600 font-medium' : 'text-gray-400'}>{s.processed}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={s.overdue > 0 ? 'text-orange-600 font-medium' : 'text-gray-400'}>{s.overdue}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={s.missed > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>{s.missed}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      s.complianceRate >= 80 ? 'bg-emerald-50 text-emerald-700' :
                      s.complianceRate >= 50 ? 'bg-yellow-50 text-yellow-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      {s.complianceRate}%
                    </span>
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
              Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, summaries.length)} of {summaries.length}
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

      {/* Actions */}
      <div className="flex gap-1.5">
        <Link href="/dashboard/admin/requirements/instances" className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm">View Instances</Link>
        <Link href="/dashboard/admin/requirements" className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm">Manage Requirements</Link>
      </div>
    </div>
  );
}
