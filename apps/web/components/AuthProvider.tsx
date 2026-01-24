'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

// Role types matching backend
export type Role = 'ADMIN' | 'COMPANY_MANAGER' | 'PHARMACY_ADMIN' | 'PHARMACY_USER' | 'READ_ONLY';
export type MemberRole = 'PHARMACY_ADMIN' | 'PHARMACY_USER' | 'READ_ONLY';

export type PharmacyMembership = {
  id: string;
  pharmacyId: string;
  memberRole: MemberRole;
  pharmacy: {
    id: string;
    name: string;
    code: string;
  };
};

export type Org = {
  id: string;
  name: string;
};

type User = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  orgId?: string;
  org?: Org;
  pharmacyMemberships?: PharmacyMembership[];
} | null;

type AuthContextShape = {
  user: User;
  loading: boolean;
  token: string | null;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextShape | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe() {
    try {
      const res = await apiFetch('/auth/me');
      if (res.ok) {
        const u = await res.json();
        setUser(u);
        return;
      }
    } catch (e) {
      // ignore
    }
    setUser(null);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (typeof window !== 'undefined') {
          const t = localStorage.getItem('pharmaopsflow_token');
          if (t) {
            setToken(t);
          }
        }
        if (!mounted) return;
        await fetchMe();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function loginWithToken(t: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pharmaopsflow_token', t);
    }
    setToken(t);
    setLoading(true);
    await fetchMe();
    setLoading(false);
  }

  function logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pharmaopsflow_token');
    }
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, token, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
