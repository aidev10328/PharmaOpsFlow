'use client';

import { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../AuthProvider';
import { apiFetch } from '../../lib/api';
import html2canvas from 'html2canvas';
import { captureContext } from './captureContext';
import VoiceRecorder from './VoiceRecorder';
import ScreenshotAnnotator from './ScreenshotAnnotator';

// ─── Constants ────────────────────────────────────────────
const ISSUE_TYPES = [
  { value: 'BUG', label: 'Bug' },
  { value: 'FUNCTIONAL_ISSUE', label: 'Functional Issue' },
  { value: 'PERFORMANCE_ISSUE', label: 'Performance Issue' },
  { value: 'UI_UX_ISSUE', label: 'UI/UX Issue' },
  { value: 'DATA_ISSUE', label: 'Data Issue' },
  { value: 'QUESTION', label: 'Question / Help' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
];

const IMPACT_OPTIONS = [
  { value: 'BLOCKING', label: 'Blocking' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'MINOR', label: 'Minor' },
  { value: 'COSMETIC', label: 'Cosmetic' },
  { value: 'SUGGESTION', label: 'Suggestion' },
];

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-blue-100 text-blue-700',
  INFO: 'bg-gray-100 text-gray-700',
};

type StructuredReport = {
  title: string;
  summary: string;
  stepsToReproduce: string[];
  expectedResult: string;
  actualResult: string;
  severity: string;
  category: string;
  confidence: number;
  notes: string;
};

type Step = 'describe' | 'review' | 'success';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function ReportIssueDrawer({ isOpen, onClose }: Props) {
  const { user } = useAuth();

  // Step
  const [step, setStep] = useState<Step>('describe');

  // Describe step — simple inputs
  const [userDescription, setUserDescription] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [annotatedBlob, setAnnotatedBlob] = useState<Blob | null>(null);
  const [annotatedPreviewUrl, setAnnotatedPreviewUrl] = useState<string | null>(null);
  const [annotatingIndex, setAnnotatingIndex] = useState<number | null>(null);
  const [capturedScreenshotUrl, setCapturedScreenshotUrl] = useState<string | null>(null);
  const [annotatingCaptured, setAnnotatingCaptured] = useState(false);
  const [capturingPage, setCapturingPage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Review step — editable structured fields (auto-populated)
  const [editableReport, setEditableReport] = useState<StructuredReport | null>(null);
  const [issueType, setIssueType] = useState('BUG');
  const [businessImpact, setBusinessImpact] = useState('MINOR');
  const [generatingReport, setGeneratingReport] = useState(false);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<any>(null);
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setStep('describe');
    setUserDescription('');
    setVoiceTranscript('');
    setAudioBlob(null);
    setFiles([]);
    setAnnotatedBlob(null);
    setAnnotatedPreviewUrl(null);
    setAnnotatingIndex(null);
    setCapturedScreenshotUrl(null);
    setAnnotatingCaptured(false);
    setCapturingPage(false);
    setEditableReport(null);
    setIssueType('BUG');
    setBusinessImpact('MINOR');
    setGeneratingReport(false);
    setSubmitting(false);
    setCreatedTicket(null);
    setError('');
  }, []);

  const handleClose = () => { resetForm(); onClose(); };

  const isImage = (file: File) => file.type.startsWith('image/');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    if (annotatingIndex === idx) setAnnotatingIndex(null);
  };

  // ─── Capture Page Screenshot ──────────────────────────────
  const capturePageScreenshot = useCallback(async () => {
    setCapturingPage(true);
    try {
      const backdrop = document.querySelector('[data-report-backdrop]') as HTMLElement;
      const drawer = document.querySelector('[data-report-drawer]') as HTMLElement;
      if (backdrop) backdrop.style.display = 'none';
      if (drawer) drawer.style.display = 'none';
      await new Promise(r => setTimeout(r, 150));

      const canvas = await html2canvas(document.body, {
        useCORS: true, allowTaint: true,
        scale: window.devicePixelRatio > 1 ? 2 : 1,
        logging: false,
      });

      if (backdrop) backdrop.style.display = '';
      if (drawer) drawer.style.display = '';

      setCapturedScreenshotUrl(canvas.toDataURL('image/png'));
      setAnnotatingCaptured(true);
    } catch {
      setError('Failed to capture screenshot. Try uploading one instead.');
      const backdrop = document.querySelector('[data-report-backdrop]') as HTMLElement;
      const drawer = document.querySelector('[data-report-drawer]') as HTMLElement;
      if (backdrop) backdrop.style.display = '';
      if (drawer) drawer.style.display = '';
    } finally {
      setCapturingPage(false);
    }
  }, []);

  // ─── Generate Report & go to Review ───────────────────────
  const goToReview = async () => {
    setGeneratingReport(true);
    setError('');
    try {
      const context = captureContext();
      const res = await apiFetch('/v1/support/tickets/generate-report', {
        method: 'POST',
        body: JSON.stringify({
          issueType: 'BUG', // will be editable on review
          businessImpact: 'MINOR',
          userDescription,
          voiceTranscript: voiceTranscript || undefined,
          pageUrl: context.pageUrl,
          pageRoute: context.pageRoute,
          pageTitle: context.pageTitle,
          consoleErrors: context.consoleErrors,
          failedApiRequests: context.failedApiRequests,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate report');
      const report: StructuredReport = await res.json();
      setEditableReport({ ...report });
      setIssueType(guessIssueType(userDescription));
      setBusinessImpact(impactFromSeverity(report.severity));
      setStep('review');
    } catch (err: any) {
      setError(err.message || 'Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  };

  // ─── Submit ───────────────────────────────────────────────
  const submitTicket = async () => {
    if (!editableReport) return;
    setSubmitting(true);
    setError('');
    try {
      const context = captureContext();
      const res = await apiFetch('/v1/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          issueType, businessImpact, userDescription,
          voiceTranscript: voiceTranscript || undefined,
          structuredTitle: editableReport.title,
          structuredSummary: editableReport.summary,
          stepsToReproduce: editableReport.stepsToReproduce,
          expectedResult: editableReport.expectedResult,
          actualResult: editableReport.actualResult,
          severity: editableReport.severity,
          category: editableReport.category,
          environment: context.environment,
          pageUrl: context.pageUrl, pageRoute: context.pageRoute,
          pageTitle: context.pageTitle, browserInfo: context.browserInfo,
          viewportInfo: context.viewportInfo, consoleErrors: context.consoleErrors,
          failedApiRequests: context.failedApiRequests,
          metadata: { timestamp: context.timestamp, portalKey: context.portalKey },
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to create ticket');
      }
      const ticket = await res.json();

      // Upload attachments
      const uploads: { file: Blob; name: string; type: string }[] = [];
      for (const f of files) uploads.push({ file: f, name: f.name, type: isImage(f) ? 'SCREENSHOT' : 'DOCUMENT' });
      if (annotatedBlob) uploads.push({ file: annotatedBlob, name: 'annotated-screenshot.png', type: 'ANNOTATED_SCREENSHOT' });
      if (audioBlob) uploads.push({ file: audioBlob, name: 'voice-recording.webm', type: 'AUDIO' });

      const token = localStorage.getItem('pharmaopsflow_token');
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
      for (const { file, name, type } of uploads) {
        const fd = new FormData();
        fd.append('file', file, name);
        await fetch(`${apiBase}/v1/support/tickets/${ticket.id}/attachments?type=${type}`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
        });
      }

      setCreatedTicket(ticket);
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const canProceed = userDescription.trim().length >= 10;
  const hasEvidence = files.length > 0 || annotatedBlob || audioBlob;

  return createPortal(
    <>
      <div data-report-backdrop className="fixed inset-0 bg-black/30 z-[9999]" onClick={handleClose} />

      <div data-report-drawer className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-white z-[10000] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-heading font-bold text-gray-900">Report an Issue</h2>
              <p className="text-[10px] text-gray-500">
                {step === 'describe' && 'Describe the problem'}
                {step === 'review' && 'Review before submitting'}
                {step === 'success' && 'Ticket created!'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress */}
        {step !== 'success' && (
          <div className="flex gap-1 px-5 pt-3">
            {['describe', 'review'].map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${
                ['describe', 'review'].indexOf(step) >= i ? 'bg-primary-500' : 'bg-gray-200'
              }`} />
            ))}
          </div>
        )}

        {error && <div className="mx-5 mt-3 alert-error text-xs">{error}</div>}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ═══ STEP 1: DESCRIBE ═══ */}
          {step === 'describe' && (
            <div className="space-y-4">
              {/* Description */}
              <div>
                <label className="field-label text-xs">What happened? *</label>
                <textarea
                  value={userDescription}
                  onChange={e => setUserDescription(e.target.value)}
                  placeholder="Describe the issue — what you were doing, what went wrong, what you expected..."
                  rows={4}
                  className="input-field text-sm"
                  autoFocus
                />
                {userDescription.length < 10 && userDescription.length > 0 && (
                  <p className="field-hint text-orange-500">At least 10 characters needed ({userDescription.length}/10)</p>
                )}
              </div>

              {/* Voice Recording */}
              <div>
                <label className="field-label text-xs mb-1.5">
                  Or describe by voice
                  <span className="text-gray-400 font-normal ml-1">(optional)</span>
                </label>
                <VoiceRecorder onRecordingComplete={(blob, transcript) => { setAudioBlob(blob); setVoiceTranscript(transcript); }} />
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-[10px] text-gray-400 font-medium uppercase">Evidence</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              {/* Capture + Upload side by side */}
              <div className="grid grid-cols-2 gap-3">
                {/* Capture Page */}
                <button
                  onClick={capturePageScreenshot}
                  disabled={capturingPage}
                  className="border-2 border-dashed border-blue-300 rounded-lg p-4 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                >
                  {capturingPage ? (
                    <div className="flex items-center justify-center gap-2 text-blue-600">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="text-xs">Capturing...</span>
                    </div>
                  ) : (
                    <>
                      <svg className="w-7 h-7 mx-auto text-blue-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <p className="text-xs text-blue-600 font-medium">Capture Page</p>
                      <p className="text-[10px] text-blue-400">Screenshot + annotate</p>
                    </>
                  )}
                </button>

                {/* Upload File */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-primary-400 transition-colors"
                >
                  <svg className="w-7 h-7 mx-auto text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-xs text-gray-600 font-medium">Upload File</p>
                  <p className="text-[10px] text-gray-400">Image, PDF, etc.</p>
                </button>
                <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt" onChange={handleFileSelect} className="hidden" />
              </div>

              {/* Captured Screenshot Annotation Editor */}
              {annotatingCaptured && capturedScreenshotUrl && (
                <div className="border-2 border-blue-200 rounded-lg p-3 bg-blue-50/30">
                  <p className="text-xs font-medium text-blue-700 mb-2">
                    Annotate your screenshot — draw, arrows, text, or highlight
                  </p>
                  <ScreenshotAnnotator
                    imageUrl={capturedScreenshotUrl}
                    onSave={(blob) => {
                      setAnnotatedBlob(blob);
                      setAnnotatedPreviewUrl(URL.createObjectURL(blob));
                      setAnnotatingCaptured(false);
                    }}
                    onCancel={() => {
                      setAnnotatingCaptured(false);
                      fetch(capturedScreenshotUrl).then(r => r.blob()).then(blob => {
                        setFiles(prev => [...prev, new File([blob], 'page-screenshot.png', { type: 'image/png' })]);
                      });
                    }}
                  />
                </div>
              )}

              {/* File/Image Annotation Editor */}
              {annotatingIndex !== null && files[annotatingIndex] && isImage(files[annotatingIndex]) && (
                <div className="border-2 border-blue-200 rounded-lg p-3 bg-blue-50/30">
                  <p className="text-xs font-medium text-blue-700 mb-2">Annotating: {files[annotatingIndex].name}</p>
                  <ScreenshotAnnotator
                    imageUrl={URL.createObjectURL(files[annotatingIndex])}
                    onSave={(blob) => {
                      setAnnotatedBlob(blob);
                      setAnnotatedPreviewUrl(URL.createObjectURL(blob));
                      setAnnotatingIndex(null);
                    }}
                    onCancel={() => setAnnotatingIndex(null)}
                  />
                </div>
              )}

              {/* Attached files & previews */}
              {(files.length > 0 || annotatedPreviewUrl) && (
                <div className="space-y-2">
                  {files.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-xs">
                      {isImage(f) ? (
                        <img src={URL.createObjectURL(f)} alt="" className="w-10 h-10 object-cover rounded" />
                      ) : (
                        <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-[10px] text-gray-500">
                          {f.name.split('.').pop()?.toUpperCase()}
                        </div>
                      )}
                      <span className="flex-1 truncate text-gray-700">{f.name}</span>
                      {isImage(f) && (
                        <button onClick={() => setAnnotatingIndex(idx)} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 text-[10px]">
                          Annotate
                        </button>
                      )}
                      <button onClick={() => removeFile(idx)} className="text-gray-400 hover:text-red-500">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {annotatedPreviewUrl && (
                    <div className="p-2 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-[10px] text-green-600 font-medium mb-1">Annotated Screenshot</p>
                      <img src={annotatedPreviewUrl} alt="Annotated" className="max-w-full rounded max-h-32 object-contain" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 2: REVIEW ═══ */}
          {step === 'review' && editableReport && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                We&apos;ve analyzed your description. Review and adjust anything before submitting.
              </p>

              {/* Title */}
              <div>
                <label className="field-label text-xs">Title</label>
                <input
                  value={editableReport.title}
                  onChange={e => setEditableReport(prev => prev ? { ...prev, title: e.target.value } : null)}
                  className="input-field text-sm"
                />
              </div>

              {/* Type + Impact inline */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label text-xs">Issue Type</label>
                  <select value={issueType} onChange={e => setIssueType(e.target.value)} className="input-field text-sm">
                    {ISSUE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label text-xs">Business Impact</label>
                  <select value={businessImpact} onChange={e => setBusinessImpact(e.target.value)} className="input-field text-sm">
                    {IMPACT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Severity + Category inline */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label text-xs">Severity</label>
                  <select
                    value={editableReport.severity}
                    onChange={e => setEditableReport(prev => prev ? { ...prev, severity: e.target.value } : null)}
                    className="input-field text-sm"
                  >
                    {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label text-xs">Module / Category</label>
                  <input
                    value={editableReport.category}
                    onChange={e => setEditableReport(prev => prev ? { ...prev, category: e.target.value } : null)}
                    className="input-field text-sm"
                  />
                </div>
              </div>

              {/* Summary */}
              <div>
                <label className="field-label text-xs">Summary</label>
                <textarea
                  value={editableReport.summary}
                  onChange={e => setEditableReport(prev => prev ? { ...prev, summary: e.target.value } : null)}
                  rows={2}
                  className="input-field text-sm"
                />
              </div>

              {/* Steps to Reproduce */}
              <div>
                <label className="field-label text-xs">Steps to Reproduce</label>
                <div className="space-y-1">
                  {editableReport.stepsToReproduce.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-gray-400 w-4 text-right">{i + 1}.</span>
                      <input
                        value={s}
                        onChange={e => {
                          const u = [...editableReport.stepsToReproduce]; u[i] = e.target.value;
                          setEditableReport(prev => prev ? { ...prev, stepsToReproduce: u } : null);
                        }}
                        className="input-field text-xs flex-1 py-1.5"
                      />
                      <button
                        onClick={() => {
                          const u = editableReport.stepsToReproduce.filter((_, idx) => idx !== i);
                          setEditableReport(prev => prev ? { ...prev, stepsToReproduce: u } : null);
                        }}
                        className="text-gray-300 hover:text-red-500"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setEditableReport(prev => prev ? { ...prev, stepsToReproduce: [...prev.stepsToReproduce, ''] } : null)}
                    className="text-[10px] text-primary-600 hover:text-primary-700 font-medium ml-5"
                  >
                    + Add step
                  </button>
                </div>
              </div>

              {/* Expected / Actual */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label text-xs">Expected Result</label>
                  <textarea value={editableReport.expectedResult}
                    onChange={e => setEditableReport(prev => prev ? { ...prev, expectedResult: e.target.value } : null)}
                    rows={2} className="input-field text-xs" />
                </div>
                <div>
                  <label className="field-label text-xs">Actual Result</label>
                  <textarea value={editableReport.actualResult}
                    onChange={e => setEditableReport(prev => prev ? { ...prev, actualResult: e.target.value } : null)}
                    rows={2} className="input-field text-xs" />
                </div>
              </div>

              {/* Evidence summary */}
              {hasEvidence && (
                <div className="bg-gray-50 rounded-lg p-2.5 text-xs text-gray-500">
                  <span className="font-medium text-gray-600">Attached: </span>
                  {files.map(f => f.name).join(', ')}
                  {annotatedBlob ? (files.length > 0 ? ', ' : '') + 'Annotated screenshot' : ''}
                  {audioBlob ? ((files.length > 0 || annotatedBlob) ? ', ' : '') + 'Voice recording' : ''}
                </div>
              )}
            </div>
          )}

          {/* ═══ SUCCESS ═══ */}
          {step === 'success' && createdTicket && (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-heading font-bold text-gray-900 mb-1">Ticket Created!</h3>
              <p className="text-sm text-gray-500 mb-5">Your issue has been reported.</p>
              <div className="card p-4 text-left max-w-xs mx-auto space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Ticket</span>
                  <span className="font-bold text-primary-600">{createdTicket.ticketNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Status</span>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Submitted</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Severity</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${SEVERITY_COLORS[createdTicket.severity] || 'bg-gray-100'}`}>{createdTicket.severity}</span>
                </div>
              </div>
              <div className="mt-5 flex justify-center gap-3">
                <button onClick={handleClose} className="btn-secondary text-sm">Close</button>
                <a href="/dashboard/support" className="btn-primary text-sm">View My Tickets</a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'success' && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <div>
              {step === 'review' && (
                <button onClick={() => setStep('describe')} className="btn-secondary text-xs py-1.5 px-3">Back</button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={handleClose} className="btn-ghost text-xs">Cancel</button>
              {step === 'describe' && (
                <button onClick={goToReview} disabled={!canProceed || generatingReport} className="btn-primary text-xs py-1.5 px-4">
                  {generatingReport ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Analyzing...
                    </span>
                  ) : 'Next: Review'}
                </button>
              )}
              {step === 'review' && (
                <button onClick={submitTicket} disabled={submitting} className="btn-accent text-xs py-1.5 px-4">
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Submitting...
                    </span>
                  ) : 'Submit Ticket'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

// ─── Helpers ────────────────────────────────────────────────
function guessIssueType(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('crash') || d.includes('error') || d.includes('broken') || d.includes('not working')) return 'BUG';
  if (d.includes('slow') || d.includes('performance') || d.includes('timeout')) return 'PERFORMANCE_ISSUE';
  if (d.includes('ui') || d.includes('layout') || d.includes('display') || d.includes('alignment')) return 'UI_UX_ISSUE';
  if (d.includes('data') || d.includes('wrong number') || d.includes('incorrect')) return 'DATA_ISSUE';
  if (d.includes('how') || d.includes('help') || d.includes('question')) return 'QUESTION';
  if (d.includes('feature') || d.includes('request') || d.includes('wish') || d.includes('add')) return 'FEATURE_REQUEST';
  return 'BUG';
}

function impactFromSeverity(severity: string): string {
  const map: Record<string, string> = { CRITICAL: 'BLOCKING', HIGH: 'MAJOR', MEDIUM: 'MINOR', LOW: 'COSMETIC', INFO: 'SUGGESTION' };
  return map[severity] || 'MINOR';
}
