'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

type MatchedInstance = {
  id: string;
  requirementName: string;
  vendorName: string | null;
  invoiceTypeName: string | null;
  periodLabel: string;
  periodStart?: string;
  periodEnd?: string;
  submissionDeadline: string;
  alreadyHasInvoice?: boolean;
};

type PendingInstance = {
  id: string;
  requirementName: string;
  vendorName: string | null;
  invoiceTypeName: string | null;
  periodLabel: string;
  periodStart?: string;
  periodEnd?: string;
  submissionDeadline: string;
  monthDiff?: number; // -2,-1=past, 0=current, 1,2=future
};

type ExtractResult = {
  fileName: string;
  tempFilePath: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  extractedData: {
    vendorName?: string;
    invoiceNumber?: string;
    amount?: number;
    invoiceDate?: string;
    dueDate?: string;
  } | null;
  confidence: Record<string, number> | null;
  matchedVendorId: string | null;
  matchedInvoiceTypeId: string | null;
  matchedInstance: MatchedInstance | null;
  matchConfidence: 'high' | 'medium' | 'low' | 'none';
  category: 'current_match' | 'vendor_match_diff_dates' | 'type_match_no_vendor' | 'new_same_month' | 'no_match';
  isDuplicate: boolean;
  amountAnomaly: string | null;
  avgAmount: number | null;
  multiSameVendor: string | null;
  error: string | null;
};

type FileRow = ExtractResult & {
  selectedInstanceId: string;
  submit: boolean;
  status: 'pending' | 'creating' | 'done' | 'error';
  resultMessage: string;
  previewUrl: string | null;
  confirmed: boolean; // only confirmed rows get processed
  rowIndex: number; // original index in the rows array
};

const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function getDateWarning(dateStr: string | undefined, label: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const diffMonths = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  if (diffMonths < -2) return `${label} is ${Math.abs(diffMonths)} months in the past`;
  if (diffMonths > 3) return `${label} is ${diffMonths} months in the future`;
  if (d.getFullYear() !== now.getFullYear() && Math.abs(diffMonths) > 2) return `${label} is in ${d.getFullYear()}, current year is ${now.getFullYear()}`;
  return null;
}

