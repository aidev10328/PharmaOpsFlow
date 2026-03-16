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
    <div className="fixed inset-0 z-[100] bg-[#f8f9fb] overflow-auto">
      <div className="min-h-full flex items-center justify-center py-10">
        <div className="w-full max-w-6xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-12 lg:gap-20">

          {/* Left Panel - Product Info */}
          <div className="hidden lg:block lg:flex-1 max-w-xl">
            {/* Logo & Title */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-200">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-heading font-bold text-gray-900 tracking-tight">PharmaOpsFlow</h1>
                <p className="text-xs text-gray-500">Invoice Management System</p>
              </div>
            </div>

            {/* Tagline */}
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              From Submission to Payment &mdash; <span className="font-bold text-gray-900">tracked, compliant, on time.</span>
            </p>

            {/* Feature List */}
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Invoice Tracking & SLA</h3>
                  <p className="text-xs text-gray-500">Deadline-driven submissions with 5th/10th day compliance tracking.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Multi-Pharmacy Management</h3>
                  <p className="text-xs text-gray-500">Role-based access for pharmacy staff, managers, and administrators.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Approvals & Payments</h3>
                  <p className="text-xs text-gray-500">Centralized review, approval workflows, and payment scheduling.</p>
                </div>
              </div>
            </div>

            {/* AI Section */}
            <div className="mb-8">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50 border border-violet-100 mb-3">
                <svg className="w-3.5 h-3.5 text-violet-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                <span className="text-[11px] font-semibold text-violet-700">AI-Powered Features</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-gray-100">
                  <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-900">Invoice Extraction</p>
                    <p className="text-[9px] text-gray-500">Auto-capture from uploads</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-gray-100">
                  <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-900">Manager Chatbot</p>
                    <p className="text-[9px] text-gray-500">Search & insights via AI</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-gray-100">
                  <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-900">Analytics Dashboard</p>
                    <p className="text-[9px] text-gray-500">Real-time compliance metrics</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-gray-100">
                  <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-900">Smart Alerts</p>
                    <p className="text-[9px] text-gray-500">SLA deadline notifications</p>
                  </div>
                </div>
              </div>
            </div>

            {/* System Flow */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">System Flow</p>
              <div className="flex items-center gap-1.5">
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-100">
                  <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span className="text-[10px] font-semibold text-blue-700">Upload</span>
                </div>
                <svg className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 border border-amber-100">
                  <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="text-[10px] font-semibold text-amber-700">Review</span>
                </div>
                <svg className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-100">
                  <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[10px] font-semibold text-emerald-700">Approve</span>
                </div>
                <svg className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 border border-purple-100">
                  <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-[10px] font-semibold text-purple-700">Schedule</span>
                </div>
                <svg className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-100">
                  <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="text-[10px] font-semibold text-emerald-700">Pay</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Sign In Form */}
          <div className="w-full lg:w-[520px] lg:flex-shrink-0">
            <div className="w-full mx-auto">
              <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 px-14 py-10">
                <div className="mb-6">
                  <h2 className="text-2xl font-heading font-bold text-gray-900">Sign in</h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Email address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-field !py-3 !text-base"
                      placeholder="you@company.com"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Password
                    </label>
                    <PasswordInput
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
                      className="input-field !py-3 !text-base"
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
                    className="btn-dark w-full h-12 text-base"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Signing in...
                      </span>
                    ) : 'Sign In'}
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

                <div className="mt-6 pt-5 border-t border-gray-100 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Secure access for pharmacy teams
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-5 text-center">
                <p className="text-xs text-gray-400">
                  &copy; {new Date().getFullYear()} PharmaOpsFlow
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
