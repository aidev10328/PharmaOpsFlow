'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (res.ok) {
        setSent(true);
      } else {
        setError(data?.message || 'Something went wrong');
      }
    } catch {
      setError('Failed to send request. Is the API server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="text-center mb-6">
            <h1 className="page-title text-2xl">Forgot Password</h1>
            <p className="text-gray-500 mt-1">
              Enter your email and we'll send you a reset link
            </p>
          </div>

          {sent ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                If an account exists with that email, a password reset link has been sent.
                Check your inbox (or Mailpit at <code className="font-mono text-xs">localhost:54334</code>).
              </div>
              <div className="text-center">
                <Link
                  href="/login"
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  Back to Sign in
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="you@example.com"
                  required
                  autoFocus
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
                {loading ? 'Sending...' : 'Send Reset Link'}
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
