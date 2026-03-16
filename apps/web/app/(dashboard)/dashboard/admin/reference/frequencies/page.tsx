'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../../lib/api';

type Frequency = {
  id: string;
  orgId: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
};

export default function FrequenciesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', code: '', description: '', sortOrder: 0 });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', sortOrder: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  const fetchFrequencies = async () => {
    try {
      const res = await apiFetch('/v1/admin/frequencies');
      if (res.ok) setFrequencies(await res.json());
    } catch { setError('Failed to load frequencies'); }
  };

  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      fetchFrequencies().finally(() => setLoadingData(false));
    }
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch('/v1/admin/frequencies', {
        method: 'POST',
        body: JSON.stringify({
          name: createForm.name,
          code: createForm.code.toUpperCase(),
          description: createForm.description || undefined,
          sortOrder: createForm.sortOrder,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to create'); }
      setSuccess('Frequency created.');
      setCreateForm({ name: '', code: '', description: '', sortOrder: 0 });
      setShowCreate(false);
      fetchFrequencies();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const startEdit = (f: Frequency) => {
    setEditingId(f.id);
    setEditForm({ name: f.name, description: f.description || '', sortOrder: f.sortOrder });
    setError(null); setSuccess(null);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/v1/admin/frequencies/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description || undefined,
          sortOrder: editForm.sortOrder,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to update'); }
      setSuccess('Frequency updated.');
      setEditingId(null);
      fetchFrequencies();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (f: Frequency) => {
    const action = f.isActive ? 'deactivate' : 'reactivate';
    if (f.isActive && !confirm(`Deactivate "${f.name}"?`)) return;
    setError(null); setSuccess(null);
    try {
      const res = await apiFetch(`/v1/admin/frequencies/${f.id}/${action}`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || `Failed to ${action}`); }
      setSuccess(`Frequency ${action}d.`);
      fetchFrequencies();
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

  if (!user || !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-heading font-bold text-gray-900">Frequencies</h1>
          <p className="text-xs text-gray-500">{frequencies.length} frequencies configured</p>
        </div>
        <button onClick={() => { setShowCreate(!showCreate); setError(null); setSuccess(null); }} className="btn-primary text-xs px-3 py-1.5">
          {showCreate ? 'Cancel' : '+ Add Frequency'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs">{success}</div>}

      {showCreate && (
        <div className="card p-3">
          <h3 className="text-xs font-semibold text-gray-900 mb-2">New Frequency</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Name *</label>
              <input type="text" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className="input-field text-xs py-1.5" required placeholder="e.g., Bi-Weekly" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Code *</label>
              <input type="text" value={createForm.code} onChange={e => setCreateForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="input-field text-xs py-1.5 font-mono" required placeholder="BI_WEEKLY" maxLength={50} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Description</label>
              <input type="text" value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} className="input-field text-xs py-1.5" placeholder="Optional" />
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Order</label>
                <input type="number" value={createForm.sortOrder} onChange={e => setCreateForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} className="input-field text-xs py-1.5 w-16" min={0} />
              </div>
              <button type="submit" disabled={creating} className="btn-accent text-xs px-3 py-1.5">{creating ? '...' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100 border-b-2 border-gray-300">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">Order</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">Code</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">Name</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px] hidden md:table-cell">Description</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">Status</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700 uppercase text-[11px]">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {frequencies.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No frequencies configured</td></tr>
            ) : frequencies.map((f) => (
              <tr key={f.id} className={`hover:bg-gray-50 ${!f.isActive ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2 text-gray-500">
                  {editingId === f.id ? (
                    <input type="number" value={editForm.sortOrder} onChange={e => setEditForm(ef => ({ ...ef, sortOrder: parseInt(e.target.value) || 0 }))} className="input-field py-1 text-xs w-14" min={0} />
                  ) : f.sortOrder}
                </td>
                <td className="px-3 py-2 font-mono text-gray-900">{f.code}</td>
                <td className="px-3 py-2 text-gray-900">
                  {editingId === f.id ? (
                    <input type="text" value={editForm.name} onChange={e => setEditForm(ef => ({ ...ef, name: e.target.value }))} className="input-field py-1 text-xs w-28" />
                  ) : f.name}
                </td>
                <td className="px-3 py-2 text-gray-500 hidden md:table-cell">
                  {editingId === f.id ? (
                    <input type="text" value={editForm.description} onChange={e => setEditForm(ef => ({ ...ef, description: e.target.value }))} className="input-field py-1 text-xs w-32" />
                  ) : (f.description || '-')}
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${f.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {f.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {editingId === f.id ? (
                      <>
                        <button onClick={handleEdit} disabled={saving} className="text-[10px] px-1.5 py-0.5 rounded bg-green-500 text-white font-medium">{saving ? '...' : 'Save'}</button>
                        <button onClick={() => setEditingId(null)} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(f)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-600">Edit</button>
                        <button onClick={() => handleToggleActive(f)} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${f.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                          {f.isActive ? 'Disable' : 'Enable'}
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
