'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

type Pharmacy = { id: string; name: string; code: string };

const CHANNEL_COLORS: Record<string, string> = {
  email: 'bg-blue-50 text-blue-700',
  webhook: 'bg-purple-50 text-purple-700',
  in_app: 'bg-teal-50 text-teal-700',
};

export default function NotificationLogsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [notifications, setNotifications] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [channelFilter, setChannelFilter] = useState('');
  const [pharmacyFilter, setPharmacyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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

  const fetchNotifications = useCallback(async (p: number) => {
    setLoadingData(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('limit', '20');
      if (channelFilter) params.set('channel', channelFilter);
      if (pharmacyFilter) params.set('pharmacyId', pharmacyFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await apiFetch(`/v1/admin/oversight/notifications?${params}`);
      if (!res.ok) throw new Error('Failed to load notifications');
      const data = await res.json();
      setNotifications(data.data || []);
      setTotalCount(data.totalCount || 0);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
    } catch (e: any) { setError(e.message); }
    finally { setLoadingData(false); }
  }, [channelFilter, pharmacyFilter, typeFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (user?.role === 'ADMIN') fetchNotifications(1);
  }, [user, fetchNotifications]);

  const handleClear = () => {
    setChannelFilter(''); setPharmacyFilter(''); setTypeFilter('');
    setDateFrom(''); setDateTo('');
  };

  const getDeliveryStatus = (n: any) => {
    if (n.failedAt) return { label: 'Failed', color: 'bg-red-50 text-red-700' };
    if (n.deliveredAt) return { label: 'Delivered', color: 'bg-emerald-50 text-emerald-700' };
    return { label: 'Sent', color: 'bg-blue-50 text-blue-700' };
  };

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

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin/oversight" className="text-link text-sm">&larr; Back to Oversight</Link>
      </div>

      <div>
        <h1 className="page-title">Notification Logs</h1>
        <p className="text-sm text-gray-500 mt-1">Delivery status and history of all system notifications — {totalCount} total</p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} className="input-field text-sm">
            <option value="">All Channels</option>
            <option value="email">Email</option>
            <option value="webhook">Webhook</option>
            <option value="in_app">In-App</option>
          </select>
          <select value={pharmacyFilter} onChange={e => setPharmacyFilter(e.target.value)} className="input-field text-sm">
            <option value="">All Pharmacies</option>
            {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input-field text-sm">
            <option value="">All Types</option>
            <option value="sla_reminder">SLA Reminder</option>
            <option value="sla_violation">SLA Violation</option>
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field text-sm" placeholder="From" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field text-sm" placeholder="To" />
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => fetchNotifications(1)} className="btn-primary text-sm">Apply</button>
          <button onClick={handleClear} className="text-sm px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-100">Clear</button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sent At</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Channel</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pharmacy</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Error</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loadingData ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">Loading...</td></tr>
              ) : notifications.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">No notifications found.</td></tr>
              ) : notifications.map((n: any) => {
                const status = getDeliveryStatus(n);
                return (
                  <tr key={n.id} className={`hover:bg-gray-50 ${n.failedAt ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(n.sentAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${CHANNEL_COLORS[n.channel] || 'bg-gray-100 text-gray-700'}`}>
                        {n.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{n.type}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{n.pharmacy?.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell max-w-xs truncate">{n.subject || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-red-600 hidden lg:table-cell max-w-xs truncate">{n.errorMessage || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-500">Page {page} of {totalPages} ({totalCount} total)</span>
            <div className="flex gap-2">
              <button onClick={() => fetchNotifications(page - 1)} disabled={page <= 1} className="text-sm px-3 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
              <button onClick={() => fetchNotifications(page + 1)} disabled={page >= totalPages} className="text-sm px-3 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
