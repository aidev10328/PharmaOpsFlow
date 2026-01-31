'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../../lib/api';
import Link from 'next/link';

export default function OversightHubPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!loading && user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      Promise.all([
        apiFetch('/v1/admin/oversight/invoices?limit=1').then(r => r.ok ? r.json() : null),
        apiFetch('/v1/admin/oversight/sla/summary').then(r => r.ok ? r.json() : null),
        apiFetch('/v1/admin/oversight/automation').then(r => r.ok ? r.json() : null),
        apiFetch('/v1/admin/oversight/notifications?limit=1').then(r => r.ok ? r.json() : null),
      ]).then(([invoices, sla, automation, notifications]) => {
        setStats({ invoices, sla, automation, notifications });
      }).finally(() => setLoadingData(false));
    }
  }, [user]);

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

  const invoiceTotal = stats?.invoices?.totalCount || 0;
  const slaCompliant = stats?.sla?.totals?.compliantPharmacies || 0;
  const slaTotal = stats?.sla?.totals?.totalPharmacies || 0;
  const slaRate = slaTotal > 0 ? Math.round((slaCompliant / slaTotal) * 100) : 0;
  const extractionRate = stats?.automation?.successRate || 0;
  const extractionFailed = stats?.automation?.failed || 0;
  const notifTotal = stats?.notifications?.totalCount || 0;

  const cards = [
    {
      title: 'Invoice Oversight',
      description: 'Global invoice view with filters, audit trail, and intervention actions.',
      href: '/dashboard/admin/oversight/invoices',
      stat: `${invoiceTotal} invoices`,
      color: 'text-primary-600',
      bgColor: 'bg-primary-50',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ),
    },
    {
      title: 'SLA & Compliance',
      description: 'Monthly compliance rates, violation tracking, pharmacy drill-down.',
      href: '/dashboard/admin/oversight/sla',
      stat: `${slaRate}% compliant`,
      color: slaRate >= 90 ? 'text-emerald-600' : slaRate >= 70 ? 'text-amber-600' : 'text-red-600',
      bgColor: slaRate >= 90 ? 'bg-emerald-50' : slaRate >= 70 ? 'bg-amber-50' : 'bg-red-50',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      title: 'Automation Health',
      description: 'AI extraction stats, failure monitoring, retry capabilities.',
      href: '/dashboard/admin/oversight/automation',
      stat: extractionFailed > 0 ? `${extractionFailed} failed` : `${extractionRate}% success`,
      color: extractionFailed > 0 ? 'text-red-600' : 'text-emerald-600',
      bgColor: extractionFailed > 0 ? 'bg-red-50' : 'bg-emerald-50',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      title: 'Notification Logs',
      description: 'Delivery status, failure diagnostics, and message history.',
      href: '/dashboard/admin/oversight/notifications',
      stat: `${notifTotal} total`,
      color: 'text-violet-600',
      bgColor: 'bg-violet-50',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin" className="text-link text-sm">&larr; Back to Admin</Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Operational Oversight</h1>
          <p className="text-sm text-gray-500 mt-1">
            System health monitoring, audit trails, and safe interventions
          </p>
        </div>
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
          Admin Only
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="card p-6 hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-lg ${card.bgColor} flex items-center justify-center ${card.color}`}>
                {card.icon}
              </div>
              <span className={`text-sm font-semibold ${card.color}`}>{card.stat}</span>
            </div>
            <h3 className="text-sm font-heading font-semibold text-gray-900 mb-1">
              {card.title}
            </h3>
            <p className="text-xs text-gray-500">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
