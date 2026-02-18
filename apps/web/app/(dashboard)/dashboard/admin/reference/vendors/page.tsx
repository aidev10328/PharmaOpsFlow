'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../../lib/api';

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
          <h1 className="text-lg font-heading font-bold text-gray-900">Vendors</h1>
          <p className="text-xs text-gray-500">{vendors.length} total</p>
        </div>
        <button onClick={() => { setShowCreate(!showCreate); setError(null); setSuccess(null); }} className="btn-primary text-xs px-3 py-1.5">
          {showCreate ? 'Cancel' : '+ Add Vendor'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs">{success}</div>}

      {/* Create Form */}
      {showCreate && (
        <div className="card p-3">
          <h3 className="text-xs font-semibold text-gray-900 mb-2">New Vendor</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Name *</label>
              <input type="text" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className="input-field text-xs py-1.5" required />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Pharmacy</label>
              <select value={createForm.pharmacyId} onChange={e => setCreateForm(f => ({ ...f, pharmacyId: e.target.value }))} className="input-field text-xs py-1.5">
                <option value="">Org-wide</option>
                {pharmacies.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Terms</label>
              <input type="text" value={createForm.paymentTerms} onChange={e => setCreateForm(f => ({ ...f, paymentTerms: e.target.value }))} className="input-field text-xs py-1.5" placeholder="Net 30" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Email</label>
              <input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Phone</label>
              <input type="tel" value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">External Ref</label>
              <input type="text" value={createForm.externalRef} onChange={e => setCreateForm(f => ({ ...f, externalRef: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div className="col-span-2 flex items-end">
              <button type="submit" disabled={creating} className="btn-accent text-xs px-3 py-1.5">{creating ? 'Creating...' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Merge Modal */}
      {mergingId && (
        <div className="card p-3 border-amber-200 bg-amber-50">
          <h3 className="text-xs font-semibold text-amber-900 mb-2">Merge Vendor: {vendors.find(v => v.id === mergingId)?.name}</h3>
          <div className="flex items-center gap-2">
            <select value={mergeTargetId} onChange={e => setMergeTargetId(e.target.value)} className="input-field text-xs py-1.5 flex-1">
              <option value="">Select target...</option>
              {vendors.filter(v => v.id !== mergingId && v.isActive).map(v => (
                <option key={v.id} value={v.id}>{v.name}{v.pharmacy ? ` (${v.pharmacy.code})` : ''}</option>
              ))}
            </select>
            <button onClick={handleMerge} disabled={!mergeTargetId || merging} className="btn-dark text-xs px-3 py-1.5">{merging ? '...' : 'Merge'}</button>
            <button onClick={() => { setMergingId(null); setMergeTargetId(''); }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-1">
        {(['all', 'org-wide', 'pharmacy'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-2 py-1 rounded-full text-[10px] font-medium transition-colors ${filter === f ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f === 'all' ? `All (${vendors.length})` : f === 'org-wide' ? `Org (${vendors.filter(v => !v.pharmacyId).length})` : `Pharm (${vendors.filter(v => !!v.pharmacyId).length})`}
          </button>
        ))}
      </div>

      {/* Edit card */}
      {editingId && (
        <div className="card p-3">
          <h3 className="text-xs font-semibold text-gray-900 mb-2">Edit: {vendors.find(v => v.id === editingId)?.name}</h3>
          <form onSubmit={handleEdit} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Name *</label>
              <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="input-field text-xs py-1.5" required />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Pharmacy</label>
              <select value={editForm.pharmacyId} onChange={e => setEditForm(f => ({ ...f, pharmacyId: e.target.value }))} className="input-field text-xs py-1.5">
                <option value="">Org-wide</option>
                {pharmacies.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Terms</label>
              <input type="text" value={editForm.paymentTerms} onChange={e => setEditForm(f => ({ ...f, paymentTerms: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Email</label>
              <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Phone</label>
              <input type="tel" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">External Ref</label>
              <input type="text" value={editForm.externalRef} onChange={e => setEditForm(f => ({ ...f, externalRef: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div className="col-span-2 flex items-end gap-1">
              <button type="submit" disabled={saving} className="text-[10px] px-2 py-1 rounded bg-green-500 text-white font-medium">{saving ? '...' : 'Save'}</button>
              <button type="button" onClick={() => setEditingId(null)} className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-600 font-medium">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Name</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Scope</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase hidden md:table-cell">Terms</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase hidden lg:table-cell">Contact</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Status</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase hidden md:table-cell">Inv</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {filteredVendors.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No vendors found</td></tr>
            ) : filteredVendors.map((v) => (
              <tr key={v.id} className={`hover:bg-gray-50 ${!v.isActive ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2 text-gray-900">{v.name}</td>
                <td className="px-3 py-2">
                  {v.pharmacy ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">{v.pharmacy.code}</span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">Org</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500 hidden md:table-cell">{v.paymentTerms || '-'}</td>
                <td className="px-3 py-2 text-gray-500 hidden lg:table-cell truncate max-w-[100px]">{v.email || v.phone || '-'}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${v.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {v.isActive ? 'Active' : 'Off'}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500 hidden md:table-cell">{v._count.invoices}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(v)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-600">Edit</button>
                    <button onClick={() => handleToggleActive(v)} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${v.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                      {v.isActive ? 'Disable' : 'Enable'}
                    </button>
                    {v.isActive && (
                      <button onClick={() => { setMergingId(v.id); setMergeTargetId(''); setError(null); setSuccess(null); }} className="text-[10px] px-1.5 py-0.5 rounded font-medium text-amber-600 hover:bg-amber-50">Merge</button>
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
