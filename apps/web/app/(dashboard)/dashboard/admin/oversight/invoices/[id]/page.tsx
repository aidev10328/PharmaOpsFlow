'use client';

import { useAuth } from '../../../../../../../components/AuthProvider';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../../../lib/api';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-50 text-blue-700',
  NEEDS_INFO: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  SCHEDULED: 'bg-purple-50 text-purple-700',
  PAID: 'bg-green-50 text-green-800',
  REJECTED: 'bg-red-50 text-red-700',
};

const ADMIN_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['APPROVED', 'NEEDS_INFO', 'REJECTED', 'DRAFT'],
  NEEDS_INFO: ['SUBMITTED', 'DRAFT', 'REJECTED'],
  APPROVED: ['SCHEDULED', 'SUBMITTED', 'REJECTED'],
  SCHEDULED: ['PAID', 'APPROVED', 'REJECTED'],
  PAID: [],
  REJECTED: ['DRAFT'],
};

const UNLOCKABLE = ['SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'SCHEDULED'];

type Pharmacy = { id: string; name: string; code: string };

export default function InvoiceDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<any>(null);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal state
  const [showOverride, setShowOverride] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Form state
  const [overrideStatus, setOverrideStatus] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [unlockReason, setUnlockReason] = useState('');
  const [reassignPharmacy, setReassignPharmacy] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  const fetchInvoice = async () => {
    try {
      const res = await apiFetch(`/v1/admin/oversight/invoices/${invoiceId}`);
      if (!res.ok) throw new Error('Failed to load invoice');
      setInvoice(await res.json());
    } catch (e: any) { setError(e.message); }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      Promise.all([
        fetchInvoice(),
        apiFetch('/v1/admin/pharmacies').then(r => r.ok ? r.json() : []).then(ps =>
          setPharmacies(ps.map((p: any) => ({ id: p.id, name: p.name, code: p.code })))
        ),
      ]).finally(() => setLoadingData(false));
    }
  }, [user, invoiceId]);

  const handleOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideStatus || !overrideReason) return;
    setProcessing(true); setError(null); setSuccess(null);
    try {
      const res = await apiFetch(`/v1/admin/oversight/invoices/${invoiceId}/override-status`, {
        method: 'POST',
        body: JSON.stringify({ newStatus: overrideStatus, reason: overrideReason }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Override failed'); }
      setSuccess('Status override applied successfully.');
      setShowOverride(false); setOverrideStatus(''); setOverrideReason('');
      fetchInvoice();
    } catch (e: any) { setError(e.message); }
    finally { setProcessing(false); }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockReason) return;
    setProcessing(true); setError(null); setSuccess(null);
    try {
      const res = await apiFetch(`/v1/admin/oversight/invoices/${invoiceId}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ reason: unlockReason }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Unlock failed'); }
      setSuccess('Invoice unlocked successfully.');
      setShowUnlock(false); setUnlockReason('');
      fetchInvoice();
    } catch (e: any) { setError(e.message); }
    finally { setProcessing(false); }
  };

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignPharmacy || !reassignReason) return;
    setProcessing(true); setError(null); setSuccess(null);
    try {
      const res = await apiFetch(`/v1/admin/oversight/invoices/${invoiceId}/reassign-pharmacy`, {
        method: 'POST',
        body: JSON.stringify({ newPharmacyId: reassignPharmacy, reason: reassignReason }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Reassign failed'); }
      setSuccess('Pharmacy reassignment completed.');
      setShowReassign(false); setReassignPharmacy(''); setReassignReason('');
      fetchInvoice();
    } catch (e: any) { setError(e.message); }
    finally { setProcessing(false); }
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
  if (!invoice) return <div className="text-center py-20 text-gray-500">Invoice not found</div>;

  const allowedTransitions = ADMIN_TRANSITIONS[invoice.status] || [];
  const canUnlock = UNLOCKABLE.includes(invoice.status);
  const isOverdue = invoice.dueDate && new Date(invoice.dueDate) < new Date() && invoice.status !== 'PAID' && invoice.status !== 'REJECTED';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin/oversight/invoices" className="text-link text-sm">&larr; Back to Invoice Oversight</Link>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">
            Invoice {invoice.invoiceNumber || invoice.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {invoice.pharmacy?.name} ({invoice.pharmacy?.code})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_COLORS[invoice.status]}`}>
            {invoice.status}
          </span>
          {isOverdue && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
              OVERDUE
            </span>
          )}
          {invoice.needsReview && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
              Needs Review
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice Details */}
          <div className="card p-5">
            <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">Invoice Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div><span className="text-gray-500 block">Invoice #</span><span className="font-medium">{invoice.invoiceNumber || '-'}</span></div>
              <div><span className="text-gray-500 block">Amount</span><span className="font-medium">{invoice.amount != null ? `$${Number(invoice.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}</span></div>
              <div><span className="text-gray-500 block">Currency</span><span className="font-medium">{invoice.currency}</span></div>
              <div><span className="text-gray-500 block">Invoice Date</span><span className="font-medium">{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString() : '-'}</span></div>
              <div><span className="text-gray-500 block">Due Date</span><span className={`font-medium ${isOverdue ? 'text-red-600' : ''}`}>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '-'}</span></div>
              <div><span className="text-gray-500 block">Submitted</span><span className="font-medium">{invoice.submittedAt ? new Date(invoice.submittedAt).toLocaleDateString() : '-'}</span></div>
              <div><span className="text-gray-500 block">Vendor</span><span className="font-medium">{invoice.vendor?.name || '-'}</span></div>
              <div><span className="text-gray-500 block">Type</span><span className="font-medium">{invoice.invoiceType?.name || '-'}</span></div>
              <div><span className="text-gray-500 block">Extraction</span><span className="font-medium">{invoice.extractionStatus}</span></div>
            </div>
            {invoice.description && <div className="mt-4 text-sm"><span className="text-gray-500 block">Description</span>{invoice.description}</div>}
            {invoice.notes && <div className="mt-2 text-sm"><span className="text-gray-500 block">Notes</span>{invoice.notes}</div>}
          </div>

          {/* Files */}
          {invoice.files?.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">Attachments ({invoice.files.length})</h3>
              <div className="space-y-2">
                {invoice.files.map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-md">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">{f.originalName}</span>
                      <span className="text-gray-400 ml-2">{(f.sizeBytes / 1024).toFixed(1)} KB</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(f.createdAt).toLocaleDateString()} by {f.uploadedBy?.firstName} {f.uploadedBy?.lastName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Intervention Actions */}
          <div className="card p-5 border-amber-200 bg-amber-50/30">
            <h3 className="text-sm font-heading font-semibold text-amber-900 mb-1">Admin Interventions</h3>
            <p className="text-xs text-amber-700 mb-4">These actions are audit-logged. A reason is required for every action.</p>
            <div className="flex flex-wrap gap-2">
              {allowedTransitions.length > 0 && (
                <button
                  onClick={() => { setShowOverride(true); setError(null); setSuccess(null); }}
                  className="text-sm px-3 py-1.5 rounded-md font-medium bg-amber-100 text-amber-800 hover:bg-amber-200"
                >
                  Override Status
                </button>
              )}
              {canUnlock && (
                <button
                  onClick={() => { setShowUnlock(true); setError(null); setSuccess(null); }}
                  className="text-sm px-3 py-1.5 rounded-md font-medium bg-amber-100 text-amber-800 hover:bg-amber-200"
                >
                  Unlock Invoice
                </button>
              )}
              <button
                onClick={() => { setShowReassign(true); setError(null); setSuccess(null); }}
                className="text-sm px-3 py-1.5 rounded-md font-medium bg-amber-100 text-amber-800 hover:bg-amber-200"
              >
                Reassign Pharmacy
              </button>
            </div>
          </div>

          {/* Extractions */}
          {invoice.extractions?.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">Extraction History</h3>
              <div className="space-y-3">
                {invoice.extractions.map((ext: any) => (
                  <div key={ext.id} className="py-2 px-3 bg-gray-50 rounded-md text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {ext.provider} {ext.model && `(${ext.model})`}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ext.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : ext.status === 'FAILED' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                        {ext.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(ext.createdAt).toLocaleString()}
                      {ext.processingMs && ` (${ext.processingMs}ms)`}
                    </div>
                    {ext.error && <div className="text-xs text-red-600 mt-1">{ext.error}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Pharmacy */}
          <div className="card p-5">
            <h3 className="text-sm font-heading font-semibold text-gray-900 mb-3">Pharmacy</h3>
            <div className="text-sm space-y-1">
              <div className="font-medium">{invoice.pharmacy?.name}</div>
              <div className="text-gray-500 font-mono">{invoice.pharmacy?.code}</div>
              {invoice.pharmacy?.city && (
                <div className="text-gray-500">{invoice.pharmacy.city}, {invoice.pharmacy.state} {invoice.pharmacy.zip}</div>
              )}
            </div>
          </div>

          {/* Vendor */}
          {invoice.vendor && (
            <div className="card p-5">
              <h3 className="text-sm font-heading font-semibold text-gray-900 mb-3">Vendor</h3>
              <div className="text-sm space-y-1">
                <div className="font-medium">{invoice.vendor.name}</div>
                {invoice.vendor.email && <div className="text-gray-500">{invoice.vendor.email}</div>}
                {invoice.vendor.phone && <div className="text-gray-500">{invoice.vendor.phone}</div>}
                {invoice.vendor.paymentTerms && <div className="text-gray-500">Terms: {invoice.vendor.paymentTerms}</div>}
              </div>
            </div>
          )}

          {/* Event Timeline */}
          <div className="card p-5">
            <h3 className="text-sm font-heading font-semibold text-gray-900 mb-3">
              Event Timeline ({invoice.events?.length || 0})
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {(invoice.events || []).map((evt: any) => (
                <div key={evt.id} className="border-l-2 border-gray-200 pl-3 py-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[evt.eventType] || 'bg-gray-100 text-gray-700'}`}>
                      {evt.eventType}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {evt.user?.firstName} {evt.user?.lastName} &middot; {new Date(evt.createdAt).toLocaleString()}
                  </div>
                  {evt.notes && <div className="text-xs text-gray-600 mt-1">{evt.notes}</div>}
                </div>
              ))}
              {(!invoice.events || invoice.events.length === 0) && (
                <p className="text-xs text-gray-400">No events recorded.</p>
              )}
            </div>
          </div>

          {/* SLA Events */}
          {invoice.slaEvents?.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-heading font-semibold text-gray-900 mb-3">SLA Events</h3>
              <div className="space-y-2">
                {invoice.slaEvents.map((sla: any) => (
                  <div key={sla.id} className="text-sm py-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${sla.eventType.includes('MISSED') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                      {sla.eventType}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">{sla.yearMonth}</span>
                    {sla.notes && <div className="text-xs text-gray-500 mt-1">{sla.notes}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Override Status Modal */}
      {showOverride && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-heading font-semibold text-gray-900 mb-1">Override Invoice Status</h3>
            <p className="text-sm text-amber-700 mb-4">This action is audit-logged. Current status: <strong>{invoice.status}</strong></p>
            <form onSubmit={handleOverride} className="space-y-4">
              <div>
                <label className="field-label">New Status <span className="text-red-500">*</span></label>
                <select value={overrideStatus} onChange={e => setOverrideStatus(e.target.value)} className="input-field" required>
                  <option value="">Select status...</option>
                  {allowedTransitions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Reason <span className="text-red-500">*</span></label>
                <textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)} className="input-field" rows={3} required minLength={5} placeholder="Explain why this override is necessary (min 5 chars)" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowOverride(false)} className="text-sm px-4 py-2 rounded-md text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="submit" disabled={processing} className="text-sm px-4 py-2 rounded-md font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                  {processing ? 'Processing...' : 'Apply Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unlock Modal */}
      {showUnlock && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-heading font-semibold text-gray-900 mb-1">Unlock Invoice</h3>
            <p className="text-sm text-amber-700 mb-4">
              This will reset the invoice from <strong>{invoice.status}</strong> to its previous state. This action is audit-logged.
            </p>
            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <label className="field-label">Reason <span className="text-red-500">*</span></label>
                <textarea value={unlockReason} onChange={e => setUnlockReason(e.target.value)} className="input-field" rows={3} required minLength={5} placeholder="Explain why this unlock is necessary (min 5 chars)" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowUnlock(false)} className="text-sm px-4 py-2 rounded-md text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="submit" disabled={processing} className="text-sm px-4 py-2 rounded-md font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                  {processing ? 'Processing...' : 'Unlock Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {showReassign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-heading font-semibold text-gray-900 mb-1">Reassign Pharmacy</h3>
            <p className="text-sm text-amber-700 mb-4">
              Move this invoice from <strong>{invoice.pharmacy?.name}</strong> to a different pharmacy. This action is audit-logged.
            </p>
            <form onSubmit={handleReassign} className="space-y-4">
              <div>
                <label className="field-label">New Pharmacy <span className="text-red-500">*</span></label>
                <select value={reassignPharmacy} onChange={e => setReassignPharmacy(e.target.value)} className="input-field" required>
                  <option value="">Select pharmacy...</option>
                  {pharmacies.filter(p => p.id !== invoice.pharmacyId).map(p =>
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  )}
                </select>
              </div>
              <div>
                <label className="field-label">Reason <span className="text-red-500">*</span></label>
                <textarea value={reassignReason} onChange={e => setReassignReason(e.target.value)} className="input-field" rows={3} required minLength={5} placeholder="Explain why this reassignment is necessary (min 5 chars)" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowReassign(false)} className="text-sm px-4 py-2 rounded-md text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="submit" disabled={processing} className="text-sm px-4 py-2 rounded-md font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                  {processing ? 'Processing...' : 'Reassign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
