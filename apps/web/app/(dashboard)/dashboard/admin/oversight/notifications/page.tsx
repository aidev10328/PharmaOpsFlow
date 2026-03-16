'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '../../../../../../lib/api';

type Pharmacy = { id: string; name: string; code: string };

type SortConfig = {
  field: string;
  direction: 'asc' | 'desc';
};

const CHANNEL_COLORS: Record<string, string> = {
  email: 'bg-blue-50 text-blue-700',
  webhook: 'bg-purple-50 text-purple-700',
  in_app: 'bg-teal-50 text-teal-700',
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

  // Sorting state
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'sentAt', direction: 'desc' });

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

  const fetchNotifications = useCallback(async (p: number) => {
    setLoadingData(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('limit', '10');
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
    if (user?.role && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) fetchNotifications(1);
  }, [user, fetchNotifications]);

  const handleClear = () => {
    setChannelFilter(''); setPharmacyFilter(''); setTypeFilter('');
    setDateFrom(''); setDateTo('');
  };

  const handleSort = (field: string) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Sort notifications client-side
  const sortedNotifications = useMemo(() => {
    const data = [...notifications];
    data.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (sortConfig.field) {
        case 'sentAt':
          aVal = new Date(a.sentAt).getTime();
          bVal = new Date(b.sentAt).getTime();
          break;
        case 'pharmacy':
          aVal = a.pharmacy?.name || '';
          bVal = b.pharmacy?.name || '';
          break;
        case 'channel':
          aVal = a.channel || '';
          bVal = b.channel || '';
          break;
        case 'type':
          aVal = a.type || '';
          bVal = b.type || '';
          break;
        case 'status':
          aVal = a.failedAt ? 'failed' : a.deliveredAt ? 'delivered' : 'sent';
          bVal = b.failedAt ? 'failed' : b.deliveredAt ? 'delivered' : 'sent';
          break;
        default:
          aVal = a[sortConfig.field];
          bVal = b[sortConfig.field];
      }
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [notifications, sortConfig]);

  const getDeliveryStatus = (n: any) => {
    if (n.failedAt) return { label: 'Failed', color: 'bg-red-50 text-red-700' };
    if (n.deliveredAt) return { label: 'Delivered', color: 'bg-emerald-50 text-emerald-700' };
    return { label: 'Sent', color: 'bg-blue-50 text-blue-700' };
  };

  if (loading) {
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
      <div>
        <h1 className="text-lg font-heading font-bold text-gray-900">Notification Logs</h1>
        <p className="text-xs text-gray-500">Delivery status and history — {totalCount} total</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}

      {/* Filters */}
      <div className="card p-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} className="input-field text-xs py-1.5">
            <option value="">All Channels</option>
            <option value="email">Email</option>
            <option value="webhook">Webhook</option>
            <option value="in_app">In-App</option>
          </select>
          <select value={pharmacyFilter} onChange={e => setPharmacyFilter(e.target.value)} className="input-field text-xs py-1.5">
            <option value="">All Pharmacies</option>
            {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input-field text-xs py-1.5">
            <option value="">All Types</option>
            <option value="sla_reminder">SLA Reminder</option>
            <option value="sla_violation">SLA Violation</option>
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field text-xs py-1.5" placeholder="From" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field text-xs py-1.5" placeholder="To" />
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={() => fetchNotifications(1)} className="btn-primary text-xs px-3 py-1.5">Apply</button>
          <button onClick={handleClear} className="text-xs px-3 py-1.5 rounded text-gray-600 hover:bg-gray-100">Clear</button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <SortableHeader label="Sent At" field="sentAt" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Channel" field="channel" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Type" field="type" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Pharmacy" field="pharmacy" sortConfig={sortConfig} onSort={handleSort} />
                <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px] hidden md:table-cell">Subject</th>
                <SortableHeader label="Status" field="status" sortConfig={sortConfig} onSort={handleSort} />
                <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px] hidden lg:table-cell">Error</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loadingData ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Loading...</td></tr>
              ) : sortedNotifications.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No notifications found.</td></tr>
              ) : sortedNotifications.map((n: any) => {
                const status = getDeliveryStatus(n);
                return (
                  <tr key={n.id} className={`hover:bg-gray-50 ${n.failedAt ? 'bg-red-50/30' : ''}`}>
                    <td className="px-3 py-2 text-gray-500">{new Date(n.sentAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${CHANNEL_COLORS[n.channel] || 'bg-gray-100 text-gray-700'}`}>
                        {n.channel}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{n.type}</td>
                    <td className="px-3 py-2 text-gray-900">{n.pharmacy?.name || '-'}</td>
                    <td className="px-3 py-2 text-gray-500 hidden md:table-cell max-w-xs truncate">{n.subject || '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-red-600 hidden lg:table-cell max-w-xs truncate">{n.errorMessage || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-3 py-2 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-500">Page {page} of {totalPages} ({totalCount} total)</span>
            <div className="flex gap-1">
              <button onClick={() => fetchNotifications(page - 1)} disabled={page <= 1} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
              <button onClick={() => fetchNotifications(page + 1)} disabled={page >= totalPages} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
