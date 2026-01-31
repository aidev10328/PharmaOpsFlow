'use client';

import { useAuth, Role } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../lib/api';
import Link from 'next/link';

type UserRow = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: Role;
  orgId?: string;
  isActive: boolean;
  createdAt: string;
  org?: { id: string; name: string };
  _count: { pharmacyMemberships: number };
};

const ROLES: Role[] = ['ADMIN', 'COMPANY_MANAGER', 'PHARMACY_ADMIN', 'PHARMACY_USER', 'READ_ONLY'];

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-red-50 text-red-700',
  COMPANY_MANAGER: 'bg-violet-50 text-violet-700',
  PHARMACY_ADMIN: 'bg-blue-50 text-blue-700',
  PHARMACY_USER: 'bg-emerald-50 text-emerald-700',
  READ_ONLY: 'bg-gray-100 text-gray-600',
};

export default function AdminUsersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '', password: '', firstName: '', lastName: '', phone: '', role: 'PHARMACY_USER' as Role, orgId: '',
  });

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ email: '', firstName: '', lastName: '', phone: '', role: '' as Role });
  const [saving, setSaving] = useState(false);

  // Org info for assignment
  const [orgId, setOrgId] = useState<string>('');

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/v1/admin/users');
      if (res.ok) setUsers(await res.json());
    } catch (e) {
      setError('Failed to load users');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchUsers();
      // Fetch org for create form
      apiFetch('/v1/admin/org').then(res => {
        if (res.ok) return res.json();
      }).then(org => {
        if (org) {
          setOrgId(org.id);
          setCreateForm(f => ({ ...f, orgId: org.id }));
        }
      });
    }
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    setTempPassword(null);
    try {
      const res = await apiFetch('/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: createForm.email,
          password: createForm.password,
          firstName: createForm.firstName || undefined,
          lastName: createForm.lastName || undefined,
          phone: createForm.phone || undefined,
          role: createForm.role,
          orgId: createForm.role === 'ADMIN' ? undefined : orgId,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create user');
      }
      setSuccess('User created successfully.');
      setCreateForm({ email: '', password: '', firstName: '', lastName: '', phone: '', role: 'PHARMACY_USER', orgId });
      setShowCreate(false);
      fetchUsers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (u: UserRow) => {
    setEditingId(u.id);
    setEditForm({ email: u.email, firstName: u.firstName || '', lastName: u.lastName || '', phone: u.phone || '', role: u.role });
    setError(null);
    setSuccess(null);
    setTempPassword(null);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/v1/admin/users/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email: editForm.email,
          firstName: editForm.firstName || undefined,
          lastName: editForm.lastName || undefined,
          phone: editForm.phone || undefined,
          role: editForm.role,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update user');
      }
      setSuccess('User updated successfully.');
      setEditingId(null);
      fetchUsers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!confirm('Reset this user\'s password? A temporary password will be generated.')) return;
    setError(null);
    setSuccess(null);
    setTempPassword(null);
    try {
      const res = await apiFetch(`/v1/admin/users/${userId}/reset-password`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to reset password');
      }
      const data = await res.json();
      setTempPassword(data.tempPassword);
      setSuccess('Password reset successfully. See the temporary password below.');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleActive = async (u: UserRow) => {
    const action = u.isActive ? 'disable' : 'enable';
    if (u.isActive && !confirm(`Are you sure you want to disable "${u.email}"?`)) return;
    setError(null);
    setSuccess(null);
    setTempPassword(null);
    try {
      const res = await apiFetch(`/v1/admin/users/${u.id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || `Failed to ${action} user`);
      }
      setSuccess(`User ${action}d successfully.`);
      fetchUsers();
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
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin" className="text-link text-sm">
          &larr; Back to Admin
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="page-title">User Management</h1>
        <button onClick={() => { setShowCreate(!showCreate); setError(null); setSuccess(null); setTempPassword(null); }} className="btn-primary">
          {showCreate ? 'Cancel' : 'Create User'}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}
      {tempPassword && (
        <div className="alert-info">
          <strong>Temporary Password:</strong>{' '}
          <code className="bg-white px-2 py-0.5 rounded text-sm font-mono font-bold">{tempPassword}</code>
          <p className="text-xs mt-1 opacity-75">Please share this with the user securely. They should change it after first login.</p>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="card p-5">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">New User</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={createForm.email}
                onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="field-label">Password <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={createForm.password}
                onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                className="input-field font-mono"
                minLength={8}
                required
              />
              <p className="field-hint">Minimum 8 characters</p>
            </div>
            <div>
              <label className="field-label">First Name</label>
              <input
                type="text"
                value={createForm.firstName}
                onChange={e => setCreateForm(f => ({ ...f, firstName: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">Last Name</label>
              <input
                type="text"
                value={createForm.lastName}
                onChange={e => setCreateForm(f => ({ ...f, lastName: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">Phone</label>
              <input
                type="tel"
                value={createForm.phone}
                onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                className="input-field"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="field-label">Role <span className="text-red-500">*</span></label>
              <select
                value={createForm.role}
                onChange={e => setCreateForm(f => ({ ...f, role: e.target.value as Role }))}
                className="input-field"
              >
                {ROLES.map(r => (
                  <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Pharmacies</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    No users found.
                  </td>
                </tr>
              ) : users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {editingId === u.id ? (
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                        className="input-field py-1 text-sm"
                      />
                    ) : u.email}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                    {editingId === u.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editForm.firstName}
                          onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                          placeholder="First"
                          className="input-field py-1 text-sm w-24"
                        />
                        <input
                          type="text"
                          value={editForm.lastName}
                          onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                          placeholder="Last"
                          className="input-field py-1 text-sm w-24"
                        />
                      </div>
                    ) : (
                      [u.firstName, u.lastName].filter(Boolean).join(' ') || '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                    {editingId === u.id ? (
                      <input
                        type="tel"
                        value={editForm.phone}
                        onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="Phone"
                        className="input-field py-1 text-sm w-32"
                      />
                    ) : (
                      u.phone || '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {editingId === u.id ? (
                      <select
                        value={editForm.role}
                        onChange={e => setEditForm(f => ({ ...f, role: e.target.value as Role }))}
                        className="input-field py-1 text-xs"
                      >
                        {ROLES.map(r => (
                          <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-600'}`}>
                        {u.role.replace(/_/g, ' ')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {u.isActive ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                    {u._count.pharmacyMemberships}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-1 flex-wrap">
                      {editingId === u.id ? (
                        <>
                          <button onClick={handleEdit} disabled={saving} className="btn-primary text-xs px-2 py-1">
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} className="btn-ghost text-xs">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(u)} className="btn-ghost text-xs">Edit</button>
                          <button onClick={() => handleResetPassword(u.id)} className="btn-ghost text-xs">Reset PW</button>
                          <button
                            onClick={() => toggleActive(u)}
                            className={`text-xs px-2 py-1 rounded-md font-medium ${
                              u.isActive
                                ? 'text-red-600 hover:bg-red-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            {u.isActive ? 'Disable' : 'Enable'}
                          </button>
                        </>
                      )}
                    </div>
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
