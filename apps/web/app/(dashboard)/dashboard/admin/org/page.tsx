'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../lib/api';

type OrgData = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  timezone: string;
  createdAt: string;
};

const timezoneLabels: Record<string, string> = {
  'America/New_York': 'Eastern Time (ET)',
  'America/Chicago': 'Central Time (CT)',
  'America/Denver': 'Mountain Time (MT)',
  'America/Los_Angeles': 'Pacific Time (PT)',
};

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

export default function OrgProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', website: '',
    street: '', city: '', state: '', zip: '', timezone: '',
  });
  const [stats, setStats] = useState({ pharmacies: 0, users: 0 });

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;

    async function fetchOrg() {
      try {
        const [orgRes, pharmaciesRes, usersRes] = await Promise.all([
          apiFetch('/v1/admin/org'),
          apiFetch('/v1/admin/pharmacies').catch(() => null),
          apiFetch('/v1/admin/users').catch(() => null),
        ]);

        if (orgRes.ok) {
          const org = await orgRes.json();
          setOrgData(org);
          setFormData({
            name: org.name || '',
            phone: org.phone || '',
            email: org.email || '',
            website: org.website || '',
            street: org.street || '',
            city: org.city || '',
            state: org.state || '',
            zip: org.zip || '',
            timezone: org.timezone || 'America/Chicago',
          });
        }

        const pharmacies = pharmaciesRes?.ok ? await pharmaciesRes.json() : [];
        const users = usersRes?.ok ? await usersRes.json() : [];

        setStats({
          pharmacies: Array.isArray(pharmacies) ? pharmacies.length : 0,
          users: Array.isArray(users) ? users.length : 0,
        });
      } catch {
        setError('Failed to load organization data');
      } finally {
        setLoadingData(false);
      }
    }

    fetchOrg();
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
          phone: formData.phone || null,
          email: formData.email || null,
          website: formData.website || null,
          street: formData.street || null,
          city: formData.city || null,
          state: formData.state || null,
          zip: formData.zip || null,
          timezone: formData.timezone,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update organization');
      }

      const updated = await res.json();
      setOrgData(updated);
      setSuccess('Organization profile updated.');
      setEditing(false);
    } catch (e: any) {
      setError(e.message || 'Failed to update organization');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setError(null);
    setSuccess(null);
    if (orgData) {
      setFormData({
        name: orgData.name || '',
        phone: orgData.phone || '',
        email: orgData.email || '',
        website: orgData.website || '',
        street: orgData.street || '',
        city: orgData.city || '',
        state: orgData.state || '',
        zip: orgData.zip || '',
        timezone: orgData.timezone || 'America/Chicago',
      });
    }
  };

  if (loading || loadingData) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-2 text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') return null;

  const address = [orgData?.street, orgData?.city, orgData?.state, orgData?.zip].filter(Boolean).join(', ');
  const createdDate = orgData?.createdAt
    ? new Date(orgData.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div className="space-y-5 max-w-3xl">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">{success}</div>}

      {/* Profile header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-xl font-heading font-bold text-white">
              {(orgData?.name || 'O').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-heading font-bold text-gray-900">{orgData?.name || 'Organization'}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Invoice processing & pharmacy management</p>
              </div>
              {!editing && (
                <button onClick={() => setEditing(true)} className="text-xs font-medium text-primary-600 hover:text-primary-700 px-3 py-1.5 rounded-md border border-primary-200 hover:bg-primary-50 transition-colors flex-shrink-0">
                  Edit
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
              <InfoChip icon="building" text={`${stats.pharmacies} pharmacies`} />
              <InfoChip icon="users" text={`${stats.users} team members`} />
              {orgData?.phone && <InfoChip icon="phone" text={orgData.phone} />}
              {orgData?.email && <InfoChip icon="email" text={orgData.email} />}
              {orgData?.website && <InfoChip icon="link" text={orgData.website} />}
              {createdDate && <InfoChip icon="calendar" text={`Since ${createdDate}`} />}
            </div>
          </div>
        </div>
      </div>

      {/* Details or Edit */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-heading font-semibold text-gray-900">
            {editing ? 'Edit Organization' : 'Company Information'}
          </h3>
        </div>

        <div className="p-5">
          {editing ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Company Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Company Name *</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} className="input-field text-sm" required />
              </div>

              {/* Contact Info */}
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Contact Information</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="input-field text-sm" placeholder="(555) 123-4567" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} className="input-field text-sm" placeholder="info@company.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Website</label>
                    <input type="text" name="website" value={formData.website} onChange={handleChange} className="input-field text-sm" placeholder="https://company.com" />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Address</div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Street</label>
                    <input type="text" name="street" value={formData.street} onChange={handleChange} className="input-field text-sm" placeholder="123 Main Street" />
                  </div>
                  <div className="grid grid-cols-6 gap-3">
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                      <input type="text" name="city" value={formData.city} onChange={handleChange} className="input-field text-sm" placeholder="City" />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                      <select name="state" value={formData.state} onChange={handleChange} className="input-field text-sm">
                        <option value="">--</option>
                        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Zip</label>
                      <input type="text" name="zip" value={formData.zip} onChange={handleChange} className="input-field text-sm" placeholder="12345" maxLength={10} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Timezone */}
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Settings</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Timezone</label>
                    <select name="timezone" value={formData.timezone} onChange={handleChange} className="input-field text-sm">
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                      <option value="America/Denver">Mountain Time (MT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                <button type="button" onClick={handleCancel} className="btn-secondary text-xs px-4 py-2">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary text-xs px-4 py-2">{submitting ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              {/* Company Name */}
              <DetailRow label="Company Name" value={orgData?.name || '-'} />

              {/* Contact */}
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Contact Information</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <DetailRow label="Phone" value={orgData?.phone || '-'} />
                  <DetailRow label="Email" value={orgData?.email || '-'} />
                  <DetailRow label="Website" value={orgData?.website || '-'} link={!!orgData?.website} />
                </div>
              </div>

              {/* Address */}
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Address</div>
                <DetailRow label="Address" value={address || 'Not set'} />
              </div>

              {/* Settings */}
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Settings</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <DetailRow label="Timezone" value={timezoneLabels[orgData?.timezone || ''] || orgData?.timezone || '-'} />
                  <DetailRow label="Organization ID" value={orgData?.id || '-'} mono />
                  <DetailRow label="Created" value={createdDate || '-'} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono, link }: { label: string; value: string; mono?: boolean; link?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{label}</div>
      {link && value !== '-' ? (
        <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-sm mt-0.5 text-primary-600 hover:underline">{value}</a>
      ) : (
        <div className={`text-sm mt-0.5 ${mono ? 'font-mono text-gray-500 text-xs' : 'font-medium text-gray-900'}`}>{value}</div>
      )}
    </div>
  );
}

function InfoChip({ icon, text }: { icon: string; text: string }) {
  const icons: Record<string, React.ReactNode> = {
    building: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />,
    users: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
    phone: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />,
    email: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />,
    link: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />,
    calendar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
  };

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icons[icon]}</svg>
      <span>{text}</span>
    </div>
  );
}
