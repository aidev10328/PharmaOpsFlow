'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

type Pharmacy = { id: string; name: string; code: string };

const EVENT_TYPE_COLORS: Record<string, string> = {
  SUBMISSION_MISSED: 'bg-red-50 text-red-700',
  PROCESSING_MISSED: 'bg-orange-50 text-orange-700',
  SUBMISSION_REMINDER_SENT: 'bg-blue-50 text-blue-700',
  PROCESSING_REMINDER_SENT: 'bg-blue-50 text-blue-700',
};

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
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
      params.set('limit', '20');
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
    if (user?.role === 'ADMIN') {
      setLoadingData(true);
      Promise.all([fetchSummary(), fetchEvents(1)]).finally(() => setLoadingData(false));
    }
  }, [user, fetchSummary, fetchEvents]);

  if (loading || loadingData) {
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

  const totals = summary?.totals || {};
  const pharmacyData = summary?.pharmacies || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin/oversight" className="text-link text-sm">&larr; Back to Oversight</Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">SLA & Compliance Oversight</h1>
          <p className="text-sm text-gray-500 mt-1">Monthly submission and processing compliance tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin/requirements/compliance" className="btn-secondary text-sm">
            New Requirements System
          </Link>
          <input
            type="month"
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
            className="input-field w-auto text-sm"
          />
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{totals.totalPharmacies || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Total Pharmacies</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{totals.compliantPharmacies || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Compliant</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{(totals.totalPharmacies || 0) - (totals.compliantPharmacies || 0)}</div>
          <div className="text-xs text-gray-500 mt-1">Non-Compliant</div>
        </div>
        <div className="card p-4 text-center">
          <div className={`text-2xl font-bold ${totals.totalPharmacies > 0 ? (totals.compliantPharmacies / totals.totalPharmacies >= 0.9 ? 'text-emerald-600' : totals.compliantPharmacies / totals.totalPharmacies >= 0.7 ? 'text-amber-600' : 'text-red-600') : 'text-gray-400'}`}>
            {totals.totalPharmacies > 0 ? Math.round((totals.compliantPharmacies / totals.totalPharmacies) * 100) : 0}%
          </div>
          <div className="text-xs text-gray-500 mt-1">Compliance Rate</div>
        </div>
      </div>

      {/* Pharmacy Compliance Table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <h3 className="text-sm font-heading font-semibold text-gray-900">Pharmacy Compliance — {monthFilter}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pharmacy</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expected</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Processed</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Compliance</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submission</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Processing</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pharmacyData.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">No data for this month.</td></tr>
              ) : pharmacyData.map((p: any) => (
                <tr key={p.pharmacyId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.pharmacyName}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-500">{p.pharmacyCode}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.totalExpected}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.submittedCount}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.processedCount}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`font-semibold ${p.complianceRate >= 100 ? 'text-emerald-600' : p.complianceRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {p.complianceRate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${p.submissionMissed > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {p.submissionMissed > 0 ? `${p.submissionMissed} missed` : 'Met'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${p.processingMissed > 0 ? 'bg-red-50 text-red-700' : p.pending > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {p.processingMissed > 0 ? `${p.processingMissed} missed` : p.pending > 0 ? `${p.pending} pending` : 'Met'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SLA Events */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="text-sm font-heading font-semibold text-gray-900">SLA Events ({eventsTotalCount})</h3>
            <div className="flex gap-2">
              <select value={pharmacyFilter} onChange={e => { setPharmacyFilter(e.target.value); }} className="input-field text-sm py-1">
                <option value="">All Pharmacies</option>
                {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={eventTypeFilter} onChange={e => { setEventTypeFilter(e.target.value); }} className="input-field text-sm py-1">
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
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pharmacy</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Notes</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Invoice</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {slaEvents.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">No SLA events found.</td></tr>
              ) : slaEvents.map((evt: any) => (
                <tr key={evt.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(evt.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{evt.pharmacy?.name} <span className="text-xs text-gray-400">({evt.pharmacy?.code})</span></td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${EVENT_TYPE_COLORS[evt.eventType] || 'bg-gray-100 text-gray-700'}`}>
                      {evt.eventType.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-500">{evt.yearMonth}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{evt.notes || '-'}</td>
                  <td className="px-4 py-3 text-sm hidden lg:table-cell">
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
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-500">Page {eventsPage} of {eventsTotalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => fetchEvents(eventsPage - 1)} disabled={eventsPage <= 1} className="text-sm px-3 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
              <button onClick={() => fetchEvents(eventsPage + 1)} disabled={eventsPage >= eventsTotalPages} className="text-sm px-3 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
