'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../lib/api';
import Link from 'next/link';

type PharmacySlaStatus = {
  pharmacyId: string;
  pharmacyName: string;
  pharmacyCode: string;
  yearMonth: string;
  expectedCount: number;
  submittedCount: number;
  processedCount: number;
  isMet: boolean;
  submissionDeadlineMet: boolean;
  processingDeadlineMet: boolean;
  events: {
    eventType: string;
    createdAt: string;
    notes: string | null;
  }[];
};

type SlaSummary = {
  yearMonth: string;
  totalPharmacies: number;
  compliant: number;
  nonCompliant: number;
  pending: number;
  pharmacies: PharmacySlaStatus[];
};

const STATUS_BADGES: Record<string, string> = {
  compliant: 'bg-green-100 text-green-800',
  nonCompliant: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
};

export default function ComplianceDashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState<SlaSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    setError(null);
    try {
      const res = await apiFetch(`/v1/sla/summary?yearMonth=${selectedMonth}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Failed to load SLA summary');
      }
    } catch (e) {
      setError('Failed to load SLA summary');
    } finally {
      setLoadingSummary(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      fetchSummary();
    }
  }, [user, fetchSummary]);

  const [runningEval, setRunningEval] = useState(false);
  const [evalResult, setEvalResult] = useState<string | null>(null);

  const runEvaluation = async () => {
    setRunningEval(true);
    setError(null);
    setEvalResult(null);
    try {
      const res = await apiFetch(`/v1/sla/run?yearMonth=${selectedMonth}`, {
        method: 'POST',
      });
      if (res.ok) {
        const result = await res.json();
        setEvalResult(`Evaluated ${result.pharmaciesEvaluated} pharmacies: ${result.submissionViolations} submission violations, ${result.processingViolations} processing violations`);
        await fetchSummary();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Evaluation failed');
      }
    } catch (e) {
      setError('Failed to run evaluation');
    } finally {
      setRunningEval(false);
    }
  };

  const getPharmacyStatus = (pharmacy: PharmacySlaStatus): 'compliant' | 'nonCompliant' | 'pending' => {
    if (pharmacy.isMet) return 'compliant';
    if (!pharmacy.submissionDeadlineMet || !pharmacy.processingDeadlineMet) return 'nonCompliant';
    return 'pending';
  };

  const getStatusLabel = (status: string): string => {
    if (status === 'compliant') return 'Compliant';
    if (status === 'nonCompliant') return 'Non-Compliant';
    return 'Pending';
  };

  const generateMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      options.push({ value, label });
    }
    return options;
  };

  if (loading || loadingSummary) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!user || !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/dashboard/manager"
            className="text-primary hover:text-primary-dark text-sm"
          >
            &larr; Back to Dashboard
          </Link>
          <h1 className="page-title mt-2">SLA Compliance Dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input-field py-2"
          >
            {generateMonthOptions().map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button onClick={runEvaluation} disabled={runningEval} className="btn-secondary disabled:opacity-50">
            {runningEval ? 'Running...' : 'Run Evaluation'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}
      {evalResult && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
          {evalResult}
        </div>
      )}

      {summary && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="card p-4">
              <div className="text-2xl font-bold text-gray-900">{summary.totalPharmacies}</div>
              <div className="text-sm text-gray-500">Total Pharmacies</div>
            </div>
            <div className="card p-4">
              <div className="text-2xl font-bold text-green-600">{summary.compliant}</div>
              <div className="text-sm text-gray-500">Compliant</div>
            </div>
            <div className="card p-4">
              <div className="text-2xl font-bold text-red-600">{summary.nonCompliant}</div>
              <div className="text-sm text-gray-500">Non-Compliant</div>
            </div>
            <div className="card p-4">
              <div className="text-2xl font-bold text-yellow-600">{summary.pending}</div>
              <div className="text-sm text-gray-500">Pending</div>
            </div>
          </div>

          {/* Compliance Progress Bar */}
          <div className="card p-6 mb-8">
            <h3 className="text-lg font-heading font-semibold text-gray-900 mb-4">
              Compliance Rate
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{
                    width: `${summary.totalPharmacies > 0
                      ? (summary.compliant / summary.totalPharmacies) * 100
                      : 0}%`,
                  }}
                />
              </div>
              <span className="text-lg font-semibold text-gray-900">
                {summary.totalPharmacies > 0
                  ? Math.round((summary.compliant / summary.totalPharmacies) * 100)
                  : 0}%
              </span>
            </div>
          </div>

          {/* Pharmacy Table */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-heading font-semibold text-gray-900">
                Pharmacy Compliance Status
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b-2 border-gray-300">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Pharmacy
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Submitted
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Processed
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Submission Deadline
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Processing Deadline
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Events
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {summary.pharmacies.map((pharmacy) => {
                    const status = getPharmacyStatus(pharmacy);
                    return (
                      <tr key={pharmacy.pharmacyId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="font-medium text-gray-900">{pharmacy.pharmacyName}</div>
                            <div className="text-sm text-gray-500">{pharmacy.pharmacyCode}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_BADGES[status]}`}>
                            {getStatusLabel(status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`font-medium ${pharmacy.submittedCount >= pharmacy.expectedCount ? 'text-green-600' : 'text-gray-900'}`}>
                            {pharmacy.submittedCount}/{pharmacy.expectedCount}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`font-medium ${pharmacy.processedCount >= pharmacy.expectedCount ? 'text-green-600' : 'text-gray-900'}`}>
                            {pharmacy.processedCount}/{pharmacy.expectedCount}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {pharmacy.submissionDeadlineMet ? (
                            <span className="text-green-600">&#10003;</span>
                          ) : (
                            <span className="text-red-600">&#10007;</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {pharmacy.processingDeadlineMet ? (
                            <span className="text-green-600">&#10003;</span>
                          ) : (
                            <span className="text-red-600">&#10007;</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {pharmacy.events.length > 0 ? (
                            <div className="text-sm text-gray-600">
                              {pharmacy.events.slice(0, 2).map((event, idx) => (
                                <div key={idx} className="truncate max-w-xs">
                                  {event.eventType.replace('_', ' ')}
                                </div>
                              ))}
                              {pharmacy.events.length > 2 && (
                                <div className="text-gray-400">+{pharmacy.events.length - 2} more</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {summary.pharmacies.length === 0 && (
              <div className="px-6 py-8 text-center text-gray-500">
                No pharmacies found.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
