'use client';

import { useAuth } from '../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../lib/api';
import Link from 'next/link';
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

export default function AdminDashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [metrics, setMetrics] = useState<MetricData | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'ADMIN') {
      router.push('/dashboard');
      return;
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;

    async function fetchMetrics() {
      try {
        const [pharmaciesRes, usersRes, invoicesRes, invoiceStatsRes, slaRes, automationRes, notificationsRes] = await Promise.all([
          apiFetch('/v1/admin/pharmacies').then(r => r.ok ? r.json() : []).catch(() => []),
          apiFetch('/v1/admin/users').then(r => r.ok ? r.json() : []).catch(() => []),
          apiFetch('/v1/admin/oversight/invoices?limit=1').then(r => r.ok ? r.json() : { totalCount: 0 }).catch(() => ({ totalCount: 0 })),
          apiFetch('/invoices/stats').then(r => r.ok ? r.json() : { statusCounts: {}, totalAmount: 0 }).catch(() => ({ statusCounts: {}, totalAmount: 0 })),
          apiFetch(`/v1/admin/oversight/sla/summary?month=${currentMonth()}`).then(r => r.ok ? r.json() : null).catch(() => null),
          apiFetch('/v1/admin/oversight/automation').then(r => r.ok ? r.json() : null).catch(() => null),
          apiFetch('/v1/admin/oversight/notifications?limit=1').then(r => r.ok ? r.json() : { totalCount: 0 }).catch(() => ({ totalCount: 0 })),
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
  }, [user]);

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

  if (!user || user.role !== 'ADMIN') return null;

  const slaRate = metrics && metrics.slaTotalPharmacies > 0
    ? Math.round((metrics.slaCompliantPharmacies / metrics.slaTotalPharmacies) * 100)
    : 0;

  const pendingReview = metrics
    ? (metrics.invoiceStatusCounts.SUBMITTED || 0) + (metrics.invoiceStatusCounts.NEEDS_INFO || 0)
    : 0;

  return (
    <div className="space-y-3">
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
              <div className="h-[200px] flex items-center justify-center text-gray-400 text-xs">
                No data
              </div>
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
              <div className="h-[200px] flex items-center justify-center text-gray-400 text-xs">
                No data
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Links Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Staff Management */}
        <div className="card p-3">
          <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Staff Management</h2>
          <div className="space-y-1">
            <QuickLink href="/dashboard/admin/users" label="Users" badge={metrics ? `${metrics.totalUsers}` : undefined} />
            <QuickLink href="/dashboard/admin/pharmacies" label="Pharmacies" badge={metrics ? `${metrics.activePharmacies}` : undefined} />
            <QuickLink href="/dashboard/admin/org" label="Organization Settings" />
          </div>
        </div>

        {/* Reference Data */}
        <div className="card p-3">
          <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Reference Data</h2>
          <div className="space-y-1">
            <QuickLink href="/dashboard/admin/reference/invoice-types" label="Invoice Types" />
            <QuickLink href="/dashboard/admin/reference/vendors" label="Vendors" />
            <QuickLink href="/dashboard/admin/requirements" label="Requirements" />
          </div>
        </div>

        {/* Operational Oversight */}
        <div className="card p-3">
          <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Operational Oversight</h2>
          <div className="space-y-1">
            <QuickLink href="/dashboard/admin/oversight/invoices" label="All Invoices" badge={metrics ? `${metrics.totalInvoices}` : undefined} />
            <QuickLink href="/dashboard/admin/oversight/sla" label="SLA & Compliance" badge={metrics ? `${slaRate}%` : undefined} badgeColor={slaRate >= 80 ? 'text-emerald-600' : 'text-amber-600'} />
            <QuickLink href="/dashboard/admin/oversight/notifications" label="Notifications" />
            <QuickLink href="/dashboard/admin/oversight/automation" label="Automation Health" />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, label, badge, badgeColor }: { href: string; label: string; badge?: string; badgeColor?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between py-1.5 px-2 -mx-2 rounded hover:bg-gray-50 transition-colors group"
    >
      <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
      {badge && (
        <span className={`text-xs font-medium ${badgeColor || 'text-gray-400'}`}>{badge}</span>
      )}
    </Link>
  );
}
