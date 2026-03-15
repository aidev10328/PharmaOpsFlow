'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import PasswordInput from '../../components/PasswordInput';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data?.message || 'Failed to reset password');
      }
    } catch {
      setError('Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="card p-8 text-center">
            <h1 className="page-title text-2xl mb-4">Invalid Reset Link</h1>
            <p className="text-gray-500 mb-4">
              This password reset link is invalid or has expired.
            </p>
            <Link
              href="/forgot-password"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Request a new reset link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="text-center mb-6">
            <h1 className="page-title text-2xl">Set New Password</h1>
            <p className="text-gray-500 mt-1">
              Enter your new password below
            </p>
          </div>

          {success ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                Your password has been reset successfully!
              </div>
              <div className="text-center">
                <Link
                  href="/login"
                  className="btn-dark inline-block"
                >
                  Sign in with new password
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  placeholder="Re-enter your password"
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
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Back to Sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
