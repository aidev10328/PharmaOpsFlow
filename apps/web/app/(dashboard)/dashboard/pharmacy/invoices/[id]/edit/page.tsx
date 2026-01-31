'use client';

import { useAuth } from '../../../../../../../components/AuthProvider';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../../../lib/api';
import Link from 'next/link';

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

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  status: string;
  description?: string;
  notes?: string;
  pharmacy: { id: string; name: string; code: string };
  vendor?: { id: string; name: string };
  invoiceType?: { id: string; name: string };
};

export default function EditInvoicePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [invoiceTypes, setInvoiceTypes] = useState<InvoiceType[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    vendorId: '',
    invoiceTypeId: '',
    invoiceNumber: '',
    invoiceDate: '',
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

  useEffect(() => {
    async function fetchData() {
      try {
        const [invoiceRes, vendorsRes, typesRes] = await Promise.all([
          apiFetch(`/invoices/${invoiceId}`),
          apiFetch('/invoices/vendors'),
          apiFetch('/invoices/types'),
        ]);

        if (vendorsRes.ok) {
          setVendors(await vendorsRes.json());
        }
        if (typesRes.ok) {
          setInvoiceTypes(await typesRes.json());
        }

        if (invoiceRes.ok) {
          const data: Invoice = await invoiceRes.json();
          setInvoice(data);

          if (!['DRAFT', 'NEEDS_INFO'].includes(data.status)) {
            setError('This invoice cannot be edited in its current status.');
            return;
          }

          setFormData({
            vendorId: data.vendor?.id || '',
            invoiceTypeId: data.invoiceType?.id || '',
            invoiceNumber: data.invoiceNumber || '',
            invoiceDate: data.invoiceDate ? data.invoiceDate.split('T')[0] : '',
            dueDate: data.dueDate ? data.dueDate.split('T')[0] : '',
            amount: data.amount ? String(Number(data.amount)) : '',
            description: data.description || '',
            notes: data.notes || '',
          });
        } else {
          setError('Invoice not found');
        }
      } catch (e) {
        console.error('Failed to fetch data:', e);
        setError('Failed to load invoice data');
      } finally {
        setLoadingData(false);
      }
    }

    if (user && invoiceId) {
      fetchData();
    }
  }, [user, invoiceId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  // Recalculate due date when vendor or invoice date changes
  useEffect(() => {
    if (formData.vendorId && formData.invoiceDate && vendors.length > 0) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

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
      const res = await apiFetch(`/invoices/${invoiceId}`, {
        method: 'PATCH',
        body: JSON.stringify({
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

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to update invoice');
      }

      router.push(`/dashboard/pharmacy/invoices/${invoiceId}`);
    } catch (e: any) {
      setError(e.message || 'Failed to update invoice');
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

  const canEdit = invoice && ['DRAFT', 'NEEDS_INFO'].includes(invoice.status);

  if (!invoice || !canEdit) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="card p-6 text-center">
          <p className="text-red-600">{error || 'This invoice cannot be edited.'}</p>
          <Link href={`/dashboard/pharmacy/invoices/${invoiceId}`} className="btn-primary mt-4 inline-block">
            Back to Invoice
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/dashboard/pharmacy/invoices/${invoiceId}`}
          className="text-primary hover:text-primary-dark text-sm"
        >
          &larr; Back to Invoice
        </Link>
      </div>

      <div className="card p-6">
        <h1 className="page-title mb-6">Edit Invoice</h1>

        {/* Read-only pharmacy info */}
        <div className="mb-6 p-3 bg-gray-50 rounded-lg">
          <span className="text-sm text-gray-500">Pharmacy</span>
          <p className="font-medium">{invoice.pharmacy.code} - {invoice.pharmacy.name}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
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
              href={`/dashboard/pharmacy/invoices/${invoiceId}`}
              className="btn-secondary"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
