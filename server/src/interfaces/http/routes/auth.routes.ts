import { Router, type RequestHandler } from 'express';
import type { AuthenticateRequestUseCase } from '../../../application/use-cases/auth/authenticate-request.use-case.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { originGuard } from '../middlewares/origin-guard.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { loginSchema, registerSchema, setActiveCompanySchema } from '../validators/auth.schemas.js';
import type { createAuthController } from '../controllers/auth.controller.js';

export interface AuthRouteOptions {
  controller: ReturnType<typeof createAuthController>;
  authenticateRequest: AuthenticateRequestUseCase;
  limiters: { credentials: RequestHandler; refresh: RequestHandler };
  allowedOrigins: string[];
}

export function createAuthRouter({
  controller,
  authenticateRequest,
  limiters,
  allowedOrigins,
}: AuthRouteOptions): Router {
  const router = Router();
  const requireToken = authenticate(authenticateRequest);
  const checkOrigin = originGuard(allowedOrigins);

  router.post(
    '/register',
    limiters.credentials,
    validate({ body: registerSchema }),
    controller.register,
  );
  router.post('/login', limiters.credentials, validate({ body: loginSchema }), controller.login);
  router.post('/refresh', limiters.refresh, checkOrigin, controller.refresh);
  router.post('/logout', checkOrigin, controller.logout);
  router.get('/me', requireToken, controller.me);
  router.put(
    '/active-company',
    requireToken,
    validate({ body: setActiveCompanySchema }),
    controller.setActiveCompany,
  );

  return router;
}
