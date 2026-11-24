import { Router, type RequestHandler } from 'express';
import type { AuthenticateRequestUseCase } from '../../../application/use-cases/auth/authenticate-request.use-case.js';
import type { createWorkspaceController } from '../controllers/workspace.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { singleFileUpload } from '../middlewares/upload.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { companyParamsSchema } from '../validators/company.schemas.js';
import { createConversationSchema, sendMessageSchema } from '../validators/mvp.schemas.js';

export interface WorkspaceRouteOptions {
  controller: ReturnType<typeof createWorkspaceController>;
  authenticateRequest: AuthenticateRequestUseCase;
  maxUploadBytes: number;
}

/**
 * Rotas de documentos, painel e chat, sempre dentro de uma empresa (:companyId).
 * Todas exigem autenticação; a associação do usuário é verificada nos casos de uso.
 */
export function createWorkspaceRouter({ controller, authenticateRequest, maxUploadBytes }: WorkspaceRouteOptions): Router {
  const router = Router();
  const requireToken: RequestHandler = authenticate(authenticateRequest);
  const byCompany = validate({ params: companyParamsSchema });
  const upload = singleFileUpload(maxUploadBytes);

  // Documentos
  router.post('/:companyId/documents', requireToken, byCompany, upload, controller.upload);
  router.get('/:companyId/documents', requireToken, byCompany, controller.list);
  router.get('/:companyId/documents/:documentId', requireToken, controller.get);
  router.get('/:companyId/documents/:documentId/file', requireToken, controller.download);
  router.post('/:companyId/documents/:documentId/analysis', requireToken, controller.analyze);

  // Painel
  router.get('/:companyId/dashboard', requireToken, byCompany, controller.dashboard);

  // Chat
  router.post(
    '/:companyId/conversations',
    requireToken,
    byCompany,
    validate({ body: createConversationSchema }),
    controller.createConversation,
  );
  router.get('/:companyId/conversations', requireToken, byCompany, controller.listConversations);
  router.get('/:companyId/conversations/:conversationId/messages', requireToken, controller.getMessages);
  router.post(
    '/:companyId/conversations/:conversationId/messages',
    requireToken,
    validate({ body: sendMessageSchema }),
    controller.postMessage,
  );

  return router;
}
