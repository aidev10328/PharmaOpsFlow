'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#9CA3AF',
  SUBMITTED: '#3B82F6',
  NEEDS_INFO: '#F59E0B',
  APPROVED: '#10B981',
  SCHEDULED: '#8B5CF6',
  PAID: '#059669',
  REJECTED: '#EF4444',
};

type Props = {
  statusCounts: Record<string, number>;
};

export default function InvoiceStatusDonut({ statusCounts }: Props) {
  const data = Object.entries(statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      name: status.replace('_', ' '),
      value: count,
      color: STATUS_COLORS[status] || '#6B7280',
    }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">
        No invoice data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [value ?? 0, name ?? '']}
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            fontSize: '0.875rem',
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          iconType="circle"
          iconSize={8}
          formatter={(value) => (
            <span style={{ color: '#475569', fontSize: '0.75rem' }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
