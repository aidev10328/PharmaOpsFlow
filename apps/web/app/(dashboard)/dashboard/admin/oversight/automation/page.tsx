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

  const rateColor = (stats?.successRate || 0) >= 90 ? 'text-emerald-600' : (stats?.successRate || 0) >= 70 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin/oversight" className="text-link text-sm">&larr; Back to Oversight</Link>
      </div>

      <div>
        <h1 className="page-title">Automation & AI Health</h1>
        <p className="text-sm text-gray-500 mt-1">Invoice extraction performance and failure monitoring</p>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{stats?.total || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Total Extractions</div>
        </div>
        <div className="card p-4 text-center">
          <div className={`text-2xl font-bold ${rateColor}`}>{stats?.successRate || 0}%</div>
          <div className="text-xs text-gray-500 mt-1">Success Rate</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{stats?.avgProcessingMs || 0}ms</div>
          <div className="text-xs text-gray-500 mt-1">Avg Processing Time</div>
        </div>
        <div className="card p-4 text-center">
          <div className={`text-2xl font-bold ${(stats?.failed || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{stats?.failed || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Failed</div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span className="text-sm text-gray-600">Success</span>
          </div>
          <div className="text-lg font-bold text-gray-900 mt-1">{stats?.success || 0}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-sm text-gray-600">Failed</span>
          </div>
          <div className="text-lg font-bold text-gray-900 mt-1">{stats?.failed || 0}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            <span className="text-sm text-gray-600">Pending</span>
          </div>
          <div className="text-lg font-bold text-gray-900 mt-1">{stats?.pending || 0}</div>
        </div>
      </div>

      {/* Recent Failures */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <h3 className="text-sm font-heading font-semibold text-gray-900">Recent Failures (last 20)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Error</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(!stats?.recentFailures || stats.recentFailures.length === 0) ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">No recent failures.</td></tr>
              ) : stats.recentFailures.map((f: any) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-500">{f.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/dashboard/admin/oversight/invoices/${f.invoiceId}`} className="text-primary-600 hover:underline">
                      {f.invoice?.invoiceNumber || f.invoiceId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{f.provider} {f.model && `(${f.model})`}</td>
                  <td className="px-4 py-3 text-sm text-red-600 hidden md:table-cell max-w-xs truncate">{f.error || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(f.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => handleRetry(f.id)}
                      disabled={retrying[f.id]}
                      className="text-xs px-2 py-1 rounded-md font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
                    >
                      {retrying[f.id] ? 'Retrying...' : 'Retry'}
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
