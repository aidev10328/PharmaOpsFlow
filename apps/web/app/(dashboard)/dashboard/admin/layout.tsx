'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

type Tab = { label: string; href: string };

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  tabs?: Tab[];
  matchPaths: string[];
};

const adminNav: NavItem[] = [
  {
    label: 'Overview',
    href: '/dashboard/admin',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
    matchPaths: ['/dashboard/admin'],
  },
  {
    label: 'Organization',
    href: '/dashboard/admin/org',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    matchPaths: ['/dashboard/admin/org'],
  },
  {
    label: 'Team',
    href: '/dashboard/admin/users',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    tabs: [
      { label: 'Users', href: '/dashboard/admin/users' },
      { label: 'Pharmacies', href: '/dashboard/admin/pharmacies' },
    ],
    matchPaths: ['/dashboard/admin/users', '/dashboard/admin/pharmacies'],
  },
  {
    label: 'Configuration',
    href: '/dashboard/admin/reference/invoice-types',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
    tabs: [
      { label: 'Invoice Types', href: '/dashboard/admin/reference/invoice-types' },
      { label: 'Vendors', href: '/dashboard/admin/reference/vendors' },
      { label: 'Frequencies', href: '/dashboard/admin/reference/frequencies' },
      { label: 'Categories', href: '/dashboard/admin/reference/categories' },
      { label: 'Requirements', href: '/dashboard/admin/requirements' },
    ],
    matchPaths: ['/dashboard/admin/reference', '/dashboard/admin/requirements'],
  },
  {
    label: 'Reports',
    href: '/dashboard/admin/oversight/invoices',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    tabs: [
      { label: 'Invoices', href: '/dashboard/admin/oversight/invoices' },
      { label: 'SLA & Compliance', href: '/dashboard/admin/oversight/sla' },
      { label: 'Notifications', href: '/dashboard/admin/oversight/notifications' },
      { label: 'Automation', href: '/dashboard/admin/oversight/automation' },
    ],
    matchPaths: ['/dashboard/admin/oversight'],
  },
];

const managerNav: NavItem[] = [
  {
    label: 'Configuration',
    href: '/dashboard/admin/reference/invoice-types',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
    tabs: [
      { label: 'Invoice Types', href: '/dashboard/admin/reference/invoice-types' },
      { label: 'Vendors', href: '/dashboard/admin/reference/vendors' },
      { label: 'Requirements', href: '/dashboard/admin/requirements' },
    ],
    matchPaths: ['/dashboard/admin/reference', '/dashboard/admin/requirements'],
  },
  {
    label: 'Reports',
    href: '/dashboard/admin/oversight/sla',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    tabs: [
      { label: 'SLA & Compliance', href: '/dashboard/admin/oversight/sla' },
      { label: 'Notifications', href: '/dashboard/admin/oversight/notifications' },
    ],
    matchPaths: ['/dashboard/admin/oversight'],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
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

  if (!user || !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) return null;

  const navItems = user.role === 'ADMIN' ? adminNav : managerNav;

  // Find which nav group is currently active
  const activeGroup = navItems.find((item) => {
    if (!item.tabs) {
      return pathname === item.href;
    }
    return item.matchPaths.some((p) => pathname === p || pathname?.startsWith(p + '/'));
  });

  // Find active tab within the group
  const activeTab = activeGroup?.tabs?.find(
    (tab) => pathname === tab.href || pathname?.startsWith(tab.href + '/')
  );

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-heading font-bold text-gray-900 leading-tight">Settings</h1>
          <p className="text-xs text-gray-500">Manage your organization, team, and configuration</p>
        </div>
      </div>

      {/* Main navigation tabs — icon + label, underline active */}
      <div className="border-b border-gray-200 mb-5">
        <nav className="flex gap-0">
          {navItems.map((item) => {
            const isActive = activeGroup === item;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Sub-tabs — pill style, shown when active group has tabs */}
      {activeGroup?.tabs && activeGroup.tabs.length > 1 && (
        <div className="flex items-center gap-2 mb-5">
          {activeGroup.tabs.map((tab) => {
            const isTabActive = activeTab === tab;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  isTabActive
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div>
        {children}
      </div>
    </div>
  );
}
