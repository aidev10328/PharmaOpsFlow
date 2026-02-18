'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

type RequiredInvoice = {
  id: string;
  orgId: string;
  pharmacyId?: string | null;
  invoiceTypeId: string;
  isActive: boolean;
  createdAt: string;
  invoiceType: { id: string; name: string; code: string; isActive: boolean };
  pharmacy?: { id: string; name: string; code: string } | null;
};

type InvoiceTypeOption = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
};

type PharmacyOption = {
  id: string;
  name: string;
  code: string;
};

export default function RequiredInvoicesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [requirements, setRequirements] = useState<RequiredInvoice[]>([]);
  const [invoiceTypes, setInvoiceTypes] = useState<InvoiceTypeOption[]>([]);
  const [pharmacies, setPharmacies] = useState<PharmacyOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ invoiceTypeId: '', pharmacyId: '' });

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  const fetchRequirements = async () => {
    try {
      const res = await apiFetch('/v1/admin/required-invoices');
      if (res.ok) setRequirements(await res.json());
    } catch { setError('Failed to load requirements'); }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      Promise.all([
        apiFetch('/v1/admin/invoice-types').then(r => r.ok ? r.json() : []).then((types: any[]) => {
          setInvoiceTypes(types.filter((t: any) => t.isActive).map((t: any) => ({ id: t.id, name: t.name, code: t.code, isActive: t.isActive })));
        }),
        apiFetch('/v1/admin/pharmacies').then(r => r.ok ? r.json() : []).then((ps: any[]) => {
          setPharmacies(ps.map((p: any) => ({ id: p.id, name: p.name, code: p.code })));
        }),
        fetchRequirements(),
      ]).finally(() => setLoadingData(false));
    }
  }, [user]);

  // Group requirements: global first, then by pharmacy
  const globalReqs = requirements.filter(r => !r.pharmacyId);
  const pharmacyReqs = requirements.filter(r => !!r.pharmacyId);
  const pharmacyGroups = pharmacies.map(p => ({
    pharmacy: p,
    reqs: pharmacyReqs.filter(r => r.pharmacyId === p.id),
  })).filter(g => g.reqs.length > 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.invoiceTypeId) return;
    setCreating(true);
    setError(null); setSuccess(null);
    try {
      const res = await apiFetch('/v1/admin/required-invoices', {
        method: 'POST',
        body: JSON.stringify({
          invoiceTypeId: createForm.invoiceTypeId,
          pharmacyId: createForm.pharmacyId || undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to create'); }
      setSuccess('Required invoice assignment created.');
      setCreateForm({ invoiceTypeId: '', pharmacyId: '' });
      setShowCreate(false);
      fetchRequirements();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const handleDelete = async (req: RequiredInvoice) => {
    const scope = req.pharmacy ? `${req.pharmacy.name}` : 'all pharmacies (global)';
    if (!confirm(`Remove "${req.invoiceType.name}" requirement from ${scope}?`)) return;
    setError(null); setSuccess(null);
    try {
      const res = await apiFetch(`/v1/admin/required-invoices/${req.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to delete'); }
      setSuccess('Requirement removed.');
      fetchRequirements();
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
          <h1 className="page-title">Required Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">Configure which invoice types are required for SLA compliance</p>
        </div>
        <button onClick={() => { setShowCreate(!showCreate); setError(null); setSuccess(null); }} className="btn-primary">
          {showCreate ? 'Cancel' : 'Add Requirement'}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {/* Create Form */}
      {showCreate && (
        <div className="card p-5">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">Add Required Invoice Type</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="field-label">Invoice Type <span className="text-red-500">*</span></label>
              <select value={createForm.invoiceTypeId} onChange={e => setCreateForm(f => ({ ...f, invoiceTypeId: e.target.value }))} className="input-field" required>
                <option value="">Select type...</option>
                {invoiceTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Scope</label>
              <select value={createForm.pharmacyId} onChange={e => setCreateForm(f => ({ ...f, pharmacyId: e.target.value }))} className="input-field">
                <option value="">Global (all pharmacies)</option>
                {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Leave blank for global; select pharmacy for override</p>
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={creating} className="btn-accent">{creating ? 'Adding...' : 'Add Requirement'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Global Requirements */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <h3 className="text-sm font-heading font-semibold text-gray-900">Global Requirements</h3>
          <p className="text-xs text-gray-500">Apply to all pharmacies unless overridden</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {globalReqs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">No global requirements configured.</td>
                </tr>
              ) : globalReqs.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{r.invoiceType.name}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-500">{r.invoiceType.code}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${r.invoiceType.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {r.invoiceType.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => handleDelete(r)} className="text-xs px-2 py-1 rounded-md font-medium text-red-600 hover:bg-red-50">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Pharmacy Overrides */}
      {pharmacyGroups.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-heading font-semibold text-gray-900">Pharmacy-Specific Overrides</h3>
          {pharmacyGroups.map(group => (
            <div key={group.pharmacy.id} className="card overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b">
                <h4 className="text-sm font-semibold text-blue-900">{group.pharmacy.name} <span className="font-mono text-blue-600">({group.pharmacy.code})</span></h4>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice Type</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {group.reqs.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-900">{r.invoiceType.name}</td>
                        <td className="px-4 py-2 text-sm font-mono text-gray-500">{r.invoiceType.code}</td>
                        <td className="px-4 py-2 text-sm">
                          <button onClick={() => handleDelete(r)} className="text-xs px-2 py-1 rounded-md font-medium text-red-600 hover:bg-red-50">Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
