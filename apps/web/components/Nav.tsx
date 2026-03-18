'use client';

import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';

const ReportIssueDrawer = dynamic(() => import('./support/ReportIssueDrawer'), { ssr: false });

export default function Nav() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  function handleLogout() {
    logout();
    router.push('/login');
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setProfileMenuOpen(false);
  }, [pathname]);

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/dashboard/pharmacy';
    }
    if (path === '/dashboard/overview') {
      return pathname === '/dashboard/overview';
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
                      AI Assistant
                    </Link>
                  </>
                )}
                {user.role === 'ADMIN' && (
                  <Link href="/dashboard/admin" className={navLinkClass('/dashboard/admin')}>
                    <span className="inline-flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Settings
                    </span>
                  </Link>
                )}
              </div>
            )}

            {/* Overview & Support Icons */}
            {user && (
              <div className="flex items-center gap-1">
                {/* Overview Infographic */}
                <div className="relative group">
                  <Link
                    href="/dashboard/overview"
                    className={`p-2 rounded-lg transition-colors ${
                      isActive('/dashboard/overview')
                        ? 'text-primary-600 bg-primary-50'
                        : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                    </svg>
                  </Link>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1 bg-gray-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    Platform Overview
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-[-1px] border-4 border-transparent border-b-gray-900" />
                  </div>
                </div>

                {/* Report Issue */}
                <div className="relative group">
                  <button
                    onClick={() => setReportIssueOpen(true)}
                    className="p-2 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                    </svg>
                  </button>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1 bg-gray-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    Report an Issue
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-[-1px] border-4 border-transparent border-b-gray-900" />
                  </div>
                </div>
              </div>
            )}

            {/* User Section */}
            <div className="flex items-center gap-3">
            {loading ? (
              <div className="h-8 w-24 bg-gray-100 rounded-md animate-pulse" />
            ) : user ? (
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary-700">
                      {(user.firstName?.[0] || user.email[0]).toUpperCase()}
                    </span>
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-sm font-medium text-gray-900 leading-tight">
                      {user.firstName && user.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : user.firstName || user.email.split('@')[0]}
                    </div>
                    <div className="text-xs text-gray-500 leading-tight">
                      {user.role.replace('_', ' ')}
                    </div>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <div className="text-sm font-medium text-gray-900 truncate">{user.email}</div>
                      <div className="text-xs text-gray-500">{user.role.replace(/_/g, ' ')}</div>
                    </div>
                    <Link
                      href="/dashboard/support"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      My Tickets
                    </Link>
                    <Link
                      href="/change-password"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Change Password
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                )}
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
      {/* Report Issue Drawer */}
      <ReportIssueDrawer isOpen={reportIssueOpen} onClose={() => setReportIssueOpen(false)} />
    </nav>
  );
}
