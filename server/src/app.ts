import cors from 'cors';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import type { Container } from './composition/container.js';
import type { CookieSettings } from './interfaces/http/cookies.js';
import { createAuthController } from './interfaces/http/controllers/auth.controller.js';
import { createCompaniesController } from './interfaces/http/controllers/companies.controller.js';
import { errorHandler } from './interfaces/http/middlewares/error-handler.middleware.js';
import { createRateLimiter, type RateLimitOptions } from './interfaces/http/middlewares/rate-limit.middleware.js';
import { notFoundHandler } from './interfaces/http/middlewares/not-found.middleware.js';
import { createAuthRouter } from './interfaces/http/routes/auth.routes.js';
import { createCompaniesRouter } from "./interfaces/http/routes/companies.routes.js";
import { createWorkspaceController } from "./interfaces/http/controllers/workspace.controller.js";
import { createWorkspaceRouter } from "./interfaces/http/routes/workspace.routes.js";
import { createHealthRouter } from './interfaces/http/routes/health.routes.js';

export interface HttpSettings {
  corsOrigins: string[];
  maxUploadBytes: number;
  trustProxy: boolean;
  cookies: CookieSettings;
  rateLimits: {
    credentials: RateLimitOptions;
    refresh: RateLimitOptions;
  };
}

export interface AppDependencies {
  container: Container;
  http: HttpSettings;
}

/**
 * Monta a aplicação HTTP com as dependências já compostas.
 * Não abre portas nem conecta ao banco: isso é responsabilidade de server.ts.
 */
export function createApp({ container, http }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  if (http.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(cors({ origin: http.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(createHealthRouter(container.checkHealth));

  app.use(
    '/auth',
    createAuthRouter({
      controller: createAuthController({
        register: container.register,
        login: container.login,
        refresh: container.refreshSession,
        logout: container.logout,
        getCurrentUser: container.getCurrentUser,
        setActiveCompany: container.setActiveCompany,
        cookies: http.cookies,
      }),
      authenticateRequest: container.authenticateRequest,
      limiters: {
        credentials: createRateLimiter(http.rateLimits.credentials),
        refresh: createRateLimiter(http.rateLimits.refresh),
      },
      allowedOrigins: http.corsOrigins,
    }),
  );

  app.use(
    '/companies',
    createCompaniesRouter({
      controller: createCompaniesController({
        createCompany: container.createCompany,
        listUserCompanies: container.listUserCompanies,
        getActiveCompany: container.getActiveCompany,
        getCompany: container.getCompany,
        updateCompany: container.updateCompany,
        listCompanyMembers: container.listCompanyMembers,
        addCompanyMember: container.addCompanyMember,
        removeCompanyMember: container.removeCompanyMember,
      }),
      authenticateRequest: container.authenticateRequest,
    }),
  );

  app.use(
    "/companies",
    createWorkspaceRouter({
      controller: createWorkspaceController({
        uploadDocument: container.uploadDocument,
        listDocuments: container.listDocuments,
        getDocument: container.getDocument,
        downloadDocument: container.downloadDocument,
        analyzeDocument: container.analyzeDocument,
        dashboard: container.dashboard,
        createConversation: container.createConversation,
        listConversations: container.listConversations,
        listMessages: container.listMessages,
        sendMessage: container.sendMessage,
      }),
      authenticateRequest: container.authenticateRequest,
      maxUploadBytes: http.maxUploadBytes,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
