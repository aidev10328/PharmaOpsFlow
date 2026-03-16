'use client';

import { useAuth } from '../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../../lib/api';

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

type Ticket = {
  id: string;
  ticketNumber: string;
  issueType: string;
  userTitle?: string;
  structuredTitle?: string;
  userDescription: string;
  businessImpact: string;
  severity: string;
  category?: string;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
  attachments: { id: string; fileName: string; attachmentType: string }[];
  assignments: { assignedToName: string }[];
};

export default function MyTicketsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  const fetchTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      const res = await apiFetch('/v1/support/tickets/my');
      if (res.ok) setTickets(await res.json());
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchTickets();
  }, [user, fetchTickets]);

  const openDetail = async (ticketId: string) => {
    setLoadingDetail(true);
    setAttachmentUrls({});
    try {
      const res = await apiFetch(`/v1/support/tickets/${ticketId}`);
      if (res.ok) {
        const ticket = await res.json();
        setSelectedTicket(ticket);
        // Pre-fetch download URLs for image attachments
        const imageAttachments = (ticket.attachments || []).filter(
          (a: any) => a.fileName?.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) ||
            a.attachmentType === 'SCREENSHOT' || a.attachmentType === 'ANNOTATED_SCREENSHOT'
        );
        const urls: Record<string, string> = {};
        await Promise.all(imageAttachments.map(async (a: any) => {
          try {
            const r = await apiFetch(`/v1/support/tickets/${ticketId}/attachments/${a.id}/download`);
            if (r.ok) { const { url } = await r.json(); urls[a.id] = url; }
          } catch {}
        }));
        setAttachmentUrls(urls);
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const addComment = async () => {
    if (!commentText.trim() || !selectedTicket) return;
    setSubmittingComment(true);
    try {
      const res = await apiFetch(`/v1/support/tickets/${selectedTicket.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ commentText }),
      });
      if (res.ok) {
        setCommentText('');
        openDetail(selectedTicket.id);
      }
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" /></div>;
  if (!user) return null;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">My Support Tickets</h1>
          <p className="page-subtitle">Track your reported issues and their status</p>
        </div>
        <span className="text-xs text-gray-400">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</span>
      </div>

      {loadingTickets ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" /></div>
      ) : tickets.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-gray-500">No tickets yet.</p>
          <p className="text-xs text-gray-400 mt-1">Use the report issue button in the header to create one.</p>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Ticket List */}
          <div className={`${selectedTicket ? 'w-2/5' : 'w-full'} space-y-2 transition-all`}>
            {tickets.map(t => (
              <div
                key={t.id}
                onClick={() => openDetail(t.id)}
                className={`card p-3 cursor-pointer transition-all ${
                  selectedTicket?.id === t.id ? 'ring-2 ring-primary-400 border-primary-300' : 'hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono font-bold text-primary-600">{t.ticketNumber}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${STATUS_COLORS[t.currentStatus] || 'bg-gray-100'}`}>
                      {t.currentStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full flex-shrink-0 ${SEVERITY_COLORS[t.severity] || ''}`}>
                    {t.severity}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-800 truncate">
                  {t.structuredTitle || t.userTitle || t.userDescription.substring(0, 80)}
                </p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[10px] text-gray-400">{ISSUE_TYPE_LABELS[t.issueType] || t.issueType}</span>
                  {t.category && <span className="text-[10px] text-gray-400">{t.category}</span>}
                  <span className="text-[10px] text-gray-400 ml-auto">{new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Ticket Detail Panel */}
          {selectedTicket && (
            <div className="w-3/5 card overflow-y-auto max-h-[calc(100vh-200px)] sticky top-20">
              {loadingDetail ? (
                <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" /></div>
              ) : (() => {
                const imageAttachments = (selectedTicket.attachments || []).filter(
                  (a: any) => a.fileName?.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) ||
                    a.attachmentType === 'SCREENSHOT' || a.attachmentType === 'ANNOTATED_SCREENSHOT'
                );
                const nonImageAttachments = (selectedTicket.attachments || []).filter(
                  (a: any) => !imageAttachments.includes(a)
                );
                const hasImages = imageAttachments.length > 0;

                return (
                  <div className={hasImages ? 'flex' : ''}>
                    {/* Attachment Previews — left side */}
                    {hasImages && (
                      <div className="w-2/5 border-r border-gray-200 p-4 bg-gray-50/50 space-y-3 flex-shrink-0">
                        <h4 className="text-xs font-semibold text-gray-600">
                          Attachments
                          <span className="text-gray-400 font-normal ml-1">({imageAttachments.length})</span>
                        </h4>
                        {imageAttachments.map((a: any) => (
                          <div key={a.id} className="space-y-1">
                            {attachmentUrls[a.id] ? (
                              <button
                                onClick={() => setExpandedImage(attachmentUrls[a.id])}
                                className="w-full rounded-lg overflow-hidden border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all cursor-pointer group"
                              >
                                <div className="relative">
                                  <img
                                    src={attachmentUrls[a.id]}
                                    alt={a.fileName}
                                    className="w-full object-cover"
                                    style={{ maxHeight: 160 }}
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                    <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                    </svg>
                                  </div>
                                </div>
                              </button>
                            ) : (
                              <div className="w-full h-24 bg-gray-100 rounded-lg flex items-center justify-center">
                                <div className="animate-spin w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full" />
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-gray-500 truncate">{a.fileName}</span>
                              {attachmentUrls[a.id] && (
                                <button
                                  onClick={() => setExpandedImage(attachmentUrls[a.id])}
                                  className="text-[10px] text-primary-600 hover:text-primary-700 font-medium flex-shrink-0"
                                >
                                  View
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {/* Non-image attachments */}
                        {nonImageAttachments.length > 0 && (
                          <div className="pt-2 border-t border-gray-200 space-y-1">
                            {nonImageAttachments.map((a: any) => (
                              <a
                                key={a.id}
                                href="#"
                                onClick={async (e) => {
                                  e.preventDefault();
                                  const res = await apiFetch(`/v1/support/tickets/${selectedTicket.id}/attachments/${a.id}/download`);
                                  if (res.ok) { const { url } = await res.json(); window.open(url, '_blank'); }
                                }}
                                className="flex items-center gap-1.5 px-2 py-1.5 text-xs bg-white rounded border border-gray-200 hover:bg-gray-50 text-gray-600"
                              >
                                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                                <span className="truncate">{a.fileName}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Ticket Info — right side (or full width when no images) */}
                    <div className={`${hasImages ? 'w-3/5' : 'w-full'} p-5 space-y-4`}>
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-bold text-primary-600">{selectedTicket.ticketNumber}</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[selectedTicket.currentStatus]}`}>
                              {selectedTicket.currentStatus.replace(/_/g, ' ')}
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

                      {/* Meta */}
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-gray-400 block">Type</span>
                          <span className="font-medium">{ISSUE_TYPE_LABELS[selectedTicket.issueType]}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block">Severity</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${SEVERITY_COLORS[selectedTicket.severity]}`}>{selectedTicket.severity}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block">Category</span>
                          <span className="font-medium">{selectedTicket.category || '-'}</span>
                        </div>
                      </div>

                      {/* Description */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 mb-1">Description</h4>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTicket.userDescription}</p>
                      </div>

                      {/* Steps to Reproduce */}
                      {selectedTicket.stepsToReproduce && Array.isArray(selectedTicket.stepsToReproduce) && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-600 mb-1">Steps to Reproduce</h4>
                          <ol className="list-decimal list-inside text-sm text-gray-700 space-y-0.5">
                            {selectedTicket.stepsToReproduce.map((s: string, i: number) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {/* Expected / Actual */}
                      {(selectedTicket.expectedResult || selectedTicket.actualResult) && (
                        <div className="grid grid-cols-2 gap-3">
                          {selectedTicket.expectedResult && (
                            <div>
                              <h4 className="text-xs font-semibold text-green-600 mb-1">Expected</h4>
                              <p className="text-xs text-gray-700">{selectedTicket.expectedResult}</p>
                            </div>
                          )}
                          {selectedTicket.actualResult && (
                            <div>
                              <h4 className="text-xs font-semibold text-red-600 mb-1">Actual</h4>
                              <p className="text-xs text-gray-700">{selectedTicket.actualResult}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Non-image attachments when no image attachments exist */}
                      {!hasImages && nonImageAttachments.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-600 mb-1">Attachments</h4>
                          <div className="flex flex-wrap gap-2">
                            {nonImageAttachments.map((a: any) => (
                              <a
                                key={a.id}
                                href="#"
                                onClick={async (e) => {
                                  e.preventDefault();
                                  const res = await apiFetch(`/v1/support/tickets/${selectedTicket.id}/attachments/${a.id}/download`);
                                  if (res.ok) { const { url } = await res.json(); window.open(url, '_blank'); }
                                }}
                                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 text-gray-600"
                              >
                                {a.fileName}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Status History */}
                      {selectedTicket.statusHistory?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-600 mb-1">Status History</h4>
                          <div className="space-y-1">
                            {selectedTicket.statusHistory.map((h: any) => (
                              <div key={h.id} className="flex items-center gap-2 text-[10px] flex-wrap">
                                <span className="text-gray-400 w-28 flex-shrink-0">{new Date(h.createdAt).toLocaleString()}</span>
                                <span className={`px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[h.newStatus]}`}>{h.newStatus.replace(/_/g, ' ')}</span>
                                <span className="text-gray-400">by {h.changedByName}</span>
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
                              <div key={c.id} className={`p-2 rounded-lg text-xs ${c.authorRole === 'ADMIN' ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-gray-800">{c.authorName}</span>
                                  <span className="text-gray-400">{new Date(c.createdAt).toLocaleString()}</span>
                                  {c.authorRole === 'ADMIN' && <span className="px-1 py-0.5 text-[9px] bg-blue-100 text-blue-600 rounded">Support</span>}
                                </div>
                                <p className="text-gray-700">{c.commentText}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 mb-3">No comments yet.</p>
                        )}

                        {/* Add Comment */}
                        <div className="flex gap-2">
                          <input
                            value={commentText}
                            onChange={e => setCommentText(e.target.value)}
                            placeholder="Add a follow-up comment..."
                            className="input-field text-xs flex-1"
                            onKeyDown={e => { if (e.key === 'Enter') addComment(); }}
                          />
                          <button
                            onClick={addComment}
                            disabled={!commentText.trim() || submittingComment}
                            className="btn-primary text-xs py-1.5 px-3"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Image Lightbox */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-8"
          onClick={() => setExpandedImage(null)}
        >
          <button
            onClick={() => setExpandedImage(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/30 rounded-full p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={expandedImage}
            alt="Attachment"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
