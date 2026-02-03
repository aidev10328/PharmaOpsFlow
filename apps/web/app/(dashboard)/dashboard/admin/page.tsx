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

  const slaRate = metrics && metrics.slaTotalPharmacies > 0
    ? Math.round((metrics.slaCompliantPharmacies / metrics.slaTotalPharmacies) * 100)
    : 0;

  const pendingReview = metrics
    ? (metrics.invoiceStatusCounts.SUBMITTED || 0) + (metrics.invoiceStatusCounts.NEEDS_INFO || 0)
    : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">System Administration</h1>
          <p className="text-sm text-gray-500 mt-1">
            Platform overview and governance
          </p>
        </div>
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-red-50 text-red-700">
          System Admin
        </span>
      </div>

      {/* Metrics Cards */}
      {loadingMetrics ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-7 w-16 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : metrics ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="card p-4">
            <div className="text-2xl font-bold text-gray-900">{metrics.totalPharmacies}</div>
            <div className="text-xs text-gray-500 mt-0.5">Pharmacies</div>
            <div className="text-xs text-emerald-600 mt-1">{metrics.activePharmacies} active</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-gray-900">{metrics.totalUsers}</div>
            <div className="text-xs text-gray-500 mt-0.5">Users</div>
            <div className="text-xs text-emerald-600 mt-1">{metrics.activeUsers} active</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-primary-600">{metrics.totalInvoices}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total Invoices</div>
            <div className="text-xs text-gray-500 mt-1">{formatCurrency(metrics.totalAmount)}</div>
          </div>
          <div className="card p-4">
            <div className={`text-2xl font-bold ${slaRate >= 80 ? 'text-emerald-600' : slaRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {slaRate}%
            </div>
            <div className="text-xs text-gray-500 mt-0.5">SLA Compliance</div>
            <div className="text-xs text-gray-500 mt-1">{metrics.slaCompliantPharmacies}/{metrics.slaTotalPharmacies} compliant</div>
          </div>
          <div className="card p-4">
            <div className={`text-2xl font-bold ${metrics.automationSuccessRate >= 90 ? 'text-emerald-600' : metrics.automationSuccessRate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
              {metrics.automationSuccessRate}%
            </div>
            <div className="text-xs text-gray-500 mt-0.5">AI Success Rate</div>
            {metrics.automationFailed > 0 ? (
              <div className="text-xs text-red-600 mt-1">{metrics.automationFailed} failed</div>
            ) : (
              <div className="text-xs text-emerald-600 mt-1">{metrics.automationTotal} extractions</div>
            )}
          </div>
          <div className="card p-4">
            <div className={`text-2xl font-bold ${pendingReview > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
              {pendingReview}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Pending Review</div>
            <div className="text-xs text-gray-500 mt-1">{metrics.notificationCount} notifications</div>
          </div>
        </div>
      ) : null}

      {/* Charts */}
      {metrics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <h3 className="text-sm font-heading font-semibold text-gray-900 mb-3">
              Invoice Status Distribution
            </h3>
            {Object.keys(metrics.invoiceStatusCounts).length > 0 ? (
              <InvoiceStatusDonut statusCounts={metrics.invoiceStatusCounts} />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
                No invoice data available
              </div>
            )}
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-heading font-semibold text-gray-900 mb-3">
              SLA Compliance by Pharmacy
            </h3>
            {metrics.slaPharmacies.length > 0 ? (
              <SlaComplianceBar
                pharmacies={metrics.slaPharmacies.map(p => ({
                  pharmacyName: p.pharmacyName,
                  pharmacyCode: p.pharmacyCode,
                  complianceRate: p.complianceRate,
                }))}
              />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
                No compliance data available
              </div>
            )}
          </div>
        </div>
      )}

      {/* System Management */}
      <div>
        <h2 className="text-sm font-heading font-semibold text-gray-700 uppercase tracking-wider mb-3">
          System Management
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <AdminLink
            href="/dashboard/admin/org"
            title="Organization"
            description="Org settings, timezone, SLA due dates"
            iconColor="text-primary-600"
            iconPath="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            badge={metrics ? `${metrics.totalPharmacies} pharmacies` : undefined}
          />
          <AdminLink
            href="/dashboard/admin/pharmacies"
            title="Pharmacies"
            description="Create, edit, activate/deactivate"
            iconColor="text-accent-600"
            iconPath="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
            badge={metrics ? `${metrics.activePharmacies} active` : undefined}
          />
          <AdminLink
            href="/dashboard/admin/users"
            title="Users"
            description="Roles, passwords, access control"
            iconColor="text-violet-600"
            iconPath="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            badge={metrics ? `${metrics.totalUsers} users` : undefined}
          />
        </div>
      </div>

      {/* Reference Data */}
      <div>
        <h2 className="text-sm font-heading font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Reference Data
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <AdminLink
            href="/dashboard/admin/reference/invoice-types"
            title="Invoice Types"
            description="Categories and SLA requirements"
            iconColor="text-amber-600"
            iconPath="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
          <AdminLink
            href="/dashboard/admin/reference/vendors"
            title="Vendors"
            description="Org-wide and pharmacy-specific"
            iconColor="text-teal-600"
            iconPath="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
          <AdminLink
            href="/dashboard/admin/reference/required-invoices"
            title="Required Invoices"
            description="SLA compliance configuration"
            iconColor="text-rose-600"
            iconPath="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </div>
      </div>

      {/* Operational Oversight */}
      <div>
        <h2 className="text-sm font-heading font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Operational Oversight
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <AdminLink
            href="/dashboard/admin/oversight/invoices"
            title="Invoice Oversight"
            description="Global view with filters"
            iconColor="text-primary-600"
            iconPath="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            badge={metrics ? `${metrics.totalInvoices} invoices` : undefined}
          />
          <AdminLink
            href="/dashboard/admin/oversight/sla"
            title="SLA & Compliance"
            description="Compliance rates and violations"
            iconColor="text-emerald-600"
            iconPath="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            badge={metrics ? `${slaRate}% compliant` : undefined}
            badgeColor={slaRate >= 80 ? 'text-emerald-600' : slaRate >= 50 ? 'text-amber-600' : 'text-red-600'}
          />
          <AdminLink
            href="/dashboard/admin/oversight/automation"
            title="Automation Health"
            description="AI extraction monitoring"
            iconColor="text-indigo-600"
            iconPath="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            badge={metrics ? `${metrics.automationSuccessRate}% success` : undefined}
            badgeColor={metrics && metrics.automationSuccessRate >= 90 ? 'text-emerald-600' : 'text-amber-600'}
          />
          <AdminLink
            href="/dashboard/admin/oversight/notifications"
            title="Notifications"
            description="Delivery status and history"
            iconColor="text-violet-600"
            iconPath="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            badge={metrics ? `${metrics.notificationCount} sent` : undefined}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Admin Link Card ─────────────────────────────────────────

function AdminLink({
  href,
  title,
  description,
  iconColor,
  iconPath,
  badge,
  badgeColor,
}: {
  href: string;
  title: string;
  description: string;
  iconColor: string;
  iconPath: string;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <Link href={href} className="card p-4 hover:shadow-md transition-all group flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-50 transition-colors">
        <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPath} />
        </svg>
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        {badge && (
          <p className={`text-xs font-medium mt-1 ${badgeColor || 'text-gray-500'}`}>{badge}</p>
        )}
      </div>
    </Link>
  );
}
