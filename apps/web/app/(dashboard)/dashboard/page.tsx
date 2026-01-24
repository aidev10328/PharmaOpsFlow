'use client';

import { useAuth, Role } from '../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Maps roles to their dashboard paths
function getDashboardPath(role: Role): string {
  switch (role) {
    case 'ADMIN':
      return '/dashboard/admin';
    case 'COMPANY_MANAGER':
      return '/dashboard/manager';
    case 'PHARMACY_ADMIN':
    case 'PHARMACY_USER':
    case 'READ_ONLY':
      return '/dashboard/pharmacy';
    default:
      return '/dashboard/pharmacy';
  }
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else {
        // Redirect to role-specific dashboard
        const targetPath = getDashboardPath(user.role);
        router.replace(targetPath);
      }
    }
  }, [user, loading, router]);

  // Show loading while redirecting
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-gray-500">Redirecting to your dashboard...</p>
      </div>
    </div>
  );
}
