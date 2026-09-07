// =====================================================
// refresh-token cookie helpers.
// path = "/api/auth" so the cookie is only sent to auth endpoints by
// the browser — min exposure. HttpOnly + sameSite=lax in dev.
// secure = true in production (NODE_ENV=production).
// =====================================================
import { Response } from 'express';

export interface SetRefreshCookieOptions {
  secure: boolean;
  maxAgeMs: number;
  name: string;
}

export function setRefreshCookie(
  res: Response,
  value: string,
  opts: SetRefreshCookieOptions,
) {
  res.cookie(opts.name, value, {
    httpOnly: true,
    secure: opts.secure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: opts.maxAgeMs,
  });
}

export function clearRefreshCookie(res: Response, name: string, secure: boolean) {
  res.clearCookie(name, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth',
  });
}
