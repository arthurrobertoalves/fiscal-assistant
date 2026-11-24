import type { RequestHandler } from 'express';
import { errors } from '../../../shared/errors/app-error.js';

/**
 * Defesa contra CSRF nas rotas que usam o cookie de refresh.
 * Navegadores sempre enviam o header Origin em requisições cross-site;
 * se ele existir e não estiver na lista permitida, a requisição é recusada.
 * Clientes sem navegador (sem Origin) seguem o fluxo normal.
 */
export function originGuard(allowedOrigins: string[]): RequestHandler {
  return (req, _res, next) => {
    const origin = req.headers.origin;
    if (origin === undefined || allowedOrigins.includes(origin)) {
      next();
      return;
    }
    next(errors.forbidden('Origem da requisição não permitida.'));
  };
}
