'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

type Instance = {
  id: string;
  requirementId: string;
  requirement: {
    id: string;
    name: string;
    pharmacy: { id: string; name: string; code: string };
    vendor: { id: string; name: string } | null;
    invoiceType: { id: string; name: string } | null;
  };
  invoiceId: string | null;
  invoice: { id: string; invoiceNumber: string | null; status: string } | null;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  submissionDeadline: string;
  processingDeadline: string;
  status: 'PENDING' | 'SUBMITTED' | 'PROCESSED' | 'OVERDUE' | 'MISSED';
  submittedAt: string | null;
  processedAt: string | null;
  submissionMet: boolean | null;
  processingMet: boolean | null;
};

type Pharmacy = { id: string; name: string; code: string };

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700',
  SUBMITTED: 'bg-blue-50 text-blue-700',
  PROCESSED: 'bg-emerald-50 text-emerald-700',
  OVERDUE: 'bg-orange-50 text-orange-700',
  MISSED: 'bg-red-50 text-red-700',
};

const formatDate = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export default function InstancesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [instances, setInstances] = useState<Instance[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [filterPharmacy, setFilterPharmacy] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>(currentMonth());

  // Link invoice modal
  const [linkingInstance, setLinkingInstance] = useState<Instance | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [linking, setLinking] = useState(false);

  // Evaluation
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      router.push('/dashboard');
      return;
    }
  }, [user, loading, router]);

  const fetchInstances = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterPharmacy) params.set('pharmacyId', filterPharmacy);
      if (filterStatus) params.set('status', filterStatus);
      if (filterMonth) params.set('yearMonth', filterMonth);
      const res = await apiFetch(`/v1/requirements/instances?${params.toString()}`);
      if (res.ok) setInstances(await res.json());
    } catch { setError('Failed to load instances'); }
  }, [filterPharmacy, filterStatus, filterMonth]);

  const fetchPharmacies = async () => {
    try {
      const res = await apiFetch('/v1/admin/pharmacies');
      if (res.ok) setPharmacies(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      Promise.all([fetchInstances(), fetchPharmacies()])
        .finally(() => setLoadingData(false));
    }
  }, [user, fetchInstances]);

  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      fetchInstances();
    }
  }, [filterPharmacy, filterStatus, filterMonth, fetchInstances, user]);

  const handleEvaluate = async () => {
    setEvaluating(true);
    setError(null);
    setSuccess(null);
    try {
      const params = filterMonth ? `?yearMonth=${filterMonth}` : '';
      const res = await apiFetch(`/v1/requirements/evaluate${params}`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed'); }
      const result = await res.json();
      setSuccess(`Evaluated ${result.evaluated} instances: ${result.overdue} overdue, ${result.missed} missed.`);
      fetchInstances();
    } catch (e: any) { setError(e.message); }
    finally { setEvaluating(false); }
  };

  const openLinkModal = async (instance: Instance) => {
    setLinkingInstance(instance);
    setSelectedInvoiceId('');
    setLoadingInvoices(true);
    try {
      // Fetch unlinked invoices for this pharmacy
      const res = await apiFetch(`/invoices?pharmacyId=${instance.requirement.pharmacy.id}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.rows || data || []);
      }
    } catch { /* ignore */ }
    finally { setLoadingInvoices(false); }
  };

  const handleLink = async () => {
    if (!linkingInstance || !selectedInvoiceId) return;
    setLinking(true);
    setError(null);
    try {
      const res = await apiFetch(`/v1/requirements/instances/${linkingInstance.id}/link`, {
        method: 'POST',
        body: JSON.stringify({ invoiceId: selectedInvoiceId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed'); }
      setSuccess('Invoice linked successfully.');
      setLinkingInstance(null);
      fetchInstances();
    } catch (e: any) { setError(e.message); }
    finally { setLinking(false); }
  };

  const handleUnlink = async (instance: Instance) => {
    if (!confirm('Unlink this invoice from the requirement?')) return;
    setError(null);
    try {
      const res = await apiFetch(`/v1/requirements/instances/${instance.id}/link`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed'); }
      setSuccess('Invoice unlinked.');
      fetchInstances();
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

  if (!user || !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin/requirements" className="text-link text-sm">&larr; Back to Requirements</Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Requirement Instances</h1>
          <p className="text-sm text-gray-500 mt-1">Track fulfillment of invoice requirements by period</p>
        </div>
        <button onClick={handleEvaluate} disabled={evaluating} className="btn-primary">
          {evaluating ? 'Evaluating...' : 'Run Evaluation'}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[150px]">
            <label className="field-label">Month</label>
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="input-field" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="field-label">Pharmacy</label>
            <select value={filterPharmacy} onChange={e => setFilterPharmacy(e.target.value)} className="input-field">
              <option value="">All Pharmacies</option>
              {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
            </select>
          </div>
          <div className="w-36">
            <label className="field-label">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field">
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="PROCESSED">Processed</option>
              <option value="OVERDUE">Overdue</option>
              <option value="MISSED">Missed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pharmacy</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Requirement</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Deadlines</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {instances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">
                    No instances found. Generate instances from the Requirements page.
                  </td>
                </tr>
              ) : instances.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-900">{i.requirement.pharmacy.code}</td>
                  <td className="px-3 py-2 text-gray-900">
                    <div className="font-medium">{i.requirement.name}</div>
                    {i.requirement.vendor && <div className="text-xs text-gray-400">{i.requirement.vendor.name}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{i.periodLabel}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs hidden md:table-cell">
                    <div>Sub: {formatDate(i.submissionDeadline)}</div>
                    <div>Proc: {formatDate(i.processingDeadline)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[i.status] || 'bg-gray-100 text-gray-600'}`}>
                      {i.status}
                    </span>
                    {i.submissionMet === false && <span className="ml-1 text-xs text-red-500" title="Submission deadline missed">!</span>}
                    {i.processingMet === false && <span className="ml-1 text-xs text-red-500" title="Processing deadline missed">!!</span>}
                  </td>
                  <td className="px-3 py-2">
                    {i.invoice ? (
                      <Link href={`/dashboard/pharmacy/invoices/${i.invoiceId}`} className="text-link text-xs">
                        {i.invoice.invoiceNumber || 'View Invoice'}
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-400">Not linked</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {i.invoice ? (
                        <button onClick={() => handleUnlink(i)} className="text-xs px-2 py-1 rounded-md font-medium text-red-600 hover:bg-red-50">Unlink</button>
                      ) : (
                        <button onClick={() => openLinkModal(i)} className="text-xs px-2 py-1 rounded-md font-medium text-primary-600 hover:bg-primary-50">Link Invoice</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Link Invoice Modal */}
      {linkingInstance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4">Link Invoice to Requirement</h3>
            <p className="text-sm text-gray-600 mb-4">
              <strong>{linkingInstance.requirement.name}</strong> - {linkingInstance.periodLabel}
            </p>

            {loadingInvoices ? (
              <div className="py-8 text-center text-gray-500">Loading invoices...</div>
            ) : invoices.length === 0 ? (
              <div className="py-8 text-center text-gray-500">No invoices available for this pharmacy.</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {invoices.map((inv: any) => (
                  <label key={inv.id} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${selectedInvoiceId === inv.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
                    <input type="radio" name="invoice" value={inv.id} checked={selectedInvoiceId === inv.id} onChange={e => setSelectedInvoiceId(e.target.value)} className="text-primary-600" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{inv.invoiceNumber || 'No Number'}</div>
                      <div className="text-xs text-gray-500">
                        {inv.vendor?.name || 'No vendor'} &middot; {inv.status} &middot; {inv.amount ? `$${Number(inv.amount).toFixed(2)}` : 'No amount'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setLinkingInstance(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleLink} disabled={!selectedInvoiceId || linking} className="btn-primary">
                {linking ? 'Linking...' : 'Link Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
