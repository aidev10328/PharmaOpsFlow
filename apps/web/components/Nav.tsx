'use client';

import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { useRouter, usePathname } from 'next/navigation';

export default function Nav() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  function handleLogout() {
    logout();
    router.push('/login');
  }

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/dashboard' || pathname?.startsWith('/dashboard/pharmacy');
    }
    if (path === '/dashboard/admin') {
      return pathname?.startsWith('/dashboard/admin');
    }
    return pathname?.startsWith(path);
  };

  const navLinkClass = (path: string) =>
    isActive(path)
      ? 'text-sm font-semibold px-3 py-2 rounded-md text-primary-600 bg-primary-50'
      : 'nav-link';

  return (
    <nav className="navbar">
      <div className="container">
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo + Nav Links */}
          <div className="flex items-center gap-1">
            <Link href="/" className="flex items-center gap-2.5 mr-6">
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <span className="text-lg font-heading font-bold text-gray-900 tracking-tight">
                PharmaOps
              </span>
            </Link>

            {user && (
              <div className="flex items-center gap-0.5">
                <Link href="/dashboard" className={navLinkClass('/dashboard')}>
                  Dashboard
                </Link>
                {['ADMIN', 'COMPANY_MANAGER'].includes(user.role) && (
                  <>
                    <Link href="/dashboard/manager/explore" className={navLinkClass('/dashboard/manager/explore')}>
                      Explore
                    </Link>
                    <Link href="/dashboard/manager/chat" className={navLinkClass('/dashboard/manager/chat')}>
                      AI Chat
                    </Link>
                  </>
                )}
                {user.role === 'ADMIN' && (
                  <Link href="/dashboard/admin" className={navLinkClass('/dashboard/admin')}>
                    Admin
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Right: User Section */}
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
                  className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors px-2 py-1.5 rounded-md hover:bg-gray-50"
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
    </nav>
  );
}
