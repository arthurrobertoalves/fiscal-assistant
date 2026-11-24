import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';
// O cookie só é enviado às rotas de autenticação, reduzindo a superfície de exposição.
export const REFRESH_COOKIE_PATH = '/auth';

export interface CookieSettings {
  secure: boolean;
  /**
   * Em produção, frontend e API ficam em sites diferentes (ex.: Vercel e Render),
   * então o cookie precisa de SameSite=None (com Secure). A proteção CSRF
   * passa a depender do originGuard.
   */
  sameSite: 'lax' | 'none';
}

function baseOptions(settings: CookieSettings): CookieOptions {
  return {
    httpOnly: true,
    secure: settings.secure,
    sameSite: settings.sameSite,
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  settings: CookieSettings,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...baseOptions(settings), expires: expiresAt });
}

export function clearRefreshCookie(res: Response, settings: CookieSettings): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions(settings));
}

export function readRefreshCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' ? value : undefined;
}
