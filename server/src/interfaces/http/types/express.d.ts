import type { AuthContext } from '../../../application/use-cases/auth/authenticate-request.use-case.js';

declare global {
  namespace Express {
    interface Request {
      /** Preenchido pelo middleware authenticate em rotas protegidas. */
      auth?: AuthContext;
    }
  }
}

export {};
