import type { RequestHandler } from 'express';
import type { AuthenticateRequestUseCase } from '../../../application/use-cases/auth/authenticate-request.use-case.js';
import { errors } from '../../../shared/errors/app-error.js';

/** Exige um access token válido no header Authorization: Bearer <token>. */
export function authenticate(authenticateRequest: AuthenticateRequestUseCase): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;

    if (!token) {
      next(errors.unauthenticated('UNAUTHENTICATED', 'Autenticação necessária.'));
      return;
    }

    try {
      req.auth = await authenticateRequest.execute(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}
