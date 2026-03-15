'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import { apiFetch } from '../../lib/api';
import PasswordInput from '../../components/PasswordInput';

function ChangePasswordForm() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isForced = searchParams.get('force') === 'true';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      let res: Response;

      if (isForced) {
        // Force change: after admin reset, no current password needed
        res = await apiFetch('/auth/force-change-password', {
          method: 'POST',
          body: JSON.stringify({ newPassword }),
        });
      } else {
        // Normal change: requires current password
        res = await apiFetch('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword }),
        });
      }

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        if (isForced) {
          // Log out so user signs in with new password
          setTimeout(() => {
            logout();
            router.push('/login');
          }, 2000);
        }
      } else {
        setError(data?.message || 'Failed to change password');
      }
    } catch {
      setError('Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="text-center mb-6">
            <h1 className="page-title text-2xl">
              {isForced ? 'Set Your New Password' : 'Change Password'}
            </h1>
            <p className="text-gray-500 mt-1">
              {isForced
                ? 'Your password was reset by an administrator. Please set a new password to continue.'
                : 'Enter your current password and choose a new one'}
            </p>
          </div>

          {success ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                Password changed successfully!
                {isForced && ' Redirecting to sign in...'}
              </div>
              {!isForced && (
                <div className="text-center">
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="btn-dark"
                  >
                    Back to Dashboard
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isForced && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <PasswordInput
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                    autoComplete="current-password"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-dark w-full"
              >
                {loading ? 'Changing...' : 'Change Password'}
              </button>

              {!isForced && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    }>
      <ChangePasswordForm />
    </Suspense>
  );
}
