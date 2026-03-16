'use client';

import { useAuth } from '../../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../../lib/api';

type NotificationPreference = {
  id: string;
  orgId: string;
  notificationType: string;
  enabled: boolean;
  channels: string[];
  config: Record<string, any> | null;
  recipientRoles: string[];
  description: string | null;
  implemented: boolean;
};

const GROUPS: { label: string; types: string[] }[] = [
  {
    label: 'SLA Notifications',
    types: [
      'SLA_SUBMISSION_REMINDER',
      'SLA_PROCESSING_REMINDER',
      'SLA_SUBMISSION_VIOLATION',
      'SLA_PROCESSING_VIOLATION',
    ],
  },
  {
    label: 'Invoice Notifications',
    types: [
      'INVOICE_SUBMITTED',
      'INVOICE_APPROVED',
      'INVOICE_REJECTED',
      'INVOICE_OVERDUE',
    ],
  },
  {
    label: 'System Notifications',
    types: [
      'AI_EXTRACTION_FAILED',
      'USER_REGISTERED',
      'PHARMACY_DEACTIVATED',
    ],
  },
];

const TYPE_LABELS: Record<string, string> = {
  SLA_SUBMISSION_REMINDER: 'Submission Reminder',
  SLA_PROCESSING_REMINDER: 'Processing Reminder',
  SLA_SUBMISSION_VIOLATION: 'Submission Violation',
  SLA_PROCESSING_VIOLATION: 'Processing Violation',
  INVOICE_SUBMITTED: 'Invoice Submitted',
  INVOICE_APPROVED: 'Invoice Approved',
  INVOICE_REJECTED: 'Invoice Rejected',
  INVOICE_OVERDUE: 'Invoice Overdue',
  AI_EXTRACTION_FAILED: 'AI Extraction Failed',
  USER_REGISTERED: 'User Registered',
  PHARMACY_DEACTIVATED: 'Pharmacy Deactivated',
};

const AVAILABLE_CHANNELS = ['in_app', 'email', 'webhook'] as const;
const CHANNEL_LABELS: Record<string, string> = {
  in_app: 'In-App',
  email: 'Email',
  webhook: 'Webhook',
};

const AVAILABLE_ROLES = ['ADMIN', 'COMPANY_MANAGER', 'PHARMACY_ADMIN', 'PHARMACY_USER'] as const;
const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  COMPANY_MANAGER: 'Manager',
  PHARMACY_ADMIN: 'Pharmacy Admin',
  PHARMACY_USER: 'Pharmacy User',
};

