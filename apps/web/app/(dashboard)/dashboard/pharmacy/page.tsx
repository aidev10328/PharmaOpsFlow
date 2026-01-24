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
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!user) {
    return null;
  }

  // Get user's role for the selected pharmacy
  const getMemberRole = (pharmacy: Pharmacy): string => {
    if (pharmacy.members && pharmacy.members.length > 0) {
      return pharmacy.members[0].memberRole.replace('_', ' ');
    }
    // Check from user's memberships
    const membership = user.pharmacyMemberships?.find(
      (m: PharmacyMembership) => m.pharmacyId === pharmacy.id
    );
    return membership?.memberRole?.replace('_', ' ') || user.role.replace('_', ' ');
  };

  const getRoleBadgeColor = (role: string): string => {
    if (role.includes('ADMIN')) return 'bg-purple-100 text-purple-800';
    if (role.includes('USER')) return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">Pharmacy Dashboard</h1>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor(user.role)}`}>
          {user.role.replace('_', ' ')}
        </span>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="text-lg font-heading font-semibold text-gray-900 mb-2">
          Welcome, {user.firstName || user.email}!
        </h2>
        <p className="text-gray-600">
          {pharmacies.length === 0
            ? "You don't have access to any pharmacies yet."
            : `You have access to ${pharmacies.length} pharmacy(s).`
          }
        </p>
      </div>

      {loadingPharmacies ? (
        <div className="card p-6">
          <p className="text-gray-500">Loading your pharmacies...</p>
        </div>
      ) : pharmacies.length === 0 ? (
        <div className="card p-6">
          <div className="text-center py-8">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pharmacies Assigned</h3>
            <p className="text-gray-600">
              Contact your administrator to get access to a pharmacy.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Pharmacy Selector */}
          {pharmacies.length > 1 && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Pharmacy
              </label>
              <select
                value={selectedPharmacy?.id || ''}
                onChange={(e) => {
                  const pharmacy = pharmacies.find(p => p.id === e.target.value);
                  setSelectedPharmacy(pharmacy || null);
                }}
                className="input-field max-w-md"
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="card p-4">
                  <div className="text-2xl font-bold font-mono text-primary">{selectedPharmacy.code}</div>
                  <div className="text-sm text-gray-500">Pharmacy Code</div>
                </div>
                <div className="card p-4">
                  <div className="text-2xl font-bold text-gray-900">{selectedPharmacy.name}</div>
                  <div className="text-sm text-gray-500">Pharmacy Name</div>
                </div>
                <div className="card p-4">
                  <div className="text-2xl font-bold text-accent">Active</div>
                  <div className="text-sm text-gray-500">Status</div>
                </div>
                <div className="card p-4">
                  <div className="text-2xl font-bold text-primary">{getMemberRole(selectedPharmacy)}</div>
                  <div className="text-sm text-gray-500">Your Role Here</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 card p-6">
                  <h3 className="text-lg font-heading font-semibold text-gray-900 mb-4">
                    Pharmacy Details
                  </h3>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Address</dt>
                      <dd className="mt-1 text-gray-900">{selectedPharmacy.address || 'Not specified'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Organization</dt>
                      <dd className="mt-1 text-gray-900">{selectedPharmacy.org?.name || '-'}</dd>
                    </div>
                  </dl>

                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Quick Actions</h4>
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
            <div className="card p-6 mt-6">
              <h3 className="text-lg font-heading font-semibold text-gray-900 mb-4">
                All Your Pharmacies
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pharmacies.map((pharmacy) => (
                  <div
                    key={pharmacy.id}
                    onClick={() => setSelectedPharmacy(pharmacy)}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedPharmacy?.id === pharmacy.id
                        ? 'border-primary bg-primary-50'
                        : 'border-gray-200 hover:border-primary hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-mono text-sm text-gray-500">{pharmacy.code}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${getRoleBadgeColor(getMemberRole(pharmacy))}`}>
                        {getMemberRole(pharmacy)}
                      </span>
                    </div>
                    <h4 className="font-semibold text-gray-900">{pharmacy.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">{pharmacy.address || 'No address'}</p>
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
