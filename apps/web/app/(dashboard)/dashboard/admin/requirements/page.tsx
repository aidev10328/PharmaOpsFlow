'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../lib/api';
import Link from 'next/link';

type Pharmacy = { id: string; name: string; code: string };
type Vendor = { id: string; name: string };
type InvoiceType = { id: string; name: string };

type Requirement = {
  id: string;
  pharmacyId: string;
  pharmacy: Pharmacy;
  vendorId: string | null;
  vendor: Vendor | null;
  invoiceTypeId: string | null;
  invoiceType: InvoiceType | null;
  name: string;
  description: string | null;
  frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  submissionDueDay: number;
  processingDueDay: number;
  applicableMonths: string | null;
  isActive: boolean;
  createdAt: string;
};

const frequencyOptions = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUALLY', label: 'Annually' },
];

const frequencyLabel = (f: string) => frequencyOptions.find(o => o.value === f)?.label || f;

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export default function RequirementsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [invoiceTypes, setInvoiceTypes] = useState<InvoiceType[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [filterPharmacy, setFilterPharmacy] = useState<string>('');
  const [filterActive, setFilterActive] = useState<string>('true');

  type FrequencyType = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<{
    pharmacyId: string;
    vendorId: string;
    invoiceTypeId: string;
    name: string;
    description: string;
    frequency: FrequencyType;
    submissionDueDay: number;
    processingDueDay: number;
    applicableMonths: string;
  }>({
    pharmacyId: '',
    vendorId: '',
    invoiceTypeId: '',
    name: '',
    description: '',
    frequency: 'MONTHLY',
    submissionDueDay: 5,
    processingDueDay: 10,
    applicableMonths: '',
  });

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    vendorId: string;
    invoiceTypeId: string;
    name: string;
    description: string;
    frequency: FrequencyType;
    submissionDueDay: number;
    processingDueDay: number;
    applicableMonths: string;
  }>({
    vendorId: '',
    invoiceTypeId: '',
    name: '',
    description: '',
    frequency: 'MONTHLY',
    submissionDueDay: 5,
    processingDueDay: 10,
    applicableMonths: '',
  });
  const [saving, setSaving] = useState(false);

  // Generate instances
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    startMonth: currentMonth(),
    endMonth: currentMonth(),
    pharmacyId: '',
  });

  // Auto-link invoices
  const [autoLinking, setAutoLinking] = useState(false);

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      router.push('/dashboard');
      return;
    }
  }, [user, loading, router]);

  const fetchRequirements = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterPharmacy) params.set('pharmacyId', filterPharmacy);
      if (filterActive) params.set('isActive', filterActive);
      const res = await apiFetch(`/v1/requirements?${params.toString()}`);
      if (res.ok) setRequirements(await res.json());
    } catch { setError('Failed to load requirements'); }
  }, [filterPharmacy, filterActive]);

  const fetchReferenceData = async () => {
    try {
      const [pharmRes, vendorRes, typeRes] = await Promise.all([
        apiFetch('/v1/admin/pharmacies').then(r => r.ok ? r.json() : []).catch(() => []),
        apiFetch('/v1/admin/vendors').then(r => r.ok ? r.json() : []).catch(() => []),
        apiFetch('/v1/admin/invoice-types').then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      setPharmacies(pharmRes);
      setVendors(vendorRes);
      setInvoiceTypes(typeRes);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      Promise.all([fetchRequirements(), fetchReferenceData()])
        .finally(() => setLoadingData(false));
    }
  }, [user, fetchRequirements]);

  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      fetchRequirements();
    }
  }, [filterPharmacy, filterActive, fetchRequirements, user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      // If "All Pharmacies" is selected, create a requirement for each pharmacy
      const targetPharmacies = createForm.pharmacyId === 'ALL' ? pharmacies : [{ id: createForm.pharmacyId }];
      let created = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const pharmacy of targetPharmacies) {
        try {
          const res = await apiFetch('/v1/requirements', {
            method: 'POST',
            body: JSON.stringify({
              pharmacyId: pharmacy.id,
              vendorId: createForm.vendorId || undefined,
              invoiceTypeId: createForm.invoiceTypeId || undefined,
              name: createForm.name,
              description: createForm.description || undefined,
              frequency: createForm.frequency,
              submissionDueDay: createForm.submissionDueDay,
              processingDueDay: createForm.processingDueDay,
              applicableMonths: createForm.applicableMonths || undefined,
            }),
          });
          if (res.ok) {
            created++;
          } else {
            const d = await res.json();
            failed++;
            if (createForm.pharmacyId === 'ALL') {
              errors.push(`${(pharmacy as Pharmacy).code || pharmacy.id}: ${d.message || 'Failed'}`);
            } else {
              throw new Error(d.message || 'Failed to create');
            }
          }
        } catch (err: any) {
          failed++;
          if (createForm.pharmacyId !== 'ALL') throw err;
          errors.push(`${(pharmacy as Pharmacy).code || pharmacy.id}: ${err.message}`);
        }
      }

      if (createForm.pharmacyId === 'ALL') {
        if (created > 0 && failed === 0) {
          setSuccess(`Created requirements for all ${created} pharmacies.`);
        } else if (created > 0 && failed > 0) {
          setSuccess(`Created ${created} requirements. ${failed} failed.`);
          if (errors.length > 0) setError(errors.slice(0, 3).join('; ') + (errors.length > 3 ? '...' : ''));
        } else {
          throw new Error(errors[0] || 'Failed to create requirements');
        }
      } else {
        setSuccess('Requirement created successfully.');
      }

      setCreateForm({
        pharmacyId: '',
        vendorId: '',
        invoiceTypeId: '',
        name: '',
        description: '',
        frequency: 'MONTHLY',
        submissionDueDay: 5,
        processingDueDay: 10,
        applicableMonths: '',
      });
      setShowCreate(false);
      fetchRequirements();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const startEdit = (r: Requirement) => {
    setEditingId(r.id);
    setEditForm({
      vendorId: r.vendorId || '',
      invoiceTypeId: r.invoiceTypeId || '',
      name: r.name,
      description: r.description || '',
      frequency: r.frequency,
      submissionDueDay: r.submissionDueDay,
      processingDueDay: r.processingDueDay,
      applicableMonths: r.applicableMonths || '',
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
      const res = await apiFetch(`/v1/requirements/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({
          vendorId: editForm.vendorId || null,
          invoiceTypeId: editForm.invoiceTypeId || null,
          name: editForm.name,
          description: editForm.description || null,
          frequency: editForm.frequency,
          submissionDueDay: editForm.submissionDueDay,
          processingDueDay: editForm.processingDueDay,
          applicableMonths: editForm.applicableMonths || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to update'); }
      setSuccess('Requirement updated.');
      setEditingId(null);
      fetchRequirements();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (r: Requirement) => {
    const newActive = !r.isActive;
    if (r.isActive && !confirm(`Deactivate "${r.name}"? This will stop generating new instances.`)) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(`/v1/requirements/${r.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: newActive }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to update'); }
      setSuccess(`Requirement ${newActive ? 'activated' : 'deactivated'}.`);
      fetchRequirements();
    } catch (e: any) { setError(e.message); }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch('/v1/requirements/instances/generate', {
        method: 'POST',
        body: JSON.stringify({
          startMonth: generateForm.startMonth,
          endMonth: generateForm.endMonth || undefined,
          pharmacyId: generateForm.pharmacyId || undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to generate'); }
      const result = await res.json();
      setSuccess(`Generated ${result.created} instances (${result.skipped} skipped).`);
      setShowGenerate(false);
    } catch (e: any) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const handleAutoLink = async () => {
    setAutoLinking(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch('/v1/requirements/auto-link-invoices', { method: 'POST' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to auto-link'); }
      const result = await res.json();
      setSuccess(`Auto-linked ${result.linked} invoices to requirement instances (${result.skipped} skipped).`);
    } catch (e: any) { setError(e.message); }
    finally { setAutoLinking(false); }
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

  if (!user || !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin" className="text-link text-sm">&larr; Back to Admin</Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Invoice Requirements</h1>
          <p className="text-sm text-gray-500 mt-1">Define recurring invoice requirements for each pharmacy</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/admin/requirements/instances" className="btn-secondary">View Instances</Link>
          <Link href="/dashboard/admin/requirements/compliance" className="btn-secondary">Compliance Summary</Link>
          <button onClick={handleAutoLink} disabled={autoLinking} className="btn-secondary">
            {autoLinking ? 'Linking...' : 'Auto-Link Invoices'}
          </button>
          <button onClick={() => { setShowGenerate(!showGenerate); setShowCreate(false); setError(null); setSuccess(null); }} className="btn-secondary">
            {showGenerate ? 'Cancel' : 'Generate Instances'}
          </button>
          <button onClick={() => { setShowCreate(!showCreate); setShowGenerate(false); setError(null); setSuccess(null); }} className="btn-primary">
            {showCreate ? 'Cancel' : 'New Requirement'}
          </button>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[180px]">
            <label className="field-label">Pharmacy</label>
            <select value={filterPharmacy} onChange={e => setFilterPharmacy(e.target.value)} className="input-field">
              <option value="">All Pharmacies</option>
              {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
            </select>
          </div>
          <div className="w-32">
            <label className="field-label">Status</label>
            <select value={filterActive} onChange={e => setFilterActive(e.target.value)} className="input-field">
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Generate Instances Form */}
      {showGenerate && (
        <div className="card p-5">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">Generate Requirement Instances</h3>
          <p className="text-sm text-gray-500 mb-4">Create tracking instances for all active requirements in the specified period.</p>
          <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="field-label">Start Month <span className="text-red-500">*</span></label>
              <input type="month" value={generateForm.startMonth} onChange={e => setGenerateForm(f => ({ ...f, startMonth: e.target.value }))} className="input-field" required />
            </div>
            <div>
              <label className="field-label">End Month</label>
              <input type="month" value={generateForm.endMonth} onChange={e => setGenerateForm(f => ({ ...f, endMonth: e.target.value }))} className="input-field" />
              <p className="text-xs text-gray-400 mt-1">Defaults to start month</p>
            </div>
            <div>
              <label className="field-label">Pharmacy</label>
              <select value={generateForm.pharmacyId} onChange={e => setGenerateForm(f => ({ ...f, pharmacyId: e.target.value }))} className="input-field">
                <option value="">All Pharmacies</option>
                {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <button type="submit" disabled={generating} className="btn-primary">{generating ? 'Generating...' : 'Generate Instances'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="card p-5">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">Create Invoice Requirement</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="field-label">Pharmacy <span className="text-red-500">*</span></label>
              <select value={createForm.pharmacyId} onChange={e => setCreateForm(f => ({ ...f, pharmacyId: e.target.value }))} className="input-field" required>
                <option value="">Select Pharmacy</option>
                <option value="ALL">All Pharmacies</option>
                {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </select>
              {createForm.pharmacyId === 'ALL' && (
                <p className="text-xs text-blue-600 mt-1">This will create a requirement for all {pharmacies.length} pharmacies</p>
              )}
            </div>
            <div>
              <label className="field-label">Name <span className="text-red-500">*</span></label>
              <input type="text" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className="input-field" required placeholder="e.g., Monthly ConEd Bill" />
            </div>
            <div>
              <label className="field-label">Frequency <span className="text-red-500">*</span></label>
              <select value={createForm.frequency} onChange={e => setCreateForm(f => ({ ...f, frequency: e.target.value as any }))} className="input-field" required>
                {frequencyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Vendor</label>
              <select value={createForm.vendorId} onChange={e => setCreateForm(f => ({ ...f, vendorId: e.target.value }))} className="input-field">
                <option value="">Any Vendor</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Invoice Type</label>
              <select value={createForm.invoiceTypeId} onChange={e => setCreateForm(f => ({ ...f, invoiceTypeId: e.target.value }))} className="input-field">
                <option value="">Any Type</option>
                {invoiceTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Description</label>
              <input type="text" value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} className="input-field" placeholder="Optional" />
            </div>
            <div>
              <label className="field-label">Submission Due Day <span className="text-red-500">*</span></label>
              <input type="number" min={1} max={28} value={createForm.submissionDueDay} onChange={e => setCreateForm(f => ({ ...f, submissionDueDay: parseInt(e.target.value) || 5 }))} className="input-field" required />
              <p className="text-xs text-gray-400 mt-1">Day of period for submission deadline</p>
            </div>
            <div>
              <label className="field-label">Processing Due Day <span className="text-red-500">*</span></label>
              <input type="number" min={1} max={28} value={createForm.processingDueDay} onChange={e => setCreateForm(f => ({ ...f, processingDueDay: parseInt(e.target.value) || 10 }))} className="input-field" required />
              <p className="text-xs text-gray-400 mt-1">Day of period for processing deadline</p>
            </div>
            {(createForm.frequency === 'QUARTERLY' || createForm.frequency === 'ANNUALLY') && (
              <div>
                <label className="field-label">Applicable Months</label>
                <input type="text" value={createForm.applicableMonths} onChange={e => setCreateForm(f => ({ ...f, applicableMonths: e.target.value }))} className="input-field" placeholder={createForm.frequency === 'QUARTERLY' ? '3,6,9,12' : '12'} />
                <p className="text-xs text-gray-400 mt-1">{createForm.frequency === 'QUARTERLY' ? 'End months of each quarter' : 'Month for annual due date'}</p>
              </div>
            )}
            <div className="md:col-span-2 lg:col-span-3">
              <button type="submit" disabled={creating} className="btn-primary">{creating ? 'Creating...' : 'Create Requirement'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pharmacy</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Vendor</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Frequency</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Due Days</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {requirements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">No requirements configured. Create one to get started.</td>
                </tr>
              ) : requirements.map((r) => (
                <tr key={r.id} className={`hover:bg-gray-50 ${!r.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2 text-gray-900">{r.pharmacy.code}</td>
                  <td className="px-3 py-2 text-gray-900">
                    {editingId === r.id ? (
                      <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="input-field py-1 text-sm w-40" />
                    ) : (
                      <div>
                        <div className="font-medium">{r.name}</div>
                        {r.description && <div className="text-xs text-gray-400">{r.description}</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500 hidden md:table-cell">
                    {editingId === r.id ? (
                      <select value={editForm.vendorId} onChange={e => setEditForm(f => ({ ...f, vendorId: e.target.value }))} className="input-field py-1 text-sm w-32">
                        <option value="">Any</option>
                        {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    ) : (r.vendor?.name || 'Any')}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === r.id ? (
                      <select value={editForm.frequency} onChange={e => setEditForm(f => ({ ...f, frequency: e.target.value as any }))} className="input-field py-1 text-sm w-28">
                        {frequencyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {frequencyLabel(r.frequency)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500 hidden lg:table-cell">
                    {editingId === r.id ? (
                      <div className="flex gap-1">
                        <input type="number" min={1} max={28} value={editForm.submissionDueDay} onChange={e => setEditForm(f => ({ ...f, submissionDueDay: parseInt(e.target.value) || 5 }))} className="input-field py-1 text-sm w-14" title="Submission" />
                        <input type="number" min={1} max={28} value={editForm.processingDueDay} onChange={e => setEditForm(f => ({ ...f, processingDueDay: parseInt(e.target.value) || 10 }))} className="input-field py-1 text-sm w-14" title="Processing" />
                      </div>
                    ) : (
                      <span className="text-xs">Sub: {r.submissionDueDay}, Proc: {r.processingDueDay}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${r.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {editingId === r.id ? (
                        <>
                          <form onSubmit={handleEdit} className="inline">
                            <button type="submit" disabled={saving} className="text-xs px-2 py-1 rounded-md font-medium text-primary-600 hover:bg-primary-50">{saving ? 'Saving...' : 'Save'}</button>
                          </form>
                          <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 rounded-md font-medium text-gray-500 hover:bg-gray-100">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(r)} className="text-xs px-2 py-1 rounded-md font-medium text-primary-600 hover:bg-primary-50">Edit</button>
                          <button onClick={() => handleToggleActive(r)} className={`text-xs px-2 py-1 rounded-md font-medium ${r.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                            {r.isActive ? 'Deactivate' : 'Activate'}
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
