'use client';

import { useAuth } from '../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../lib/api';
import InvoiceStatusDonut from '../../../../components/charts/InvoiceStatusDonut';
import SlaComplianceBar from '../../../../components/charts/SlaComplianceBar';

type MetricData = {
  totalPharmacies: number;
  activePharmacies: number;
  totalUsers: number;
  activeUsers: number;
  totalInvoices: number;
  invoiceStatusCounts: Record<string, number>;
  totalAmount: number;
  slaCompliantPharmacies: number;
  slaTotalPharmacies: number;
  slaPharmacies: { pharmacyId: string; pharmacyCode: string; pharmacyName: string; complianceRate: number }[];
  automationTotal: number;
  automationSuccessRate: number;
  automationFailed: number;
  notificationCount: number;
};

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

export default function AdminOverviewPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [metrics, setMetrics] = useState<MetricData | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  const monthDateRange = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    const from = `${month}-01`;
    const last = new Date(y, m, 0).getDate();
    const to = `${month}-${String(last).padStart(2, '0')}`;
    return { from, to };
  };

  const monthOptions = () => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      options.push({ value: val, label });
    }
    return options;
  };

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;

    async function fetchMetrics() {
      setLoadingMetrics(true);
      try {
        const { from, to } = monthDateRange(selectedMonth);
        const [pharmaciesRes, usersRes, invoicesRes, invoiceStatsRes, slaRes, automationRes, notificationsRes] = await Promise.all([
          apiFetch('/v1/admin/pharmacies').then(r => r.ok ? r.json() : []).catch(() => []),
          apiFetch('/v1/admin/users').then(r => r.ok ? r.json() : []).catch(() => []),
          apiFetch(`/v1/admin/oversight/invoices?limit=1&dateFrom=${from}&dateTo=${to}`).then(r => r.ok ? r.json() : { totalCount: 0 }).catch(() => ({ totalCount: 0 })),
          apiFetch(`/invoices/stats?month=${selectedMonth}`).then(r => r.ok ? r.json() : { statusCounts: {}, totalAmount: 0 }).catch(() => ({ statusCounts: {}, totalAmount: 0 })),
          apiFetch(`/v1/admin/oversight/sla/summary?month=${selectedMonth}`).then(r => r.ok ? r.json() : null).catch(() => null),
          apiFetch('/v1/admin/oversight/automation').then(r => r.ok ? r.json() : null).catch(() => null),
          apiFetch(`/v1/admin/oversight/notifications?limit=1&dateFrom=${from}&dateTo=${to}`).then(r => r.ok ? r.json() : { totalCount: 0 }).catch(() => ({ totalCount: 0 })),
        ]);

        const pharmacies = Array.isArray(pharmaciesRes) ? pharmaciesRes : [];
        const users = Array.isArray(usersRes) ? usersRes : [];

        setMetrics({
          totalPharmacies: pharmacies.length,
          activePharmacies: pharmacies.filter((p: any) => p.isActive !== false).length,
          totalUsers: users.length,
          activeUsers: users.filter((u: any) => u.isActive !== false).length,
          totalInvoices: invoicesRes.totalCount || 0,
          invoiceStatusCounts: invoiceStatsRes.statusCounts || {},
          totalAmount: invoiceStatsRes.totalAmount || 0,
          slaCompliantPharmacies: slaRes?.totals?.compliantPharmacies || 0,
          slaTotalPharmacies: slaRes?.totals?.totalPharmacies || 0,
          slaPharmacies: (slaRes?.pharmacies || []).map((p: any) => ({
            pharmacyId: p.pharmacyId,
            pharmacyCode: p.pharmacyCode,
            pharmacyName: p.pharmacyName,
            complianceRate: p.complianceRate ?? 0,
          })),
          automationTotal: automationRes?.total || 0,
          automationSuccessRate: automationRes?.successRate || 0,
          automationFailed: automationRes?.failed || 0,
          notificationCount: notificationsRes.totalCount || 0,
        });
      } catch (e) {
        console.error('Failed to fetch admin metrics:', e);
      } finally {
        setLoadingMetrics(false);
      }
    }

    fetchMetrics();
  }, [user, selectedMonth]);

  if (loading || !user || user.role !== 'ADMIN') return null;

  const slaRate = metrics && metrics.slaTotalPharmacies > 0
    ? Math.round((metrics.slaCompliantPharmacies / metrics.slaTotalPharmacies) * 100)
    : 0;

  const pendingReview = metrics
    ? (metrics.invoiceStatusCounts.SUBMITTED || 0) + (metrics.invoiceStatusCounts.NEEDS_INFO || 0)
    : 0;

  return (
    <div className="space-y-3">
      {/* Month Picker */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const [y, m] = selectedMonth.split('-').map(Number);
              const prev = new Date(y, m - 2, 1);
              setSelectedMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
            }}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 cursor-pointer"
          >
            {monthOptions().map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={() => {
              const [y, m] = selectedMonth.split('-').map(Number);
              const next = new Date(y, m, 1);
              const nextVal = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
              if (nextVal <= currentMonth()) setSelectedMonth(nextVal);
            }}
            disabled={selectedMonth === currentMonth()}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        {selectedMonth !== currentMonth() && (
          <button
            onClick={() => setSelectedMonth(currentMonth())}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
          >
            Current Month
          </button>
        )}
      </div>

      {/* Metrics Cards */}
      {loadingMetrics ? (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-2.5 animate-pulse">
              <div className="h-5 w-10 bg-gray-200 rounded mb-1" />
              <div className="h-2.5 w-16 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : metrics ? (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          <div className="card p-2.5">
            <div className="text-lg font-bold text-gray-900">{metrics.totalPharmacies}</div>
            <div className="text-[10px] text-gray-500">Pharmacies</div>
            <div className="text-[10px] text-emerald-600">{metrics.activePharmacies} active</div>
          </div>
          <div className="card p-2.5">
            <div className="text-lg font-bold text-gray-900">{metrics.totalUsers}</div>
            <div className="text-[10px] text-gray-500">Users</div>
            <div className="text-[10px] text-emerald-600">{metrics.activeUsers} active</div>
          </div>
          <div className="card p-2.5">
            <div className="text-lg font-bold text-primary-600">{metrics.totalInvoices}</div>
            <div className="text-[10px] text-gray-500">Invoices</div>
            <div className="text-[10px] text-gray-500">{formatCurrency(metrics.totalAmount)}</div>
          </div>
          <div className="card p-2.5">
            <div className={`text-lg font-bold ${slaRate >= 80 ? 'text-emerald-600' : slaRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {slaRate}%
            </div>
            <div className="text-[10px] text-gray-500">SLA</div>
            <div className="text-[10px] text-gray-500">{metrics.slaCompliantPharmacies}/{metrics.slaTotalPharmacies}</div>
          </div>
          <div className="card p-2.5">
            <div className={`text-lg font-bold ${metrics.automationSuccessRate >= 90 ? 'text-emerald-600' : metrics.automationSuccessRate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
              {metrics.automationSuccessRate}%
            </div>
            <div className="text-[10px] text-gray-500">AI Success</div>
            {metrics.automationFailed > 0 ? (
              <div className="text-[10px] text-red-600">{metrics.automationFailed} failed</div>
            ) : (
              <div className="text-[10px] text-gray-400">{metrics.automationTotal} total</div>
            )}
          </div>
          <div className="card p-2.5">
            <div className={`text-lg font-bold ${pendingReview > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
              {pendingReview}
            </div>
            <div className="text-[10px] text-gray-500">Pending</div>
            <div className="text-[10px] text-gray-500">{metrics.notificationCount} alerts</div>
          </div>
        </div>
      ) : null}

      {/* Charts */}
      {metrics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="card p-3 overflow-hidden">
            <h3 className="text-xs font-heading font-semibold text-gray-900 mb-2">Invoice Status</h3>
            {Object.keys(metrics.invoiceStatusCounts).length > 0 ? (
              <div className="h-[200px]">
                <InvoiceStatusDonut statusCounts={metrics.invoiceStatusCounts} />
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-gray-400 text-xs">No data</div>
            )}
          </div>
          <div className="card p-3 overflow-hidden">
            <h3 className="text-xs font-heading font-semibold text-gray-900 mb-2">SLA by Pharmacy</h3>
            {metrics.slaPharmacies.length > 0 ? (
              <div className="h-[290px]">
                <SlaComplianceBar
                  pharmacies={metrics.slaPharmacies.map(p => ({
                    pharmacyName: p.pharmacyName,
                    pharmacyCode: p.pharmacyCode,
                    complianceRate: p.complianceRate,
                  }))}
                />
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-gray-400 text-xs">No data</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
