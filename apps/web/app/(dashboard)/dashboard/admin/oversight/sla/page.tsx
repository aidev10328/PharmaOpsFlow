'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

type Pharmacy = { id: string; name: string; code: string };

type SortConfig = {
  field: string;
  direction: 'asc' | 'desc';
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  SUBMISSION_MISSED: 'bg-red-50 text-red-700',
  PROCESSING_MISSED: 'bg-orange-50 text-orange-700',
  SUBMISSION_REMINDER_SENT: 'bg-blue-50 text-blue-700',
  PROCESSING_REMINDER_SENT: 'bg-blue-50 text-blue-700',
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

export default function SlaOversightPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [monthFilter, setMonthFilter] = useState(defaultMonth);
  const [summary, setSummary] = useState<any>(null);
  const [slaEvents, setSlaEvents] = useState<any[]>([]);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsTotalPages, setEventsTotalPages] = useState(1);
  const [eventsTotalCount, setEventsTotalCount] = useState(0);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [pharmacyFilter, setPharmacyFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [runningEval, setRunningEval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evalResult, setEvalResult] = useState<string | null>(null);

  // Sorting state for pharmacy compliance table
  const [pharmacySort, setPharmacySort] = useState<SortConfig>({ field: 'pharmacyName', direction: 'asc' });
  const [pharmacyPage, setPharmacyPage] = useState(1);
  const pharmacyPageSize = 10;

  // Sorting state for events table
  const [eventsSort, setEventsSort] = useState<SortConfig>({ field: 'createdAt', direction: 'desc' });

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      apiFetch('/v1/admin/pharmacies').then(r => r.ok ? r.json() : []).then(ps =>
        setPharmacies(ps.map((p: any) => ({ id: p.id, name: p.name, code: p.code })))
      );
    }
  }, [user]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await apiFetch(`/v1/admin/oversight/sla/summary?month=${monthFilter}`);
      if (res.ok) setSummary(await res.json());
    } catch { setError('Failed to load SLA summary'); }
  }, [monthFilter]);

  const fetchEvents = useCallback(async (p: number) => {
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('limit', '10');
      params.set('month', monthFilter);
      if (pharmacyFilter) params.set('pharmacyId', pharmacyFilter);
      if (eventTypeFilter) params.set('eventType', eventTypeFilter);
      const res = await apiFetch(`/v1/admin/oversight/sla/events?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSlaEvents(data.data || []);
        setEventsPage(data.page);
        setEventsTotalPages(data.totalPages);
        setEventsTotalCount(data.totalCount);
      }
    } catch { setError('Failed to load SLA events'); }
  }, [monthFilter, pharmacyFilter, eventTypeFilter]);

  useEffect(() => {
    if (user?.role && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      setLoadingData(true);
      setPharmacyPage(1);
      Promise.all([fetchSummary(), fetchEvents(1)]).finally(() => setLoadingData(false));
    }
  }, [user, fetchSummary, fetchEvents]);

  const handlePharmacySort = (field: string) => {
    setPharmacySort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setPharmacyPage(1);
  };

  const handleEventsSort = (field: string) => {
    setEventsSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Sort and paginate pharmacy data
  const sortedPharmacyData = useMemo(() => {
    const data = [...(summary?.pharmacies || [])];
    data.sort((a: any, b: any) => {
      let aVal = a[pharmacySort.field];
      let bVal = b[pharmacySort.field];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return pharmacySort.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return pharmacySort.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [summary?.pharmacies, pharmacySort]);

  const paginatedPharmacyData = useMemo(() => {
    const start = (pharmacyPage - 1) * pharmacyPageSize;
    return sortedPharmacyData.slice(start, start + pharmacyPageSize);
  }, [sortedPharmacyData, pharmacyPage]);

  const pharmacyTotalPages = Math.ceil(sortedPharmacyData.length / pharmacyPageSize);

  // Sort events data (client-side for displayed data)
  const sortedEvents = useMemo(() => {
    const data = [...slaEvents];
    data.sort((a: any, b: any) => {
      let aVal = eventsSort.field === 'createdAt' ? new Date(a.createdAt).getTime() :
                 eventsSort.field === 'pharmacy' ? a.pharmacy?.name || '' : a[eventsSort.field];
      let bVal = eventsSort.field === 'createdAt' ? new Date(b.createdAt).getTime() :
                 eventsSort.field === 'pharmacy' ? b.pharmacy?.name || '' : b[eventsSort.field];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return eventsSort.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return eventsSort.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [slaEvents, eventsSort]);

  const runEvaluation = async () => {
    setRunningEval(true);
    setError(null);
    setEvalResult(null);
    try {
      const res = await apiFetch(`/v1/sla/run?yearMonth=${monthFilter}`, {
        method: 'POST',
      });
      if (res.ok) {
        const result = await res.json();
        setEvalResult(`Evaluated ${result.pharmaciesEvaluated} pharmacies: ${result.submissionViolations} submission violations, ${result.processingViolations} processing violations`);
        // Refresh data
        await Promise.all([fetchSummary(), fetchEvents(1)]);
      } else {
        const data = await res.json();
        setError(data.message || 'Evaluation failed');
      }
    } catch { setError('Failed to run evaluation'); }
    finally { setRunningEval(false); }
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

  const totals = summary?.totals || {};

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-heading font-bold text-gray-900">SLA & Compliance Oversight</h1>
          <p className="text-xs text-gray-500">Monthly submission and processing compliance tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runEvaluation}
            disabled={runningEval}
            className="text-xs px-3 h-8 rounded-md bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm inline-flex items-center"
          >
            {runningEval ? 'Running...' : 'Run Evaluation'}
          </button>
          <Link href="/dashboard/admin/requirements/compliance" className="text-xs px-3 h-8 rounded-md border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm inline-flex items-center">
            Requirements
          </Link>
          <input
            type="month"
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
            className="input-field text-xs h-8 px-2 w-36"
          />
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}
      {evalResult && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs">{evalResult}</div>}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="card p-2.5 text-center">
          <div className="text-lg font-bold text-gray-900">{totals.totalPharmacies || 0}</div>
          <div className="text-[10px] text-gray-500">Total Pharmacies</div>
        </div>
        <div className="card p-2.5 text-center">
          <div className="text-lg font-bold text-emerald-600">{totals.compliantPharmacies || 0}</div>
          <div className="text-[10px] text-gray-500">Compliant</div>
        </div>
        <div className="card p-2.5 text-center">
          <div className="text-lg font-bold text-red-600">{(totals.totalPharmacies || 0) - (totals.compliantPharmacies || 0)}</div>
          <div className="text-[10px] text-gray-500">Non-Compliant</div>
        </div>
        <div className="card p-2.5 text-center">
          <div className={`text-lg font-bold ${totals.totalPharmacies > 0 ? (totals.compliantPharmacies / totals.totalPharmacies >= 0.9 ? 'text-emerald-600' : totals.compliantPharmacies / totals.totalPharmacies >= 0.7 ? 'text-amber-600' : 'text-red-600') : 'text-gray-400'}`}>
            {totals.totalPharmacies > 0 ? Math.round((totals.compliantPharmacies / totals.totalPharmacies) * 100) : 0}%
          </div>
          <div className="text-[10px] text-gray-500">Compliance Rate</div>
        </div>
      </div>

      {/* Pharmacy Compliance Table */}
      <div className="card overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
          <h3 className="text-xs font-heading font-semibold text-gray-900">Pharmacy Compliance — {monthFilter}</h3>
          <span className="text-[10px] text-gray-500">{sortedPharmacyData.length} pharmacies</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <SortableHeader label="Pharmacy" field="pharmacyName" sortConfig={pharmacySort} onSort={handlePharmacySort} />
                <SortableHeader label="Code" field="pharmacyCode" sortConfig={pharmacySort} onSort={handlePharmacySort} className="hidden sm:table-cell" />
                <SortableHeader label="Expected" field="totalExpected" sortConfig={pharmacySort} onSort={handlePharmacySort} className="hidden md:table-cell" />
                <SortableHeader label="Submitted" field="submittedCount" sortConfig={pharmacySort} onSort={handlePharmacySort} className="hidden md:table-cell" />
                <SortableHeader label="Processed" field="processedCount" sortConfig={pharmacySort} onSort={handlePharmacySort} className="hidden lg:table-cell" />
                <SortableHeader label="Rate" field="complianceRate" sortConfig={pharmacySort} onSort={handlePharmacySort} />
                <SortableHeader label="Submission" field="submissionMissed" sortConfig={pharmacySort} onSort={handlePharmacySort} />
                <SortableHeader label="Processing" field="processingMissed" sortConfig={pharmacySort} onSort={handlePharmacySort} />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {paginatedPharmacyData.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No data for this month.</td></tr>
              ) : paginatedPharmacyData.map((p: any) => (
                <tr key={p.pharmacyId} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{p.pharmacyName}</td>
                  <td className="px-3 py-2 font-mono text-gray-500 hidden sm:table-cell">{p.pharmacyCode}</td>
                  <td className="px-3 py-2 text-gray-500 hidden md:table-cell">{p.totalExpected}</td>
                  <td className="px-3 py-2 text-gray-500 hidden md:table-cell">{p.submittedCount}</td>
                  <td className="px-3 py-2 text-gray-500 hidden lg:table-cell">{p.processedCount}</td>
                  <td className="px-3 py-2">
                    <span className={`font-semibold ${p.complianceRate >= 100 ? 'text-emerald-600' : p.complianceRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {p.complianceRate}%
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      p.submissionMissed > 0 ? 'bg-red-50 text-red-700' :
                      p.submittedCount === 0 && p.totalExpected > 0 ? 'bg-gray-100 text-gray-500' :
                      'bg-emerald-50 text-emerald-700'
                    }`}>
                      {p.submissionMissed > 0 ? `${p.submissionMissed} miss` :
                       p.submittedCount === 0 && p.totalExpected > 0 ? 'None' : 'Met'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      p.processingMissed > 0 ? 'bg-red-50 text-red-700' :
                      p.submittedCount === 0 && p.totalExpected > 0 ? 'bg-gray-100 text-gray-500' :
                      p.pending > 0 ? 'bg-amber-50 text-amber-700' :
                      'bg-emerald-50 text-emerald-700'
                    }`}>
                      {p.processingMissed > 0 ? `${p.processingMissed} miss` :
                       p.submittedCount === 0 && p.totalExpected > 0 ? 'N/A' :
                       p.pending > 0 ? `${p.pending} pend` : 'Met'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pharmacyTotalPages > 1 && (
          <div className="px-3 py-2 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-500">Page {pharmacyPage} of {pharmacyTotalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPharmacyPage(p => Math.max(1, p - 1))} disabled={pharmacyPage <= 1} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
              <button onClick={() => setPharmacyPage(p => Math.min(pharmacyTotalPages, p + 1))} disabled={pharmacyPage >= pharmacyTotalPages} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* SLA Events */}
      <div className="card overflow-hidden mt-6">
        <div className="px-3 py-2 bg-gray-50 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h3 className="text-xs font-heading font-semibold text-gray-900">SLA Events ({eventsTotalCount})</h3>
            <div className="flex gap-1">
              <select value={pharmacyFilter} onChange={e => { setPharmacyFilter(e.target.value); }} className="input-field text-xs py-1">
                <option value="">All Pharmacies</option>
                {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={eventTypeFilter} onChange={e => { setEventTypeFilter(e.target.value); }} className="input-field text-xs py-1">
                <option value="">All Types</option>
                <option value="SUBMISSION_MISSED">Submission Missed</option>
                <option value="PROCESSING_MISSED">Processing Missed</option>
                <option value="SUBMISSION_REMINDER_SENT">Submission Reminder</option>
                <option value="PROCESSING_REMINDER_SENT">Processing Reminder</option>
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <SortableHeader label="Date" field="createdAt" sortConfig={eventsSort} onSort={handleEventsSort} />
                <SortableHeader label="Pharmacy" field="pharmacy" sortConfig={eventsSort} onSort={handleEventsSort} />
                <SortableHeader label="Event Type" field="eventType" sortConfig={eventsSort} onSort={handleEventsSort} />
                <SortableHeader label="Month" field="yearMonth" sortConfig={eventsSort} onSort={handleEventsSort} />
                <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px] hidden md:table-cell">Notes</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px] hidden lg:table-cell">Invoice</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sortedEvents.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No SLA events found.</td></tr>
              ) : sortedEvents.map((evt: any) => (
                <tr key={evt.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500">{new Date(evt.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-gray-900">{evt.pharmacy?.name} <span className="text-[10px] text-gray-400">({evt.pharmacy?.code})</span></td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${EVENT_TYPE_COLORS[evt.eventType] || 'bg-gray-100 text-gray-700'}`}>
                      {evt.eventType.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-500">{evt.yearMonth}</td>
                  <td className="px-3 py-2 text-gray-500 hidden md:table-cell">{evt.notes || '-'}</td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {evt.invoice ? (
                      <Link href={`/dashboard/admin/oversight/invoices/${evt.invoice.id}`} className="text-primary-600 hover:underline">
                        {evt.invoice.invoiceNumber || evt.invoice.id.slice(0, 8)}
                      </Link>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {eventsTotalPages > 1 && (
          <div className="px-3 py-2 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-500">Page {eventsPage} of {eventsTotalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => fetchEvents(eventsPage - 1)} disabled={eventsPage <= 1} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
              <button onClick={() => fetchEvents(eventsPage + 1)} disabled={eventsPage >= eventsTotalPages} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
