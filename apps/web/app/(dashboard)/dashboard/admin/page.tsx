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

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loadingPharmacies, setLoadingPharmacies] = useState(true);

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
    if (user?.role === 'ADMIN') {
      fetchPharmacies();
    }
  }, [user]);

  if (loading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">Admin Dashboard</h1>
        <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
          System Admin
        </span>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="text-lg font-heading font-semibold text-gray-900 mb-2">
          Welcome, {user.firstName || 'Admin'}!
        </h2>
        <p className="text-gray-600">
          You have full system access. Manage all organizations, pharmacies, and users from here.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="card p-4">
          <div className="text-2xl font-bold text-primary">{pharmacies.length}</div>
          <div className="text-sm text-gray-500">Total Pharmacies</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-accent">1</div>
          <div className="text-sm text-gray-500">Organizations</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-gray-900">Active</div>
          <div className="text-sm text-gray-500">System Status</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-primary">{user.role}</div>
          <div className="text-sm text-gray-500">Your Role</div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-heading font-semibold text-gray-900 mb-4">All Pharmacies</h3>
        {loadingPharmacies ? (
          <p className="text-gray-500">Loading pharmacies...</p>
        ) : pharmacies.length === 0 ? (
          <p className="text-gray-500">No pharmacies found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Members</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pharmacies.map((pharmacy) => (
                  <tr key={pharmacy.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">{pharmacy.code}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{pharmacy.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{pharmacy.org?.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{pharmacy.address || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{pharmacy._count?.members ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
