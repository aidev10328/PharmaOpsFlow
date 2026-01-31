import './globals.css';
import React from 'react';
import { AuthProvider } from '../components/AuthProvider';
import Nav from '../components/Nav';

export const metadata = {
  title: 'PharmaOpsFlow',
  description: 'Multi-pharmacy invoice intake and processing system with role-based access, AI-assisted invoice capture, deadline tracking (5th/10th), centralized approvals/payments, dashboards by pharmacy, and a manager chatbot for search and insights.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-gray-900 font-sans">
        <AuthProvider>
          <div className="min-h-screen flex flex-col">
            <Nav />
            <main className="flex-1 py-6 lg:py-8">
              <div className="container">
                {children}
              </div>
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
