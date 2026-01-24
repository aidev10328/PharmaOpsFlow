'use client';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export async function apiFetch(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> || {}),
  };

  // Add auth token if available
  try {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('pharmaopsflow_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch (e) {
    // ignore localStorage errors
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  });

  return res;
}
