'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  status: string;
  entryMethod?: 'MANUAL' | 'AI_EXTRACTION';
  vendor: { id: string; name: string; code?: string };
  invoiceType: { id: string; name: string };
  pharmacy?: { id: string; name: string; code?: string };
  requirementInstances?: {
    id: string;
    requirement: { id: string; name: string };
    periodLabel: string;
  }[];
};

type PendingInstance = {
  id: string;
  requirementId: string;
  requirement: {
    id: string;
    name: string;
    pharmacy: { id: string; name: string; code: string };
    vendor: { id: string; name: string } | null;
    invoiceType: { id: string; name: string } | null;
  };
  invoiceId: string | null;
  periodLabel: string;
  submissionDeadline: string;
  status: 'PENDING' | 'SUBMITTED' | 'PROCESSED' | 'OVERDUE' | 'MISSED';
};

type Props = {
  invoices: Invoice[];
  pendingInstances?: PendingInstance[];
  monthFilter: string;
  selectedPharmacyId?: string;
  isManager: boolean;
  formatCurrency: (amount: string | number) => string;
  basePath?: string; // e.g. '/dashboard/pharmacy/invoices' or '/dashboard/manager/invoices'
  onMonthChange?: (month: string) => void;
};

const STATUS_COLORS: Record<string, string> = {
  PENDING_UPLOAD: 'bg-yellow-500',
  DRAFT: 'bg-slate-400',
  SUBMITTED: 'bg-blue-500',
  NEEDS_INFO: 'bg-amber-500',
  APPROVED: 'bg-emerald-500',
  SCHEDULED: 'bg-violet-500',
  PAID: 'bg-green-500',
  REJECTED: 'bg-red-500',
  OVERDUE: 'bg-orange-500',
};

