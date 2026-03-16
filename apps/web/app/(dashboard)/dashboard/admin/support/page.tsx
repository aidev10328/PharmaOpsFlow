'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../../lib/api';

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'bg-blue-100 text-blue-700',
  UNDER_REVIEW: 'bg-indigo-100 text-indigo-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  NEED_MORE_INFO: 'bg-orange-100 text-orange-700',
  FIXED: 'bg-green-100 text-green-700',
  RELEASED: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-gray-100 text-gray-700',
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-blue-100 text-blue-700',
  INFO: 'bg-gray-100 text-gray-600',
};

const ISSUE_TYPE_LABELS: Record<string, string> = {
  BUG: 'Bug',
  FUNCTIONAL_ISSUE: 'Functional',
  PERFORMANCE_ISSUE: 'Performance',
  UI_UX_ISSUE: 'UI/UX',
  DATA_ISSUE: 'Data',
  QUESTION: 'Question',
  FEATURE_REQUEST: 'Feature Req.',
};

const ALL_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'NEED_MORE_INFO', 'FIXED', 'RELEASED', 'CLOSED'];
const ALL_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

export default function AdminSupportPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // List state
  const [tickets, setTickets] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingList, setLoadingList] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [search, setSearch] = useState('');

  // Detail state
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Actions
  const [commentText, setCommentText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Admin users for assignment
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [assignUserId, setAssignUserId] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && user.role !== 'ADMIN') router.push('/dashboard');
  }, [user, loading, router]);

  const fetchTickets = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', '25');
      if (statusFilter) params.append('status', statusFilter);
      if (severityFilter) params.append('severity', severityFilter);
      if (search) params.append('search', search);

      const res = await apiFetch(`/v1/admin/support/tickets?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets);
        setTotal(data.total);
      }
    } finally {
      setLoadingList(false);
    }
  }, [page, statusFilter, severityFilter, search]);

  useEffect(() => {
    if (user?.role === 'ADMIN') fetchTickets();
  }, [user, fetchTickets]);

  // Fetch admin users for assignment
  useEffect(() => {
    if (user?.role === 'ADMIN') {
      apiFetch('/v1/admin/users').then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const users = Array.isArray(data) ? data : data.users || [];
          setAdminUsers(users.filter((u: any) => u.role === 'ADMIN'));
        }
      });
    }
  }, [user]);

  const openDetail = async (ticketId: string) => {
    setLoadingDetail(true);
    setNewStatus('');
    setStatusNote('');
    try {
      const res = await apiFetch(`/v1/admin/support/tickets/${ticketId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedTicket(data);
        setNewStatus(data.currentStatus);
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const addComment = async () => {
    if (!commentText.trim() || !selectedTicket) return;
    setSubmittingComment(true);
    try {
      await apiFetch(`/v1/admin/support/tickets/${selectedTicket.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ commentText, isInternal }),
      });
      setCommentText('');
      setIsInternal(false);
      openDetail(selectedTicket.id);
    } finally {
      setSubmittingComment(false);
    }
  };

  const updateStatus = async () => {
    if (!newStatus || !selectedTicket || newStatus === selectedTicket.currentStatus) return;
    setUpdatingStatus(true);
    try {
      await apiFetch(`/v1/admin/support/tickets/${selectedTicket.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ newStatus, note: statusNote || undefined }),
      });
      setStatusNote('');
      openDetail(selectedTicket.id);
      fetchTickets();
    } finally {
      setUpdatingStatus(false);
    }
  };

  const assignTicket = async () => {
    if (!assignUserId || !selectedTicket) return;
    setAssigning(true);
    try {
      await apiFetch(`/v1/admin/support/tickets/${selectedTicket.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assignToUserId: assignUserId }),
      });
      setAssignUserId('');
      openDetail(selectedTicket.id);
      fetchTickets();
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" /></div>;
  if (!user || user.role !== 'ADMIN') return null;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-heading font-bold text-gray-900">Support Tickets</h1>
          <p className="text-xs text-gray-500">Manage and resolve user-reported issues ({total} total)</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search tickets..."
            className="input-field text-xs py-1.5 w-48"
          />
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input-field text-xs py-1.5 w-36">
            <option value="">All Statuses</option>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <select value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setPage(1); }} className="input-field text-xs py-1.5 w-32">
            <option value="">All Severities</option>
            {ALL_SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {(statusFilter || severityFilter || search) && (
            <button onClick={() => { setStatusFilter(''); setSeverityFilter(''); setSearch(''); setPage(1); }} className="text-xs text-primary-600 hover:text-primary-700">
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-5">
        {/* Ticket List Table */}
        <div className={`${selectedTicket ? 'w-2/5' : 'w-full'} transition-all`}>
          {loadingList ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" /></div>
          ) : tickets.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm text-gray-500">No tickets found.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {tickets.map(t => (
                <div
                  key={t.id}
                  onClick={() => openDetail(t.id)}
                  className={`card p-3 cursor-pointer transition-all ${
                    selectedTicket?.id === t.id ? 'ring-2 ring-primary-400' : 'hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono font-bold text-primary-600">{t.ticketNumber}</span>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${STATUS_COLORS[t.currentStatus]}`}>
                        {t.currentStatus.replace(/_/g, ' ')}
                      </span>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${SEVERITY_COLORS[t.severity]}`}>
                        {t.severity}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      {ISSUE_TYPE_LABELS[t.issueType]}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {t.structuredTitle || t.userTitle || t.userDescription.substring(0, 80)}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-gray-400">{t.reportedByName}</span>
                    {t.assignments?.[0] && <span className="text-[10px] text-blue-500">Assigned: {t.assignments[0].assignedToName}</span>}
                    <span className="text-[10px] text-gray-400 ml-auto">{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {total > 25 && (
                <div className="flex justify-center gap-2 pt-3">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-xs py-1 px-3 disabled:opacity-40">Prev</button>
                  <span className="text-xs text-gray-500 py-1">Page {page}</span>
                  <button disabled={tickets.length < 25} onClick={() => setPage(p => p + 1)} className="btn-secondary text-xs py-1 px-3 disabled:opacity-40">Next</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedTicket && (
          <div className="w-3/5 card p-5 overflow-y-auto max-h-[calc(100vh-200px)] sticky top-20">
            {loadingDetail ? (
              <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" /></div>
            ) : (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-primary-600">{selectedTicket.ticketNumber}</span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[selectedTicket.currentStatus]}`}>
                        {selectedTicket.currentStatus.replace(/_/g, ' ')}
                      </span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${SEVERITY_COLORS[selectedTicket.severity]}`}>
                        {selectedTicket.severity}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-gray-900">
                      {selectedTicket.structuredTitle || selectedTicket.userTitle || 'Untitled'}
                    </h3>
                  </div>
                  <button onClick={() => setSelectedTicket(null)} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Reporter Info */}
                <div className="bg-gray-50 rounded-lg p-3 text-xs">
                  <div className="grid grid-cols-3 gap-2">
                    <div><span className="text-gray-400">Reporter</span><br /><span className="font-medium">{selectedTicket.reportedByName}</span></div>
                    <div><span className="text-gray-400">Email</span><br /><span className="font-medium">{selectedTicket.reportedByEmail}</span></div>
                    <div><span className="text-gray-400">Created</span><br /><span className="font-medium">{new Date(selectedTicket.createdAt).toLocaleString()}</span></div>
                  </div>
                </div>

                {/* Meta row */}
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div><span className="text-gray-400 block">Type</span><span className="font-medium">{ISSUE_TYPE_LABELS[selectedTicket.issueType]}</span></div>
                  <div><span className="text-gray-400 block">Impact</span><span className="font-medium">{selectedTicket.businessImpact}</span></div>
                  <div><span className="text-gray-400 block">Category</span><span className="font-medium">{selectedTicket.category || '-'}</span></div>
                  <div><span className="text-gray-400 block">Page</span><span className="font-medium truncate block" title={selectedTicket.pageRoute}>{selectedTicket.pageRoute || '-'}</span></div>
                </div>

                {/* Structured Summary */}
                {selectedTicket.structuredSummary && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-600 mb-1">Summary</h4>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTicket.structuredSummary}</p>
                  </div>
                )}

                {/* User Description */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-600 mb-1">User Description</h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTicket.userDescription}</p>
                </div>

                {/* Steps to Reproduce */}
                {selectedTicket.stepsToReproduce && Array.isArray(selectedTicket.stepsToReproduce) && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-600 mb-1">Steps to Reproduce</h4>
                    <ol className="list-decimal list-inside text-sm text-gray-700 space-y-0.5">
                      {selectedTicket.stepsToReproduce.map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ol>
                  </div>
                )}

                {/* Expected / Actual */}
                <div className="grid grid-cols-2 gap-3">
                  {selectedTicket.expectedResult && (
                    <div className="bg-green-50 rounded-lg p-2">
                      <h4 className="text-xs font-semibold text-green-700 mb-1">Expected</h4>
                      <p className="text-xs text-gray-700">{selectedTicket.expectedResult}</p>
                    </div>
                  )}
                  {selectedTicket.actualResult && (
                    <div className="bg-red-50 rounded-lg p-2">
                      <h4 className="text-xs font-semibold text-red-700 mb-1">Actual</h4>
                      <p className="text-xs text-gray-700">{selectedTicket.actualResult}</p>
                    </div>
                  )}
                </div>

                {/* Attachments */}
                {selectedTicket.attachments?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-600 mb-1">Attachments ({selectedTicket.attachments.length})</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedTicket.attachments.map((a: any) => (
                        <button
                          key={a.id}
                          onClick={async () => {
                            const res = await apiFetch(`/v1/support/tickets/${selectedTicket.id}/attachments/${a.id}/download`);
                            if (res.ok) {
                              const { url } = await res.json();
                              window.open(url, '_blank');
                            }
                          }}
                          className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          {a.fileName}
                          <span className="text-[9px] text-gray-400">({a.attachmentType})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Context / Metadata */}
                {(selectedTicket.browserInfo || selectedTicket.viewportInfo || selectedTicket.consoleErrors) && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold text-gray-500 hover:text-gray-700 mb-1">Technical Context</summary>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2 mt-1">
                      {selectedTicket.browserInfo && (
                        <div>
                          <span className="text-gray-400">Browser:</span>{' '}
                          <span className="font-mono text-[10px]">{selectedTicket.browserInfo.userAgent?.substring(0, 100)}</span>
                        </div>
                      )}
                      {selectedTicket.viewportInfo && (
                        <div>
                          <span className="text-gray-400">Viewport:</span>{' '}
                          {selectedTicket.viewportInfo.width}x{selectedTicket.viewportInfo.height} @{selectedTicket.viewportInfo.devicePixelRatio}x
                        </div>
                      )}
                      {selectedTicket.pageUrl && (
                        <div>
                          <span className="text-gray-400">URL:</span>{' '}<span className="font-mono text-[10px]">{selectedTicket.pageUrl}</span>
                        </div>
                      )}
                      {selectedTicket.consoleErrors && Array.isArray(selectedTicket.consoleErrors) && selectedTicket.consoleErrors.length > 0 && (
                        <div>
                          <span className="text-gray-400">Console Errors:</span>
                          <ul className="mt-1 space-y-0.5">
                            {selectedTicket.consoleErrors.map((e: string, i: number) => (
                              <li key={i} className="font-mono text-[10px] text-red-600 bg-red-50 p-1 rounded">{e}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {selectedTicket.failedApiRequests && Array.isArray(selectedTicket.failedApiRequests) && selectedTicket.failedApiRequests.length > 0 && (
                        <div>
                          <span className="text-gray-400">Failed API Requests:</span>
                          <ul className="mt-1 space-y-0.5">
                            {selectedTicket.failedApiRequests.map((r: any, i: number) => (
                              <li key={i} className="font-mono text-[10px] text-orange-600 bg-orange-50 p-1 rounded">
                                {r.method} {r.url} → {r.status}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {/* ─── Admin Actions ──────────────────────── */}
                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-xs font-semibold text-gray-700">Admin Actions</h4>

                  {/* Status Update */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-500 block mb-0.5">Change Status</label>
                      <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="input-field text-xs py-1.5 w-full">
                        {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-500 block mb-0.5">Note (optional)</label>
                      <input value={statusNote} onChange={e => setStatusNote(e.target.value)} className="input-field text-xs py-1.5 w-full" placeholder="Reason..." />
                    </div>
                    <button
                      onClick={updateStatus}
                      disabled={updatingStatus || newStatus === selectedTicket.currentStatus}
                      className="btn-primary text-xs py-1.5 px-3 disabled:opacity-40"
                    >
                      Update
                    </button>
                  </div>

                  {/* Assignment */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-500 block mb-0.5">Assign To</label>
                      <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)} className="input-field text-xs py-1.5 w-full">
                        <option value="">Select user...</option>
                        {adminUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.firstName || u.email} ({u.role})</option>
                        ))}
                      </select>
                    </div>
                    <button onClick={assignTicket} disabled={!assignUserId || assigning} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">
                      Assign
                    </button>
                  </div>

                  {/* Current assignments */}
                  {selectedTicket.assignments?.length > 0 && (
                    <div className="text-xs text-gray-500">
                      Current: {selectedTicket.assignments.map((a: any) => a.assignedToName).join(', ')}
                    </div>
                  )}
                </div>

                {/* Status History */}
                {selectedTicket.statusHistory?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-600 mb-1">Status History</h4>
                    <div className="space-y-1">
                      {selectedTicket.statusHistory.map((h: any) => (
                        <div key={h.id} className="flex items-center gap-2 text-[10px]">
                          <span className="text-gray-400 w-28 flex-shrink-0">{new Date(h.createdAt).toLocaleString()}</span>
                          {h.oldStatus !== h.newStatus && (
                            <>
                              <span className={`px-1 py-0.5 rounded-full font-medium ${STATUS_COLORS[h.oldStatus]}`}>{h.oldStatus.replace(/_/g, ' ')}</span>
                              <span className="text-gray-400">→</span>
                            </>
                          )}
                          <span className={`px-1 py-0.5 rounded-full font-medium ${STATUS_COLORS[h.newStatus]}`}>{h.newStatus.replace(/_/g, ' ')}</span>
                          <span className="text-gray-400">{h.changedByName}</span>
                          {h.note && <span className="text-gray-500 italic">— {h.note}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-600 mb-2">Comments</h4>
                  {selectedTicket.comments?.length > 0 ? (
                    <div className="space-y-2 mb-3">
                      {selectedTicket.comments.map((c: any) => (
                        <div key={c.id} className={`p-2.5 rounded-lg text-xs ${
                          c.isInternal ? 'bg-amber-50 border border-amber-200' : c.authorRole === 'ADMIN' ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-800">{c.authorName}</span>
                            <span className="text-gray-400">{new Date(c.createdAt).toLocaleString()}</span>
                            {c.isInternal && <span className="px-1 py-0.5 text-[9px] bg-amber-200 text-amber-700 rounded font-medium">Internal</span>}
                            {c.authorRole === 'ADMIN' && <span className="px-1 py-0.5 text-[9px] bg-blue-100 text-blue-600 rounded">Admin</span>}
                          </div>
                          <p className="text-gray-700">{c.commentText}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mb-3">No comments yet.</p>
                  )}

                  {/* Add Comment */}
                  <div className="space-y-2">
                    <textarea
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder="Write a comment..."
                      rows={2}
                      className="input-field text-xs w-full"
                    />
                    <div className="flex items-center justify-between">
                      <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="rounded" />
                        Internal note (not visible to reporter)
                      </label>
                      <button onClick={addComment} disabled={!commentText.trim() || submittingComment} className="btn-primary text-xs py-1.5 px-3 disabled:opacity-40">
                        {isInternal ? 'Add Internal Note' : 'Send Comment'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
