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

  const [formData, setFormData] = useState({
    pharmacyId: '',
    vendorId: '',
    invoiceTypeId: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    amount: '',
    description: '',
    notes: '',
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Fetch pharmacies, vendors, and invoice types
  useEffect(() => {
    async function fetchData() {
      try {
        const [pharmaciesRes, vendorsRes, typesRes] = await Promise.all([
          apiFetch('/pharmacies'),
          apiFetch('/invoices/vendors'),
          apiFetch('/invoices/types'),
        ]);

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
  }, [user, searchParams]);

  // Calculate due date based on vendor payment terms
  useEffect(() => {
    if (formData.vendorId && formData.invoiceDate) {
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
  }, [formData.vendorId, formData.invoiceDate, vendors]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
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
      // Create the invoice
      const createRes = await apiFetch('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          pharmacyId: formData.pharmacyId,
          vendorId: formData.vendorId,
          invoiceTypeId: formData.invoiceTypeId,
          invoiceNumber: formData.invoiceNumber,
          invoiceDate: formData.invoiceDate,
          dueDate: formData.dueDate || formData.invoiceDate,
          amount: parseFloat(formData.amount),
          description: formData.description || undefined,
          notes: formData.notes || undefined,
        }),
      });

      if (!createRes.ok) {
        const errorData = await createRes.json();
        throw new Error(errorData.message || 'Failed to create invoice');
      }

      const invoice = await createRes.json();

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
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/dashboard/pharmacy/invoices?pharmacyId=${formData.pharmacyId}`}
          className="text-primary hover:text-primary-dark text-sm"
        >
          &larr; Back to Invoices
        </Link>
      </div>

      <div className="card p-6">
        <h1 className="page-title mb-6">New Invoice</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={(e) => handleSubmit(e, true)} className="space-y-6">
          {/* Pharmacy Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pharmacy <span className="text-red-500">*</span>
            </label>
            <select
              name="pharmacyId"
              value={formData.pharmacyId}
              onChange={handleChange}
              className="input-field"
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
              onChange={handleChange}
              className="input-field"
              required
            >
              <option value="">Select a vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.code} - {vendor.name} {vendor.paymentTerms && `(${vendor.paymentTerms})`}
                </option>
              ))}
            </select>
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
              className="input-field"
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
              className="input-field"
              required
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="invoiceDate"
                value={formData.invoiceDate}
                onChange={handleChange}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="dueDate"
                value={formData.dueDate}
                onChange={handleChange}
                className="input-field"
                required
              />
              {formData.vendorId && vendors.find(v => v.id === formData.vendorId)?.paymentTerms && (
                <p className="text-xs text-gray-500 mt-1">
                  Auto-calculated from vendor payment terms: {vendors.find(v => v.id === formData.vendorId)?.paymentTerms}
                </p>
              )}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (USD) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              min="0.01"
              className="input-field"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <input
              type="text"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Brief description of the invoice"
              className="input-field"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Internal Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Internal notes (not visible to vendors)"
              className="input-field"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 pt-4 border-t">
            <Link
              href={`/dashboard/pharmacy/invoices?pharmacyId=${formData.pharmacyId}`}
              className="btn-secondary"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="btn-secondary"
            >
              {submitting ? 'Saving...' : 'Save as Draft'}
            </button>
            <button
              type="button"
              onClick={(e) => handleSubmit(e, false)}
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? 'Submitting...' : 'Save & Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
