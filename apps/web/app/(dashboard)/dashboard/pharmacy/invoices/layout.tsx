import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default function InvoicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense fallback={<div className="text-gray-500">Loading...</div>}>{children}</Suspense>;
}
