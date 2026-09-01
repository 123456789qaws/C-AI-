'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/* ============================================================
 * Types
 * ============================================================ */

export type AuthUser = {
  id: string;
  role: 'STUDENT' | 'TEACHER' | 'TA' | 'ADMIN';
  name: string;
};

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (id: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refresh: () => Promise<void>;
}

/* ============================================================
 * Constants & Helpers
 * ============================================================ */

const TOKEN_KEY = 'luna-token';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/* ============================================================
 * Context
 * ============================================================ */

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/* ============================================================
 * Provider
 * ============================================================ */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /** Re-fetch the current user from /api/auth/me using stored token. */
  const refresh = useCallback(async () => {
    const storedToken = getToken();
    if (!storedToken) {
      setUser(null);
      setTokenState(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${storedToken}` },
      });

      if (!res.ok) {
        // Token expired or invalid
        clearToken();
        setUser(null);
        setTokenState(null);
      } else {
        const data = (await res.json()) as { user: AuthUser };
        setUser(data.user);
        setTokenState(storedToken);
      }
    } catch {
      // Network error — keep user as null but don't clear token (might be transient)
      setUser(null);
      setTokenState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /** On mount: check for existing token and restore session. */
  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Login: POST /api/auth/login, store token, set user. Returns the user on success. */
  const login = useCallback(async (id: string, password: string): Promise<AuthUser> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password }),
    });

    const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };

    if (!res.ok) {
      throw new Error(data.error ?? '登录失败');
    }

    if (!data.token || !data.user) {
      throw new Error('服务器响应异常');
    }

    setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  /** Logout: clear token, reset user. */
  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setTokenState(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

/* ============================================================
 * Hook
 * ============================================================ */

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  // During SSR/SSG prerender, context is undefined — return safe defaults
  if (!ctx) {
    return {
      user: null,
      token: null,
      loading: true,
      login: async () => ({ id: '', role: 'STUDENT', name: '' }),
      logout: () => {},
      refresh: async () => {},
    };
  }
  return ctx;
}
