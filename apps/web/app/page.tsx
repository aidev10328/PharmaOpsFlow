'use client';

import { useAuth } from '../components/AuthProvider';
import Link from 'next/link';

export default function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card p-8">
        <h1 className="page-title text-3xl mb-4">
          Welcome to PharmaOpsFlow
        </h1>

        <p className="text-gray-600 mb-6">
          Multi-pharmacy invoice intake and processing system with role-based access, AI-assisted invoice capture, deadline tracking (5th/10th), centralized approvals/payments, dashboards by pharmacy, and a manager chatbot for search and insights.
        </p>

        {user ? (
          <div className="space-y-4">
            <p className="text-accent">
              Logged in as <strong>{user.email}</strong>
            </p>
            <Link
              href="/dashboard"
              className="btn-primary inline-block"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-500">
              Please sign in to continue.
            </p>
            <Link
              href="/login"
              className="btn-primary inline-block"
            >
              Sign In
            </Link>
          </div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-heading font-semibold text-gray-900 mb-2">Getting Started</h3>
          <p className="text-gray-600 text-sm">
            This project was generated with BuildFlow. All infrastructure is pre-configured.
            Start adding your business logic!
          </p>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-heading font-semibold text-gray-900 mb-2">Documentation</h3>
          <p className="text-gray-600 text-sm">
            Check the README.md for setup instructions and project structure overview.
          </p>
        </div>
      </div>
    </div>
  );
}
