'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
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

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export default function CompliancePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [summaries, setSummaries] = useState<ComplianceSummary[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterMonth, setFilterMonth] = useState<string>(currentMonth());

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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin/requirements" className="text-link text-sm">&larr; Back to Requirements</Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Compliance Summary</h1>
          <p className="text-sm text-gray-500 mt-1">Track requirement fulfillment across pharmacies</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">Period:</label>
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="input-field w-40" />
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Overall Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="card p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Total</div>
          <div className="text-2xl font-bold text-gray-900">{totals.totalRequirements}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Pending</div>
          <div className="text-2xl font-bold text-yellow-600">{totals.pending}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Submitted</div>
          <div className="text-2xl font-bold text-blue-600">{totals.submitted}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Processed</div>
          <div className="text-2xl font-bold text-emerald-600">{totals.processed}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Overdue</div>
          <div className="text-2xl font-bold text-orange-600">{totals.overdue}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Missed</div>
          <div className="text-2xl font-bold text-red-600">{totals.missed}</div>
        </div>
      </div>

      {/* Compliance Rate Bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Compliance Rate</span>
          <span className="text-sm font-bold text-gray-900">{overallRate}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full ${overallRate >= 80 ? 'bg-emerald-500' : overallRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${overallRate}%` }}
          />
        </div>
      </div>

      {/* Per-Pharmacy Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pharmacy</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Pending</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Submitted</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Processed</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Overdue</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Missed</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Rate</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {summaries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">
                    No compliance data available. Generate requirement instances first.
                  </td>
                </tr>
              ) : summaries.map((s) => (
                <tr key={s.pharmacyId} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{s.pharmacyName}</div>
                    <div className="text-xs text-gray-400">{s.pharmacyCode}</div>
                  </td>
                  <td className="px-3 py-2 text-center text-gray-700">{s.totalRequirements}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={s.pending > 0 ? 'text-yellow-600 font-medium' : 'text-gray-400'}>{s.pending}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={s.submitted > 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}>{s.submitted}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={s.processed > 0 ? 'text-emerald-600 font-medium' : 'text-gray-400'}>{s.processed}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={s.overdue > 0 ? 'text-orange-600 font-medium' : 'text-gray-400'}>{s.overdue}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={s.missed > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>{s.missed}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
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
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <Link href="/dashboard/admin/requirements/instances" className="btn-secondary">View All Instances</Link>
        <Link href="/dashboard/admin/requirements" className="btn-secondary">Manage Requirements</Link>
      </div>
    </div>
  );
}