// Category config
const CATEGORIES = {
  current_match: {
    title: 'Matched to Current Period Requirements',
    desc: 'These invoices match existing requirements by vendor and invoice dates fall within the expected period.',
    color: 'emerald',
    icon: (
      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    border: '!border-emerald-200',
    bg: 'bg-emerald-50/40',
    headerBg: 'bg-emerald-50',
  },
  vendor_match_diff_dates: {
    title: 'Vendor Matched — Different Period',
    desc: 'Vendor matches a requirement but invoice dates fall outside the expected period. Choose the correct period or confirm for past/future.',
    color: 'amber',
    icon: (
      <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
    border: '!border-amber-200',
    bg: 'bg-amber-50/30',
    headerBg: 'bg-amber-50',
  },
  type_match_no_vendor: {
    title: 'Possible Match — Description/Type Only',
    desc: 'Vendor not recognized, but the invoice description or type resembles an existing requirement. Please verify and assign the correct vendor.',
    color: 'purple',
    icon: (
      <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    border: '!border-purple-200',
    bg: 'bg-purple-50/30',
    headerBg: 'bg-purple-50',
  },
  new_same_month: {
    title: 'New Invoices — Current Month',
    desc: 'No matching vendor or requirement found, but invoice dates are in the current month. These will be created as new standalone invoices.',
    color: 'blue',
    icon: (
      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    ),
    border: '!border-blue-200',
    bg: 'bg-blue-50/30',
    headerBg: 'bg-blue-50',
  },
  no_match: {
    title: 'Unmatched / Duplicates',
    desc: 'No vendor, date, or requirement match found, or the invoice already exists in the system. Review carefully before proceeding.',
    color: 'gray',
    icon: (
      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    border: '!border-gray-200',
    bg: 'bg-gray-50/30',
    headerBg: 'bg-gray-50',
  },
} as const;

const CATEGORY_ORDER: (keyof typeof CATEGORIES)[] = ['current_match', 'vendor_match_diff_dates', 'type_match_no_vendor', 'new_same_month', 'no_match'];

// Filter instances to only the period matching the invoice date (± 1 month nearby)
function getRelevantInstances(allInstances: PendingInstance[], invoiceDate?: string | null, dueDate?: string | null): PendingInstance[] {
  if (!allInstances.length) return allInstances;
  const refDateStr = invoiceDate || dueDate;
  if (!refDateStr) return allInstances;
  const refDate = new Date(refDateStr);
  if (isNaN(refDate.getTime())) return allInstances;

  // Find instances whose period contains the invoice date
  const exactMatch = allInstances.filter(inst => {
    if (!inst.periodStart || !inst.periodEnd) return false;
    const start = new Date(inst.periodStart);
    const end = new Date(inst.periodEnd);
    return refDate >= start && refDate <= end;
  });

  if (exactMatch.length > 0) return exactMatch;

  // No exact match — find nearest month (±1 month from invoice date)
  const refMonth = refDate.getFullYear() * 12 + refDate.getMonth();
  const nearby = allInstances.filter(inst => {
    if (!inst.periodStart) return false;
    const ps = new Date(inst.periodStart);
    const instMonth = ps.getFullYear() * 12 + ps.getMonth();
    return Math.abs(instMonth - refMonth) <= 1;
  });

  return nearby.length > 0 ? nearby : allInstances;
}

// Group pending instances by period for dropdown optgroups
function groupInstancesByPeriod(instances: PendingInstance[]): { label: string; instances: PendingInstance[] }[] {
  const groups: Record<string, PendingInstance[]> = {};
  const order: string[] = [];
  // Sort: current month first (monthDiff=0), then past (-1,-2), then future (1,2)
  const sorted = [...instances].sort((a, b) => {
    const aDiff = Math.abs(a.monthDiff ?? 99);
    const bDiff = Math.abs(b.monthDiff ?? 99);
    return aDiff - bDiff;
  });
  for (const inst of sorted) {
    const key = inst.periodLabel;
    if (!groups[key]) {
      groups[key] = [];
      order.push(key);
    }
    groups[key].push(inst);
  }
  return order.map(label => ({
    label: label + (instances.find(i => i.periodLabel === label)?.monthDiff === 0 ? ' (Current)' : ''),
    instances: groups[label],
  }));
}

export default function BulkUploadPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pharmacyId = searchParams.get('pharmacyId') || '';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pharmacies, setPharmacies] = useState<{ id: string; name: string; code: string }[]>([]);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState(pharmacyId);
  const [dragActive, setDragActive] = useState(false);

  const [step, setStep] = useState<'select' | 'extracting' | 'review' | 'submitting' | 'done'>('select');
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<FileRow[]>([]);
  const [pendingInstances, setPendingInstances] = useState<PendingInstance[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [editModalIdx, setEditModalIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    apiFetch('/pharmacies/my/memberships')
      .then(r => r.ok ? r.json() : [])
      .then(memberships => {
        const pharms = memberships.map((m: any) => m.pharmacy);
        setPharmacies(pharms);
        if (!selectedPharmacyId && pharms.length === 1) setSelectedPharmacyId(pharms[0].id);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!selectedPharmacyId) return;
    apiFetch('/invoices/vendors')
      .then(r => r.ok ? r.json() : [])
      .then(data => setVendors(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [selectedPharmacyId]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f =>
      f.type === 'application/pdf' || f.type.startsWith('image/') ||
      f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    if (dropped.length > 0) setFiles(prev => [...prev, ...dropped]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleExtract = async () => {
    if (!selectedPharmacyId || files.length === 0) return;
    setStep('extracting');
    setError('');

    const formData = new FormData();
    formData.append('pharmacyId', selectedPharmacyId);
    files.forEach(f => formData.append('files', f));

    try {
      const token = localStorage.getItem('pharmaopsflow_token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/extraction/bulk-extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || 'Bulk extraction failed');
      }

      const data = await res.json();
      setPendingInstances(data.pendingInstances || []);

      const fileRows: FileRow[] = (data.results || []).map((r: ExtractResult, idx: number) => ({
        ...r,
        selectedInstanceId: r.matchedInstance?.id || '',
        submit: true,
        status: 'pending' as const,
        resultMessage: '',
        previewUrl: files[idx] ? URL.createObjectURL(files[idx]) : null,
        confirmed: !r.isDuplicate && (r.category === 'current_match'), // auto-confirm high-confidence matches
        rowIndex: idx,
      }));

      setRows(fileRows);
      setStep('review');
    } catch (e: any) {
      setError(e.message);
      setStep('select');
    }
  };

  const handleInstanceChange = (idx: number, instanceId: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, selectedInstanceId: instanceId } : r));
  };

  const handleToggleConfirm = (idx: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, confirmed: !r.confirmed } : r));
  };

  const handleFieldChange = (idx: number, field: string, value: string | number) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      return { ...r, extractedData: { ...r.extractedData, [field]: value } };
    }));
  };

  const handleVendorIdChange = (idx: number, vendorId: string) => {
    const vendorName = vendors.find(v => v.id === vendorId)?.name || '';
    setRows(prev => prev.map((r, i) => i === idx ? {
      ...r,
      matchedVendorId: vendorId || null,
      extractedData: { ...r.extractedData, vendorName },
    } : r));
  };

  const handleSubmitAll = async (forceDraft = false) => {
    setStep('submitting');
    setError('');

    const updatedRows = [...rows];

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      if (!row.tempFilePath || row.status === 'done' || !row.confirmed) continue;

      updatedRows[i] = { ...row, status: 'creating' };
      setRows([...updatedRows]);

      try {
        const body: any = {
          tempFilePath: row.tempFilePath,
          originalName: row.originalName,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          pharmacyId: selectedPharmacyId,
          vendorId: row.matchedVendorId || undefined,
          vendorName: !row.matchedVendorId ? (row.extractedData?.vendorName || undefined) : undefined,
          invoiceTypeId: row.matchedInvoiceTypeId || undefined,
          invoiceNumber: row.extractedData?.invoiceNumber || undefined,
          amount: row.extractedData?.amount || undefined,
          invoiceDate: row.extractedData?.invoiceDate || undefined,
          dueDate: row.extractedData?.dueDate || undefined,
          submit: forceDraft ? false : row.submit,
        };

        if (row.selectedInstanceId) {
          body.instanceId = row.selectedInstanceId;
        }

        const res = await apiFetch('/extraction/create-from-temp', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.message || 'Failed to create invoice');
        }

        const invoice = await res.json();
        updatedRows[i] = {
          ...updatedRows[i],
          status: 'done',
          resultMessage: `#${invoice.invoiceNumber || invoice.id?.slice(0, 8)}${forceDraft ? ' (draft)' : (row.submit ? ' (submitted)' : ' (draft)')}${row.selectedInstanceId ? ' — linked to requirement' : ''}`,
        };
      } catch (e: any) {
        updatedRows[i] = {
          ...updatedRows[i],
          status: 'error',
          resultMessage: e.message,
        };
      }

      setRows([...updatedRows]);
    }

    // Redirect to invoices list
    router.push(`/dashboard/pharmacy/invoices?pharmacyId=${selectedPharmacyId}`);
  };

  // Group rows by category
  const getGroupedRows = () => {
    const groups: Record<string, FileRow[]> = {};
    for (const cat of CATEGORY_ORDER) groups[cat] = [];
    for (const row of rows) {
      const cat = row.category || 'no_match';
      if (groups[cat]) groups[cat].push(row);
      else groups['no_match'].push(row);
    }
    return groups;
  };

  const groupedRows = getGroupedRows();
  const confirmedRows = rows.filter(r => r.confirmed);
  const unconfirmedRows = rows.filter(r => !r.confirmed);
  const doneCount = rows.filter(r => r.status === 'done').length;
  const errorCount = rows.filter(r => r.status === 'error').length;
  const matchedCount = rows.filter(r => r.selectedInstanceId && r.confirmed).length;
  const duplicateCount = rows.filter(r => r.isDuplicate).length;
  const anomalyCount = rows.filter(r => r.amountAnomaly).length;

  const selectedInstanceIds = rows.filter(r => r.confirmed).map(r => r.selectedInstanceId).filter(Boolean);
  const getDuplicateWarning = (instanceId: string) => {
    if (!instanceId) return false;
    return selectedInstanceIds.filter(id => id === instanceId).length > 1;
  };

  const editRow = editModalIdx !== null ? rows[editModalIdx] : null;

  if (loading || !user) return null;

  // --- Render a single invoice row card ---
  const renderRow = (row: FileRow) => {
    const idx = row.rowIndex;
    return (
      <div
        key={idx}
        className={`px-3 py-2.5 border-b border-gray-100 last:border-b-0 transition-all ${
          row.status === 'done' ? 'bg-emerald-50/30' :
          row.status === 'error' ? 'bg-red-50/30' : ''
        }`}
      >
        <div className="flex items-start gap-3">
          {/* File info */}
          <div className="flex-shrink-0 w-[140px]">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="text-[11px] font-medium text-gray-900 truncate" title={row.fileName}>{row.fileName}</span>
            </div>
            {row.previewUrl && (
              <a href={row.previewUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary-600 hover:underline ml-5">
                View file
              </a>
            )}
            {row.error && <div className="text-[10px] text-red-500 mt-0.5 ml-5">{row.error}</div>}
          </div>

          {/* Extracted data */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-gray-900">{row.extractedData?.vendorName || 'Unknown vendor'}</span>
              {row.extractedData?.invoiceNumber && (
                <span className="text-[10px] text-gray-500">#{row.extractedData.invoiceNumber}</span>
              )}
              {row.isDuplicate && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">DUPLICATE</span>
              )}
              {row.multiSameVendor && !row.isDuplicate && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium" title={row.multiSameVendor}>MULTI</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-0.5">
              {row.extractedData?.amount != null && <span className="font-medium text-gray-700">${Number(row.extractedData.amount).toFixed(2)}</span>}
              {row.extractedData?.invoiceDate && <span>Inv: {formatDate(row.extractedData.invoiceDate)}</span>}
              {row.extractedData?.dueDate && <span>Due: {formatDate(row.extractedData.dueDate)}</span>}
            </div>
            {/* Date warnings */}
            {(() => {
              const warnings = [
                getDateWarning(row.extractedData?.invoiceDate, 'Invoice date'),
                getDateWarning(row.extractedData?.dueDate, 'Due date'),
              ].filter(Boolean);
              return warnings.length > 0 ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <svg className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[9px] text-amber-600">{warnings.join(' | ')}</span>
                </div>
              ) : null;
            })()}
            {/* Amount anomaly warning */}
            {row.amountAnomaly && (
              <div className="flex items-center gap-1 mt-0.5">
                <svg className="w-2.5 h-2.5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-[9px] text-red-600">{row.amountAnomaly}</span>
              </div>
            )}
            {/* Multi same vendor info */}
            {row.multiSameVendor && (
              <div className="flex items-center gap-1 mt-0.5">
                <svg className="w-2.5 h-2.5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="text-[9px] text-blue-600">{row.multiSameVendor}</span>
              </div>
            )}
          </div>

          {/* Match dropdown */}
          <div className="w-[220px] flex-shrink-0">
            {step === 'review' ? (
              <div>
                <select
                  value={row.selectedInstanceId}
                  onChange={e => handleInstanceChange(idx, e.target.value)}
                  className={`input-field text-[10px] py-1 w-full ${
                    row.selectedInstanceId ? 'border-emerald-300 bg-emerald-50/50' : ''
                  }`}
                >
                  <option value="">No requirement match</option>
                  {groupInstancesByPeriod(getRelevantInstances(pendingInstances, row.extractedData?.invoiceDate, row.extractedData?.dueDate)).map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.instances.map(inst => (
                        <option key={inst.id} value={inst.id}>
                          {inst.requirementName}{inst.vendorName ? ` (${inst.vendorName})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {getDuplicateWarning(row.selectedInstanceId) && (
                  <div className="text-[9px] text-orange-600 mt-0.5">Same requirement selected elsewhere</div>
                )}
                {row.matchConfidence === 'high' && (
                  <div className="text-[9px] text-emerald-600 mt-0.5">Auto-matched (vendor + period)</div>
                )}
                {row.matchConfidence === 'medium' && (
                  <div className="text-[9px] text-yellow-600 mt-0.5">Auto-matched (vendor only)</div>
                )}
                {row.matchConfidence === 'low' && (
                  <div className="text-[9px] text-purple-600 mt-0.5">Suggested (description match)</div>
                )}
                {/* Action indicator */}
                <div className={`text-[9px] mt-1 font-medium ${row.selectedInstanceId ? 'text-emerald-700' : 'text-gray-400'}`}>
                  {row.selectedInstanceId ? 'Will link to requirement' : 'Will create new invoice'}
                </div>
              </div>
            ) : (
              <span className="text-[10px] text-gray-500">
                {row.selectedInstanceId
                  ? pendingInstances.find(i => i.id === row.selectedInstanceId)?.requirementName || 'Linked'
                  : 'Standalone invoice'}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {step === 'review' && (
              <>
                {row.confirmed ? (
                  <>
                    <button
                      onClick={() => setEditModalIdx(idx)}
                      className="text-[10px] px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleConfirm(idx)}
                      className="text-[10px] px-2 py-1 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 font-medium"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleToggleConfirm(idx)}
                    className="text-[10px] px-2.5 py-1 rounded border border-gray-300 bg-white text-gray-600 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 font-medium transition-colors"
                  >
                    Confirm
                  </button>
                )}
              </>
            )}
            {row.status === 'creating' && (
              <svg className="animate-spin h-4 w-4 text-primary-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {row.status === 'done' && (
              <span className="text-[10px] text-emerald-600 font-medium">{row.resultMessage}</span>
            )}
            {row.status === 'error' && (
              <span className="text-[10px] text-red-600">{row.resultMessage}</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-heading font-bold text-gray-900">Bulk Upload</h1>
          <p className="text-xs text-gray-500">Upload multiple invoices and match to requirements</p>
        </div>
        <Link href={`/dashboard/pharmacy/invoices?pharmacyId=${selectedPharmacyId}`} className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 shadow-sm">
          Back to Invoices
        </Link>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{error}</div>}

      {/* Step 1: Select files */}
      {step === 'select' && (
        <div className="space-y-3">
          {pharmacies.length > 1 && (
            <div className="card p-3">
              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Pharmacy</label>
              <select
                value={selectedPharmacyId}
                onChange={e => setSelectedPharmacyId(e.target.value)}
                className="input-field text-xs py-1.5 w-64"
              >
                <option value="">Select pharmacy...</option>
                {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </select>
            </div>
          )}

          <div
            className={`card border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
              dragActive ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
            }`}
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx"
              className="hidden"
              onChange={handleFileSelect}
            />
            <div className="text-gray-400 mb-2">
              <svg className="mx-auto h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-sm text-gray-600 font-medium">Drop invoice files here or click to browse</p>
            <p className="text-[10px] text-gray-400 mt-1">PDF, images, Word docs (max 10MB each, up to 20 files)</p>
          </div>

          {files.length > 0 && (
            <div className="card p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">{files.length} file{files.length > 1 ? 's' : ''} selected</span>
                <button onClick={() => setFiles([])} className="text-[10px] text-red-600 hover:underline">Clear all</button>
              </div>
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between py-1 px-2 bg-gray-50 rounded text-xs">
                  <span className="text-gray-700 truncate flex-1">{f.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); window.open(URL.createObjectURL(f), '_blank'); }}
                    className="text-primary-600 hover:text-primary-800 text-[10px] font-medium mx-1"
                  >
                    View
                  </button>
                  <span className="text-gray-400 mx-1">{(f.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => removeFile(i)} className="text-red-500 hover:text-red-700 text-[10px]">Remove</button>
                </div>
              ))}
              <button
                onClick={handleExtract}
                disabled={!selectedPharmacyId}
                className="btn-primary text-xs px-4 py-2 w-full mt-2 disabled:opacity-50"
              >
                Extract & Match ({files.length} files)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Extracting */}
      {step === 'extracting' && (
        <div className="card p-8 text-center">
          <svg className="animate-spin h-6 w-6 mx-auto text-primary-500 mb-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm font-medium text-gray-700">Extracting invoice data...</p>
          <p className="text-xs text-gray-400 mt-1">Processing {files.length} files with AI extraction</p>
        </div>
      )}

      {/* Step 3: Review — Categorized */}
      {(step === 'review' || step === 'submitting' || step === 'done') && (
        <div className="space-y-3">
          {/* Summary bar */}
          <div className="card p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-gray-600">{rows.length} invoices</span>
              <span className="text-emerald-600 font-medium">{matchedCount} matched</span>
              {duplicateCount > 0 && <span className="text-red-600 font-medium">{duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''}</span>}
              {anomalyCount > 0 && <span className="text-orange-600 font-medium">{anomalyCount} amount warning{anomalyCount > 1 ? 's' : ''}</span>}
              <span className="text-primary-600 font-medium">{confirmedRows.length} confirmed</span>
              {unconfirmedRows.length > 0 && <span className="text-gray-400">{unconfirmedRows.length} unconfirmed</span>}
              {step === 'done' && (
                <>
                  <span className="text-emerald-600 font-medium">{doneCount} created</span>
                  {errorCount > 0 && <span className="text-red-600 font-medium">{errorCount} failed</span>}
                </>
              )}
            </div>
            {step === 'review' && (
              <div className="flex items-center gap-2">
                <button onClick={() => { setStep('select'); setRows([]); }} className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
                  Back
                </button>
                <button
                  onClick={() => handleSubmitAll(true)}
                  disabled={confirmedRows.length === 0}
                  className="text-xs px-4 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50"
                >
                  Save Confirmed as Draft ({confirmedRows.length})
                </button>
                <button
                  onClick={() => handleSubmitAll(false)}
                  disabled={confirmedRows.length === 0}
                  className="btn-primary text-xs px-4 py-1.5"
                >
                  Submit Confirmed ({confirmedRows.length})
                </button>
              </div>
            )}
            {step === 'done' && (
              <Link href={`/dashboard/pharmacy/invoices?pharmacyId=${selectedPharmacyId}`} className="btn-primary text-xs px-4 py-1.5">
                View Invoices
              </Link>
            )}
          </div>

          {/* Categorized sections */}
          {CATEGORY_ORDER.map(catKey => {
            const catRows = groupedRows[catKey];
            if (!catRows || catRows.length === 0) return null;
            const cat = CATEGORIES[catKey];
            const confirmedInCat = catRows.filter(r => r.confirmed).length;

            return (
              <div key={catKey} className={`card ${cat.border} overflow-hidden`}>
                {/* Category header */}
                <div className={`${cat.headerBg} px-3 py-2 flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    {cat.icon}
                    <div>
                      <h3 className="text-xs font-semibold text-gray-900">{cat.title}</h3>
                      <p className="text-[10px] text-gray-500 mt-0.5">{cat.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="font-medium text-gray-600">{catRows.length} invoice{catRows.length > 1 ? 's' : ''}</span>
                    {confirmedInCat > 0 && (
                      <span className="text-emerald-600">({confirmedInCat} confirmed)</span>
                    )}
                    {step === 'review' && confirmedInCat < catRows.length && (
                      <button
                        onClick={() => {
                          setRows(prev => prev.map(r =>
                            catRows.some(cr => cr.rowIndex === r.rowIndex) && !r.isDuplicate
                              ? { ...r, confirmed: true }
                              : r
                          ));
                        }}
                        className="px-2 py-0.5 rounded border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 font-medium"
                      >
                        Confirm All
                      </button>
                    )}
                  </div>
                </div>

                {/* Rows */}
                <div>{catRows.map(row => renderRow(row))}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editModalIdx !== null && editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditModalIdx(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Edit Invoice Details</h3>
                <p className="text-[10px] text-gray-500 mt-0.5">{editRow.fileName}</p>
              </div>
              <div className="flex items-center gap-2">
                {editRow.previewUrl && (
                  <a href={editRow.previewUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary-600 hover:underline font-medium">
                    View PDF
                  </a>
                )}
                <button onClick={() => setEditModalIdx(null)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Vendor</label>
                <select
                  value={editRow.matchedVendorId || ''}
                  onChange={e => handleVendorIdChange(editModalIdx, e.target.value)}
                  className="input-field text-sm py-2 w-full"
                >
                  <option value="">Select vendor...</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Invoice #</label>
                  <input
                    type="text"
                    value={editRow.extractedData?.invoiceNumber || ''}
                    onChange={e => handleFieldChange(editModalIdx, 'invoiceNumber', e.target.value)}
                    className="input-field text-sm py-2 w-full"
                    placeholder="INV-001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editRow.extractedData?.amount || ''}
                      onChange={e => handleFieldChange(editModalIdx, 'amount', e.target.value ? parseFloat(e.target.value) : '')}
                      className="input-field text-sm py-2 w-full pl-7"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={editRow.extractedData?.invoiceDate || ''}
                    onChange={e => handleFieldChange(editModalIdx, 'invoiceDate', e.target.value)}
                    className="input-field text-sm py-2 w-full"
                  />
                  {getDateWarning(editRow.extractedData?.invoiceDate, 'Invoice date') && (
                    <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                      <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                      {getDateWarning(editRow.extractedData?.invoiceDate, 'Invoice date')}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={editRow.extractedData?.dueDate || ''}
                    onChange={e => handleFieldChange(editModalIdx, 'dueDate', e.target.value)}
                    className="input-field text-sm py-2 w-full"
                  />
                  {getDateWarning(editRow.extractedData?.dueDate, 'Due date') && (
                    <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                      <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                      {getDateWarning(editRow.extractedData?.dueDate, 'Due date')}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Match to Requirement</label>
                <select
                  value={editRow.selectedInstanceId}
                  onChange={e => handleInstanceChange(editModalIdx, e.target.value)}
                  className={`input-field text-sm py-2 w-full ${editRow.selectedInstanceId ? 'border-emerald-300' : ''}`}
                >
                  <option value="">No requirement (standalone invoice)</option>
                  {groupInstancesByPeriod(getRelevantInstances(pendingInstances, editRow.extractedData?.invoiceDate, editRow.extractedData?.dueDate)).map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.instances.map(inst => (
                        <option key={inst.id} value={inst.id}>
                          {inst.requirementName}{inst.vendorName ? ` (${inst.vendorName})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
              <button
                onClick={() => setEditModalIdx(null)}
                className="text-xs px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
