'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

export default function AutomationHealthPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  const fetchStats = async () => {
    try {
      const res = await apiFetch('/v1/admin/oversight/automation');
      if (res.ok) setStats(await res.json());
    } catch { setError('Failed to load automation stats'); }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchStats().finally(() => setLoadingData(false));
    }
  }, [user]);

  const handleRetry = async (extractionId: string) => {
    setRetrying(prev => ({ ...prev, [extractionId]: true }));
    setError(null); setSuccess(null);
    try {
      const res = await apiFetch(`/v1/admin/oversight/automation/retry/${extractionId}`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Retry failed'); }
      setSuccess('Extraction retry initiated successfully.');
      fetchStats();
    } catch (e: any) { setError(e.message); }
    finally { setRetrying(prev => ({ ...prev, [extractionId]: false })); }
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

  if (!user || user.role !== 'ADMIN') return null;

  const rateColor = (stats?.successRate || 0) >= 90 ? 'text-emerald-600' : (stats?.successRate || 0) >= 70 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="max-w-6xl mx-auto space-y-3">
      <div>
        <h1 className="text-lg font-heading font-bold text-gray-900">Automation & AI Health</h1>
        <p className="text-xs text-gray-500">Invoice extraction performance and failure monitoring</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs">{success}</div>}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="card p-2.5 text-center">
          <div className="text-lg font-bold text-gray-900">{stats?.total || 0}</div>
          <div className="text-[10px] text-gray-500">Total Extractions</div>
        </div>
        <div className="card p-2.5 text-center">
          <div className={`text-lg font-bold ${rateColor}`}>{stats?.successRate || 0}%</div>
          <div className="text-[10px] text-gray-500">Success Rate</div>
        </div>
        <div className="card p-2.5 text-center">
          <div className="text-lg font-bold text-gray-900">{stats?.avgProcessingMs || 0}ms</div>
          <div className="text-[10px] text-gray-500">Avg Processing</div>
        </div>
        <div className="card p-2.5 text-center">
          <div className={`text-lg font-bold ${(stats?.failed || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{stats?.failed || 0}</div>
          <div className="text-[10px] text-gray-500">Failed</div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-2.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-xs text-gray-600">Success</span>
          </div>
          <div className="text-base font-bold text-gray-900 mt-0.5">{stats?.success || 0}</div>
        </div>
        <div className="card p-2.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <span className="text-xs text-gray-600">Failed</span>
          </div>
          <div className="text-base font-bold text-gray-900 mt-0.5">{stats?.failed || 0}</div>
        </div>
        <div className="card p-2.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <span className="text-xs text-gray-600">Pending</span>
          </div>
          <div className="text-base font-bold text-gray-900 mt-0.5">{stats?.pending || 0}</div>
        </div>
      </div>

      {/* Recent Failures */}
      <div className="card overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b">
          <h3 className="text-xs font-heading font-semibold text-gray-900">Recent Failures (last 20)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">ID</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Invoice</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Provider</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase hidden md:table-cell">Error</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Date</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {(!stats?.recentFailures || stats.recentFailures.length === 0) ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No recent failures.</td></tr>
              ) : stats.recentFailures.map((f: any) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-500">{f.id.slice(0, 8)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/admin/oversight/invoices/${f.invoiceId}`} className="text-primary-600 hover:underline">
                      {f.invoice?.invoiceNumber || f.invoiceId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{f.provider} {f.model && `(${f.model})`}</td>
                  <td className="px-3 py-2 text-red-600 hidden md:table-cell max-w-xs truncate">{f.error || '-'}</td>
                  <td className="px-3 py-2 text-gray-500">{new Date(f.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleRetry(f.id)}
                      disabled={retrying[f.id]}
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
                    >
                      {retrying[f.id] ? '...' : 'Retry'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