export default function NotificationSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && user.role !== 'ADMIN' && user.role !== 'COMPANY_MANAGER') router.push('/dashboard');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || (user.role !== 'ADMIN' && user.role !== 'COMPANY_MANAGER')) return;
    fetchPrefs();
  }, [user]);

  async function fetchPrefs() {
    try {
      const res = await apiFetch('/v1/admin/notification-preferences');
      if (res.ok) {
        const data = await res.json();
        setPrefs(Array.isArray(data) ? data : []);
      } else {
        const errBody = await res.text();
        console.error('Notification prefs API error:', res.status, errBody);
        setError(`Failed to load preferences (${res.status})`);
      }
    } catch (e) {
      console.error('Notification prefs fetch error:', e);
      setError('Failed to load notification preferences');
    } finally {
      setLoadingData(false);
    }
  }

  async function updatePref(notificationType: string, updates: Partial<Pick<NotificationPreference, 'enabled' | 'channels' | 'config' | 'recipientRoles'>>) {
    setSaving(notificationType);
    setError(null);
    try {
      const res = await apiFetch(`/v1/admin/notification-preferences/${notificationType}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setPrefs((prev) => prev.map((p) => (p.notificationType === notificationType ? { ...p, ...updated } : p)));
        setSuccess('Saved');
        setTimeout(() => setSuccess(null), 2000);
      } else {
        setError('Failed to save');
      }
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(null);
    }
  }

  function toggleEnabled(pref: NotificationPreference) {
    updatePref(pref.notificationType, { enabled: !pref.enabled });
  }

  function toggleChannel(pref: NotificationPreference, channel: string) {
    if (channel === 'in_app') return; // Cannot disable in_app
    const current = pref.channels || ['in_app'];
    const updated = current.includes(channel)
      ? current.filter((c) => c !== channel)
      : [...current, channel];
    updatePref(pref.notificationType, { channels: updated });
  }

  function toggleRole(pref: NotificationPreference, role: string) {
    const current = pref.recipientRoles || ['ADMIN'];
    const updated = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role];
    if (updated.length === 0) return; // Must have at least one role
    updatePref(pref.notificationType, { recipientRoles: updated });
  }

  function updateConfig(pref: NotificationPreference, key: string, value: number) {
    const config = { ...(pref.config || {}), [key]: value };
    updatePref(pref.notificationType, { config });
  }

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

  if (!user || (user.role !== 'ADMIN' && user.role !== 'COMPANY_MANAGER')) return null;

  const prefsByType = Object.fromEntries(prefs.map((p) => [p.notificationType, p]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-heading font-bold text-gray-900">Notification Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure which notifications are sent, when, and to whom.</p>
        </div>
        {success && (
          <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">{success}</span>
        )}
        {error && (
          <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded">{error}</span>
        )}
      </div>

      {GROUPS.map((group) => (
        <div key={group.label}>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{group.label}</h2>
          <div className="space-y-2">
            {group.types.map((type) => {
              const pref = prefsByType[type];
              if (!pref) return null;
              const isSaving = saving === type;

              return (
                <div
                  key={type}
                  className={`card p-4 transition-opacity ${!pref.enabled ? 'opacity-60' : ''} ${isSaving ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">{TYPE_LABELS[type] || type}</h3>
                        {!pref.implemented && (
                          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Coming soon</span>
                        )}
                      </div>
                      {pref.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{pref.description}</p>
                      )}
                    </div>

                    {/* Right: Toggle */}
                    <button
                      onClick={() => toggleEnabled(pref)}
                      disabled={isSaving}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        pref.enabled ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          pref.enabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Settings row — only show when enabled */}
                  {pref.enabled && (
                    <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Channels */}
                      <div>
                        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Channels</label>
                        <div className="flex flex-wrap gap-1.5">
                          {AVAILABLE_CHANNELS.map((ch) => {
                            const active = (pref.channels || []).includes(ch);
                            const isInApp = ch === 'in_app';
                            return (
                              <button
                                key={ch}
                                onClick={() => toggleChannel(pref, ch)}
                                disabled={isInApp || isSaving}
                                className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                                  active
                                    ? 'bg-primary-50 border-primary-200 text-primary-700'
                                    : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                                } ${isInApp ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                {CHANNEL_LABELS[ch]}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Recipients */}
                      <div>
                        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Recipients</label>
                        <div className="flex flex-wrap gap-1.5">
                          {AVAILABLE_ROLES.map((role) => {
                            const active = (pref.recipientRoles || []).includes(role);
                            return (
                              <button
                                key={role}
                                onClick={() => toggleRole(pref, role)}
                                disabled={isSaving}
                                className={`text-xs px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-primary-50 border-primary-200 text-primary-700'
                                    : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                                }`}
                              >
                                {ROLE_LABELS[role]}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Config (timing) */}
                      <div>
                        {(type === 'SLA_SUBMISSION_REMINDER' || type === 'SLA_PROCESSING_REMINDER') && (
                          <div>
                            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Days Before Deadline</label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={pref.config?.reminderDaysBefore ?? 2}
                              onChange={(e) => updateConfig(pref, 'reminderDaysBefore', parseInt(e.target.value) || 2)}
                              disabled={isSaving}
                              className="w-20 text-sm border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                          </div>
                        )}
                        {type === 'INVOICE_OVERDUE' && (
                          <div>
                            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Days After Due Date</label>
                            <input
                              type="number"
                              min={1}
                              max={30}
                              value={pref.config?.daysAfterDue ?? 1}
                              onChange={(e) => updateConfig(pref, 'daysAfterDue', parseInt(e.target.value) || 1)}
                              disabled={isSaving}
                              className="w-20 text-sm border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
