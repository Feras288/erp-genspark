// =====================================================
// Frontend HTTP client.
// - baseURL = NEXT_PUBLIC_API_URL (falls back to http://localhost:3001/api)
// - credentials: 'include' so the HttpOnly refresh cookie is sent
// - Authorization: Bearer <accessToken> if accessToken is set in-memory
// - On 401, try /auth/refresh once; on success, replay original request.
// - NEVER uses localStorage / sessionStorage.
// - The access token is held in an in-memory store, NOT a module-level global.
// =====================================================
import type { SafeUser } from './auth-types';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let _accessToken: string | null = null;
const _listeners = new Set<(t: string | null) => void>();

export function setAccessToken(token: string | null) {
  _accessToken = token;
  for (const fn of _listeners) fn(token);
}
export function getAccessToken(): string | null {
  return _accessToken;
}
export function onAccessTokenChange(fn: (t: string | null) => void): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

const BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:3001/api';

interface RequestOptions {
  method?: string;
  body?: unknown;
  retryOn401?: boolean;
  signal?: AbortSignal;
}

async function rawRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (_accessToken) headers.Authorization = `Bearer ${_accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    credentials: 'include',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      try {
        body = await res.text();
      } catch {
        body = null;
      }
    }
    throw new ApiError(
      (body && typeof body === 'object' && 'message' in (body as object)
        ? String((body as { message: unknown }).message)
        : `HTTP ${res.status}`),
      res.status,
      body,
    );
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && opts.retryOn401 !== false) {
      // try refresh once
      try {
        const r = await rawRequest<{ accessToken: string; user: SafeUser }>(
          '/auth/refresh',
          { method: 'POST', retryOn401: false },
        );
        setAccessToken(r.accessToken);
        return await rawRequest<T>(path, { ...opts, retryOn401: false });
      } catch (refreshErr) {
        setAccessToken(null);
        throw err; // surface the original 401
      }
    }
    throw err;
  }
}

export const api = {
  login: (email: string, password: string) =>
    apiRequest<{ accessToken: string; user: SafeUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      retryOn401: false,
    }),
  refresh: () =>
    apiRequest<{ accessToken: string; user: SafeUser }>('/auth/refresh', {
      method: 'POST',
      retryOn401: false,
    }),
  logout: () =>
    apiRequest<void>('/auth/logout', { method: 'POST', retryOn401: false }),
  me: () => apiRequest<SafeUser>('/auth/me'),
  listUsers: (page = 1, pageSize = 20, search?: string) => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) q.set('search', search);
    return apiRequest<{ total: number; page: number; pageSize: number; items: SafeUser[] }>(
      `/users?${q.toString()}`,
    );
  },
};
