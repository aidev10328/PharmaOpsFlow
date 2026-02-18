'use client';

import { useAuth, Role } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../lib/api';

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

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '', password: '', firstName: '', lastName: '', phone: '', role: 'PHARMACY_USER' as Role, orgId: '',
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ email: '', firstName: '', lastName: '', phone: '', role: '' as Role });
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string>('');

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/v1/admin/users');
      if (res.ok) setUsers(await res.json());
    } catch { setError('Failed to load users'); }
    finally { setLoadingData(false); }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchUsers();
      apiFetch('/v1/admin/org').then(res => res.ok ? res.json() : null).then(org => {
        if (org) { setOrgId(org.id); setCreateForm(f => ({ ...f, orgId: org.id })); }
      });
    }
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true); setError(null); setSuccess(null); setTempPassword(null);
    try {
      const res = await apiFetch('/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: createForm.email, password: createForm.password,
          firstName: createForm.firstName || undefined, lastName: createForm.lastName || undefined,
          phone: createForm.phone || undefined, role: createForm.role,
          orgId: createForm.role === 'ADMIN' ? undefined : orgId,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed'); }
      setSuccess('User created'); setCreateForm({ email: '', password: '', firstName: '', lastName: '', phone: '', role: 'PHARMACY_USER', orgId });
      setShowCreate(false); fetchUsers();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const startEdit = (u: UserRow) => {
    setEditingId(u.id);
    setEditForm({ email: u.email, firstName: u.firstName || '', lastName: u.lastName || '', phone: u.phone || '', role: u.role });
    setError(null); setSuccess(null); setTempPassword(null);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true); setError(null);
    try {
      const res = await apiFetch(`/v1/admin/users/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ email: editForm.email, firstName: editForm.firstName || undefined, lastName: editForm.lastName || undefined, phone: editForm.phone || undefined, role: editForm.role }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed'); }
      setSuccess('User updated'); setEditingId(null); fetchUsers();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleResetPassword = async (userId: string) => {
    if (!confirm('Reset password?')) return;
    setError(null); setSuccess(null); setTempPassword(null);
    try {
      const res = await apiFetch(`/v1/admin/users/${userId}/reset-password`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed'); }
      const data = await res.json();
      setTempPassword(data.tempPassword); setSuccess('Password reset');
    } catch (e: any) { setError(e.message); }
  };

  const toggleActive = async (u: UserRow) => {
    const action = u.isActive ? 'disable' : 'enable';
    if (u.isActive && !confirm(`Disable "${u.email}"?`)) return;
    setError(null); setSuccess(null); setTempPassword(null);
    try {
      const res = await apiFetch(`/v1/admin/users/${u.id}/${action}`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed'); }
      setSuccess(`User ${action}d`); fetchUsers();
    } catch (e: any) { setError(e.message); }
  };

  if (loading || loadingData) {
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

  return (
    <div className="max-w-6xl mx-auto space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-heading font-bold text-gray-900">Users</h1>
          <p className="text-xs text-gray-500">{users.length} total users</p>
        </div>
        <button onClick={() => { setShowCreate(!showCreate); setError(null); setSuccess(null); setTempPassword(null); }} className="btn-primary text-xs px-3 py-1.5">
          {showCreate ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs">{success}</div>}
      {tempPassword && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded text-xs">
          <strong>Temp Password:</strong> <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold">{tempPassword}</code>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="card p-3">
          <h3 className="text-xs font-semibold text-gray-900 mb-2">New User</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Email *</label>
              <input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} className="input-field text-xs py-1.5" required />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Password *</label>
              <input type="text" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} className="input-field text-xs py-1.5 font-mono" minLength={8} required />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">First Name</label>
              <input type="text" value={createForm.firstName} onChange={e => setCreateForm(f => ({ ...f, firstName: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Last Name</label>
              <input type="text" value={createForm.lastName} onChange={e => setCreateForm(f => ({ ...f, lastName: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Phone</label>
              <input type="tel" value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Role *</label>
              <select value={createForm.role} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value as Role }))} className="input-field text-xs py-1.5">
                {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={creating} className="btn-accent text-xs px-3 py-1.5">{creating ? 'Creating...' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="card overflow-hidden">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Email</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase hidden md:table-cell">Name</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Role</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Status</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase hidden lg:table-cell">Pharmacies</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {users.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No users found</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-900">
                  {editingId === u.id ? (
                    <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="input-field py-1 text-xs w-full" />
                  ) : u.email}
                </td>
                <td className="px-3 py-2 text-gray-600 hidden md:table-cell">
                  {editingId === u.id ? (
                    <div className="flex gap-1">
                      <input type="text" value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First" className="input-field py-1 text-xs w-20" />
                      <input type="text" value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last" className="input-field py-1 text-xs w-20" />
                    </div>
                  ) : ([u.firstName, u.lastName].filter(Boolean).join(' ') || '-')}
                </td>
                <td className="px-3 py-2">
                  {editingId === u.id ? (
                    <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as Role }))} className="input-field py-1 text-[10px]">
                      {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                    </select>
                  ) : (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-600'}`}>
                      {u.role.replace(/_/g, ' ')}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {u.isActive ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                      <span className="w-1 h-1 rounded-full bg-emerald-500" />Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                      <span className="w-1 h-1 rounded-full bg-gray-400" />Disabled
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600 hidden lg:table-cell">{u._count.pharmacyMemberships}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {editingId === u.id ? (
                      <>
                        <button onClick={handleEdit} disabled={saving} className="text-[10px] px-1.5 py-0.5 rounded bg-green-500 text-white font-medium">{saving ? '...' : 'Save'}</button>
                        <button onClick={() => setEditingId(null)} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(u)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-600">Edit</button>
                        <button onClick={() => handleResetPassword(u.id)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-600">Reset</button>
                        <button onClick={() => toggleActive(u)} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${u.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
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
  );
}
