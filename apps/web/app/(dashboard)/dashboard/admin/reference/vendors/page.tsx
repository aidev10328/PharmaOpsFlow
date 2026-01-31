'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

type Vendor = {
  id: string;
  orgId: string;
  pharmacyId?: string | null;
  name: string;
  externalRef?: string;
  phone?: string;
  email?: string;
  paymentTerms?: string;
  isActive: boolean;
  createdAt: string;
  pharmacy?: { id: string; name: string; code: string } | null;
  _count: { invoices: number };
};

type PharmacyOption = {
  id: string;
  name: string;
  code: string;
};

export default function VendorsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [pharmacies, setPharmacies] = useState<PharmacyOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'org-wide' | 'pharmacy'>('all');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', pharmacyId: '', externalRef: '', phone: '', email: '', paymentTerms: '' });

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', pharmacyId: '', externalRef: '', phone: '', email: '', paymentTerms: '' });
  const [saving, setSaving] = useState(false);

  // Merge state
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  const fetchVendors = async () => {
    try {
      const res = await apiFetch('/v1/admin/vendors');
      if (res.ok) setVendors(await res.json());
    } catch { setError('Failed to load vendors'); }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      Promise.all([
        apiFetch('/v1/admin/pharmacies').then(r => r.ok ? r.json() : []).then((ps: any[]) => {
          setPharmacies(ps.map((p: any) => ({ id: p.id, name: p.name, code: p.code })));
        }),
        fetchVendors(),
      ]).finally(() => setLoadingData(false));
    }
  }, [user]);

  const filteredVendors = vendors.filter(v => {
    if (filter === 'org-wide') return !v.pharmacyId;
    if (filter === 'pharmacy') return !!v.pharmacyId;
    return true;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null); setSuccess(null);
    try {
      const res = await apiFetch('/v1/admin/vendors', {
        method: 'POST',
        body: JSON.stringify({
          name: createForm.name,
          pharmacyId: createForm.pharmacyId || undefined,
          externalRef: createForm.externalRef || undefined,
          phone: createForm.phone || undefined,
          email: createForm.email || undefined,
          paymentTerms: createForm.paymentTerms || undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to create'); }
      setSuccess('Vendor created.');
      setCreateForm({ name: '', pharmacyId: '', externalRef: '', phone: '', email: '', paymentTerms: '' });
      setShowCreate(false);
      fetchVendors();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const startEdit = (v: Vendor) => {
    setEditingId(v.id);
    setEditForm({ name: v.name, pharmacyId: v.pharmacyId || '', externalRef: v.externalRef || '', phone: v.phone || '', email: v.email || '', paymentTerms: v.paymentTerms || '' });
    setError(null); setSuccess(null);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/v1/admin/vendors/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          pharmacyId: editForm.pharmacyId || undefined,
          externalRef: editForm.externalRef || undefined,
          phone: editForm.phone || undefined,
          email: editForm.email || undefined,
          paymentTerms: editForm.paymentTerms || undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to update'); }
      setSuccess('Vendor updated.');
      setEditingId(null);
      fetchVendors();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (v: Vendor) => {
    const action = v.isActive ? 'deactivate' : 'reactivate';
    if (v.isActive && !confirm(`Deactivate "${v.name}"?`)) return;
    setError(null); setSuccess(null);
    try {
      const res = await apiFetch(`/v1/admin/vendors/${v.id}/${action}`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || `Failed to ${action}`); }
      setSuccess(`Vendor ${action}d.`);
      fetchVendors();
    } catch (e: any) { setError(e.message); }
  };

  const handleMerge = async () => {
    if (!mergingId || !mergeTargetId) return;
    if (!confirm(`Merge this vendor into the selected target? All invoices will be reassigned and this vendor will be deactivated.`)) return;
    setMerging(true);
    setError(null); setSuccess(null);
    try {
      const res = await apiFetch(`/v1/admin/vendors/${mergingId}/merge`, {
        method: 'POST',
        body: JSON.stringify({ targetVendorId: mergeTargetId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to merge'); }
      const result = await res.json();
      setSuccess(`Vendor merged. ${result.invoicesReassigned} invoice(s) reassigned.`);
      setMergingId(null);
      setMergeTargetId('');
      fetchVendors();
    } catch (e: any) { setError(e.message); }
    finally { setMerging(false); }
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
        <Link href="/dashboard/admin" className="text-link text-sm">&larr; Back to Admin</Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Vendors</h1>
          <p className="text-sm text-gray-500 mt-1">Manage org-wide and pharmacy-specific vendors</p>
        </div>
        <button onClick={() => { setShowCreate(!showCreate); setError(null); setSuccess(null); }} className="btn-primary">
          {showCreate ? 'Cancel' : 'New Vendor'}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {/* Create Form */}
      {showCreate && (
        <div className="card p-5">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">Create Vendor</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="field-label">Name <span className="text-red-500">*</span></label>
              <input type="text" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className="input-field" required />
            </div>
            <div>
              <label className="field-label">Pharmacy (optional)</label>
              <select value={createForm.pharmacyId} onChange={e => setCreateForm(f => ({ ...f, pharmacyId: e.target.value }))} className="input-field">
                <option value="">Org-wide (all pharmacies)</option>
                {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Payment Terms</label>
              <input type="text" value={createForm.paymentTerms} onChange={e => setCreateForm(f => ({ ...f, paymentTerms: e.target.value }))} className="input-field" placeholder="e.g., Net 30" />
            </div>
            <div>
              <label className="field-label">External Ref</label>
              <input type="text" value={createForm.externalRef} onChange={e => setCreateForm(f => ({ ...f, externalRef: e.target.value }))} className="input-field" placeholder="Account number" />
            </div>
            <div>
              <label className="field-label">Phone</label>
              <input type="tel" value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="field-label">Email</label>
              <input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} className="input-field" />
            </div>
            <div className="md:col-span-3">
              <button type="submit" disabled={creating} className="btn-primary">{creating ? 'Creating...' : 'Create Vendor'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Merge Modal */}
      {mergingId && (
        <div className="card p-5 border-amber-200 bg-amber-50">
          <h3 className="text-sm font-heading font-semibold text-amber-900 mb-3">Merge Vendor</h3>
          <p className="text-sm text-amber-700 mb-3">
            Merge <strong>{vendors.find(v => v.id === mergingId)?.name}</strong> into another vendor.
            All invoices will be reassigned, and this vendor will be deactivated.
          </p>
          <div className="flex items-center gap-3">
            <select value={mergeTargetId} onChange={e => setMergeTargetId(e.target.value)} className="input-field flex-1">
              <option value="">Select target vendor...</option>
              {vendors.filter(v => v.id !== mergingId && v.isActive).map(v => (
                <option key={v.id} value={v.id}>{v.name}{v.pharmacy ? ` (${v.pharmacy.code})` : ' (Org-wide)'}</option>
              ))}
            </select>
            <button onClick={handleMerge} disabled={!mergeTargetId || merging} className="btn-primary">{merging ? 'Merging...' : 'Merge'}</button>
            <button onClick={() => { setMergingId(null); setMergeTargetId(''); }} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2">
        {(['all', 'org-wide', 'pharmacy'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === f ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f === 'all' ? `All (${vendors.length})` : f === 'org-wide' ? `Org-wide (${vendors.filter(v => !v.pharmacyId).length})` : `Pharmacy (${vendors.filter(v => !!v.pharmacyId).length})`}
          </button>
        ))}
      </div>

      {/* Edit card */}
      {editingId && (
        <div className="card p-5">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">
            Edit Vendor: {vendors.find(v => v.id === editingId)?.name}
          </h3>
          <form onSubmit={handleEdit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="field-label">Name <span className="text-red-500">*</span></label>
              <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="input-field" required />
            </div>
            <div>
              <label className="field-label">Pharmacy</label>
              <select value={editForm.pharmacyId} onChange={e => setEditForm(f => ({ ...f, pharmacyId: e.target.value }))} className="input-field">
                <option value="">Org-wide (all pharmacies)</option>
                {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Payment Terms</label>
              <input type="text" value={editForm.paymentTerms} onChange={e => setEditForm(f => ({ ...f, paymentTerms: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="field-label">External Ref</label>
              <input type="text" value={editForm.externalRef} onChange={e => setEditForm(f => ({ ...f, externalRef: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="field-label">Phone</label>
              <input type="tel" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="field-label">Email</label>
              <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="input-field" />
            </div>
            <div className="md:col-span-3 flex items-center gap-3">
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
              <button type="button" onClick={() => setEditingId(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scope</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Payment Terms</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Invoices</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">No vendors found.</td>
                </tr>
              ) : filteredVendors.map((v) => (
                <tr key={v.id} className={`hover:bg-gray-50 ${!v.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-sm text-gray-900">{v.name}</td>
                  <td className="px-4 py-3 text-sm">
                    {v.pharmacy ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">{v.pharmacy.code}</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">Org-wide</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{v.paymentTerms || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                    {v.email || v.phone || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${v.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {v.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{v._count.invoices}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-1 flex-wrap">
                      <button onClick={() => startEdit(v)} className="text-xs px-2 py-1 rounded-md font-medium text-primary-600 hover:bg-primary-50">Edit</button>
                      <button onClick={() => handleToggleActive(v)} className={`text-xs px-2 py-1 rounded-md font-medium ${v.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                        {v.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                      {v.isActive && (
                        <button onClick={() => { setMergingId(v.id); setMergeTargetId(''); setError(null); setSuccess(null); }} className="text-xs px-2 py-1 rounded-md font-medium text-amber-600 hover:bg-amber-50">Merge</button>
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
