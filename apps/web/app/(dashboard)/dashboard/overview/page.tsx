'use client';

import { useAuth } from '../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function OverviewPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2 text-gray-400">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-6 lg:-my-8">
      <style jsx>{`
        .ov {
          --bg: #0b1120;
          --card: #111827;
          --card-light: #1a2332;
          --border: #1e293b;
          --text: #e2e8f0;
          --text-dim: #94a3b8;
          --text-muted: #64748b;
          --blue: #3b82f6;
          --purple: #8b5cf6;
          --emerald: #10b981;
          --amber: #f59e0b;
          --rose: #ef4444;
          --cyan: #06b6d4;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          padding: 0;
        }
        .ov * { box-sizing: border-box; margin: 0; }
        .ov-wrap { max-width: 1280px; margin: 0 auto; padding: 60px 64px; }

        /* ── Hero ── */
        .ov-hero { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; margin-bottom: 56px; }
        .ov-hero-left {}
        .ov-hero-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: var(--blue); margin-bottom: 12px; }
        .ov-hero-title { font-size: 32px; font-weight: 800; line-height: 1.2; margin-bottom: 16px; color: #fff; }
        .ov-hero-desc { font-size: 14px; color: var(--text-dim); line-height: 1.7; margin-bottom: 20px; }
        .ov-badges { display: flex; flex-wrap: wrap; gap: 8px; }
        .ov-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-dim);
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 100px;
          padding: 6px 14px;
        }
        .ov-hero-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .ov-hero-metric {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 28px 24px;
        }
        .ov-hero-metric-val { font-size: 28px; font-weight: 800; margin-bottom: 2px; }
        .ov-hero-metric-label { font-size: 12px; color: var(--text-muted); }

        /* ── Section ── */
        .ov-section { margin-bottom: 56px; }
        .ov-section-title {
          font-size: 18px;
          font-weight: 800;
          margin-bottom: 20px;
          color: #fff;
          border-bottom: 1px solid var(--border);
          padding-bottom: 12px;
        }

        /* ── 3-col middle ── */
        .ov-mid { display: grid; grid-template-columns: 1fr 1.4fr 1fr; gap: 28px; margin-bottom: 56px; }
        .ov-mid-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 32px;
        }
        .ov-mid-card h3 {
          font-size: 16px;
          font-weight: 800;
          color: #fff;
          margin-bottom: 16px;
        }
        .ov-mid-card ul { list-style: none; }
        .ov-mid-card li {
          font-size: 13px;
          color: var(--text-dim);
          padding: 8px 0;
          line-height: 1.5;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .ov-mid-card li::before {
          content: '\u2022';
          color: var(--blue);
          font-size: 16px;
          line-height: 1;
          flex-shrink: 0;
          margin-top: 2px;
        }

        /* ── Flow ── */
        .ov-flow-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .ov-flow-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 10px;
          background: var(--card-light);
        }
        .ov-flow-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
        }
        .ov-flow-text h4 { font-size: 12px; font-weight: 700; color: #fff; }
        .ov-flow-text p { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
        .ov-flow-arrow {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: var(--blue);
          padding: 0 2px;
        }

        /* Flow row: item -> arrow -> item -> arrow -> item */
        .ov-flow-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .ov-flow-row .ov-flow-item { flex: 1; }

        /* ── Target tags ── */
        .ov-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
        .ov-tag {
          font-size: 11px;
          font-weight: 600;
          color: var(--blue);
          background: rgba(59,130,246,0.1);
          border: 1px solid rgba(59,130,246,0.2);
          border-radius: 100px;
          padding: 6px 14px;
        }
        .ov-target-desc { font-size: 13px; color: var(--text-dim); line-height: 1.6; }

        /* ── Roles ── */
        .ov-roles { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
        .ov-role {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 24px 20px;
        }
        .ov-role h4 {
          font-size: 12px;
          font-weight: 800;
          color: #fff;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .ov-role p {
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.5;
        }

        /* ── Bottom 2-col ── */
        .ov-bottom { display: grid; grid-template-columns: 1.2fr 1fr; gap: 28px; }
        .ov-bottom-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 32px;
        }
        .ov-bottom-card h3 {
          font-size: 16px;
          font-weight: 800;
          color: #fff;
          margin-bottom: 20px;
        }

        /* ── Compare table ── */
        .ov-cmp-table { width: 100%; border-collapse: collapse; }
        .ov-cmp-table th {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-muted);
          text-align: left;
          padding: 0 12px 12px;
          border-bottom: 1px solid var(--border);
        }
        .ov-cmp-table td {
          font-size: 11px;
          color: var(--text-dim);
          padding: 12px;
          border-bottom: 1px solid rgba(30,41,59,0.5);
          vertical-align: top;
        }
        .ov-cmp-table tr:last-child td { border-bottom: none; }
        .ov-cmp-table .ov-cmp-feat { font-weight: 600; color: var(--text); }
        .ov-cmp-yes { color: var(--emerald); }
        .ov-cmp-no { color: var(--text-muted); opacity: 0.5; }

        /* ── Exec value list ── */
        .ov-exec-list { list-style: none; }
        .ov-exec-list li {
          font-size: 13px;
          color: var(--text-dim);
          padding: 10px 0;
          line-height: 1.5;
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .ov-exec-list li::before {
          content: '\u2713';
          color: var(--emerald);
          font-weight: 700;
          font-size: 12px;
          flex-shrink: 0;
          margin-top: 2px;
        }

        @media (max-width: 900px) {
          .ov-hero { grid-template-columns: 1fr; }
          .ov-mid { grid-template-columns: 1fr; }
          .ov-roles { grid-template-columns: repeat(2, 1fr); }
          .ov-bottom { grid-template-columns: 1fr; }
          .ov-flow-row { flex-direction: column; }
        }
        @media (max-width: 600px) {
          .ov-wrap { padding: 40px 28px; }
          .ov-hero-title { font-size: 24px; }
          .ov-roles { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="ov">
        <div className="ov-wrap">

          {/* ════ HERO ════ */}
          <div className="ov-hero">
            <div className="ov-hero-left">
              <div className="ov-hero-label">PharmaOpsFlow</div>
              <h1 className="ov-hero-title">AI-Powered Invoice Operations for Multi-Pharmacy Organizations</h1>
              <p className="ov-hero-desc">
                A centralized operations platform for pharmacy groups managing 5–50+ locations.
                PharmaOpsFlow automates invoice intake, extraction, approvals, SLA tracking, compliance
                monitoring, and audit visibility — replacing spreadsheets, emails, and manual follow-up.
              </p>
              <div className="ov-badges">
                <span className="ov-badge">Multi-Pharmacy Management</span>
                <span className="ov-badge">AI Invoice Extraction</span>
                <span className="ov-badge">5th / 10th SLA Tracking</span>
                <span className="ov-badge">Approval Workflows</span>
                <span className="ov-badge">Audit Trail</span>
                <span className="ov-badge">n8n Automation</span>
              </div>
            </div>
            <div className="ov-hero-metrics">
              <div className="ov-hero-metric">
                <div className="ov-hero-metric-val" style={{ color: 'var(--blue)' }}>15–20 hrs</div>
                <div className="ov-hero-metric-label">saved per week with AI</div>
              </div>
              <div className="ov-hero-metric">
                <div className="ov-hero-metric-val" style={{ color: 'var(--emerald)' }}>80%+</div>
                <div className="ov-hero-metric-label">reduction in data-entry errors</div>
              </div>
              <div className="ov-hero-metric">
                <div className="ov-hero-metric-val" style={{ color: 'var(--purple)' }}>100%</div>
                <div className="ov-hero-metric-label">invoice lifecycle audit trail</div>
              </div>
              <div className="ov-hero-metric">
                <div className="ov-hero-metric-val" style={{ color: 'var(--amber)' }}>0 Missed</div>
                <div className="ov-hero-metric-label">deadlines with SLA reminders</div>
              </div>
            </div>
          </div>

          {/* ════ 3-COL MIDDLE ════ */}
          <div className="ov-mid">
            {/* Problems It Solves */}
            <div className="ov-mid-card">
              <h3>Problems It Solves</h3>
              <ul>
                <li>Manual invoice collection across multiple pharmacy locations</li>
                <li>Missed submission and approval deadlines causing late fees</li>
                <li>No central visibility for managers and admins</li>
                <li>Data-entry mistakes, duplicate invoices, and wrong amounts</li>
                <li>No audit trail for disputes, approvals, or resubmissions</li>
                <li>No structured SLA enforcement across pharmacies</li>
              </ul>
            </div>

            {/* End-to-End Invoice Flow */}
            <div className="ov-mid-card">
              <h3>End-to-End Invoice Flow</h3>
              {/* Row 1: Upload -> AI Extract -> Review -> Approve */}
              <div className="ov-flow-row">
                <div className="ov-flow-item">
                  <div className="ov-flow-icon" style={{ background: 'rgba(59,130,246,0.15)' }}>
                    <span>&#x1F4E4;</span>
                  </div>
                  <div className="ov-flow-text">
                    <h4>Upload</h4>
                    <p>PDF / image / bulk invoices</p>
                  </div>
                </div>
                <div className="ov-flow-arrow">&#x27A1;&#xFE0F;</div>
                <div className="ov-flow-item">
                  <div className="ov-flow-icon" style={{ background: 'rgba(139,92,246,0.15)' }}>
                    <span>&#x1F4CB;</span>
                  </div>
                  <div className="ov-flow-text">
                    <h4>AI Extract</h4>
                    <p>Vendor, amount, dates, type, confidence</p>
                  </div>
                </div>
              </div>
              <div className="ov-flow-row">
                <div className="ov-flow-item">
                  <div className="ov-flow-icon" style={{ background: 'rgba(16,185,129,0.15)' }}>
                    <span>&#x2705;</span>
                  </div>
                  <div className="ov-flow-text">
                    <h4>Review</h4>
                    <p>User validates and submits</p>
                  </div>
                </div>
                <div className="ov-flow-arrow">&#x27A1;&#xFE0F;</div>
                <div className="ov-flow-item">
                  <div className="ov-flow-icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
                    <span>&#x1F44D;</span>
                  </div>
                  <div className="ov-flow-text">
                    <h4>Approve</h4>
                    <p>Manager/Admin approves or requests info</p>
                  </div>
                </div>
              </div>
              <div className="ov-flow-row">
                <div className="ov-flow-item">
                  <div className="ov-flow-icon" style={{ background: 'rgba(6,182,212,0.15)' }}>
                    <span>&#x1F4B3;</span>
                  </div>
                  <div className="ov-flow-text">
                    <h4>Pay</h4>
                    <p>Payment scheduled and marked paid</p>
                  </div>
                </div>
                <div className="ov-flow-arrow">&#x27A1;&#xFE0F;</div>
                <div className="ov-flow-item">
                  <div className="ov-flow-icon" style={{ background: 'rgba(139,92,246,0.15)' }}>
                    <span>&#x1F4C5;</span>
                  </div>
                  <div className="ov-flow-text">
                    <h4>SLA Track</h4>
                    <p>Deadlines monitored at every stage</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Target Customer */}
            <div className="ov-mid-card">
              <h3>Target Customer</h3>
              <div className="ov-tags">
                <span className="ov-tag">Independent pharmacy groups</span>
                <span className="ov-tag">Pharmacy management orgs</span>
                <span className="ov-tag">5–50+ locations</span>
                <span className="ov-tag">Centralized AP teams</span>
                <span className="ov-tag">Recurring vendor invoices</span>
                <span className="ov-tag">SLA-driven operations</span>
              </div>
              <p className="ov-target-desc">
                Ideal for organizations handling rent, utilities, insurance, and wholesale vendor invoices
                across many pharmacy locations with shared back-office operations.
              </p>
            </div>
          </div>

          {/* ════ ROLE-BASED OPERATING MODEL ════ */}
          <div className="ov-section">
            <div className="ov-section-title">Role-Based Operating Model</div>
            <div className="ov-roles">
              <div className="ov-role">
                <h4>Admin</h4>
                <p>Full system control — users, pharmacies, platform configuration, notifications, SLA rules, and org-wide oversight.</p>
              </div>
              <div className="ov-role">
                <h4>Company Manager</h4>
                <p>Reviews invoices across assigned pharmacies, approves/rejects, monitors compliance, and resolves exceptions.</p>
              </div>
              <div className="ov-role">
                <h4>Pharmacy Admin</h4>
                <p>Manages submission readiness, requirement schedules, and invoice operations for a pharmacy location.</p>
              </div>
              <div className="ov-role">
                <h4>Pharmacy User</h4>
                <p>Uploads invoices, reviews AI extraction, submits for approval, and tracks deadlines and status.</p>
              </div>
              <div className="ov-role">
                <h4>Read Only</h4>
                <p>View-only access to assigned locations, invoices, requirements, and dashboards for oversight and reporting.</p>
              </div>
            </div>
          </div>

          {/* ════ BOTTOM 2-COL ════ */}
          <div className="ov-bottom">
            {/* Why PharmaOpsFlow Wins */}
            <div className="ov-bottom-card">
              <h3>Why PharmaOpsFlow Wins</h3>
              <table className="ov-cmp-table">
                <thead>
                  <tr>
                    <th>PharmaOpsFlow</th>
                    <th>Generic AP Tools</th>
                    <th>Pharmacy Systems</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="ov-cmp-feat">Built for multi-pharmacy organizations with location hierarchy and role-based oversight</td>
                    <td>Mostly generic AP; not designed for multi-location pharmacy operations</td>
                    <td>Usually focused on dispensing/workflows, not AP operations</td>
                  </tr>
                  <tr>
                    <td className="ov-cmp-feat">AI extraction using multiple providers and confidence scoring</td>
                    <td>Single provider or limited OCR</td>
                    <td>Usually none</td>
                  </tr>
                  <tr>
                    <td className="ov-cmp-feat">5th / 10th SLA tracking with reminders and per-pharmacy overrides</td>
                    <td>Basic due dates; no pharmacy-specific SLA logic</td>
                    <td>Not available</td>
                  </tr>
                  <tr>
                    <td className="ov-cmp-feat">Invoice requirement scheduling by pharmacy and frequency</td>
                    <td>Manual reminders</td>
                    <td>Not available</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Executive Value */}
            <div className="ov-bottom-card">
              <h3>Executive Value</h3>
              <ul className="ov-exec-list">
                <li>Real-time visibility into invoice counts, total amounts, SLA rates, and exceptions</li>
                <li>Automated reminders on the 3rd, 4th, 8th, and 9th before deadlines are missed</li>
                <li>Faster onboarding of new pharmacies with pre-defined invoice requirements</li>
                <li>Dispute handling with full timeline of submit, review, reject, resubmit, and approve actions</li>
                <li>Natural-language manager chatbot for cross-pharmacy invoice insights</li>
                <li>n8n automation backbone for extraction, reminders, SLA checks, and escalations</li>
              </ul>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
