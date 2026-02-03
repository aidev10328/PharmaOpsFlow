'use client';

import { useAuth } from '../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../lib/api';
import InvoiceStatusDonut from '../../../../components/charts/InvoiceStatusDonut';
import SlaComplianceBar from '../../../../components/charts/SlaComplianceBar';

type Pharmacy = {
  id: string;
  name: string;
  code: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  isActive?: boolean;
  org: { id: string; name: string };
  members?: { user: { email: string } }[];
  _count?: { members: number };
};

type InvoiceStats = {
  statusCounts: Record<string, number>;
  totalAmount: number;
  upcomingDue: number;
};

type SlaSummaryResult = {
  month: string;
  pharmacies: Array<{
    pharmacyId: string;
    pharmacyName: string;
    pharmacyCode: string;
    submissionMissed: number;
    processingMissed: number;
    pending: number;
    totalExpected: number;
    submittedCount: number;
    processedCount: number;
    complianceRate: number;
  }>;
  totals: {
    totalPharmacies: number;
    compliantPharmacies: number;
    submissionMissedTotal: number;
    processingMissedTotal: number;
  };
};

function formatAddress(p: Pharmacy): string {
  const parts = [p.street, [p.city, p.state].filter(Boolean).join(', '), p.zip].filter(Boolean);
  return parts.join(', ') || '-';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function ManagerDashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [slaSummary, setSlaSummary] = useState<SlaSummaryResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (!authLoading && user && user.role !== 'COMPANY_MANAGER' && user.role !== 'ADMIN') {
      router.push('/dashboard');
      return;
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

        const [pharmaciesRes, statsRes, slaRes] = await Promise.all([
          apiFetch('/pharmacies'),
          apiFetch('/invoices/stats'),
          apiFetch(`/explore/sla?month=${currentMonth}`),
        ]);

        if (pharmaciesRes.ok) setPharmacies(await pharmaciesRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
        if (slaRes.ok) setSlaSummary(await slaRes.json());
      } catch (e) {
        console.error('Failed to load dashboard data:', e);
      } finally {
        setLoading(false);
      }
    }

    if (user && (user.role === 'COMPANY_MANAGER' || user.role === 'ADMIN')) {
      fetchDashboardData();
    }
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-32 bg-gray-200 rounded-full animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-8 w-16 bg-gray-200 rounded mb-2" />
              <div className="h-4 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
              <div className="h-[280px] bg-gray-100 rounded" />
            </div>
          ))}
        </div>
        <div className="card p-6 animate-pulse">
          <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
          <div className="h-40 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const totalInvoices = stats
    ? Object.values(stats.statusCounts).reduce((sum, count) => sum + count, 0)
    : 0;

  const pendingReview = stats
    ? (stats.statusCounts.SUBMITTED || 0) + (stats.statusCounts.NEEDS_INFO || 0)
    : 0;

  const overallComplianceRate =
    slaSummary && slaSummary.totals.totalPharmacies > 0
      ? Math.round((slaSummary.totals.compliantPharmacies / slaSummary.totals.totalPharmacies) * 100)
      : 0;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Manager Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {user.org?.name || 'Your Organization'} &middot; {pharmacies.length} pharmacies
          </p>
        </div>
        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
          Company Manager
        </span>
      </div>

      {/* Section 1: Key Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{totalInvoices}</div>
              <div className="text-xs text-gray-500 font-medium">Total Invoices</div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(Number(stats?.totalAmount || 0))}</div>
              <div className="text-xs text-gray-500 font-medium">Total Amount</div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${overallComplianceRate >= 80 ? 'bg-green-50' : overallComplianceRate >= 50 ? 'bg-yellow-50' : 'bg-red-50'}`}>
              <svg className={`w-5 h-5 ${overallComplianceRate >= 80 ? 'text-green-600' : overallComplianceRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className={`text-2xl font-bold ${overallComplianceRate >= 80 ? 'text-green-700' : overallComplianceRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                {overallComplianceRate}%
              </div>
              <div className="text-xs text-gray-500 font-medium">SLA Compliance</div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${pendingReview > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
              <svg className={`w-5 h-5 ${pendingReview > 0 ? 'text-amber-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className={`text-2xl font-bold ${pendingReview > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                {pendingReview}
              </div>
              <div className="text-xs text-gray-500 font-medium">Pending Review</div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-6">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">
            Invoice Status Distribution
          </h3>
          {stats?.statusCounts ? (
            <InvoiceStatusDonut statusCounts={stats.statusCounts} />
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              No data available
            </div>
          )}
        </div>

        <div className="card p-6">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">
            SLA Compliance by Pharmacy
          </h3>
          {slaSummary?.pharmacies && slaSummary.pharmacies.length > 0 ? (
            <SlaComplianceBar pharmacies={slaSummary.pharmacies} />
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              No compliance data available
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Pharmacy Overview Cards */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-heading font-semibold text-gray-900">
          Pharmacy Overview
        </h3>
        <span className="text-xs text-gray-500">{pharmacies.length} pharmacies</span>
      </div>
      {pharmacies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pharmacies.map((pharmacy) => {
            const slaData = slaSummary?.pharmacies.find((p) => p.pharmacyId === pharmacy.id);
            const complianceRate = slaData?.complianceRate ?? null;
            const isActive = pharmacy.isActive !== false;
            return (
              <div
                key={pharmacy.id}
                className="card p-5 hover:shadow-md transition-shadow"
              >
                {/* Header: Code + Status Badges */}
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {pharmacy.code}
                  </span>
                  <div className="flex items-center gap-2">
                    {complianceRate !== null && (
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                          complianceRate >= 80
                            ? 'bg-green-100 text-green-800'
                            : complianceRate >= 50
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        SLA {complianceRate}%
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {/* Pharmacy Name */}
                <h4 className="font-semibold text-gray-900 mb-3">{pharmacy.name}</h4>

                {/* Details */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-start gap-2 text-gray-600">
                    <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    <span>{formatAddress(pharmacy)}</span>
                  </div>
                  {pharmacy.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                      <span>{pharmacy.phone}</span>
                    </div>
                  )}
                  {pharmacy.members && pharmacy.members.length > 0 && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                      <span>{pharmacy.members[0].user.email}</span>
                    </div>
                  )}
                </div>

                {/* Footer: Members count + SLA details */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {pharmacy._count?.members ?? 0} member(s)
                  </span>
                  {slaData && (
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span title="Submitted">{slaData.submittedCount}/{slaData.totalExpected} submitted</span>
                      <span title="Processed">{slaData.processedCount}/{slaData.totalExpected} processed</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card px-6 py-12 text-center text-gray-500 text-sm">
          No pharmacies found in your organization.
        </div>
      )}
    </div>
  );
}
