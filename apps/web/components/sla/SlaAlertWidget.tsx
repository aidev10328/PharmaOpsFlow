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
  yearMonth?: string;
};

export default function SlaAlertWidget({ pharmacyId, yearMonth }: Props) {
  const [status, setStatus] = useState<SlaStatus | null>(null);
  const [alerts, setAlerts] = useState<SlaAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const monthParam = yearMonth ? `?yearMonth=${yearMonth}` : '';
      const [statusRes, alertsRes] = await Promise.all([
        apiFetch(`/v1/sla/pharmacies/${pharmacyId}${monthParam}`),
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
  }, [pharmacyId, yearMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    }
    if (!status.submissionDeadlineMet || !status.processingDeadlineMet) {
      return (
        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <div className="card p-3 animate-pulse">
        <div className="h-3 bg-gray-200 rounded w-1/3 mb-3"></div>
        <div className="h-6 bg-gray-200 rounded w-1/2 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-2/3"></div>
      </div>
    );
  }

  return (
    <div className={`card p-3 border-l-4 ${getStatusColor()}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-gray-900">SLA Status - {status?.yearMonth}</h4>
        {getStatusIcon()}
      </div>

      {status && (
        <div className="space-y-2">
          {/* Progress Indicators */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-gray-600">Submitted</span>
                <span className={`font-medium ${status.submittedCount >= status.expectedCount ? 'text-green-600' : 'text-gray-900'}`}>
                  {status.submittedCount}/{status.expectedCount}
                </span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${status.submittedCount >= status.expectedCount ? 'bg-green-500' : 'bg-primary'}`}
                  style={{ width: `${status.expectedCount > 0 ? Math.min((status.submittedCount / status.expectedCount) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-gray-600">Processed</span>
                <span className={`font-medium ${status.processedCount >= status.expectedCount ? 'text-green-600' : 'text-gray-900'}`}>
                  {status.processedCount}/{status.expectedCount}
                </span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${status.processedCount >= status.expectedCount ? 'bg-green-500' : 'bg-primary'}`}
                  style={{ width: `${status.expectedCount > 0 ? Math.min((status.processedCount / status.expectedCount) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* Deadline Alerts */}
          {(!status.submissionDeadlineMet || !status.processingDeadlineMet) && (
            <div className="text-[10px] text-red-700 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {!status.submissionDeadlineMet && <span>Submission deadline missed!</span>}
              {!status.submissionDeadlineMet && !status.processingDeadlineMet && <span className="mx-1">•</span>}
              {!status.processingDeadlineMet && status.submissionDeadlineMet && <span>Processing deadline missed!</span>}
            </div>
          )}

          {status.isMet && (
            <div className="text-[10px] text-green-700 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>All SLA requirements met!</span>
            </div>
          )}
        </div>
      )}

      {/* Recent Alerts - compact list */}
      {alerts.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <h5 className="text-[10px] font-medium text-gray-500 uppercase mb-1">Recent Activity</h5>
          <div className="space-y-1">
            {alerts.slice(0, 3).map((alert, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-[10px]">
                <span className="flex-shrink-0 w-1 h-1 mt-1 rounded-full bg-gray-400"></span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-700 truncate">{alert.message || alert.eventType.replace('_', ' ')}</p>
                  <p className="text-gray-400">{formatDate(alert.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
