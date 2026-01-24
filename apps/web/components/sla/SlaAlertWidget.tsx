'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api';

type SlaStatus = {
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
};

type SlaAlert = {
  type: string;
  eventType: string;
  message: string;
  createdAt: string;
};

type Props = {
  pharmacyId: string;
};

export default function SlaAlertWidget({ pharmacyId }: Props) {
  const [status, setStatus] = useState<SlaStatus | null>(null);
  const [alerts, setAlerts] = useState<SlaAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, alertsRes] = await Promise.all([
        apiFetch(`/v1/sla/pharmacies/${pharmacyId}`),
        apiFetch(`/v1/sla/pharmacies/${pharmacyId}/alerts?limit=3`),
      ]);

      if (statusRes.ok) {
        setStatus(await statusRes.json());
      }
      if (alertsRes.ok) {
        setAlerts(await alertsRes.json());
      }
    } catch (e) {
      console.error('Failed to fetch SLA data:', e);
    } finally {
      setLoading(false);
    }
  }, [pharmacyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getCurrentDay = () => new Date().getDate();
  const SUBMISSION_DUE_DAY = 5;
  const PROCESSING_DUE_DAY = 10;

  const getDaysUntil = (day: number): number => {
    const today = getCurrentDay();
    if (today >= day) return 0;
    return day - today;
  };

  const getStatusColor = () => {
    if (!status) return 'border-gray-200';
    if (status.isMet) return 'border-green-500';
    if (!status.submissionDeadlineMet || !status.processingDeadlineMet) return 'border-red-500';
    return 'border-yellow-500';
  };

  const getStatusIcon = () => {
    if (!status) return null;
    if (status.isMet) {
      return (
        <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    }
    if (!status.submissionDeadlineMet || !status.processingDeadlineMet) {
      return (
        <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    }
    return (
      <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
      </div>
    );
  }

  return (
    <div className={`card p-4 border-l-4 ${getStatusColor()}`}>
      <div className="flex items-start justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-900">SLA Status - {status?.yearMonth}</h4>
        {getStatusIcon()}
      </div>

      {status && (
        <div className="space-y-3">
          {/* Progress Indicators */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">Submitted</span>
                <span className={`font-medium ${status.submittedCount >= status.expectedCount ? 'text-green-600' : 'text-gray-900'}`}>
                  {status.submittedCount}/{status.expectedCount}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${status.submittedCount >= status.expectedCount ? 'bg-green-500' : 'bg-primary'}`}
                  style={{ width: `${Math.min((status.submittedCount / status.expectedCount) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">Processed</span>
                <span className={`font-medium ${status.processedCount >= status.expectedCount ? 'text-green-600' : 'text-gray-900'}`}>
                  {status.processedCount}/{status.expectedCount}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${status.processedCount >= status.expectedCount ? 'bg-green-500' : 'bg-primary'}`}
                  style={{ width: `${Math.min((status.processedCount / status.expectedCount) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Deadline Reminders */}
          {!status.isMet && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              {status.submittedCount < status.expectedCount && getCurrentDay() < SUBMISSION_DUE_DAY && (
                <div className="flex items-center gap-2 text-yellow-700">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{getDaysUntil(SUBMISSION_DUE_DAY)} days until submission deadline</span>
                </div>
              )}
              {status.submittedCount >= status.expectedCount && status.processedCount < status.expectedCount && getCurrentDay() < PROCESSING_DUE_DAY && (
                <div className="flex items-center gap-2 text-yellow-700">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{getDaysUntil(PROCESSING_DUE_DAY)} days until processing deadline</span>
                </div>
              )}
              {!status.submissionDeadlineMet && (
                <div className="flex items-center gap-2 text-red-700">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Submission deadline missed!</span>
                </div>
              )}
              {!status.processingDeadlineMet && (
                <div className="flex items-center gap-2 text-red-700">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Processing deadline missed!</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recent Alerts */}
      {alerts.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <h5 className="text-xs font-medium text-gray-500 uppercase mb-2">Recent Activity</h5>
          <div className="space-y-2">
            {alerts.map((alert, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <span className="flex-shrink-0 w-1.5 h-1.5 mt-1.5 rounded-full bg-gray-400"></span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-700 truncate">{alert.message || alert.eventType.replace('_', ' ')}</p>
                  <p className="text-xs text-gray-400">{formatDate(alert.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {status?.isMet && (
        <div className="mt-3 flex items-center gap-2 text-sm text-green-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>All SLA requirements met for this month!</span>
        </div>
      )}
    </div>
  );
}
