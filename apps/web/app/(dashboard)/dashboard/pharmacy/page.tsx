'use client';

import { useAuth, PharmacyMembership } from '../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../lib/api';
import SlaAlertWidget from '../../../../components/sla/SlaAlertWidget';

type Pharmacy = {
  id: string;
  name: string;
  code: string;
  address?: string;
  org: { id: string; name: string };
  members?: { memberRole: string }[];
};

export default function PharmacyDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loadingPharmacies, setLoadingPharmacies] = useState(true);
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);

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

  const getRoleBadgeColor = (role: string): string => {
    if (role.includes('ADMIN')) return 'bg-violet-50 text-violet-700';
    if (role.includes('USER')) return 'bg-emerald-50 text-emerald-700';
    return 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Pharmacy Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Welcome back, {user.firstName || user.email}
          </p>
        </div>
        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${getRoleBadgeColor(user.role)}`}>
          {user.role.replace('_', ' ')}
        </span>
      </div>

      {/* Pharmacy Access Info */}
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              {pharmacies.length === 0
                ? "You don't have access to any pharmacies yet."
                : `You have access to ${pharmacies.length} pharmacy${pharmacies.length > 1 ? 'ies' : ''}.`
              }
            </p>
            {pharmacies.length === 0 && (
              <p className="text-xs text-gray-500 mt-0.5">Contact your administrator to get access.</p>
            )}
          </div>
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
              {/* Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card p-4">
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Code</div>
                  <div className="text-lg font-bold font-mono text-primary-600 mt-1">{selectedPharmacy.code}</div>
                </div>
                <div className="card p-4">
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Name</div>
                  <div className="text-lg font-bold text-gray-900 mt-1 truncate">{selectedPharmacy.name}</div>
                </div>
                <div className="card p-4">
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Status</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-lg font-bold text-emerald-600">Active</span>
                  </div>
                </div>
                <div className="card p-4">
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Your Role</div>
                  <div className="text-lg font-bold text-primary-600 mt-1 truncate">{getMemberRole(selectedPharmacy)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Pharmacy Details & Quick Actions */}
                <div className="lg:col-span-2 card p-5">
                  <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">
                    Pharmacy Details
                  </h3>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Address</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedPharmacy.address || 'Not specified'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Organization</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedPharmacy.org?.name || '-'}</dd>
                    </div>
                  </dl>

                  <div className="mt-5 pt-5 border-t border-gray-100">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h4>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/dashboard/pharmacy/invoices?pharmacyId=${selectedPharmacy.id}`}
                        className="btn-primary text-sm"
                      >
                        View Invoices
                      </a>
                      <a
                        href={`/dashboard/pharmacy/invoices/new?pharmacyId=${selectedPharmacy.id}`}
                        className="btn-secondary text-sm"
                      >
                        Create Invoice
                      </a>
                      <a
                        href="/dashboard/pharmacy/invoices/upload"
                        className="btn-accent text-sm gap-1.5"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Upload Invoice
                      </a>
                    </div>
                  </div>
                </div>

                {/* SLA Status Widget */}
                <div className="lg:col-span-1">
                  <SlaAlertWidget pharmacyId={selectedPharmacy.id} />
                </div>
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
                    <p className="text-xs text-gray-500 mt-1">{pharmacy.address || 'No address'}</p>
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
