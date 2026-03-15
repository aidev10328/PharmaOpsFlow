'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../components/AuthProvider';
import { apiFetch } from '../../lib/api';
import PasswordInput from '../../components/PasswordInput';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { loginWithToken, user } = useAuth();

  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (res.ok && data?.access_token) {
        if (data.mustChangePassword) {
          // Store token temporarily and redirect to force change password
          await loginWithToken(data.access_token);
          router.push('/change-password?force=true');
        } else {
          await loginWithToken(data.access_token);
          router.push('/dashboard');
        }
      } else {
        setError(data?.message || 'Invalid credentials');
      }
    } catch (err) {
      console.error(err);
      setError('Login failed. Is the API server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="text-center mb-6">
            <h1 className="page-title text-2xl">Sign in to PharmaOpsFlow</h1>
            <p className="text-gray-500 mt-1">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="admin@local"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
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
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Forgot password?
            </Link>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-center text-xs text-gray-400">
              Default credentials: admin@local / admin123
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
