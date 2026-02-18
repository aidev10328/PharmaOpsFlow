'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
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

type SortConfig = {
  field: string;
  direction: 'asc' | 'desc';
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

function SortableHeader({
  label,
  field,
  sortConfig,
  onSort,
  className = '',
}: {
  label: string;
  field: string;
  sortConfig: SortConfig;
  onSort: (field: string) => void;
  className?: string;
}) {
  const isActive = sortConfig.field === field;
  return (
    <th
      className={`px-3 py-2 font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${isActive ? 'text-primary-600' : 'text-gray-300'}`}>
          {isActive ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '▼'}
        </span>
      </div>
    </th>
  );
}

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

  // Pagination and sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'pharmacy', direction: 'asc' });
  const itemsPerPage = 10;

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

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterPharmacy, filterActive]);

  const handleSort = (field: string) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
    setCurrentPage(1);
  };

  // Sort and paginate data
  const sortedAndPaginatedData = useMemo(() => {
    const sorted = [...requirements].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortConfig.field) {
        case 'pharmacy':
          aVal = a.pharmacy?.code || '';
          bVal = b.pharmacy?.code || '';
          break;
        case 'name':
          aVal = a.name || '';
          bVal = b.name || '';
          break;
        case 'vendor':
          aVal = a.vendor?.name || '';
          bVal = b.vendor?.name || '';
          break;
        case 'frequency':
          aVal = a.frequency || '';
          bVal = b.frequency || '';
          break;
        case 'isActive':
          aVal = a.isActive ? 1 : 0;
          bVal = b.isActive ? 1 : 0;
          break;
        default:
          aVal = a.pharmacy?.code || '';
          bVal = b.pharmacy?.code || '';
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });

    const startIndex = (currentPage - 1) * itemsPerPage;
    return sorted.slice(startIndex, startIndex + itemsPerPage);
  }, [requirements, sortConfig, currentPage]);

  const totalPages = Math.ceil(requirements.length / itemsPerPage);

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
    <div className="max-w-6xl mx-auto space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-heading font-bold text-gray-900">Requirements</h1>
          <p className="text-xs text-gray-500">{requirements.length} requirements</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href="/dashboard/admin/requirements/instances" className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm">Instances</Link>
          <Link href="/dashboard/admin/requirements/compliance" className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm">Compliance</Link>
          <button onClick={handleAutoLink} disabled={autoLinking} className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm disabled:opacity-50">
            {autoLinking ? '...' : 'Auto-Link'}
          </button>
          <button onClick={() => { setShowGenerate(!showGenerate); setShowCreate(false); setError(null); setSuccess(null); }} className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm">
            {showGenerate ? 'Cancel' : 'Generate'}
          </button>
          <button onClick={() => { setShowCreate(!showCreate); setShowGenerate(false); setError(null); setSuccess(null); }} className="btn-primary text-xs px-3 py-1.5 shadow-sm">
            {showCreate ? 'Cancel' : '+ Add'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs">{success}</div>}

      {/* Filters */}
      <div className="card p-2 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Pharmacy</label>
          <select value={filterPharmacy} onChange={e => setFilterPharmacy(e.target.value)} className="input-field text-xs py-1.5">
            <option value="">All</option>
            {pharmacies.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
          </select>
        </div>
        <div className="w-24">
          <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Status</label>
          <select value={filterActive} onChange={e => setFilterActive(e.target.value)} className="input-field text-xs py-1.5">
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {/* Generate Instances Form */}
      {showGenerate && (
        <div className="card p-3">
          <h3 className="text-xs font-semibold text-gray-900 mb-2">Generate Instances</h3>
          <form onSubmit={handleGenerate} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Start Month *</label>
              <input type="month" value={generateForm.startMonth} onChange={e => setGenerateForm(f => ({ ...f, startMonth: e.target.value }))} className="input-field text-xs py-1.5" required />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">End Month</label>
              <input type="month" value={generateForm.endMonth} onChange={e => setGenerateForm(f => ({ ...f, endMonth: e.target.value }))} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Pharmacy</label>
              <select value={generateForm.pharmacyId} onChange={e => setGenerateForm(f => ({ ...f, pharmacyId: e.target.value }))} className="input-field text-xs py-1.5">
                <option value="">All</option>
                {pharmacies.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={generating} className="btn-dark text-xs px-3 py-1.5">{generating ? '...' : 'Generate'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="card p-3">
          <h3 className="text-xs font-semibold text-gray-900 mb-2">New Requirement</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Pharmacy *</label>
              <select value={createForm.pharmacyId} onChange={e => setCreateForm(f => ({ ...f, pharmacyId: e.target.value }))} className="input-field text-xs py-1.5" required>
                <option value="">Select...</option>
                <option value="ALL">All ({pharmacies.length})</option>
                {pharmacies.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Name *</label>
              <input type="text" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className="input-field text-xs py-1.5" required placeholder="Monthly ConEd" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Frequency *</label>
              <select value={createForm.frequency} onChange={e => setCreateForm(f => ({ ...f, frequency: e.target.value as any }))} className="input-field text-xs py-1.5" required>
                {frequencyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Vendor</label>
              <select value={createForm.vendorId} onChange={e => setCreateForm(f => ({ ...f, vendorId: e.target.value }))} className="input-field text-xs py-1.5">
                <option value="">Any</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Type</label>
              <select value={createForm.invoiceTypeId} onChange={e => setCreateForm(f => ({ ...f, invoiceTypeId: e.target.value }))} className="input-field text-xs py-1.5">
                <option value="">Any</option>
                {invoiceTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Sub Due</label>
              <input type="number" min={1} max={28} value={createForm.submissionDueDay} onChange={e => setCreateForm(f => ({ ...f, submissionDueDay: parseInt(e.target.value) || 5 }))} className="input-field text-xs py-1.5" required />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Proc Due</label>
              <input type="number" min={1} max={28} value={createForm.processingDueDay} onChange={e => setCreateForm(f => ({ ...f, processingDueDay: parseInt(e.target.value) || 10 }))} className="input-field text-xs py-1.5" required />
            </div>
            <div className="flex items-end">
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
              <SortableHeader label="Pharm" field="pharmacy" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
              <SortableHeader label="Name" field="name" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
              <SortableHeader label="Vendor" field="vendor" sortConfig={sortConfig} onSort={handleSort} className="text-left hidden md:table-cell" />
              <SortableHeader label="Freq" field="frequency" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase hidden lg:table-cell">Due</th>
              <SortableHeader label="Status" field="isActive" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {sortedAndPaginatedData.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No requirements configured</td></tr>
            ) : sortedAndPaginatedData.map((r) => (
              <tr key={r.id} className={`hover:bg-gray-50 ${!r.isActive ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2 text-gray-900">{r.pharmacy.code}</td>
                <td className="px-3 py-2 text-gray-900">
                  {editingId === r.id ? (
                    <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="input-field py-1 text-xs w-28" />
                  ) : r.name}
                </td>
                <td className="px-3 py-2 text-gray-500 hidden md:table-cell">
                  {editingId === r.id ? (
                    <select value={editForm.vendorId} onChange={e => setEditForm(f => ({ ...f, vendorId: e.target.value }))} className="input-field py-1 text-xs w-24">
                      <option value="">Any</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  ) : (r.vendor?.name || '-')}
                </td>
                <td className="px-3 py-2">
                  {editingId === r.id ? (
                    <select value={editForm.frequency} onChange={e => setEditForm(f => ({ ...f, frequency: e.target.value as any }))} className="input-field py-1 text-xs w-20">
                      {frequencyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">{frequencyLabel(r.frequency)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500 hidden lg:table-cell">
                  {editingId === r.id ? (
                    <div className="flex gap-1">
                      <input type="number" min={1} max={28} value={editForm.submissionDueDay} onChange={e => setEditForm(f => ({ ...f, submissionDueDay: parseInt(e.target.value) || 5 }))} className="input-field py-1 text-xs w-10" />
                      <input type="number" min={1} max={28} value={editForm.processingDueDay} onChange={e => setEditForm(f => ({ ...f, processingDueDay: parseInt(e.target.value) || 10 }))} className="input-field py-1 text-xs w-10" />
                    </div>
                  ) : (
                    <span className="text-[10px]">{r.submissionDueDay}/{r.processingDueDay}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${r.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {r.isActive ? 'Active' : 'Off'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {editingId === r.id ? (
                      <>
                        <button onClick={handleEdit} disabled={saving} className="text-[10px] px-1.5 py-0.5 rounded bg-green-500 text-white font-medium">{saving ? '...' : 'Save'}</button>
                        <button onClick={() => setEditingId(null)} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(r)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-600">Edit</button>
                        <button onClick={() => handleToggleActive(r)} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${r.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                          {r.isActive ? 'Disable' : 'Enable'}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="text-[11px] text-gray-500">
              Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, requirements.length)} of {requirements.length}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 text-[11px] font-medium rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="px-2 text-[11px] text-gray-600">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-[11px] font-medium rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
