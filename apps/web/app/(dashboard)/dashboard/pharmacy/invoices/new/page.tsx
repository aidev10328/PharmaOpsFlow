'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../../lib/api';
import Link from 'next/link';

type Pharmacy = {
  id: string;
  name: string;
  code: string;
};

type Vendor = {
  id: string;
  name: string;
  code: string;
  paymentTerms?: string;
};

type InvoiceType = {
  id: string;
  name: string;
  description?: string;
};

type DocumentType = 'INVOICE' | 'STATEMENT' | 'CREDIT_MEMO' | 'OTHER';

type RequirementInstance = {
  id: string;
  requirement: {
    id: string;
    name: string;
    pharmacy: { id: string; name: string; code: string };
    vendor: { id: string; name: string } | null;
    invoiceType: { id: string; name: string } | null;
  };
  periodLabel: string;
  submissionDeadline: string;
  status: string;
};

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
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Fetch pharmacies, vendors, invoice types, and instance (if applicable)
  useEffect(() => {
    async function fetchData() {
      try {
        const promises: Promise<Response>[] = [
          apiFetch('/pharmacies'),
          apiFetch('/invoices/vendors'),
          apiFetch('/invoices/types'),
        ];

        // Fetch instance if instanceId is present
        if (instanceId) {
          promises.push(apiFetch(`/v1/requirements/instances/${instanceId}`));
        }

        const results = await Promise.all(promises);
        const [pharmaciesRes, vendorsRes, typesRes] = results;

        if (pharmaciesRes.ok) {
          const data = await pharmaciesRes.json();
          setPharmacies(data);
          // Set initial pharmacy from query param or first pharmacy
          const initialPharmacy = searchParams.get('pharmacyId') || (data.length > 0 ? data[0].id : '');
          setFormData(prev => ({ ...prev, pharmacyId: initialPharmacy }));
        }

        if (vendorsRes.ok) {
          const data = await vendorsRes.json();
          setVendors(data);
        }

        if (typesRes.ok) {
          const data = await typesRes.json();
          setInvoiceTypes(data);
        }

        // Handle instance data
        if (instanceId && results[3]) {
          const instanceRes = results[3];
          if (instanceRes.ok) {
            const instanceData = await instanceRes.json();
            setInstance(instanceData);
            // Pre-fill vendor and invoice type from requirement
            setFormData(prev => ({
              ...prev,
              vendorId: instanceData.requirement.vendor?.id || prev.vendorId,
              invoiceTypeId: instanceData.requirement.invoiceType?.id || prev.invoiceTypeId,
            }));
          }
        }
      } catch (e) {
        console.error('Failed to fetch data:', e);
        setError('Failed to load form data');
      } finally {
        setLoadingData(false);
      }
    }

    if (user) {
      fetchData();
    }
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

  // Create new vendor
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
        body: JSON.stringify({
          name: newVendorName.trim(),
          externalRef: newVendorCode.trim().toUpperCase() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to create vendor');
      }

      const newVendor = await res.json();

      // Add to vendors list and select it
      setVendors([...vendors, newVendor]);
      setFormData({ ...formData, vendorId: newVendor.id });
      setShowNewVendor(false);
      setNewVendorName('');
      setNewVendorCode('');
    } catch (err: any) {
      setError(err.message || 'Failed to create vendor');
    } finally {
      setCreatingVendor(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent, saveAsDraft = true) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Validation
    if (!formData.pharmacyId) {
      setError('Please select a pharmacy');
      setSubmitting(false);
      return;
    }
    if (!formData.vendorId) {
      setError('Please select a vendor');
      setSubmitting(false);
      return;
    }
    if (!formData.invoiceTypeId) {
      setError('Please select an invoice type');
      setSubmitting(false);
      return;
    }
    if (!formData.invoiceNumber) {
      setError('Please enter an invoice number');
      setSubmitting(false);
      return;
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid amount');
      setSubmitting(false);
      return;
    }

    try {
      // Prepare notes with due upon receipt info
      let notes = formData.notes || '';
      if (dueUponReceipt && !notes.includes('Due upon Receipt')) {
        notes = notes ? `${notes}\nDue upon Receipt` : 'Due upon Receipt';
      }

      // Create the invoice
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

      const invoice = await createRes.json();

      // Link to requirement instance if applicable
      if (instance) {
        const linkRes = await apiFetch(`/v1/requirements/instances/${instance.id}/link`, {
          method: 'POST',
          body: JSON.stringify({ invoiceId: invoice.id }),
        });
        if (!linkRes.ok) {
          console.warn('Failed to link invoice to requirement, but invoice was created');
        }
      }

      // If not saving as draft, submit it
      if (!saveAsDraft) {
        const submitRes = await apiFetch(`/invoices/${invoice.id}/submit`, {
          method: 'POST',
          body: JSON.stringify({}),
        });

        if (!submitRes.ok) {
          throw new Error('Invoice created but failed to submit');
        }
      }

      // Redirect to invoice list
      router.push(`/dashboard/pharmacy/invoices?pharmacyId=${formData.pharmacyId}`);
    } catch (e: any) {
      setError(e.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
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

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <Link
          href={`/dashboard/pharmacy/invoices?pharmacyId=${formData.pharmacyId}`}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          ← Back to Invoices
        </Link>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-4">Create New Invoice</h1>

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
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4">
        <form onSubmit={(e) => handleSubmit(e, true)}>
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
                {pharmacies.map((pharmacy) => (
                  <option key={pharmacy.id} value={pharmacy.id}>
                    {pharmacy.code} - {pharmacy.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Vendor Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vendor <span className="text-red-500">*</span>
              </label>
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
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name} ({vendor.code})
                  </option>
                ))}
                <option value="__new__">+ Create New Vendor</option>
              </select>

              {/* New Vendor Form */}
              {showNewVendor && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 mb-2">Create New Vendor</p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newVendorName}
                      onChange={(e) => setNewVendorName(e.target.value)}
                      placeholder="Vendor Name"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={newVendorCode}
                      onChange={(e) => setNewVendorCode(e.target.value.toUpperCase())}
                      placeholder="Vendor Code (e.g., ACME)"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCreateVendor}
                        disabled={creatingVendor}
                        className="flex-1 py-2 px-3 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {creatingVendor ? 'Creating...' : 'Create Vendor'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewVendor(false)}
                        className="py-2 px-3 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
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
                {invoiceTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Document Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document Type
              </label>
              <select
                name="documentType"
                value={formData.documentType}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="INVOICE">Invoice</option>
                <option value="STATEMENT">Statement</option>
                <option value="CREDIT_MEMO">Credit Memo</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Account Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Number
                <span className="ml-1 text-xs text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                name="accountNumber"
                value={formData.accountNumber}
                onChange={handleChange}
                placeholder="e.g., 123456789"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Invoice Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={handleChange}
                placeholder="e.g., INV-2024-001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            {/* Invoice Date & Due Date - Same Row */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="invoiceDate"
                value={formData.invoiceDate}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              {!dueUponReceipt && (
                <>
                  <input
                    type="date"
                    name="dueDate"
                    value={formData.dueDate}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {formData.vendorId && vendors.find(v => v.id === formData.vendorId)?.paymentTerms && (
                    <p className="text-xs text-gray-500 mt-1">
                      Auto-calculated from: {vendors.find(v => v.id === formData.vendorId)?.paymentTerms}
                    </p>
                  )}
                </>
              )}
              {dueUponReceipt && (
                <p className="text-sm text-amber-600 italic py-2">Payment due immediately upon receipt</p>
              )}

              {/* Due Upon Receipt Checkbox - Below Due Date */}
              <div className="flex items-center mt-2">
                <input
                  type="checkbox"
                  id="dueUponReceipt"
                  checked={dueUponReceipt}
                  onChange={(e) => {
                    setDueUponReceipt(e.target.checked);
                    if (e.target.checked) {
                      setFormData({ ...formData, dueDate: '' });
                    }
                  }}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="dueUponReceipt" className="ml-2 text-sm text-gray-600">
                  Due upon Receipt
                </label>
              </div>
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Brief description of the invoice"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={2}
                placeholder="Any additional notes (payment terms, remit-to address, etc.)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={(e) => handleSubmit(e, false)}
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
    </div>
  );
}
