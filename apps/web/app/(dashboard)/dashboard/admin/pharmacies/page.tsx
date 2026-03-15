'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../lib/api';
import Link from 'next/link';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

type Pharmacy = {
  id: string;
  name: string;
  code: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  website?: string;
  timezone?: string;
  submissionDueDay?: number | null;
  processingDueDay?: number | null;
  isActive: boolean;
  org: { id: string; name: string };
  _count: { members: number; invoices: number };
};

const emptyCreateForm = { name: '', code: '', street: '', city: '', state: '', zip: '', phone: '', website: '', timezone: '' };
const emptyEditForm = { name: '', street: '', city: '', state: '', zip: '', phone: '', website: '', timezone: '', submissionDueDay: '', processingDueDay: '' };

export default function AdminPharmaciesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  const fetchPharmacies = async () => {
    try {
      const res = await apiFetch('/v1/admin/pharmacies');
      if (res.ok) {
        setPharmacies(await res.json());
      }
    } catch (e) {
      setError('Failed to load pharmacies');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') fetchPharmacies();
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const orgRes = await apiFetch('/v1/admin/org');
      if (!orgRes.ok) throw new Error('Failed to fetch org');
      const org = await orgRes.json();

      const res = await apiFetch('/v1/admin/pharmacies', {
        method: 'POST',
        body: JSON.stringify({
          orgId: org.id,
          name: createForm.name,
          code: createForm.code,
          street: createForm.street || undefined,
          city: createForm.city || undefined,
          state: createForm.state || undefined,
          zip: createForm.zip || undefined,
          phone: createForm.phone || undefined,
          website: createForm.website || undefined,
          timezone: createForm.timezone || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create pharmacy');
      }
      setSuccess('Pharmacy created successfully.');
      setCreateForm(emptyCreateForm);
      setShowCreate(false);
      fetchPharmacies();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (pharmacy: Pharmacy) => {
    setEditingId(pharmacy.id);
    setEditForm({
      name: pharmacy.name,
      street: pharmacy.street || '',
      city: pharmacy.city || '',
      state: pharmacy.state || '',
      zip: pharmacy.zip || '',
      phone: pharmacy.phone || '',
      website: pharmacy.website || '',
      timezone: pharmacy.timezone || '',
      submissionDueDay: pharmacy.submissionDueDay != null ? String(pharmacy.submissionDueDay) : '',
      processingDueDay: pharmacy.processingDueDay != null ? String(pharmacy.processingDueDay) : '',
    });
    setError(null);
    setSuccess(null);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/v1/admin/pharmacies/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          street: editForm.street || undefined,
          city: editForm.city || undefined,
          state: editForm.state || undefined,
          zip: editForm.zip || undefined,
          phone: editForm.phone || undefined,
          website: editForm.website || undefined,
          timezone: editForm.timezone || undefined,
          submissionDueDay: editForm.submissionDueDay ? parseInt(editForm.submissionDueDay, 10) : undefined,
          processingDueDay: editForm.processingDueDay ? parseInt(editForm.processingDueDay, 10) : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update pharmacy');
      }
      setSuccess('Pharmacy updated successfully.');
      setEditingId(null);
      fetchPharmacies();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (pharmacy: Pharmacy) => {
    setError(null);
    setSuccess(null);
    const action = pharmacy.isActive ? 'deactivate' : 'reactivate';
    if (pharmacy.isActive && !confirm(`Are you sure you want to deactivate "${pharmacy.name}"? It will no longer be able to submit invoices.`)) {
      return;
    }
    try {
      const res = await apiFetch(`/v1/admin/pharmacies/${pharmacy.id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || `Failed to ${action} pharmacy`);
      }
      setSuccess(`Pharmacy ${action}d successfully.`);
      fetchPharmacies();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const formatLocation = (p: Pharmacy) => {
    const parts = [p.city, p.state].filter(Boolean);
    if (parts.length === 0) return '-';
    return parts.join(', ');
  };

  const formatFullAddress = (p: Pharmacy) => {
    const line1 = p.street || '';
    const line2 = [p.city, p.state].filter(Boolean).join(', ');
    const line3 = p.zip || '';
    return [line1, line2, line3].filter(Boolean).join(', ');
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
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-heading font-bold text-gray-900">Pharmacies</h1>
          <p className="text-xs text-gray-500">{pharmacies.length} total</p>
        </div>
        <button onClick={() => { setShowCreate(!showCreate); setError(null); setSuccess(null); }} className="btn-primary text-xs px-3 py-1.5">
          {showCreate ? 'Cancel' : '+ Add Pharmacy'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs">{success}</div>}

      {/* Create Form */}
      {showCreate && (
        <div className="card p-3">
          <h3 className="text-xs font-semibold text-gray-900 mb-2">New Pharmacy</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Name *</label>
              <input type="text" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className="input-field text-xs py-1.5" required />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Code *</label>
              <input type="text" value={createForm.code} onChange={e => setCreateForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="input-field text-xs py-1.5 font-mono" maxLength={20} required />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Phone</label>
              <input type="tel" value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">City</label>
              <input type="text" value={createForm.city} onChange={e => setCreateForm(f => ({ ...f, city: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">State</label>
              <select value={createForm.state} onChange={e => setCreateForm(f => ({ ...f, state: e.target.value }))} className="input-field text-xs py-1.5">
                <option value="">Select...</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">ZIP</label>
              <input type="text" value={createForm.zip} onChange={e => setCreateForm(f => ({ ...f, zip: e.target.value }))} className="input-field text-xs py-1.5 font-mono" maxLength={10} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Timezone</label>
              <select value={createForm.timezone} onChange={e => setCreateForm(f => ({ ...f, timezone: e.target.value }))} className="input-field text-xs py-1.5">
                <option value="">Default (ET)</option>
                <option value="America/New_York">Eastern</option>
                <option value="America/Chicago">Central</option>
                <option value="America/Denver">Mountain</option>
                <option value="America/Los_Angeles">Pacific</option>
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={creating} className="btn-accent text-xs px-3 py-1.5">{creating ? 'Creating...' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Form */}
      {editingId && (
        <div className="card p-3">
          <h3 className="text-xs font-semibold text-gray-900 mb-2">Edit: {pharmacies.find(p => p.id === editingId)?.code}</h3>
          <form onSubmit={handleEdit} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Name</label>
              <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Phone</label>
              <input type="tel" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">City</label>
              <input type="text" value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">State</label>
              <select value={editForm.state} onChange={e => setEditForm(f => ({ ...f, state: e.target.value }))} className="input-field text-xs py-1.5">
                <option value="">Select...</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">ZIP</label>
              <input type="text" value={editForm.zip} onChange={e => setEditForm(f => ({ ...f, zip: e.target.value }))} className="input-field text-xs py-1.5 font-mono" maxLength={10} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Timezone</label>
              <select value={editForm.timezone} onChange={e => setEditForm(f => ({ ...f, timezone: e.target.value }))} className="input-field text-xs py-1.5">
                <option value="">Default (ET)</option>
                <option value="America/New_York">Eastern</option>
                <option value="America/Chicago">Central</option>
                <option value="America/Denver">Mountain</option>
                <option value="America/Los_Angeles">Pacific</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Submission Due Day</label>
              <input type="number" value={editForm.submissionDueDay} onChange={e => setEditForm(f => ({ ...f, submissionDueDay: e.target.value }))} min="1" max="28" placeholder="Org default" className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Processing Due Day</label>
              <input type="number" value={editForm.processingDueDay} onChange={e => setEditForm(f => ({ ...f, processingDueDay: e.target.value }))} min="1" max="28" placeholder="Org default" className="input-field text-xs py-1.5" />
            </div>
            <div className="col-span-2 flex items-end gap-1">
              <button type="submit" disabled={saving} className="text-[10px] px-2 py-1 rounded bg-green-500 text-white font-medium">{saving ? '...' : 'Save'}</button>
              <button type="button" onClick={() => setEditingId(null)} className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-600 font-medium">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Pharmacies Table */}
      <div className="card overflow-hidden">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Code</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Name</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase hidden md:table-cell">Location</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase hidden lg:table-cell">Phone</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Status</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Members</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {pharmacies.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No pharmacies found</td></tr>
            ) : pharmacies.map((pharmacy) => (
              <tr key={pharmacy.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-gray-900">{pharmacy.code}</td>
                <td className="px-3 py-2 text-gray-900">{pharmacy.name}</td>
                <td className="px-3 py-2 text-gray-600 hidden md:table-cell" title={formatFullAddress(pharmacy)}>{formatLocation(pharmacy)}</td>
                <td className="px-3 py-2 text-gray-600 hidden lg:table-cell">{pharmacy.phone || '-'}</td>
                <td className="px-3 py-2">
                  {pharmacy.isActive ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                      <span className="w-1 h-1 rounded-full bg-emerald-500" />Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                      <span className="w-1 h-1 rounded-full bg-gray-400" />Inactive
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600">
                  <Link href={`/dashboard/admin/pharmacies/${pharmacy.id}/members`} className="text-primary-600 hover:underline">{pharmacy._count.members}</Link>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Link href={`/dashboard/admin/pharmacies/${pharmacy.id}/members`} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-primary-50 text-primary-600 font-medium">Members</Link>
                    <button onClick={() => startEdit(pharmacy)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-600">Edit</button>
                    <button onClick={() => toggleActive(pharmacy)} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${pharmacy.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                      {pharmacy.isActive ? 'Disable' : 'Enable'}
                    </button>
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
