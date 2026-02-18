'use client';

import { useAuth, Role, MemberRole } from '../../../../../../../components/AuthProvider';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../../../lib/api';
import Link from 'next/link';

type Member = {
  id: string;
  memberRole: MemberRole;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    role: Role;
    isActive: boolean;
  };
};

type UserOption = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: Role;
  isActive: boolean;
};

const MEMBER_ROLES: MemberRole[] = ['PHARMACY_ADMIN', 'PHARMACY_USER', 'READ_ONLY'];

const ROLE_COLORS: Record<string, string> = {
  PHARMACY_ADMIN: 'bg-blue-50 text-blue-700',
  PHARMACY_USER: 'bg-emerald-50 text-emerald-700',
  READ_ONLY: 'bg-gray-100 text-gray-600',
};

export default function PharmacyMembersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const pharmacyId = params.id as string;

  const [pharmacyName, setPharmacyName] = useState('');
  const [pharmacyCode, setPharmacyCode] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Add member form
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ userId: '', memberRole: 'PHARMACY_USER' as MemberRole });

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  const fetchMembers = async () => {
    try {
      const res = await apiFetch(`/v1/admin/pharmacies/${pharmacyId}/members`);
      if (res.ok) setMembers(await res.json());
    } catch (e) {
      setError('Failed to load members');
    }
  };

  const fetchAvailableUsers = async () => {
    try {
      const res = await apiFetch('/v1/admin/users');
      if (res.ok) {
        const allUsers: UserOption[] = await res.json();
        // Filter: only users with pharmacy-eligible roles, exclude those already members
        setAvailableUsers(allUsers);
      }
    } catch (e) {
      // silent
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN' && pharmacyId) {
      // Fetch pharmacy info from the list
      apiFetch('/v1/admin/pharmacies').then(res => {
        if (res.ok) return res.json();
      }).then((pharmacies: any[]) => {
        if (pharmacies) {
          const p = pharmacies.find((ph: any) => ph.id === pharmacyId);
          if (p) {
            setPharmacyName(p.name);
            setPharmacyCode(p.code);
          }
        }
      });

      Promise.all([fetchMembers(), fetchAvailableUsers()]).finally(() => setLoadingData(false));
    }
  }, [user, pharmacyId]);

  // Get users eligible to be added (not already members, and have pharmacy-eligible roles)
  const eligibleUsers = availableUsers.filter(u => {
    const isAlreadyMember = members.some(m => m.user.id === u.id);
    const eligibleRoles: string[] = ['PHARMACY_ADMIN', 'PHARMACY_USER', 'READ_ONLY'];
    return !isAlreadyMember && eligibleRoles.includes(u.role) && u.isActive;
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.userId) return;
    setAdding(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(`/v1/admin/pharmacies/${pharmacyId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          userId: addForm.userId,
          memberRole: addForm.memberRole,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to add member');
      }
      setSuccess('Member added successfully.');
      setAddForm({ userId: '', memberRole: 'PHARMACY_USER' });
      setShowAdd(false);
      fetchMembers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (memberId: string, email: string) => {
    if (!confirm(`Remove "${email}" from this pharmacy?`)) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(`/v1/admin/pharmacies/${pharmacyId}/members/${memberId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to remove member');
      }
      setSuccess('Member removed successfully.');
      fetchMembers();
    } catch (e: any) {
      setError(e.message);
    }
  };

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

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin/pharmacies" className="text-link text-sm">
          &larr; Back to Pharmacies
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">
            {pharmacyName || 'Pharmacy'} Members
          </h1>
          {pharmacyCode && (
            <p className="text-sm text-gray-500 mt-1">
              Code: <span className="font-mono">{pharmacyCode}</span>
            </p>
          )}
        </div>
        <button onClick={() => { setShowAdd(!showAdd); setError(null); setSuccess(null); }} className="btn-primary">
          {showAdd ? 'Cancel' : 'Add Member'}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {/* Add Member Form */}
      {showAdd && (
        <div className="card p-5">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">Add Member</h3>
          {eligibleUsers.length === 0 ? (
            <p className="text-sm text-gray-500">
              No eligible users available. Only users with PHARMACY_ADMIN, PHARMACY_USER, or READ_ONLY roles can be added.
              <Link href="/dashboard/admin/users" className="text-link ml-1">Create a user first.</Link>
            </p>
          ) : (
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="field-label">User <span className="text-red-500">*</span></label>
                <select
                  value={addForm.userId}
                  onChange={e => setAddForm(f => ({ ...f, userId: e.target.value }))}
                  className="input-field"
                  required
                >
                  <option value="">Select a user...</option>
                  {eligibleUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.email} ({[u.firstName, u.lastName].filter(Boolean).join(' ') || u.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Member Role <span className="text-red-500">*</span></label>
                <select
                  value={addForm.memberRole}
                  onChange={e => setAddForm(f => ({ ...f, memberRole: e.target.value as MemberRole }))}
                  className="input-field"
                >
                  {MEMBER_ROLES.map(r => (
                    <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={adding} className="btn-accent">
                  {adding ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Members Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">System Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Member Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No members assigned to this pharmacy yet.
                  </td>
                </tr>
              ) : members.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{m.user.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                    {[m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                    {m.user.phone || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="text-xs text-gray-500">{m.user.role.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[m.memberRole] || 'bg-gray-100 text-gray-600'}`}>
                      {m.memberRole.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => handleRemove(m.id, m.user.email)}
                      className="text-xs px-2 py-1 rounded-md font-medium text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
