'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, Label } from 'recharts';

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
  statusAmounts?: Record<string, number>;
};

const RADIAN = Math.PI / 180;

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

function renderCustomLabel({ cx, cy, midAngle, outerRadius, value, percent }: any) {
  if (percent < 0.05) return null;
  const radius = outerRadius + 16;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#374151" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fontWeight={600}>
      {value}
    </text>
  );
}

export default function InvoiceStatusDonut({ statusCounts, statusAmounts }: Props) {
  const data = Object.entries(statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      name: status.replace('_', ' '),
      rawStatus: status,
      value: count,
      amount: statusAmounts?.[status] || 0,
      color: STATUS_COLORS[status] || '#6B7280',
    }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">
        No invoice data available
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

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
          label={renderCustomLabel}
          labelLine={false}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
          <Label
            value={total}
            position="center"
            style={{ fontSize: '20px', fontWeight: 700, fill: '#1F2937' }}
          />
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem' }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{d.name}</div>
                <div>Count: {d.value}</div>
                {d.amount > 0 && <div>Amount: {formatCurrency(d.amount)}</div>}
              </div>
            );
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={44}
          iconType="circle"
          iconSize={8}
          formatter={(value, entry: any) => {
            const item = data.find(d => d.name === value);
            return (
              <span style={{ color: '#475569', fontSize: '0.7rem' }}>
                {value} {item && item.amount > 0 ? `(${formatCurrency(item.amount)})` : ''}
              </span>
            );
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
