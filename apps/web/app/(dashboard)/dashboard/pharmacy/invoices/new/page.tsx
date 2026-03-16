'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

type Pharmacy = { id: string; name: string; code: string };
type Vendor = { id: string; name: string; code: string; paymentTerms?: string };
type InvoiceType = { id: string; name: string; description?: string };
type DocumentType = 'INVOICE' | 'STATEMENT' | 'CREDIT_MEMO' | 'OTHER';

type ExtractedData = {
  vendorName?: string;
  invoiceNumber?: string;
  accountNumber?: string;
  documentType?: DocumentType;
  invoiceDate?: string;
  dueDate?: string;
  paymentTerms?: string;
  amount?: number;
  currency?: string;
  invoiceType?: string;
  payableTo?: string;
  paymentAddress?: string;
};

type Confidence = {
  vendorName?: number;
  invoiceNumber?: number;
  invoiceDate?: number;
  dueDate?: number;
  amount?: number;
};

type TempFileData = {
  tempFilePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

type RequirementInstance = {
  id: string;
  requirement: {
    id: string;
    name: string;
    pharmacy: { id: string; name: string; code: string };
    vendor: { id: string; name: string } | null;
    invoiceType: { id: string; name: string } | null;
  };
  periodStart?: string;
  periodEnd?: string;
  periodLabel: string;
  submissionDeadline: string;
  status: string;
};

type SubmitWarning = {
  severity: 'error' | 'warning';
  message: string;
};

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

export default function NewInvoicePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [invoiceTypes, setInvoiceTypes] = useState<InvoiceType[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Instance data (when creating from requirement)
  const instanceId = searchParams.get('instanceId');
  const [instance, setInstance] = useState<RequirementInstance | null>(null);

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tempFileData, setTempFileData] = useState<TempFileData | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [extractionWarnings, setExtractionWarnings] = useState<{ type: string; severity: string; field?: string; message: string }[]>([]);

  // Submit confirmation
  const [submitWarnings, setSubmitWarnings] = useState<SubmitWarning[]>([]);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [pendingSubmitDraft, setPendingSubmitDraft] = useState(true);

  // New vendor creation
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorCode, setNewVendorCode] = useState('');
  const [creatingVendor, setCreatingVendor] = useState(false);

  // Due upon receipt
  const [dueUponReceipt, setDueUponReceipt] = useState(false);

  const [formData, setFormData] = useState({
    pharmacyId: '',
    vendorId: '',
    invoiceTypeId: '',
    documentType: 'INVOICE' as DocumentType,
    accountNumber: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    amount: '',
    currency: 'USD',
    description: '',
    notes: '',
  });

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  // Fetch pharmacies, vendors, invoice types, and instance
  useEffect(() => {
    async function fetchData() {
      try {
        const promises: Promise<Response>[] = [
          apiFetch('/pharmacies'),
          apiFetch('/invoices/vendors'),
          apiFetch('/invoices/types'),
        ];
        if (instanceId) {
          promises.push(apiFetch(`/v1/requirements/instances/${instanceId}`));
        }

        const results = await Promise.all(promises);
        const [pharmaciesRes, vendorsRes, typesRes] = results;

        if (pharmaciesRes.ok) {
          const data = await pharmaciesRes.json();
          setPharmacies(data);
          const initialPharmacy = searchParams.get('pharmacyId') || (data.length > 0 ? data[0].id : '');
          setFormData(prev => ({ ...prev, pharmacyId: initialPharmacy }));
        }
        if (vendorsRes.ok) setVendors(await vendorsRes.json());
        if (typesRes.ok) setInvoiceTypes(await typesRes.json());

        // Handle instance data
        if (instanceId && results[3]?.ok) {
          const instanceData = await results[3].json();
          setInstance(instanceData);
          setFormData(prev => ({
            ...prev,
            vendorId: instanceData.requirement.vendor?.id || prev.vendorId,
            invoiceTypeId: instanceData.requirement.invoiceType?.id || prev.invoiceTypeId,
          }));
        }
      } catch {
        setError('Failed to load form data');
      } finally {
        setLoadingData(false);
      }
    }
    if (user) fetchData();
  }, [user, searchParams, instanceId]);

  // Calculate due date based on vendor payment terms
  useEffect(() => {
    if (formData.vendorId && formData.invoiceDate && !dueUponReceipt) {
      const vendor = vendors.find(v => v.id === formData.vendorId);
      if (vendor?.paymentTerms) {
        const match = vendor.paymentTerms.match(/Net (\d+)/i);
        if (match) {
          const days = parseInt(match[1], 10);
          const dueDate = new Date(formData.invoiceDate);
          dueDate.setDate(dueDate.getDate() + days);
          setFormData(prev => ({ ...prev, dueDate: dueDate.toISOString().split('T')[0] }));
        }
      }
    }
  }, [formData.vendorId, formData.invoiceDate, vendors, dueUponReceipt]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  // === File Upload Handlers ===
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) validateAndSetFile(e.dataTransfer.files[0]);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) validateAndSetFile(e.target.files[0]);
  };

  const validateAndSetFile = (selectedFile: File) => {
    const allowedTypes = [
      'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Please upload a PDF, image (JPG, PNG), or Word document');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }
    setFile(selectedFile);
    setError(null);
  };

  const handleUploadAndParse = async () => {
    if (!file || !formData.pharmacyId) {
      setError('Please select a pharmacy and upload a file');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('pharmacyId', formData.pharmacyId);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'}/extraction/extract-only`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('pharmaopsflow_token')}` },
          body: fd,
        }
      );
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Upload failed');
      }

      const data = await res.json();
      setTempFileData({
        tempFilePath: data.tempFilePath,
        originalName: data.originalName,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
      });
      setExtractedData(data.extractedData);
      setConfidence(data.confidence);

      // Build warnings: API warnings + requirement-specific checks
      const allWarnings = [...(data.warnings || [])];

      // Add requirement-specific warnings if uploading against a requirement
      if (instance && data.extractedData) {
        const ext = data.extractedData;

        // Vendor mismatch
        if (instance.requirement.vendor && ext.vendorName) {
          const reqVendor = instance.requirement.vendor.name.toLowerCase();
          const extVendor = ext.vendorName.toLowerCase();
          if (!extVendor.includes(reqVendor) && !reqVendor.includes(extVendor)) {
            allWarnings.push({
              type: 'requirement_mismatch',
              severity: 'warning',
              field: 'vendorName',
              message: `Requirement expects vendor "${instance.requirement.vendor.name}" but invoice is from "${ext.vendorName}". This may not be the right invoice for this requirement.`,
            });
          }
        }

        // Invoice type mismatch
        if (instance.requirement.invoiceType && ext.invoiceType) {
          const reqType = instance.requirement.invoiceType.name.toLowerCase();
          const extType = ext.invoiceType.toLowerCase();
          if (!extType.includes(reqType) && !reqType.includes(extType)) {
            allWarnings.push({
              type: 'requirement_mismatch',
              severity: 'warning',
              field: 'invoiceType',
              message: `Requirement expects "${instance.requirement.invoiceType.name}" but AI detected "${ext.invoiceType}". Please verify this is the correct invoice type.`,
            });
          }
        }

        // Date outside requirement period
        if (ext.invoiceDate && instance.periodStart && instance.periodEnd) {
          const invDate = new Date(ext.invoiceDate);
          const periodStart = new Date(instance.periodStart);
          const periodEnd = new Date(instance.periodEnd);
          if (invDate < periodStart || invDate > periodEnd) {
            allWarnings.push({
              type: 'requirement_mismatch',
              severity: 'warning',
              field: 'invoiceDate',
              message: `Invoice date ${ext.invoiceDate} is outside the requirement period (${instance.periodLabel}). This invoice may belong to a different period.`,
            });
          }
        }
      }

      setExtractionWarnings(allWarnings);

      // Update vendor/type lists from extraction response
      if (data.vendors) setVendors(data.vendors);
      if (data.invoiceTypes) setInvoiceTypes(data.invoiceTypes);

      const isDueUponReceipt = data.extractedData?.dueDate === 'DUE_UPON_RECEIPT' ||
        data.extractedData?.paymentTerms?.toLowerCase().includes('due upon receipt') ||
        data.extractedData?.paymentTerms?.toLowerCase().includes('payable upon receipt');
      setDueUponReceipt(isDueUponReceipt);

      // Show new vendor form if vendor not matched
      if (data.extractedData?.vendorName && !data.matchedVendorId) {
        setShowNewVendor(true);
        setNewVendorName(data.extractedData.vendorName);
        const code = data.extractedData.vendorName
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .split(' ')
          .map((w: string) => w.charAt(0).toUpperCase())
          .join('')
          .substring(0, 6) || 'NEW';
        setNewVendorCode(code);
      }

      // Pre-fill form with extracted data
      if (data.extractedData) {
        const notesParts: string[] = [];
        if (data.extractedData.paymentTerms) notesParts.push(`Payment Terms: ${data.extractedData.paymentTerms}`);
        if (data.extractedData.payableTo) notesParts.push(`Payable to: ${data.extractedData.payableTo}`);
        if (data.extractedData.paymentAddress) notesParts.push(`Send Payment to: ${data.extractedData.paymentAddress}`);

        const defaultInvoiceTypeId = data.matchedInvoiceTypeId ||
          (data.invoiceTypes || []).find((t: InvoiceType) => t.name === 'Vendor Invoice')?.id || '';

        setFormData(prev => ({
          ...prev,
          vendorId: data.matchedVendorId || prev.vendorId,
          invoiceTypeId: defaultInvoiceTypeId || prev.invoiceTypeId,
          invoiceNumber: data.extractedData.invoiceNumber || prev.invoiceNumber,
          accountNumber: data.extractedData.accountNumber || prev.accountNumber,
          documentType: data.extractedData.documentType || prev.documentType,
          invoiceDate: data.extractedData.invoiceDate || prev.invoiceDate,
          dueDate: isDueUponReceipt ? '' : (data.extractedData.dueDate || prev.dueDate),
          amount: data.extractedData.amount?.toString() || prev.amount,
          currency: data.extractedData.currency || prev.currency,
          notes: notesParts.length > 0 ? notesParts.join('\n') : prev.notes,
        }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload and parse invoice');
    } finally {
      setUploading(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setTempFileData(null);
    setExtractedData(null);
    setConfidence(null);
    setExtractionWarnings([]);
    setShowNewVendor(false);
  };

  // === Vendor Creation ===
  const handleCreateVendor = async () => {
    if (!newVendorName.trim() || !newVendorCode.trim()) {
      setError('Please enter vendor name and code');
      return;
    }
    setCreatingVendor(true);
    setError(null);
    try {
      const res = await apiFetch('/invoices/vendors', {
        method: 'POST',
        body: JSON.stringify({ name: newVendorName.trim(), externalRef: newVendorCode.trim().toUpperCase() || undefined }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to create vendor');
      }
      const newVendor = await res.json();
      setVendors(prev => [...prev, newVendor]);
      setFormData(prev => ({ ...prev, vendorId: newVendor.id }));
      setShowNewVendor(false);
      setNewVendorName('');
      setNewVendorCode('');
    } catch (err: any) {
      setError(err.message || 'Failed to create vendor');
    } finally {
      setCreatingVendor(false);
    }
  };

  // === Submit with pre-validation ===
  const handlePreSubmit = (e: React.FormEvent, saveAsDraft = true) => {
    e.preventDefault();
    setError(null);

    if (!formData.pharmacyId) { setError('Please select a pharmacy'); return; }
    if (!formData.vendorId) { setError('Please select a vendor'); return; }
    if (!formData.invoiceTypeId) { setError('Please select an invoice type'); return; }
    if (!formData.invoiceNumber) { setError('Please enter an invoice number'); return; }
    if (!formData.amount || parseFloat(formData.amount) <= 0) { setError('Please enter a valid amount'); return; }

    const warns = validateBeforeSubmit();
    if (warns.length > 0) {
      setSubmitWarnings(warns);
      setPendingSubmitDraft(saveAsDraft);
      setShowSubmitConfirm(true);
      return;
    }

    doSubmit(saveAsDraft);
  };

  const doSubmit = async (saveAsDraft = true) => {
    setShowSubmitConfirm(false);
    setSubmitting(true);
    setError(null);

    try {
      let notes = formData.notes || '';
      if (dueUponReceipt && !notes.includes('Due upon Receipt')) {
        notes = notes ? `${notes}\nDue upon Receipt` : 'Due upon Receipt';
      }

      let invoice: any;

      if (tempFileData) {
        // Create from uploaded file
        const res = await apiFetch('/extraction/create-from-temp', {
          method: 'POST',
          body: JSON.stringify({
            pharmacyId: formData.pharmacyId,
            tempFilePath: tempFileData.tempFilePath,
            originalName: tempFileData.originalName,
            mimeType: tempFileData.mimeType,
            sizeBytes: tempFileData.sizeBytes,
            vendorId: formData.vendorId || undefined,
            invoiceTypeId: formData.invoiceTypeId || undefined,
            invoiceNumber: formData.invoiceNumber || undefined,
            accountNumber: formData.accountNumber || undefined,
            invoiceDate: formData.invoiceDate || undefined,
            dueDate: dueUponReceipt ? formData.invoiceDate : (formData.dueDate || undefined),
            amount: formData.amount ? parseFloat(formData.amount) : undefined,
            currency: formData.currency,
            notes: notes || undefined,
            submit: !saveAsDraft,
          }),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || 'Failed to create invoice');
        }
        invoice = await res.json();
      } else {
        // Manual creation (no file)
        const createRes = await apiFetch('/invoices', {
          method: 'POST',
          body: JSON.stringify({
            pharmacyId: formData.pharmacyId,
            vendorId: formData.vendorId,
            invoiceTypeId: formData.invoiceTypeId,
            invoiceNumber: formData.invoiceNumber,
            invoiceDate: formData.invoiceDate,
            dueDate: dueUponReceipt ? formData.invoiceDate : (formData.dueDate || formData.invoiceDate),
            amount: parseFloat(formData.amount),
            description: formData.description || undefined,
            notes: notes || undefined,
          }),
        });
        if (!createRes.ok) {
          const errorData = await createRes.json();
          throw new Error(errorData.message || 'Failed to create invoice');
        }
        invoice = await createRes.json();

        // Submit if not saving as draft
        if (!saveAsDraft) {
          const submitRes = await apiFetch(`/invoices/${invoice.id}/submit`, {
            method: 'POST',
            body: JSON.stringify({}),
          });
          if (!submitRes.ok) throw new Error('Invoice created but failed to submit');
        }
      }

      // Link to requirement instance if applicable
      if (instance && invoice) {
        const linkRes = await apiFetch(`/v1/requirements/instances/${instance.id}/link`, {
          method: 'POST',
          body: JSON.stringify({ invoiceId: invoice.id }),
        });
        if (!linkRes.ok) console.warn('Failed to link invoice to requirement');
      }

      router.push(`/dashboard/pharmacy/invoices?pharmacyId=${formData.pharmacyId}`);
    } catch (e: any) {
      setError(e.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  // Confidence helpers
  const getConfidenceColor = (score: number | undefined) => {
    if (score === undefined) return 'text-gray-400';
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };
  const getConfidenceLabel = (score: number | undefined) => {
    if (score === undefined) return '';
    return `${Math.round(score * 100)}%`;
  };

  // Validate invoice against requirement before submit
  const validateBeforeSubmit = (): SubmitWarning[] => {
    const warns: SubmitWarning[] = [];

    // Date checks
    if (formData.invoiceDate) {
      const invDate = new Date(formData.invoiceDate);
      const now = new Date();
      const diffMonths = (now.getFullYear() - invDate.getFullYear()) * 12 + (now.getMonth() - invDate.getMonth());
      if (Math.abs(invDate.getFullYear() - now.getFullYear()) >= 2) {
        warns.push({ severity: 'error', message: `Invoice date year is ${invDate.getFullYear()} but current year is ${now.getFullYear()}. This is likely incorrect.` });
      } else if (diffMonths > 6) {
        warns.push({ severity: 'warning', message: `Invoice date is ${diffMonths} months in the past. Please verify.` });
      } else if (diffMonths < -3) {
        warns.push({ severity: 'warning', message: `Invoice date is ${Math.abs(diffMonths)} months in the future. Please verify.` });
      }
    }
    if (formData.dueDate && !dueUponReceipt) {
      const dueDate = new Date(formData.dueDate);
      const now = new Date();
      if (dueDate < now) {
        const daysPast = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysPast > 30) {
          warns.push({ severity: 'warning', message: `Due date is ${daysPast} days past due. This invoice may already be overdue.` });
        }
      }
    }

    // Requirement-specific checks
    if (instance) {
      // Vendor mismatch
      if (instance.requirement.vendor && formData.vendorId && formData.vendorId !== instance.requirement.vendor.id) {
        const selectedVendor = vendors.find(v => v.id === formData.vendorId);
        warns.push({
          severity: 'warning',
          message: `Vendor mismatch: Requirement expects "${instance.requirement.vendor.name}" but you selected "${selectedVendor?.name || 'different vendor'}".`,
        });
      }

      // Invoice type mismatch
      if (instance.requirement.invoiceType && formData.invoiceTypeId && formData.invoiceTypeId !== instance.requirement.invoiceType.id) {
        const selectedType = invoiceTypes.find(t => t.id === formData.invoiceTypeId);
        warns.push({
          severity: 'warning',
          message: `Invoice type mismatch: Requirement expects "${instance.requirement.invoiceType.name}" but you selected "${selectedType?.name || 'different type'}".`,
        });
      }

      // Date outside requirement period
      if (formData.invoiceDate && instance.periodStart && instance.periodEnd) {
        const invDate = new Date(formData.invoiceDate);
        const periodStart = new Date(instance.periodStart);
        const periodEnd = new Date(instance.periodEnd);
        if (invDate < periodStart || invDate > periodEnd) {
          warns.push({
            severity: 'warning',
            message: `Invoice date ${formData.invoiceDate} is outside the requirement period (${instance.periodLabel}). This invoice may belong to a different period.`,
          });
        }
      }

      // Submission deadline passed
      if (instance.submissionDeadline) {
        const deadline = new Date(instance.submissionDeadline);
        if (new Date() > deadline) {
          warns.push({
            severity: 'warning',
            message: `Submission deadline for ${instance.periodLabel} was ${deadline.toLocaleDateString()}. This is a late submission.`,
          });
        }
      }
    }

    // General checks - missing due date
    if (!formData.dueDate && !dueUponReceipt) {
      warns.push({ severity: 'warning', message: 'No due date set. Invoice may not trigger payment on time.' });
    }

    // Low confidence warnings from extraction
    if (confidence) {
      const lowFields: string[] = [];
      if (confidence.amount < 0.7) lowFields.push('amount');
      if (confidence.invoiceDate < 0.7) lowFields.push('invoice date');
      if (confidence.vendorName < 0.7) lowFields.push('vendor');
      if (lowFields.length > 0) {
        warns.push({ severity: 'warning', message: `AI had low confidence on: ${lowFields.join(', ')}. Please double-check these values.` });
      }
    }

    return warns;
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

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">New Invoice</h1>
        <Link href={`/dashboard/pharmacy/invoices?pharmacyId=${formData.pharmacyId}`} className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 shadow-sm">
          Back to Invoices
        </Link>
      </div>

      {/* Requirement Instance Info Box */}
      {instance && (
        <div className="card p-4 mb-4 bg-blue-50 border-blue-200">
          <h2 className="font-semibold text-gray-900 mb-2">Submitting Invoice For:</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-500 uppercase">Requirement</div>
              <div className="font-medium">{instance.requirement.name}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">Period</div>
              <div className="font-medium">{instance.periodLabel}</div>
            </div>
            {instance.requirement.vendor && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Expected Vendor</div>
                <div className="font-medium">{instance.requirement.vendor.name}</div>
              </div>
            )}
            <div>
              <div className="text-xs text-gray-500 uppercase">Due By</div>
              <div className="font-medium text-orange-600">
                {new Date(instance.submissionDeadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* File Upload Section (optional) */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900">Upload Document</h2>
          <span className="text-xs text-gray-400">Optional &mdash; AI will auto-fill the form below</span>
        </div>

        {!tempFileData ? (
          <>
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-left">
                    <p className="font-medium text-gray-900 text-sm">{file.name}</p>
                    <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button onClick={() => setFile(null)} className="text-xs text-red-600 hover:text-red-800 ml-2">Remove</button>
                  <button
                    onClick={handleUploadAndParse}
                    disabled={uploading || !formData.pharmacyId}
                    className="ml-3 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {uploading ? (
                      <>
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Parsing...
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Parse with AI
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center py-1">
                  <svg className="w-6 h-6 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-gray-600 text-xs">
                    Drag and drop your invoice here, or{' '}
                    <label className="text-blue-600 hover:text-blue-800 cursor-pointer font-medium">
                      browse
                      <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx" onChange={handleFileChange} />
                    </label>
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">PDF, images, or Word documents (max 10MB)</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-800">Document parsed successfully</p>
              <p className="text-xs text-green-600 truncate">{tempFileData.originalName}</p>
            </div>
            <button onClick={removeFile} className="text-xs text-green-700 hover:text-green-900 font-medium">Remove</button>
          </div>
        )}
      </div>

      {/* Extraction Warnings */}
      {extractionWarnings.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mb-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            AI Observations ({extractionWarnings.length})
          </h3>
          {extractionWarnings.map((w, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                w.severity === 'error' ? 'bg-red-50 border border-red-200 text-red-800' :
                w.severity === 'warning' ? 'bg-amber-50 border border-amber-200 text-amber-800' :
                'bg-blue-50 border border-blue-200 text-blue-800'
              }`}
            >
              <svg className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                w.severity === 'error' ? 'text-red-500' :
                w.severity === 'warning' ? 'text-amber-500' :
                'text-blue-500'
              }`} fill="currentColor" viewBox="0 0 20 20">
                {w.severity === 'error' ? (
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                ) : w.severity === 'warning' ? (
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                )}
              </svg>
              <div>
                <span className="font-medium">{w.message}</span>
                {w.field && <span className="ml-1 text-[10px] opacity-60">({w.field})</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invoice Form */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          {tempFileData ? 'Review & Edit Details' : 'Invoice Details'}
          {extractedData && <span className="ml-2 text-xs font-normal text-green-600">AI extracted</span>}
        </h2>

        <form onSubmit={(e) => handlePreSubmit(e, true)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Pharmacy Selection */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pharmacy <span className="text-red-500">*</span>
              </label>
              <select
                name="pharmacyId"
                value={formData.pharmacyId}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select a pharmacy</option>
                {pharmacies.map(p => (
                  <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                ))}
              </select>
            </div>

            {/* Vendor Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vendor <span className="text-red-500">*</span>
                {confidence?.vendorName !== undefined && (
                  <span className={`ml-2 text-xs ${getConfidenceColor(confidence.vendorName)}`}>
                    ({getConfidenceLabel(confidence.vendorName)} confidence)
                  </span>
                )}
              </label>
              {extractedData?.vendorName && !formData.vendorId && (
                <p className="text-xs text-amber-600 mb-1">Detected: &ldquo;{extractedData.vendorName}&rdquo; (not in system)</p>
              )}
              <select
                name="vendorId"
                value={formData.vendorId}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setShowNewVendor(true);
                  } else {
                    handleChange(e);
                    setShowNewVendor(false);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select a vendor</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
                ))}
                <option value="__new__">+ Create New Vendor</option>
              </select>

              {showNewVendor && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 mb-2">Create New Vendor</p>
                  <div className="space-y-2">
                    <input type="text" value={newVendorName} onChange={e => setNewVendorName(e.target.value)} placeholder="Vendor Name" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                    <input type="text" value={newVendorCode} onChange={e => setNewVendorCode(e.target.value.toUpperCase())} placeholder="Vendor Code (e.g., ACME)" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                    <div className="flex gap-2">
                      <button type="button" onClick={handleCreateVendor} disabled={creatingVendor} className="flex-1 py-2 px-3 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {creatingVendor ? 'Creating...' : 'Create Vendor'}
                      </button>
                      <button type="button" onClick={() => setShowNewVendor(false)} className="py-2 px-3 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Invoice Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Type <span className="text-red-500">*</span>
              </label>
              <select
                name="invoiceTypeId"
                value={formData.invoiceTypeId}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select invoice type</option>
                {invoiceTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Document Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
              <select name="documentType" value={formData.documentType} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="INVOICE">Invoice</option>
                <option value="STATEMENT">Statement</option>
                <option value="CREDIT_MEMO">Credit Memo</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Account Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Number <span className="ml-1 text-xs text-gray-400">(optional)</span>
              </label>
              <input type="text" name="accountNumber" value={formData.accountNumber} onChange={handleChange} placeholder="e.g., 123456789" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>

            {/* Invoice Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Number <span className="text-red-500">*</span>
                {confidence?.invoiceNumber !== undefined && (
                  <span className={`ml-2 text-xs ${getConfidenceColor(confidence.invoiceNumber)}`}>
                    ({getConfidenceLabel(confidence.invoiceNumber)} confidence)
                  </span>
                )}
              </label>
              <input type="text" name="invoiceNumber" value={formData.invoiceNumber} onChange={handleChange} placeholder="e.g., INV-2024-001" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount <span className="text-red-500">*</span>
                {confidence?.amount !== undefined && (
                  <span className={`ml-2 text-xs ${getConfidenceColor(confidence.amount)}`}>
                    ({getConfidenceLabel(confidence.amount)} confidence)
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                <input type="number" name="amount" value={formData.amount} onChange={handleChange} placeholder="0.00" step="0.01" min="0.01" className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
              </div>
            </div>

            {/* Invoice Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Date <span className="text-red-500">*</span>
                {confidence?.invoiceDate !== undefined && (
                  <span className={`ml-2 text-xs ${getConfidenceColor(confidence.invoiceDate)}`}>
                    ({getConfidenceLabel(confidence.invoiceDate)} confidence)
                  </span>
                )}
              </label>
              <input type="date" name="invoiceDate" value={formData.invoiceDate} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
              {getDateWarning(formData.invoiceDate, 'Invoice date') && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  {getDateWarning(formData.invoiceDate, 'Invoice date')}
                </p>
              )}
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
                {confidence?.dueDate !== undefined && (
                  <span className={`ml-2 text-xs ${getConfidenceColor(confidence.dueDate)}`}>
                    ({getConfidenceLabel(confidence.dueDate)} confidence)
                  </span>
                )}
              </label>
              {!dueUponReceipt && (
                <>
                  <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  {getDateWarning(formData.dueDate, 'Due date') && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                      {getDateWarning(formData.dueDate, 'Due date')}
                    </p>
                  )}
                  {formData.vendorId && vendors.find(v => v.id === formData.vendorId)?.paymentTerms && (
                    <p className="text-xs text-gray-500 mt-1">Auto-calculated from: {vendors.find(v => v.id === formData.vendorId)?.paymentTerms}</p>
                  )}
                </>
              )}
              {dueUponReceipt && (
                <p className="text-sm text-amber-600 italic py-2">Payment due immediately upon receipt</p>
              )}
              <div className="flex items-center mt-2">
                <input
                  type="checkbox"
                  id="dueUponReceipt"
                  checked={dueUponReceipt}
                  onChange={(e) => {
                    setDueUponReceipt(e.target.checked);
                    if (e.target.checked) setFormData(prev => ({ ...prev, dueDate: '' }));
                  }}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="dueUponReceipt" className="ml-2 text-sm text-gray-600">Due upon Receipt</label>
              </div>
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input type="text" name="description" value={formData.description} onChange={handleChange} placeholder="Brief description of the invoice" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} placeholder="Any additional notes (payment terms, remit-to address, etc.)" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={(e) => handlePreSubmit(e as any, false)}
              disabled={submitting}
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Save & Submit for Approval'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving...' : 'Save as Draft'}
            </button>
            <Link
              href={`/dashboard/pharmacy/invoices?pharmacyId=${formData.pharmacyId}`}
              className="py-2 px-4 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 text-center"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>

      {/* Submit Confirmation Dialog */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Review Before {pendingSubmitDraft ? 'Saving' : 'Submitting'}
              </h3>
            </div>
            <div className="px-5 py-4 max-h-60 overflow-y-auto space-y-2">
              {submitWarnings.map((w, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                    w.severity === 'error' ? 'bg-red-50 border border-red-200 text-red-800' :
                    'bg-amber-50 border border-amber-200 text-amber-800'
                  }`}
                >
                  <svg className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                    w.severity === 'error' ? 'text-red-500' : 'text-amber-500'
                  }`} fill="currentColor" viewBox="0 0 20 20">
                    {w.severity === 'error' ? (
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    )}
                  </svg>
                  <span>{w.message}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Go Back & Fix
              </button>
              <button
                onClick={() => doSubmit(pendingSubmitDraft)}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                  pendingSubmitDraft ? 'bg-gray-600 hover:bg-gray-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {pendingSubmitDraft ? 'Save Anyway' : 'Submit Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
