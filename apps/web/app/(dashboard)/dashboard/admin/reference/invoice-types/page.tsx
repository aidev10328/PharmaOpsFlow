'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../../lib/api';

type InvoiceType = {
  id: string;
  orgId: string;
  name: string;
  code: string;
  description?: string;
  isRequired: boolean;
  isActive: boolean;
  createdAt: string;
  _count: { invoices: number; requiredInvoiceTypes: number };
};

export default function InvoiceTypesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [types, setTypes] = useState<InvoiceType[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', code: '', description: '', isRequired: false });

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', isRequired: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  const fetchTypes = async () => {
    try {
      const res = await apiFetch('/v1/admin/invoice-types');
      if (res.ok) setTypes(await res.json());
    } catch { setError('Failed to load invoice types'); }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchTypes().finally(() => setLoadingData(false));
    }
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch('/v1/admin/invoice-types', {
        method: 'POST',
        body: JSON.stringify({
          name: createForm.name,
          code: createForm.code.toUpperCase(),
          description: createForm.description || undefined,
          isRequired: createForm.isRequired,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to create'); }
      setSuccess('Invoice type created.');
      setCreateForm({ name: '', code: '', description: '', isRequired: false });
      setShowCreate(false);
      fetchTypes();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const startEdit = (t: InvoiceType) => {
    setEditingId(t.id);
    setEditForm({ name: t.name, description: t.description || '', isRequired: t.isRequired });
    setError(null); setSuccess(null);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/v1/admin/invoice-types/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description || undefined,
          isRequired: editForm.isRequired,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to update'); }
      setSuccess('Invoice type updated.');
      setEditingId(null);
      fetchTypes();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (t: InvoiceType) => {
    const action = t.isActive ? 'deactivate' : 'reactivate';
    if (t.isActive && !confirm(`Deactivate "${t.name}"? This prevents new invoices from using this type.`)) return;
    setError(null); setSuccess(null);
    try {
      const res = await apiFetch(`/v1/admin/invoice-types/${t.id}/${action}`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || `Failed to ${action}`); }
      setSuccess(`Invoice type ${action}d.`);
      fetchTypes();
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
    <div className="max-w-5xl mx-auto space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-heading font-bold text-gray-900">Invoice Types</h1>
          <p className="text-xs text-gray-500">{types.length} types configured</p>
        </div>
        <button onClick={() => { setShowCreate(!showCreate); setError(null); setSuccess(null); }} className="btn-primary text-xs px-3 py-1.5">
          {showCreate ? 'Cancel' : '+ Add Type'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs">{success}</div>}

      {/* Create Form */}
      {showCreate && (
        <div className="card p-3">
          <h3 className="text-xs font-semibold text-gray-900 mb-2">New Invoice Type</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Name *</label>
              <input type="text" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className="input-field text-xs py-1.5" required placeholder="e.g., Rent" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Code *</label>
              <input type="text" value={createForm.code} onChange={e => setCreateForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="input-field text-xs py-1.5 font-mono" required placeholder="RENT" maxLength={50} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Description</label>
              <input type="text" value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} className="input-field text-xs py-1.5" placeholder="Optional" />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={createForm.isRequired} onChange={e => setCreateForm(f => ({ ...f, isRequired: e.target.checked }))} className="rounded border-gray-300 text-primary-600 w-3 h-3" />
                <span className="text-[10px] text-gray-700">Required</span>
              </label>
              <button type="submit" disabled={creating} className="btn-accent text-xs px-3 py-1.5">{creating ? '...' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Code</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Name</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase hidden md:table-cell">Description</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Required</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Status</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase hidden md:table-cell">Invoices</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {types.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No invoice types configured</td></tr>
            ) : types.map((t) => (
              <tr key={t.id} className={`hover:bg-gray-50 ${!t.isActive ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2 font-mono text-gray-900">{t.code}</td>
                <td className="px-3 py-2 text-gray-900">
                  {editingId === t.id ? (
                    <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="input-field py-1 text-xs w-28" />
                  ) : t.name}
                </td>
                <td className="px-3 py-2 text-gray-500 hidden md:table-cell">
                  {editingId === t.id ? (
                    <input type="text" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} className="input-field py-1 text-xs w-32" />
                  ) : (t.description || '-')}
                </td>
                <td className="px-3 py-2">
                  {editingId === t.id ? (
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={editForm.isRequired} onChange={e => setEditForm(f => ({ ...f, isRequired: e.target.checked }))} className="rounded border-gray-300 text-primary-600 w-3 h-3" />
                      <span className="text-[10px]">Req</span>
                    </label>
                  ) : (
                    t.isRequired ? (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">Required</span>
                    ) : (
                      <span className="text-[10px] text-gray-400">Optional</span>
                    )
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${t.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {t.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500 hidden md:table-cell">{t._count.invoices}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {editingId === t.id ? (
                      <>
                        <button onClick={handleEdit} disabled={saving} className="text-[10px] px-1.5 py-0.5 rounded bg-green-500 text-white font-medium">{saving ? '...' : 'Save'}</button>
                        <button onClick={() => setEditingId(null)} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(t)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-600">Edit</button>
                        <button onClick={() => handleToggleActive(t)} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${t.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                          {t.isActive ? 'Disable' : 'Enable'}
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
