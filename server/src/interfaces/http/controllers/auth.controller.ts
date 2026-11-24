import type { RequestHandler } from 'express';
import type { GetCurrentUserUseCase } from '../../../application/use-cases/auth/get-current-user.use-case.js';
import type { LoginUseCase } from '../../../application/use-cases/auth/login.use-case.js';
import type { LogoutUseCase } from '../../../application/use-cases/auth/logout.use-case.js';
import type { RefreshSessionUseCase } from '../../../application/use-cases/auth/refresh-session.use-case.js';
import type { RegisterUserUseCase } from '../../../application/use-cases/auth/register-user.use-case.js';
import type { SetActiveCompanyUseCase } from '../../../application/use-cases/auth/set-active-company.use-case.js';
import { errors } from '../../../shared/errors/app-error.js';
import {
  type CookieSettings,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from '../cookies.js';
import {
  toAccessTokenResponse,
  toAuthResponse,
  toCompanyWithRoleDto,
  toUserDto,
} from '../presenters.js';
import type { LoginBody, RegisterBody, SetActiveCompanyBody } from '../validators/auth.schemas.js';

export interface AuthControllerDependencies {
  register: RegisterUserUseCase;
  login: LoginUseCase;
  refresh: RefreshSessionUseCase;
  logout: LogoutUseCase;
  getCurrentUser: GetCurrentUserUseCase;
  setActiveCompany: SetActiveCompanyUseCase;
  cookies: CookieSettings;
}

/** Controllers apenas traduzem HTTP ↔ casos de uso. Sem regras de negócio aqui. */
export function createAuthController(deps: AuthControllerDependencies) {
  const register: RequestHandler = async (req, res) => {
    const result = await deps.register.execute(req.body as RegisterBody);
    setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt, deps.cookies);
    res.status(201).json(toAuthResponse(result));
  };

  const login: RequestHandler = async (req, res) => {
    const result = await deps.login.execute(req.body as LoginBody);
    setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt, deps.cookies);
    res.json(toAuthResponse(result));
  };

  const refresh: RequestHandler = async (req, res) => {
    const tokens = await deps.refresh.execute(readRefreshCookie(req));
    setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt, deps.cookies);
    res.json(toAccessTokenResponse(tokens));
  };

  const logout: RequestHandler = async (req, res) => {
    await deps.logout.execute(readRefreshCookie(req));
    clearRefreshCookie(res, deps.cookies);
    res.status(204).end();
  };

  const me: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const user = await deps.getCurrentUser.execute(auth.userId);
    res.json({ user: toUserDto(user), activeCompanyId: auth.activeCompanyId });
  };

  const setActiveCompany: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId } = req.body as SetActiveCompanyBody;
    const membership = await deps.setActiveCompany.execute(auth, companyId);
    res.json(toCompanyWithRoleDto(membership));
  };

  return { register, login, refresh, logout, me, setActiveCompany };
}

export function requireAuth<T>(auth: T | undefined): T {
  if (!auth) {
    throw errors.unauthenticated('UNAUTHENTICATED', 'Autenticação necessária.');
  }
  return auth;
}
