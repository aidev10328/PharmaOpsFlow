'use client';

import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { useRouter } from 'next/navigation';

export default function Nav() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <nav className="navbar">
      <div className="container">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-heading font-bold text-primary-600">
              PharmaOpsFlow
            </Link>

            {user && (
              <div className="flex items-center gap-4">
                <Link
                  href="/dashboard"
                  className="nav-link"
                >
                  Dashboard
                </Link>
                {['ADMIN', 'COMPANY_MANAGER'].includes(user.role) && (
                  <>
                    <Link
                      href="/dashboard/manager/explore"
                      className="nav-link"
                    >
                      Explore
                    </Link>
                    <Link
                      href="/dashboard/manager/chat"
                      className="nav-link"
                    >
                      AI Chat
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {loading ? (
              <span className="text-sm text-gray-400">...</span>
            ) : user ? (
              <>
                <span className="text-sm text-gray-600">{user.email}</span>
                <button
                  onClick={handleLogout}
                  className="nav-link"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="btn-primary text-sm"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
