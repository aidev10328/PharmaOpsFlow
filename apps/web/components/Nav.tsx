'use client';

import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

type AdminMenuItem = {
  label: string;
  href: string;
};

type AdminMenuSection = {
  title: string;
  items: AdminMenuItem[];
};

const adminMenuSections: AdminMenuSection[] = [
  {
    title: 'Staff Management',
    items: [
      { label: 'Users', href: '/dashboard/admin/users' },
      { label: 'Pharmacies', href: '/dashboard/admin/pharmacies' },
      { label: 'Organization Settings', href: '/dashboard/admin/org' },
    ],
  },
  {
    title: 'Reference Data',
    items: [
      { label: 'Invoice Types', href: '/dashboard/admin/reference/invoice-types' },
      { label: 'Vendors', href: '/dashboard/admin/reference/vendors' },
      { label: 'Requirements', href: '/dashboard/admin/requirements' },
    ],
  },
  {
    title: 'Operational Oversight',
    items: [
      { label: 'All Invoices', href: '/dashboard/admin/oversight/invoices' },
      { label: 'SLA & Compliance', href: '/dashboard/admin/oversight/sla' },
      { label: 'Notifications', href: '/dashboard/admin/oversight/notifications' },
      { label: 'Automation Health', href: '/dashboard/admin/oversight/automation' },
    ],
  },
];

// Manager-accessible menu items (subset of admin)
const managerMenuSections: AdminMenuSection[] = [
  {
    title: 'Requirements',
    items: [
      { label: 'Requirements', href: '/dashboard/admin/requirements' },
      { label: 'Compliance', href: '/dashboard/admin/requirements/compliance' },
      { label: 'Instances', href: '/dashboard/admin/requirements/instances' },
    ],
  },
  {
    title: 'Oversight',
    items: [
      { label: 'SLA & Compliance', href: '/dashboard/admin/oversight/sla' },
      { label: 'Notifications', href: '/dashboard/admin/oversight/notifications' },
    ],
  },
];

export default function Nav() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  function handleLogout() {
    logout();
    router.push('/login');
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (adminMenuRef.current && !adminMenuRef.current.contains(event.target as Node)) {
        setAdminMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setAdminMenuOpen(false);
  }, [pathname]);

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/dashboard/pharmacy';
    }
    if (path === '/dashboard/admin') {
      return pathname?.startsWith('/dashboard/admin');
    }
    return pathname?.startsWith(path);
  };

  const navLinkClass = (path: string) =>
    isActive(path)
      ? 'text-sm font-bold px-4 py-2 rounded-lg text-white bg-primary-600 shadow-sm'
      : 'text-sm font-semibold px-4 py-2 rounded-lg text-gray-700 hover:text-primary-600 hover:bg-gray-100 transition-colors';

  const adminButtonClass = isActive('/dashboard/admin')
    ? 'text-sm font-bold px-4 py-2 rounded-lg text-white bg-primary-600 shadow-sm inline-flex items-center gap-1'
    : 'text-sm font-semibold px-4 py-2 rounded-lg text-gray-700 hover:text-primary-600 hover:bg-gray-100 transition-colors inline-flex items-center gap-1';

  return (
    <nav className="navbar sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="container">
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <span className="text-lg font-heading font-bold text-gray-900 tracking-tight">
                PharmaOps
              </span>
            </Link>
          </div>

          {/* Right: Nav Links + User Section */}
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2 mr-2">
                <Link href="/dashboard" className={navLinkClass('/dashboard')}>
                  Dashboard
                </Link>
                {['PHARMACY_ADMIN', 'PHARMACY_USER'].includes(user.role) && (
                  <Link href="/dashboard/pharmacy/invoices" className={navLinkClass('/dashboard/pharmacy/invoices')}>
                    Invoices
                  </Link>
                )}
                {['ADMIN', 'COMPANY_MANAGER'].includes(user.role) && (
                  <>
                    <Link href="/dashboard/manager/invoices" className={navLinkClass('/dashboard/manager/invoices')}>
                      Operations
                    </Link>
                    <Link href="/dashboard/manager/chat" className={navLinkClass('/dashboard/manager/chat')}>
                      AI Chat
                    </Link>
                  </>
                )}
                {user.role === 'ADMIN' && (
                  <div className="relative" ref={adminMenuRef}>
                    <button
                      onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                      className={adminButtonClass}
                    >
                      Admin
                      <svg
                        className={`w-4 h-4 transition-transform ${adminMenuOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Dropdown Menu */}
                    {adminMenuOpen && (
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                        {/* Overview Link */}
                        <Link
                          href="/dashboard/admin"
                          className={`block px-4 py-2 text-sm font-medium transition-colors ${
                            pathname === '/dashboard/admin'
                              ? 'text-primary-600 bg-primary-50'
                              : 'text-gray-900 hover:bg-gray-50'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                            </svg>
                            Overview
                          </span>
                        </Link>
                        <div className="border-t border-gray-100 my-2" />

                        {adminMenuSections.map((section, idx) => (
                          <div key={section.title}>
                            {idx > 0 && <div className="border-t border-gray-100 my-2" />}
                            <div className="px-4 py-1.5">
                              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                                {section.title}
                              </span>
                            </div>
                            {section.items.map((item) => (
                              <Link
                                key={item.href}
                                href={item.href}
                                className={`block px-4 py-2 text-sm transition-colors ${
                                  pathname === item.href || pathname?.startsWith(item.href + '/')
                                    ? 'text-primary-600 bg-primary-50 font-medium'
                                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                              >
                                {item.label}
                              </Link>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {user.role === 'COMPANY_MANAGER' && (
                  <div className="relative" ref={adminMenuRef}>
                    <button
                      onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                      className={adminButtonClass}
                    >
                      Manage
                      <svg
                        className={`w-4 h-4 transition-transform ${adminMenuOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Manager Dropdown Menu */}
                    {adminMenuOpen && (
                      <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                        {managerMenuSections.map((section, idx) => (
                          <div key={section.title}>
                            {idx > 0 && <div className="border-t border-gray-100 my-2" />}
                            <div className="px-4 py-1.5">
                              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                                {section.title}
                              </span>
                            </div>
                            {section.items.map((item) => (
                              <Link
                                key={item.href}
                                href={item.href}
                                className={`block px-4 py-2 text-sm transition-colors ${
                                  pathname === item.href || pathname?.startsWith(item.href + '/')
                                    ? 'text-primary-600 bg-primary-50 font-medium'
                                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                              >
                                {item.label}
                              </Link>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* User Section */}
            <div className="flex items-center gap-3">
            {loading ? (
              <div className="h-8 w-24 bg-gray-100 rounded-md animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary-700">
                      {(user.firstName?.[0] || user.email[0]).toUpperCase()}
                    </span>
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-sm font-medium text-gray-900 leading-tight">
                      {user.firstName || user.email.split('@')[0]}
                    </div>
                    <div className="text-xs text-gray-500 leading-tight">
                      {user.role.replace('_', ' ')}
                    </div>
                  </div>
                </div>
                <div className="w-px h-6 bg-gray-200" />
                <button
                  onClick={handleLogout}
                  className="btn-primary text-sm"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link href="/login" className="btn-primary text-sm">
                Sign in
              </Link>
            )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
