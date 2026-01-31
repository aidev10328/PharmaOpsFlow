'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../lib/api';
import Link from 'next/link';

export default function OrgSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    timezone: '',
    submissionDueDay: '',
    processingDueDay: '',
  });

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    async function fetchOrg() {
      try {
        const res = await apiFetch('/v1/admin/org');
        if (res.ok) {
          const org = await res.json();
          setFormData({
            name: org.name || '',
            timezone: org.timezone || 'America/Chicago',
            submissionDueDay: String(org.submissionDueDay ?? 5),
            processingDueDay: String(org.processingDueDay ?? 10),
          });
        }
      } catch (e) {
        setError('Failed to load organization settings');
      } finally {
        setLoadingData(false);
      }
    }
    if (user?.role === 'ADMIN') fetchOrg();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch('/v1/admin/org', {
        method: 'PATCH',
        body: JSON.stringify({
          name: formData.name,
          timezone: formData.timezone,
          submissionDueDay: parseInt(formData.submissionDueDay, 10),
          processingDueDay: parseInt(formData.processingDueDay, 10),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update organization');
      }

      setSuccess('Organization settings updated successfully.');
    } catch (e: any) {
      setError(e.message || 'Failed to update organization');
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

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin" className="text-link text-sm">
          &larr; Back to Admin
        </Link>
      </div>

      <div className="card p-6">
        <h1 className="page-title mb-6">Organization Settings</h1>

        {error && <div className="alert-error mb-6">{error}</div>}
        {success && <div className="alert-success mb-6">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="field-label">Organization Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="field-label">Timezone</label>
            <select name="timezone" value={formData.timezone} onChange={handleChange} className="input-field">
              <option value="America/New_York">Eastern (America/New_York)</option>
              <option value="America/Chicago">Central (America/Chicago)</option>
              <option value="America/Denver">Mountain (America/Denver)</option>
              <option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Submission Due Day</label>
              <input
                type="number"
                name="submissionDueDay"
                value={formData.submissionDueDay}
                onChange={handleChange}
                min="1"
                max="28"
                className="input-field"
                required
              />
              <p className="field-hint">Day of month invoices must be submitted (1-28)</p>
            </div>
            <div>
              <label className="field-label">Processing Due Day</label>
              <input
                type="number"
                name="processingDueDay"
                value={formData.processingDueDay}
                onChange={handleChange}
                min="1"
                max="28"
                className="input-field"
                required
              />
              <p className="field-hint">Day of month invoices must be processed (1-28)</p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
