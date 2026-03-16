'use client';

import { useAuth, PharmacyMembership } from '../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../lib/api';
import SlaAlertWidget from '../../../../components/sla/SlaAlertWidget';
import RequirementsWidget from '../../../../components/requirements/RequirementsWidget';

type Pharmacy = {
  id: string;
  name: string;
  code: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  org: { id: string; name: string };
  members?: { memberRole: string; user: { email: string } }[];
};

type InvoiceStats = {
  totalCount: number;
  totalAmount: number;
  statusCounts: Record<string, number>;
};

type RequirementsSummary = {
  pending: number;
  overdue: number;
  submitted: number;
  processed: number;
  totalThisMonth: number;
};

type RequirementInstance = {
  id: string;
  invoiceId: string | null;
  status: string;
  submissionDeadline: string;
};

function formatAddress(p: Pharmacy): string {
  const parts = [p.street, [p.city, p.state].filter(Boolean).join(', '), p.zip].filter(Boolean);
  return parts.join(', ') || 'Not specified';
}

export default function PharmacyDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loadingPharmacies, setLoadingPharmacies] = useState(true);
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);
  const [invoiceStats, setInvoiceStats] = useState<InvoiceStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [requirementsSummary, setRequirementsSummary] = useState<RequirementsSummary | null>(null);
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
  }, [user, loading, router]);

  useEffect(() => {
    async function fetchPharmacies() {
      try {
        const res = await apiFetch('/pharmacies');
        if (res.ok) {
          const data = await res.json();
          setPharmacies(data);
          if (data.length > 0) {
            setSelectedPharmacy(data[0]);
          }
        }
      } catch (e) {
        console.error('Failed to fetch pharmacies:', e);
      } finally {
        setLoadingPharmacies(false);
      }
    }
    if (user) {
      fetchPharmacies();
    }
  }, [user]);

  // Fetch invoice stats for selected month
  const fetchInvoiceStats = useCallback(async (pharmacyId: string) => {
    setLoadingStats(true);
    try {
      // Fetch both invoice stats and requirement instances in parallel
      const [statsRes, instancesRes] = await Promise.all([
        apiFetch(`/invoices/stats?pharmacyId=${pharmacyId}&month=${monthFilter}`),
        apiFetch(`/v1/requirements/pharmacy/${pharmacyId}/instances?yearMonth=${monthFilter}`),
      ]);

      if (!statsRes.ok) {
        console.error('fetchInvoiceStats: API error:', statsRes.status);
        setInvoiceStats({ totalCount: 0, totalAmount: 0, statusCounts: {} });
        return;
      }

      const data = await statsRes.json();
      const statusCounts = data.statusCounts || {};
      const draftCount = statusCounts.DRAFT || 0;
      const managerView = user?.role === 'COMPANY_MANAGER' || user?.role === 'ADMIN';
      const invoiceTotal = Object.values(statusCounts).reduce((a: number, b: any) => a + (b || 0), 0) as number - (managerView ? draftCount : 0);

      // Compute pending/overdue from requirement instances (same logic as invoice list)
      let pendingCount = 0;
      let overdueCount = 0;
      if (instancesRes.ok) {
        const instances: RequirementInstance[] = await instancesRes.json();
        const now = new Date();
        const unfilled = instances.filter((i) => !i.invoiceId && ['PENDING', 'OVERDUE'].includes(i.status));
        pendingCount = unfilled.filter((i) => new Date(i.submissionDeadline) >= now).length;
        overdueCount = unfilled.filter((i) => new Date(i.submissionDeadline) < now).length;
      }

      setRequirementsSummary((prev) => prev ? { ...prev, pending: pendingCount, overdue: overdueCount } : { pending: pendingCount, overdue: overdueCount, submitted: 0, processed: 0, totalThisMonth: 0 });

      setInvoiceStats({
        totalCount: pendingCount + overdueCount + invoiceTotal,
        totalAmount: data.totalAmount || 0,
        statusCounts,
      });
    } catch (e) {
      console.error('Failed to fetch invoice stats:', e);
      setInvoiceStats({ totalCount: 0, totalAmount: 0, statusCounts: {} });
    } finally {
      setLoadingStats(false);
    }
  }, [monthFilter]);

  useEffect(() => {
    if (selectedPharmacy) {
      fetchInvoiceStats(selectedPharmacy.id);
    }
  }, [selectedPharmacy, fetchInvoiceStats]);

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

  if (!user) {
    return null;
  }

  const getMemberRole = (pharmacy: Pharmacy): string => {
    if (pharmacy.members && pharmacy.members.length > 0) {
      return pharmacy.members[0].memberRole.replace('_', ' ');
    }
    const membership = user.pharmacyMemberships?.find(
      (m: PharmacyMembership) => m.pharmacyId === pharmacy.id
    );
    return membership?.memberRole?.replace('_', ' ') || user.role.replace('_', ' ');
  };

  const isManager = user?.role === 'COMPANY_MANAGER' || user?.role === 'ADMIN';

  const getRoleBadgeColor = (role: string): string => {
    if (role.includes('ADMIN')) return 'bg-violet-50 text-violet-700';
    if (role.includes('USER')) return 'bg-emerald-50 text-emerald-700';
    return 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-3">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-bold text-gray-900">Pharmacy Dashboard</h1>
        {/* Month Picker */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              const [y, m] = monthFilter.split('-').map(Number);
              const d = new Date(y, m - 2, 1);
              setMonthFilter(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="Previous month"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="text-sm font-medium text-gray-700 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          />
          <button
            onClick={() => {
              const [y, m] = monthFilter.split('-').map(Number);
              const d = new Date(y, m, 1);
              setMonthFilter(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="Next month"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {loadingPharmacies ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm">Loading pharmacies...</span>
          </div>
        </div>
      ) : pharmacies.length === 0 ? (
        <div className="card py-16 text-center">
          <div className="text-gray-300 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">No Pharmacies Assigned</h3>
          <p className="text-sm text-gray-500">
            Contact your administrator to get access to a pharmacy.
          </p>
        </div>
      ) : (
        <>
          {/* Pharmacy Selector */}
          {pharmacies.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Select Pharmacy
              </label>
              <select
                value={selectedPharmacy?.id || ''}
                onChange={(e) => {
                  const pharmacy = pharmacies.find(p => p.id === e.target.value);
                  setSelectedPharmacy(pharmacy || null);
                }}
                className="input-field max-w-sm"
              >
                {pharmacies.map((pharmacy) => (
                  <option key={pharmacy.id} value={pharmacy.id}>
                    {pharmacy.code} - {pharmacy.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Selected Pharmacy Details */}
          {selectedPharmacy && (
            <>
              {/* Invoice Analytics */}
              <div>
                <h2 className="text-xs font-heading font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Invoice Analytics
                </h2>
                {loadingStats ? (
                  <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="card p-2.5 animate-pulse">
                        <div className="h-5 w-8 bg-gray-200 rounded mb-1" />
                        <div className="h-2.5 w-14 bg-gray-100 rounded" />
                      </div>
                    ))}
                  </div>
                ) : invoiceStats ? (
                  <>
                    {/* Alert Banner for Rejected/Needs Info */}
                    {((invoiceStats.statusCounts.REJECTED || 0) > 0 || (invoiceStats.statusCounts.NEEDS_INFO || 0) > 0) && (
                      <div className="mb-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span className="text-xs text-amber-800">
                            {(invoiceStats.statusCounts.REJECTED || 0) > 0 && (
                              <span className="font-medium">{invoiceStats.statusCounts.REJECTED} rejected</span>
                            )}
                            {(invoiceStats.statusCounts.REJECTED || 0) > 0 && (invoiceStats.statusCounts.NEEDS_INFO || 0) > 0 && ', '}
                            {(invoiceStats.statusCounts.NEEDS_INFO || 0) > 0 && (
                              <span className="font-medium">{invoiceStats.statusCounts.NEEDS_INFO} need info</span>
                            )}
                          </span>
                          <a
                            href={`/dashboard/pharmacy/invoices?pharmacyId=${selectedPharmacy?.id}&status=NEEDS_INFO,REJECTED`}
                            className="ml-auto text-xs font-medium text-amber-700 hover:text-amber-900"
                          >
                            View →
                          </a>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-2">
                      <div className="card p-2.5">
                        <div className="text-lg font-bold text-gray-900">{invoiceStats.totalCount}</div>
                        <div className="text-[10px] text-gray-500">Total</div>
                      </div>
                      <div className={`card p-2.5 ${(requirementsSummary?.pending || 0) > 0 ? 'border-yellow-200 bg-yellow-50' : ''}`}>
                        <div className={`text-lg font-bold ${(requirementsSummary?.pending || 0) > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                          {requirementsSummary?.pending || 0}
                        </div>
                        <div className={`text-[10px] ${(requirementsSummary?.pending || 0) > 0 ? 'text-yellow-700' : 'text-gray-500'}`}>Pending</div>
                      </div>
                      <a
                        href={`/dashboard/pharmacy/invoices?pharmacyId=${selectedPharmacy?.id}`}
                        className={`card p-2.5 block ${
                          (requirementsSummary?.overdue || 0) > 0
                            ? '!border-2 !border-red-400 !bg-red-600 shadow-lg animate-pulse cursor-pointer'
                            : '!border-2 !border-red-300 !bg-red-50 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <svg className={`w-3.5 h-3.5 ${(requirementsSummary?.overdue || 0) > 0 ? 'text-white' : 'text-red-400'}`} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <div className={`text-lg font-bold ${(requirementsSummary?.overdue || 0) > 0 ? 'text-white' : 'text-red-600'}`}>
                            {requirementsSummary?.overdue || 0}
                          </div>
                        </div>
                        <div className={`text-[10px] font-semibold ${(requirementsSummary?.overdue || 0) > 0 ? 'text-red-100' : 'text-red-600'}`}>Overdue</div>
                      </a>
                      {!isManager && (
                        <div className="card p-2.5">
                          <div className="text-lg font-bold text-amber-600">{invoiceStats.statusCounts.DRAFT || 0}</div>
                          <div className="text-[10px] text-gray-500">Draft</div>
                        </div>
                      )}
                      <div className="card p-2.5">
                        <div className="text-lg font-bold text-blue-600">{invoiceStats.statusCounts.SUBMITTED || 0}</div>
                        <div className="text-[10px] text-gray-500">Submitted</div>
                      </div>
                      <div className="card p-2.5 border-yellow-200 bg-yellow-50">
                        <div className="text-lg font-bold text-yellow-600">{invoiceStats.statusCounts.NEEDS_INFO || 0}</div>
                        <div className="text-[10px] text-yellow-700">Needs Info</div>
                      </div>
                      <div className="card p-2.5">
                        <div className="text-lg font-bold text-green-600">{invoiceStats.statusCounts.APPROVED || 0}</div>
                        <div className="text-[10px] text-gray-500">Approved</div>
                      </div>
                      <div className="card p-2.5">
                        <div className="text-lg font-bold text-purple-600">{invoiceStats.statusCounts.SCHEDULED || 0}</div>
                        <div className="text-[10px] text-gray-500">Scheduled</div>
                      </div>
                      <div className="card p-2.5">
                        <div className="text-lg font-bold text-emerald-600">{invoiceStats.statusCounts.PAID || 0}</div>
                        <div className="text-[10px] text-gray-500">Paid</div>
                      </div>
                      <div className="card p-2.5 border-red-200 bg-red-50">
                        <div className="text-lg font-bold text-red-600">{invoiceStats.statusCounts.REJECTED || 0}</div>
                        <div className="text-[10px] text-red-700">Rejected</div>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Pharmacy Info Row */}
              <div className="grid grid-cols-4 gap-2">
                <div className="card p-2.5">
                  <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Code</div>
                  <div className="text-base font-bold font-mono text-primary-600">{selectedPharmacy.code}</div>
                </div>
                <div className="card p-2.5">
                  <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Name</div>
                  <div className="text-base font-bold text-gray-900 truncate">{selectedPharmacy.name}</div>
                </div>
                <div className="card p-2.5">
                  <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Status</div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-base font-bold text-emerald-600">Active</span>
                  </div>
                </div>
                <div className="card p-2.5">
                  <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Your Role</div>
                  <div className="text-base font-bold text-primary-600 truncate">{getMemberRole(selectedPharmacy)}</div>
                </div>
              </div>

              {/* Requirements & SLA Widgets */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <RequirementsWidget pharmacyId={selectedPharmacy.id} yearMonth={monthFilter} />
                <SlaAlertWidget pharmacyId={selectedPharmacy.id} yearMonth={monthFilter} />
              </div>
            </>
          )}

          {/* All Pharmacies List */}
          {pharmacies.length > 1 && (
            <div className="card p-5">
              <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">
                All Your Pharmacies
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pharmacies.map((pharmacy) => (
                  <div
                    key={pharmacy.id}
                    onClick={() => setSelectedPharmacy(pharmacy)}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedPharmacy?.id === pharmacy.id
                        ? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-mono text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{pharmacy.code}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${getRoleBadgeColor(getMemberRole(pharmacy))}`}>
                        {getMemberRole(pharmacy)}
                      </span>
                    </div>
                    <h4 className="font-semibold text-sm text-gray-900">{pharmacy.name}</h4>
                    <p className="text-xs text-gray-500 mt-1">{formatAddress(pharmacy)}</p>
                    {pharmacy.phone && (
                      <p className="text-xs text-gray-500">{pharmacy.phone}</p>
                    )}
                    {pharmacy.members && pharmacy.members.length > 0 && (
                      <p className="text-xs text-gray-500">{pharmacy.members[0].user.email}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
