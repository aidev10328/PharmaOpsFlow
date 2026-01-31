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
  isActive: boolean;
  org: { id: string; name: string };
  _count: { members: number; invoices: number };
};

const emptyCreateForm = { name: '', code: '', street: '', city: '', state: '', zip: '', phone: '', website: '', timezone: '' };
const emptyEditForm = { name: '', street: '', city: '', state: '', zip: '', phone: '', website: '', timezone: '' };

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
        <h1 className="page-title">Pharmacy Management</h1>
        <button onClick={() => { setShowCreate(!showCreate); setError(null); setSuccess(null); }} className="btn-primary">
          {showCreate ? 'Cancel' : 'Create Pharmacy'}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {/* Create Form */}
      {showCreate && (
        <div className="card p-5">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">New Pharmacy</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="field-label">Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={createForm.name}
                onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="field-label">Code <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={createForm.code}
                onChange={e => setCreateForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="input-field font-mono"
                maxLength={20}
                required
              />
              <p className="field-hint">Unique identifier (e.g., ELM, BBP). Immutable after creation.</p>
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
            <div className="md:col-span-2 lg:col-span-3">
              <label className="field-label">Street Address</label>
              <input
                type="text"
                value={createForm.street}
                onChange={e => setCreateForm(f => ({ ...f, street: e.target.value }))}
                className="input-field"
                placeholder="123 Main Street"
              />
            </div>
            <div>
              <label className="field-label">City</label>
              <input
                type="text"
                value={createForm.city}
                onChange={e => setCreateForm(f => ({ ...f, city: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">State</label>
              <select
                value={createForm.state}
                onChange={e => setCreateForm(f => ({ ...f, state: e.target.value }))}
                className="input-field"
              >
                <option value="">Select state...</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">ZIP Code</label>
              <input
                type="text"
                value={createForm.zip}
                onChange={e => setCreateForm(f => ({ ...f, zip: e.target.value }))}
                className="input-field font-mono"
                maxLength={10}
                placeholder="10001"
              />
            </div>
            <div>
              <label className="field-label">Website</label>
              <input
                type="url"
                value={createForm.website}
                onChange={e => setCreateForm(f => ({ ...f, website: e.target.value }))}
                className="input-field"
                placeholder="https://www.example.com"
              />
            </div>
            <div>
              <label className="field-label">Timezone</label>
              <select
                value={createForm.timezone}
                onChange={e => setCreateForm(f => ({ ...f, timezone: e.target.value }))}
                className="input-field"
              >
                <option value="">Default (America/New_York)</option>
                <option value="America/New_York">Eastern</option>
                <option value="America/Chicago">Central</option>
                <option value="America/Denver">Mountain</option>
                <option value="America/Los_Angeles">Pacific</option>
              </select>
            </div>
            <div className="md:col-span-2 lg:col-span-3 flex justify-end">
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? 'Creating...' : 'Create Pharmacy'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Form (shown above table when editing) */}
      {editingId && (
        <div className="card p-5">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">
            Edit Pharmacy: {pharmacies.find(p => p.id === editingId)?.code}
          </h3>
          <form onSubmit={handleEdit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="field-label">Name</label>
              <input
                type="text"
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">Phone</label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">Website</label>
              <input
                type="url"
                value={editForm.website}
                onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="field-label">Street Address</label>
              <input
                type="text"
                value={editForm.street}
                onChange={e => setEditForm(f => ({ ...f, street: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">City</label>
              <input
                type="text"
                value={editForm.city}
                onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">State</label>
              <select
                value={editForm.state}
                onChange={e => setEditForm(f => ({ ...f, state: e.target.value }))}
                className="input-field"
              >
                <option value="">Select state...</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">ZIP Code</label>
              <input
                type="text"
                value={editForm.zip}
                onChange={e => setEditForm(f => ({ ...f, zip: e.target.value }))}
                className="input-field font-mono"
                maxLength={10}
              />
            </div>
            <div>
              <label className="field-label">Timezone</label>
              <select
                value={editForm.timezone}
                onChange={e => setEditForm(f => ({ ...f, timezone: e.target.value }))}
                className="input-field"
              >
                <option value="">Default (America/New_York)</option>
                <option value="America/New_York">Eastern</option>
                <option value="America/Chicago">Central</option>
                <option value="America/Denver">Mountain</option>
                <option value="America/Los_Angeles">Pacific</option>
              </select>
            </div>
            <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingId(null)} className="btn-ghost text-xs">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pharmacies Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Members</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pharmacies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    No pharmacies found. Create one above.
                  </td>
                </tr>
              ) : pharmacies.map((pharmacy) => (
                <tr key={pharmacy.id} className={`hover:bg-gray-50 ${editingId === pharmacy.id ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{pharmacy.code}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {pharmacy.name}
                    {pharmacy.website && (
                      <a href={pharmacy.website} target="_blank" rel="noopener noreferrer" className="text-link text-xs ml-2">
                        www
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell" title={formatFullAddress(pharmacy)}>
                    {formatLocation(pharmacy)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                    {pharmacy.phone || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {pharmacy.isActive ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <Link href={`/dashboard/admin/pharmacies/${pharmacy.id}/members`} className="text-link">
                      {pharmacy._count.members} member{pharmacy._count.members !== 1 ? 's' : ''}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <button onClick={() => startEdit(pharmacy)} className="btn-ghost text-xs">
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(pharmacy)}
                        className={`text-xs px-2 py-1 rounded-md font-medium ${
                          pharmacy.isActive
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {pharmacy.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
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
