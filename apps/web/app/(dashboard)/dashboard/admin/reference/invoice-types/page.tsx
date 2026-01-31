'use client';

import { useAuth, Role } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

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
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin" className="text-link text-sm">&larr; Back to Admin</Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Invoice Types</h1>
          <p className="text-sm text-gray-500 mt-1">Manage invoice categories for your organization</p>
        </div>
        <button onClick={() => { setShowCreate(!showCreate); setError(null); setSuccess(null); }} className="btn-primary">
          {showCreate ? 'Cancel' : 'New Invoice Type'}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {/* Create Form */}
      {showCreate && (
        <div className="card p-5">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">Create Invoice Type</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Name <span className="text-red-500">*</span></label>
              <input type="text" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className="input-field" required placeholder="e.g., Rent" />
            </div>
            <div>
              <label className="field-label">Code <span className="text-red-500">*</span></label>
              <input type="text" value={createForm.code} onChange={e => setCreateForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="input-field font-mono" required placeholder="e.g., RENT" maxLength={50} />
              <p className="text-xs text-gray-400 mt-1">Immutable after creation</p>
            </div>
            <div className="md:col-span-2">
              <label className="field-label">Description</label>
              <input type="text" value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} className="input-field" placeholder="Optional description" />
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={createForm.isRequired} onChange={e => setCreateForm(f => ({ ...f, isRequired: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Required for SLA compliance</span>
              </label>
            </div>
            <div className="md:col-span-2">
              <button type="submit" disabled={creating} className="btn-primary">{creating ? 'Creating...' : 'Create Invoice Type'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Required</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Invoices</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {types.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">No invoice types configured yet.</td>
                </tr>
              ) : types.map((t) => (
                <tr key={t.id} className={`hover:bg-gray-50 ${!t.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{t.code}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {editingId === t.id ? (
                      <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="input-field py-1 text-sm w-40" />
                    ) : t.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
                    {editingId === t.id ? (
                      <input type="text" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} className="input-field py-1 text-sm w-48" placeholder="Description" />
                    ) : (t.description || '-')}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {editingId === t.id ? (
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={editForm.isRequired} onChange={e => setEditForm(f => ({ ...f, isRequired: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                        <span className="text-xs">Required</span>
                      </label>
                    ) : (
                      t.isRequired ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">Required</span>
                      ) : (
                        <span className="text-xs text-gray-400">Optional</span>
                      )
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${t.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{t._count.invoices}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      {editingId === t.id ? (
                        <>
                          <form onSubmit={handleEdit} className="inline">
                            <button type="submit" disabled={saving} className="text-xs px-2 py-1 rounded-md font-medium text-primary-600 hover:bg-primary-50">{saving ? 'Saving...' : 'Save'}</button>
                          </form>
                          <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 rounded-md font-medium text-gray-500 hover:bg-gray-100">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(t)} className="text-xs px-2 py-1 rounded-md font-medium text-primary-600 hover:bg-primary-50">Edit</button>
                          <button onClick={() => handleToggleActive(t)} className={`text-xs px-2 py-1 rounded-md font-medium ${t.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                            {t.isActive ? 'Deactivate' : 'Reactivate'}
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
