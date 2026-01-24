'use client';

import { useAuth } from '../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../lib/api';

type Pharmacy = {
  id: string;
  name: string;
  code: string;
  address?: string;
  org: { id: string; name: string };
  _count?: { members: number };
};

export default function ManagerDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loadingPharmacies, setLoadingPharmacies] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'COMPANY_MANAGER' && user.role !== 'ADMIN') {
      router.push('/dashboard');
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
        }
      } catch (e) {
        console.error('Failed to fetch pharmacies:', e);
      } finally {
        setLoadingPharmacies(false);
      }
    }
    if (user && (user.role === 'COMPANY_MANAGER' || user.role === 'ADMIN')) {
      fetchPharmacies();
    }
  }, [user]);

  if (loading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">Manager Dashboard</h1>
        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
          Company Manager
        </span>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="text-lg font-heading font-semibold text-gray-900 mb-2">
          Welcome, {user.firstName || user.email}!
        </h2>
        <p className="text-gray-600">
          You are managing <strong>{user.org?.name || 'your organization'}</strong>.
          You have access to all pharmacies within your organization.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="card p-4">
          <div className="text-2xl font-bold text-primary">{pharmacies.length}</div>
          <div className="text-sm text-gray-500">Your Pharmacies</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-accent">{user.org?.name || '-'}</div>
          <div className="text-sm text-gray-500">Organization</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-gray-900">Active</div>
          <div className="text-sm text-gray-500">Status</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-primary">{user.role.replace('_', ' ')}</div>
          <div className="text-sm text-gray-500">Your Role</div>
        </div>
      </div>

      <div className="card p-6 mb-6">
        <h3 className="text-lg font-heading font-semibold text-gray-900 mb-4">
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-4">
          <a
            href="/dashboard/manager/invoices"
            className="btn-primary"
          >
            Review Invoices
          </a>
          <a
            href="/dashboard/manager/compliance"
            className="btn-secondary"
          >
            SLA Compliance
          </a>
          <a
            href="/dashboard/manager/explore"
            className="btn-secondary"
          >
            Invoice Explorer
          </a>
          <a
            href="/dashboard/manager/chat"
            className="btn-secondary"
          >
            AI Chat Assistant
          </a>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-heading font-semibold text-gray-900 mb-4">
          Organization Pharmacies
        </h3>
        {loadingPharmacies ? (
          <p className="text-gray-500">Loading pharmacies...</p>
        ) : pharmacies.length === 0 ? (
          <p className="text-gray-500">No pharmacies found in your organization.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pharmacies.map((pharmacy) => (
              <div
                key={pharmacy.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-primary hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="font-mono text-sm text-gray-500">{pharmacy.code}</span>
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                    Active
                  </span>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">{pharmacy.name}</h4>
                <p className="text-sm text-gray-600 mb-2">{pharmacy.address || 'No address'}</p>
                <div className="text-xs text-gray-500">
                  {pharmacy._count?.members ?? 0} member(s)
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
