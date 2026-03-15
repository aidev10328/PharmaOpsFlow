'use client';

import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

export default function Nav() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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
                      AI Chat
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
                      {user.firstName || user.email.split('@')[0]}
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
    </nav>
  );
}
