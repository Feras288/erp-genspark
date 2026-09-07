'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setAccessToken } from './api';
import type { SafeUser } from './auth-types';

interface AuthState {
  user: SafeUser | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasPermission: (key: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });

  const setLoaded = useCallback((user: SafeUser | null, error: string | null) => {
    setState({ user, loading: false, error });
    setAccessToken(null);
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const data = await api.refresh();
      setAccessToken(data.accessToken);
      setState({ user: data.user, loading: false, error: null });
    } catch {
      // No valid refresh cookie => unauthenticated.
      setLoaded(null, null);
    }
  }, [setLoaded]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.login(email, password);
      setAccessToken(data.accessToken);
      setState({ user: data.user, loading: false, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل تسجيل الدخول';
      setState({ user: null, loading: false, error: msg });
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore logout network errors: we still wipe local state
    }
    setAccessToken(null);
    setState({ user: null, loading: false, error: null });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api.refresh();
      setAccessToken(data.accessToken);
      setState((s) => ({ ...s, user: data.user, error: null }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'انتهت الجلسة';
      setAccessToken(null);
      setState({ user: null, loading: false, error: msg });
    }
  }, []);

  const hasPermission = useCallback(
    (key: string) => !!state.user?.permissions.includes(key),
    [state.user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      refresh,
      hasPermission,
    }),
    [state, login, logout, refresh, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
