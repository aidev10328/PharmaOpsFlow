'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
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

type SortConfig = {
  field: string;
  direction: 'asc' | 'desc';
};

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

  // Pagination and sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'submissionDeadline', direction: 'asc' });
  const itemsPerPage = 10;

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

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterPharmacy, filterStatus, filterMonth]);

  const handleSort = (field: string) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
    setCurrentPage(1);
  };

  // Sort and paginate data
  const sortedAndPaginatedData = useMemo(() => {
    const sorted = [...instances].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortConfig.field) {
        case 'pharmacy':
          aVal = a.requirement.pharmacy?.code || '';
          bVal = b.requirement.pharmacy?.code || '';
          break;
        case 'requirement':
          aVal = a.requirement.name || '';
          bVal = b.requirement.name || '';
          break;
        case 'period':
          aVal = a.periodLabel || '';
          bVal = b.periodLabel || '';
          break;
        case 'submissionDeadline':
          aVal = new Date(a.submissionDeadline).getTime();
          bVal = new Date(b.submissionDeadline).getTime();
          break;
        case 'status':
          const statusOrder = { PENDING: 1, OVERDUE: 2, SUBMITTED: 3, PROCESSED: 4, MISSED: 5 };
          aVal = statusOrder[a.status] || 0;
          bVal = statusOrder[b.status] || 0;
          break;
        default:
          aVal = new Date(a.submissionDeadline).getTime();
          bVal = new Date(b.submissionDeadline).getTime();
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
  }, [instances, sortConfig, currentPage]);

  const totalPages = Math.ceil(instances.length / itemsPerPage);

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
          <h1 className="text-lg font-heading font-bold text-gray-900">Instances</h1>
          <p className="text-xs text-gray-500">Track fulfillment of invoice requirements by period ({instances.length} total)</p>
        </div>
        <button onClick={handleEvaluate} disabled={evaluating} className="btn-primary text-xs px-3 py-1.5">
          {evaluating ? 'Evaluating...' : 'Run Evaluation'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs">{success}</div>}

      {/* Filters */}
      <div className="card p-3">
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[130px]">
            <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Month</label>
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="input-field text-xs py-1.5" />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Pharmacy</label>
            <select value={filterPharmacy} onChange={e => setFilterPharmacy(e.target.value)} className="input-field text-xs py-1.5">
              <option value="">All Pharmacies</option>
              {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
            </select>
          </div>
          <div className="w-28">
            <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field text-xs py-1.5">
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
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader label="Pharmacy" field="pharmacy" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
                <SortableHeader label="Requirement" field="requirement" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
                <SortableHeader label="Period" field="period" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
                <SortableHeader label="Deadlines" field="submissionDeadline" sortConfig={sortConfig} onSort={handleSort} className="text-left hidden md:table-cell" />
                <SortableHeader label="Status" field="status" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Invoice</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sortedAndPaginatedData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                    No instances found. Generate instances from the Requirements page.
                  </td>
                </tr>
              ) : sortedAndPaginatedData.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-900">{i.requirement.pharmacy.code}</td>
                  <td className="px-3 py-2 text-gray-900">
                    <div className="font-medium">{i.requirement.name}</div>
                    {i.requirement.vendor && <div className="text-[10px] text-gray-400">{i.requirement.vendor.name}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{i.periodLabel}</td>
                  <td className="px-3 py-2 text-gray-500 text-[10px] hidden md:table-cell">
                    <div>Sub: {formatDate(i.submissionDeadline)}</div>
                    <div>Proc: {formatDate(i.processingDeadline)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[i.status] || 'bg-gray-100 text-gray-600'}`}>
                      {i.status}
                    </span>
                    {i.submissionMet === false && <span className="ml-1 text-[10px] text-red-500" title="Submission deadline missed">!</span>}
                    {i.processingMet === false && <span className="ml-1 text-[10px] text-red-500" title="Processing deadline missed">!!</span>}
                  </td>
                  <td className="px-3 py-2">
                    {i.invoice ? (
                      <Link href={`/dashboard/pharmacy/invoices/${i.invoiceId}`} className="text-primary-600 hover:underline text-[10px]">
                        {i.invoice.invoiceNumber || 'View'}
                      </Link>
                    ) : (
                      <span className="text-[10px] text-gray-400">Not linked</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {i.invoice ? (
                        <button onClick={() => handleUnlink(i)} className="text-[10px] px-1.5 py-0.5 rounded font-medium text-red-600 hover:bg-red-50">Unlink</button>
                      ) : (
                        <button onClick={() => openLinkModal(i)} className="text-[10px] px-1.5 py-0.5 rounded font-medium text-primary-600 hover:bg-primary-50">Link</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="text-[11px] text-gray-500">
              Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, instances.length)} of {instances.length}
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

      {/* Link Invoice Modal */}
      {linkingInstance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Link Invoice to Requirement</h3>
            <p className="text-xs text-gray-600 mb-3">
              <strong>{linkingInstance.requirement.name}</strong> - {linkingInstance.periodLabel}
            </p>

            {loadingInvoices ? (
              <div className="py-6 text-center text-gray-400 text-xs">Loading invoices...</div>
            ) : invoices.length === 0 ? (
              <div className="py-6 text-center text-gray-400 text-xs">No invoices available for this pharmacy.</div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {invoices.map((inv: any) => (
                  <label key={inv.id} className={`flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50 ${selectedInvoiceId === inv.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
                    <input type="radio" name="invoice" value={inv.id} checked={selectedInvoiceId === inv.id} onChange={e => setSelectedInvoiceId(e.target.value)} className="text-primary-600" />
                    <div className="flex-1">
                      <div className="font-medium text-xs">{inv.invoiceNumber || 'No Number'}</div>
                      <div className="text-[10px] text-gray-500">
                        {inv.vendor?.name || 'No vendor'} &middot; {inv.status} &middot; {inv.amount ? `$${Number(inv.amount).toFixed(2)}` : 'No amount'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setLinkingInstance(null)} className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-600 font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={handleLink} disabled={!selectedInvoiceId || linking} className="btn-accent text-xs px-3 py-1.5">
                {linking ? 'Linking...' : 'Link Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
