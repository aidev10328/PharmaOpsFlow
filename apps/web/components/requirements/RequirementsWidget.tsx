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
  yearMonth?: string;
};

export default function RequirementsWidget({ pharmacyId, yearMonth }: Props) {
  const [summary, setSummary] = useState<RequirementsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const params = yearMonth ? `?yearMonth=${yearMonth}` : '';
        const res = await apiFetch(`/v1/requirements/pharmacy/${pharmacyId}/summary${params}`);
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
      setLoading(true);
      fetchSummary();
    }
  }, [pharmacyId, yearMonth]);

  if (loading) {
    return (
      <div className="card p-3">
        <h3 className="text-xs font-heading font-semibold text-gray-900 mb-2">
          Invoice Requirements
        </h3>
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
        </div>
      </div>
    );
  }

  if (error || !summary || summary.totalThisMonth === 0) {
    return (
      <div className="card p-3">
        <h3 className="text-xs font-heading font-semibold text-gray-900 mb-2">
          Invoice Requirements
        </h3>
        <div className="text-center py-3">
          <svg className="w-6 h-6 mx-auto text-gray-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-xs text-gray-500">No requirements this month</p>
        </div>
      </div>
    );
  }

  const hasAction = summary.pending > 0 || summary.overdue > 0;

  return (
    <div className={`card p-3 ${hasAction ? 'border-l-4 border-yellow-400' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-heading font-semibold text-gray-900">
          Invoice Requirements
        </h3>
        {hasAction && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800">
            Action Required
          </span>
        )}
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <div className="text-center p-2 bg-yellow-50 rounded">
          <div className="text-base font-bold text-yellow-600">{summary.pending}</div>
          <div className="text-[10px] text-gray-600">Pending</div>
        </div>
        <div className="text-center p-2 bg-orange-50 rounded">
          <div className="text-base font-bold text-orange-600">{summary.overdue}</div>
          <div className="text-[10px] text-gray-600">Overdue</div>
        </div>
        <div className="text-center p-2 bg-blue-50 rounded">
          <div className="text-base font-bold text-blue-600">{summary.submitted}</div>
          <div className="text-[10px] text-gray-600">Submitted</div>
        </div>
        <div className="text-center p-2 bg-emerald-50 rounded">
          <div className="text-base font-bold text-emerald-600">{summary.processed}</div>
          <div className="text-[10px] text-gray-600">Processed</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-2">
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>{yearMonth ? new Date(parseInt(yearMonth.split('-')[0]), parseInt(yearMonth.split('-')[1]) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
          <span>{summary.submitted + summary.processed} / {summary.totalThisMonth} completed</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className="bg-emerald-500 h-1.5 rounded-full transition-all"
            style={{ width: `${summary.totalThisMonth > 0 ? ((summary.submitted + summary.processed) / summary.totalThisMonth) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Action Button */}
      <Link
        href={`/dashboard/pharmacy/invoices?pharmacyId=${pharmacyId}`}
        className={`block w-full text-center py-1.5 px-3 rounded text-xs font-medium transition-colors ${
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
