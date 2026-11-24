import { Router } from 'express';
import type { AuthenticateRequestUseCase } from '../../../application/use-cases/auth/authenticate-request.use-case.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import type { createCompaniesController } from '../controllers/companies.controller.js';
import {
  addMemberSchema,
  companyParamsSchema,
  createCompanySchema,
  memberParamsSchema,
  updateCompanySchema,
} from '../validators/company.schemas.js';

export interface CompanyRouteOptions {
  controller: ReturnType<typeof createCompaniesController>;
  authenticateRequest: AuthenticateRequestUseCase;
}

/** Todas as rotas exigem autenticação. A autorização por empresa fica nos casos de uso. */
export function createCompaniesRouter({ controller, authenticateRequest }: CompanyRouteOptions): Router {
  const router = Router();
  const requireToken = authenticate(authenticateRequest);

  router.post('/', requireToken, validate({ body: createCompanySchema }), controller.create);
  router.get('/', requireToken, controller.list);
  // Declarada antes de "/:companyId" para não ser interpretada como um id.
  router.get('/active', requireToken, controller.getActive);
  router.get('/:companyId', requireToken, validate({ params: companyParamsSchema }), controller.get);
  router.patch(
    '/:companyId',
    requireToken,
    validate({ params: companyParamsSchema, body: updateCompanySchema }),
    controller.update,
  );
  router.get(
    '/:companyId/members',
    requireToken,
    validate({ params: companyParamsSchema }),
    controller.listMembers,
  );
  router.post(
    '/:companyId/members',
    requireToken,
    validate({ params: companyParamsSchema, body: addMemberSchema }),
    controller.addMember,
  );
  router.delete(
    '/:companyId/members/:userId',
    requireToken,
    validate({ params: memberParamsSchema }),
    controller.removeMember,
  );

  return router;
}
