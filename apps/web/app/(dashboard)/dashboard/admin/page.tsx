'use client';

import { useAuth } from '../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

export default function AdminHubPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'ADMIN') {
      router.push('/dashboard');
      return;
    }
  }, [user, loading, router]);

  if (loading) {
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

  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  const sections = [
    {
      title: 'Organization Settings',
      description: 'Configure org name, timezone, and SLA due dates.',
      href: '/dashboard/admin/org',
      icon: (
        <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      title: 'Pharmacy Management',
      description: 'Create, edit, activate/deactivate pharmacies.',
      href: '/dashboard/admin/pharmacies',
      icon: (
        <svg className="w-6 h-6 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: 'User Management',
      description: 'Create users, assign roles, reset passwords.',
      href: '/dashboard/admin/users',
      icon: (
        <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
  ];

  const referenceSections = [
    {
      title: 'Invoice Types',
      description: 'Manage invoice categories and SLA requirements.',
      href: '/dashboard/admin/reference/invoice-types',
      icon: (
        <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      title: 'Vendors',
      description: 'Org-wide and pharmacy-specific vendor management.',
      href: '/dashboard/admin/reference/vendors',
      icon: (
        <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      title: 'Required Invoices',
      description: 'Configure required invoice types for SLA compliance.',
      href: '/dashboard/admin/reference/required-invoices',
      icon: (
        <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">System Administration</h1>
          <p className="text-sm text-gray-500 mt-1">
            Platform configuration and governance
          </p>
        </div>
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-red-50 text-red-700">
          System Admin
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="card p-6 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center mb-4 group-hover:bg-primary-50 transition-colors">
              {section.icon}
            </div>
            <h3 className="text-sm font-heading font-semibold text-gray-900 mb-1">
              {section.title}
            </h3>
            <p className="text-xs text-gray-500">{section.description}</p>
          </Link>
        ))}
      </div>

      {/* Reference Data Section */}
      <div>
        <h2 className="text-sm font-heading font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Reference Data
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {referenceSections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="card p-6 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center mb-4 group-hover:bg-primary-50 transition-colors">
                {section.icon}
              </div>
              <h3 className="text-sm font-heading font-semibold text-gray-900 mb-1">
                {section.title}
              </h3>
              <p className="text-xs text-gray-500">{section.description}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Operational Oversight Section */}
      <div>
        <h2 className="text-sm font-heading font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Operational Oversight
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/dashboard/admin/oversight/invoices"
            className="card p-6 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center mb-4 group-hover:bg-primary-50 transition-colors">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <h3 className="text-sm font-heading font-semibold text-gray-900 mb-1">Invoice Oversight</h3>
            <p className="text-xs text-gray-500">Global invoice view with filters, audit trail, and intervention actions.</p>
          </Link>
          <Link
            href="/dashboard/admin/oversight/sla"
            className="card p-6 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center mb-4 group-hover:bg-primary-50 transition-colors">
              <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-sm font-heading font-semibold text-gray-900 mb-1">SLA & Compliance</h3>
            <p className="text-xs text-gray-500">Monthly compliance rates, violation tracking, and pharmacy drill-down.</p>
          </Link>
          <Link
            href="/dashboard/admin/oversight/automation"
            className="card p-6 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center mb-4 group-hover:bg-primary-50 transition-colors">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-heading font-semibold text-gray-900 mb-1">Automation Health</h3>
            <p className="text-xs text-gray-500">AI extraction stats, failure monitoring, and retry capabilities.</p>
          </Link>
          <Link
            href="/dashboard/admin/oversight/notifications"
            className="card p-6 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center mb-4 group-hover:bg-primary-50 transition-colors">
              <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h3 className="text-sm font-heading font-semibold text-gray-900 mb-1">Notification Logs</h3>
            <p className="text-xs text-gray-500">Delivery status, failure diagnostics, and message history.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
