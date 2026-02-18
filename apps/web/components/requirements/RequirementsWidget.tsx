'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import Link from 'next/link';

type RequirementsSummary = {
  pharmacyId: string;
  pharmacyName: string;
  pharmacyCode: string;
  pending: number;
  overdue: number;
  submitted: number;
  processed: number;
  totalThisMonth: number;
};

type Props = {
  pharmacyId: string;
};

export default function RequirementsWidget({ pharmacyId }: Props) {
  const [summary, setSummary] = useState<RequirementsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await apiFetch(`/v1/requirements/pharmacy/${pharmacyId}/summary`);
        if (res.ok) {
          setSummary(await res.json());
        } else if (res.status === 404) {
          // No requirements configured - that's OK
          setSummary(null);
        } else {
          setError('Failed to load');
        }
      } catch {
        setError('Failed to load');
      } finally {
        setLoading(false);
      }
    }
    if (pharmacyId) {
      fetchSummary();
    }
  }, [pharmacyId]);

  if (loading) {
    return (
      <div className="card p-5">
        <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">
          Invoice Requirements
        </h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400"></div>
        </div>
      </div>
    );
  }

  if (error || !summary || summary.totalThisMonth === 0) {
    return (
      <div className="card p-5">
        <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">
          Invoice Requirements
        </h3>
        <div className="text-center py-4">
          <div className="text-gray-400 mb-2">
            <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">No requirements for this month</p>
        </div>
      </div>
    );
  }

  const hasAction = summary.pending > 0 || summary.overdue > 0;

  return (
    <div className={`card p-5 ${hasAction ? 'border-l-4 border-yellow-400' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-heading font-semibold text-gray-900">
          Invoice Requirements
        </h3>
        {hasAction && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Action Required
          </span>
        )}
      </div>

      {/* Alert for overdue */}
      {summary.overdue > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium text-red-800">
              {summary.overdue} overdue requirement{summary.overdue !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="text-center p-3 bg-yellow-50 rounded-lg">
          <div className="text-xl font-bold text-yellow-600">{summary.pending}</div>
          <div className="text-xs text-gray-600">Pending</div>
        </div>
        <div className="text-center p-3 bg-orange-50 rounded-lg">
          <div className="text-xl font-bold text-orange-600">{summary.overdue}</div>
          <div className="text-xs text-gray-600">Overdue</div>
        </div>
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <div className="text-xl font-bold text-blue-600">{summary.submitted}</div>
          <div className="text-xs text-gray-600">Submitted</div>
        </div>
        <div className="text-center p-3 bg-emerald-50 rounded-lg">
          <div className="text-xl font-bold text-emerald-600">{summary.processed}</div>
          <div className="text-xs text-gray-600">Processed</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>This Month</span>
          <span>{summary.submitted + summary.processed} / {summary.totalThisMonth} completed</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-emerald-500 h-2 rounded-full transition-all"
            style={{ width: `${summary.totalThisMonth > 0 ? ((summary.submitted + summary.processed) / summary.totalThisMonth) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Action Button */}
      <Link
        href={`/dashboard/pharmacy/invoices?pharmacyId=${pharmacyId}`}
        className={`block w-full text-center py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
          hasAction
            ? 'bg-yellow-500 text-white hover:bg-yellow-600'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        {hasAction ? 'Submit Invoices' : 'View All Invoices'}
      </Link>
    </div>
  );
}
