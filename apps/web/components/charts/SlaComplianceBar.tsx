'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type PharmacyCompliance = {
  pharmacyName: string;
  pharmacyCode: string;
  complianceRate: number;
};

type Props = {
  pharmacies: PharmacyCompliance[];
};

function getBarColor(compliance: number): string {
  if (compliance >= 80) return '#059669';
  if (compliance >= 50) return '#F59E0B';
  return '#EF4444';
}

export default function SlaComplianceBar({ pharmacies }: Props) {
  if (pharmacies.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">
        No compliance data available
      </div>
    );
  }

  const data = pharmacies.map((p) => ({
    name: p.pharmacyCode,
    fullName: p.pharmacyName,
    compliance: p.complianceRate,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 12, fill: '#94A3B8' }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={50}
          tick={{ fontSize: 11, fill: '#475569' }}
        />
        <Tooltip
          formatter={(value) => [`${value ?? 0}%`, 'Compliance']}
          labelFormatter={(label) => {
            const item = data.find((d) => d.name === label);
            return item?.fullName || label;
          }}
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            fontSize: '0.875rem',
          }}
        />
        <Bar dataKey="compliance" radius={[0, 4, 4, 0]} barSize={20}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getBarColor(entry.compliance)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