const STATUS_BG: Record<string, string> = {
  PENDING_UPLOAD: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  DRAFT: 'bg-slate-50 border-slate-200 text-slate-700',
  SUBMITTED: 'bg-blue-50 border-blue-200 text-blue-800',
  NEEDS_INFO: 'bg-amber-50 border-amber-200 text-amber-800',
  APPROVED: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  SCHEDULED: 'bg-violet-50 border-violet-200 text-violet-800',
  PAID: 'bg-green-50 border-green-200 text-green-800',
  REJECTED: 'bg-red-50 border-red-200 text-red-800',
  OVERDUE: 'bg-orange-50 border-orange-200 text-orange-800',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_UPLOAD: 'Pending Upload',
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  NEEDS_INFO: 'Needs Info',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  PAID: 'Paid',
  REJECTED: 'Rejected',
  OVERDUE: 'Overdue',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function InvoiceCalendarView({
  invoices,
  pendingInstances = [],
  monthFilter,
  selectedPharmacyId,
  isManager,
  formatCurrency,
  basePath = '/dashboard/pharmacy/invoices',
  onMonthChange,
}: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; invoice?: Invoice; instance?: PendingInstance } | null>(null);

  const calendarData = useMemo(() => {
    const [year, month] = monthFilter.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days: { date: number | null; isToday: boolean }[] = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ date: null, isToday: false });
    }

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month - 1;

    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        date: d,
        isToday: isCurrentMonth && today.getDate() === d,
      });
    }

    // Pad trailing cells to complete the last row
    while (days.length % 7 !== 0) {
      days.push({ date: null, isToday: false });
    }

    const invoicesByDate: Record<number, Invoice[]> = {};
    for (const inv of invoices) {
      if (isManager && inv.status === 'DRAFT') continue;
      const dt = new Date(inv.dueDate);
      if (dt.getFullYear() === year && dt.getMonth() === month - 1) {
        const day = dt.getDate();
        if (!invoicesByDate[day]) invoicesByDate[day] = [];
        invoicesByDate[day].push(inv);
      }
    }

    const instancesByDate: Record<number, PendingInstance[]> = {};
    if (!isManager) {
      for (const inst of pendingInstances) {
        const dt = new Date(inst.submissionDeadline);
        if (dt.getFullYear() === year && dt.getMonth() === month - 1) {
          const day = dt.getDate();
          if (!instancesByDate[day]) instancesByDate[day] = [];
          instancesByDate[day].push(inst);
        }
      }
    }

    const totalRows = days.length / 7;
    return { days, invoicesByDate, instancesByDate, year, month, totalRows };
  }, [invoices, pendingInstances, monthFilter, isManager]);

  const { days, invoicesByDate, instancesByDate, year, month, totalRows } = calendarData;

  const monthLabel = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const goToPrevMonth = () => {
    if (!onMonthChange) return;
    const d = new Date(year, month - 2, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const goToNextMonth = () => {
    if (!onMonthChange) return;
    const d = new Date(year, month, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const goToToday = () => {
    if (!onMonthChange) return;
    const now = new Date();
    onMonthChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleItemMouseEnter = (e: React.MouseEvent, invoice?: Invoice, instance?: PendingInstance) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top - 4,
      invoice,
      instance,
    });
  };

  const handleItemMouseLeave = () => {
    setTooltip(null);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="card overflow-hidden flex flex-col" style={{ height: `calc(100vh - 280px)`, minHeight: '400px' }}>
      {/* Header with month nav + legend */}
      <div className="px-3 py-2 border-b border-gray-300 bg-slate-50 flex items-center gap-3 flex-shrink-0">
        {/* Month navigation */}
        {onMonthChange && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={goToPrevMonth}
              className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
              title="Previous month"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-xs font-semibold text-gray-800 min-w-[120px] text-center">{monthLabel}</span>
            <button
              onClick={goToNextMonth}
              className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
              title="Next month"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={goToToday}
              className="ml-1 px-2 py-0.5 rounded text-[10px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-200 border border-gray-300 transition-colors"
            >
              Today
            </button>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap ml-auto">
          {[
            { label: 'Pending', color: 'bg-yellow-500' },
            { label: 'Overdue', color: 'bg-red-500' },
            { label: 'Submitted', color: 'bg-blue-500' },
            { label: 'Approved', color: 'bg-emerald-500' },
            { label: 'Scheduled', color: 'bg-violet-500' },
            { label: 'Paid', color: 'bg-green-500' },
            { label: 'Draft', color: 'bg-slate-400' },
            { label: 'Rejected', color: 'bg-red-500' },
          ].map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className={`w-2 h-2 rounded-full ${color}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-300 bg-slate-100 flex-shrink-0">
        {DAY_NAMES.map((day) => (
          <div key={day} className="px-2 py-1.5 text-[10px] font-semibold text-gray-600 uppercase tracking-wider text-center border-r border-gray-300 last:border-r-0">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid - fills remaining space */}
      <div className="grid grid-cols-7 flex-1 min-h-0" style={{ gridTemplateRows: `repeat(${totalRows}, minmax(0, 1fr))` }}>
        {days.map((day, idx) => {
          const dayInvoices = day.date ? invoicesByDate[day.date] || [] : [];
          const dayInstances = day.date ? instancesByDate[day.date] || [] : [];
          const hasItems = dayInvoices.length > 0 || dayInstances.length > 0;
          const now = new Date();

          return (
            <div
              key={idx}
              className={`border-b border-r border-gray-300 p-1 flex flex-col transition-colors ${
                day.date === null
                  ? 'bg-gray-100/60'
                  : day.isToday
                    ? 'bg-primary-50/50'
                    : hasItems
                      ? 'bg-white hover:bg-gray-50/50'
                      : 'bg-white'
              }`}
            >
              {day.date !== null && (
                <>
                  <div className="flex items-center justify-between mb-0.5 flex-shrink-0">
                    <span
                      className={`text-[11px] font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                        day.isToday
                          ? 'bg-primary-600 text-white'
                          : 'text-gray-600'
                      }`}
                    >
                      {day.date}
                    </span>
                    {hasItems && (
                      <span className="text-[9px] text-gray-400">
                        {dayInvoices.length + dayInstances.length}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {/* Pending instances */}
                    {dayInstances.map((inst) => {
                      const isOverdue = inst.status === 'OVERDUE' || new Date(inst.submissionDeadline) < now;
                      return (
                        <Link
                          key={`inst-${inst.id}`}
                          href={`/dashboard/pharmacy/invoices/new?pharmacyId=${selectedPharmacyId}&instanceId=${inst.id}`}
                          className={`block mb-0.5 px-1 py-px rounded text-[9px] leading-tight border truncate ${
                            isOverdue
                              ? 'bg-red-50 border-red-300 text-red-700'
                              : 'bg-yellow-50 border-yellow-300 text-yellow-700'
                          } hover:shadow-sm transition-shadow`}
                          onMouseEnter={(e) => handleItemMouseEnter(e, undefined, inst)}
                          onMouseLeave={handleItemMouseLeave}
                        >
                          <span className="flex items-center gap-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOverdue ? 'bg-red-500' : 'bg-yellow-500'}`} />
                            <span className="truncate">{inst.requirement.vendor?.name || inst.requirement.name}</span>
                          </span>
                        </Link>
                      );
                    })}

                    {/* Invoices */}
                    {dayInvoices.map((inv) => (
                      <Link
                        key={inv.id}
                        href={`${basePath}/${inv.id}`}
                        className={`block mb-0.5 px-1 py-px rounded text-[9px] leading-tight border truncate ${
                          STATUS_BG[inv.status] || 'bg-gray-50 border-gray-200 text-gray-700'
                        } hover:shadow-sm transition-shadow`}
                        onMouseEnter={(e) => handleItemMouseEnter(e, inv)}
                        onMouseLeave={handleItemMouseLeave}
                      >
                        <span className="flex items-center gap-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_COLORS[inv.status] || 'bg-gray-400'}`} />
                          <span className="truncate font-medium">
                            {inv.vendor?.name?.substring(0, 10) || 'Unknown'}
                          </span>
                          <span className="ml-auto text-[8px] tabular-nums opacity-70 flex-shrink-0">
                            {formatCurrency(inv.amount).replace('$', '')}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (tooltip.invoice || tooltip.instance) && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="bg-gray-900 text-white rounded-lg shadow-xl px-3 py-2 text-[11px] max-w-[260px] whitespace-nowrap">
            {tooltip.invoice && (
              <div className="space-y-0.5">
                <div className="font-semibold">{tooltip.invoice.invoiceNumber || 'Draft Invoice'}</div>
                <div className="text-gray-300">Vendor: {tooltip.invoice.vendor?.name || 'Unknown'}</div>
                {tooltip.invoice.pharmacy && <div className="text-gray-300">Pharmacy: {tooltip.invoice.pharmacy.name}</div>}
                <div className="text-gray-300">Type: {tooltip.invoice.invoiceType?.name}</div>
                <div className="text-gray-300">Amount: <span className="text-white font-medium">{formatCurrency(tooltip.invoice.amount)}</span></div>
                <div className="text-gray-300">Due: {formatDate(tooltip.invoice.dueDate)}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[tooltip.invoice.status] || 'bg-gray-400'}`} />
                  <span className="font-medium">{STATUS_LABEL[tooltip.invoice.status] || tooltip.invoice.status}</span>
                </div>
              </div>
            )}
            {tooltip.instance && (
              <div className="space-y-0.5">
                <div className="font-semibold">{tooltip.instance.requirement.name}</div>
                <div className="text-gray-300">Vendor: {tooltip.instance.requirement.vendor?.name || 'N/A'}</div>
                <div className="text-gray-300">Period: {tooltip.instance.periodLabel}</div>
                <div className="text-gray-300">Deadline: {formatDate(tooltip.instance.submissionDeadline)}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    tooltip.instance.status === 'OVERDUE' || new Date(tooltip.instance.submissionDeadline) < new Date()
                      ? 'bg-red-500' : 'bg-yellow-500'
                  }`} />
                  <span className="font-medium">
                    {tooltip.instance.status === 'OVERDUE' || new Date(tooltip.instance.submissionDeadline) < new Date()
                      ? 'Overdue' : 'Pending Upload'}
                  </span>
                </div>
              </div>
            )}
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      )}
    </div>
  );
}
