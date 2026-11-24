import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env.js';
import { AddCompanyMemberUseCase } from '../application/use-cases/companies/add-company-member.use-case.js';
import { CreateCompanyUseCase } from '../application/use-cases/companies/create-company.use-case.js';
import { GetActiveCompanyUseCase } from '../application/use-cases/companies/get-active-company.use-case.js';
import { GetCompanyUseCase } from '../application/use-cases/companies/get-company.use-case.js';
import { ListCompanyMembersUseCase } from '../application/use-cases/companies/list-company-members.use-case.js';
import { ListUserCompaniesUseCase } from '../application/use-cases/companies/list-user-companies.use-case.js';
import { RemoveCompanyMemberUseCase } from '../application/use-cases/companies/remove-company-member.use-case.js';
import { UpdateCompanyUseCase } from '../application/use-cases/companies/update-company.use-case.js';
import { AuthenticateRequestUseCase } from '../application/use-cases/auth/authenticate-request.use-case.js';
import { GetCurrentUserUseCase } from '../application/use-cases/auth/get-current-user.use-case.js';
import { LoginUseCase } from '../application/use-cases/auth/login.use-case.js';
import { LogoutUseCase } from '../application/use-cases/auth/logout.use-case.js';
import { RefreshSessionUseCase } from '../application/use-cases/auth/refresh-session.use-case.js';
import { RegisterUserUseCase } from '../application/use-cases/auth/register-user.use-case.js';
import { SetActiveCompanyUseCase } from '../application/use-cases/auth/set-active-company.use-case.js';
import { CheckSystemHealthUseCase } from '../application/use-cases/check-system-health.use-case.js';
import { UploadDocumentUseCase } from '../application/use-cases/documents/upload-document.use-case.js';
import {
  AnalyzeDocumentUseCase,
  DownloadDocumentUseCase,
  GetDocumentUseCase,
  ListDocumentsUseCase,
} from '../application/use-cases/documents/document-queries.use-cases.js';
import { GetDashboardUseCase } from '../application/use-cases/dashboard/get-dashboard.use-case.js';
import {
  CreateConversationUseCase,
  ListConversationsUseCase,
  ListMessagesUseCase,
  SendMessageUseCase,
} from '../application/use-cases/chat/chat.use-cases.js';
import type { AiAssistant, FileStorage, PdfTextExtractor, XmlDocumentParser } from '../application/ports/document-processing.ports.js';
import { CompanyAccessService } from '../application/services/company-access.service.js';
import { DocumentAnalysisService } from '../application/services/document-analysis.service.js';
import { SessionIssuer } from '../application/services/session-issuer.js';
import { PrismaAnalysisRepository } from '../infrastructure/database/prisma-analysis.repository.js';
import { PrismaCompanyRepository } from '../infrastructure/database/prisma-company.repository.js';
import { PrismaConversationRepository } from '../infrastructure/database/prisma-conversation.repository.js';
import { PrismaDatabaseHealth } from '../infrastructure/database/prisma.js';
import { PrismaDocumentRepository } from '../infrastructure/database/prisma-document.repository.js';
import { PrismaSessionRepository } from '../infrastructure/database/prisma-session.repository.js';
import { PrismaUserRepository } from '../infrastructure/database/prisma-user.repository.js';
import { Argon2PasswordHasher } from '../infrastructure/security/argon2-password-hasher.js';
import { CryptoRefreshTokenCodec } from '../infrastructure/security/crypto-refresh-token.codec.js';
import { JoseAccessTokenService } from '../infrastructure/security/jose-access-token.service.js';
import { LocalFileStorage } from '../infrastructure/storage/local-file-storage.js';
import { UnpdfTextExtractor } from '../infrastructure/parsers/pdf-text-extractor.js';
import { NfeXmlParser } from '../infrastructure/parsers/nfe-xml-parser.js';
import { GroqAssistant } from '../infrastructure/ai/groq-assistant.js';

export type ContainerConfig = Pick<
  Env,
  | 'JWT_SECRET'
  | 'ACCESS_TOKEN_TTL_SECONDS'
  | 'REFRESH_TOKEN_TTL_DAYS'
  | 'STORAGE_DIR'
  | 'MAX_UPLOAD_MB'
  | 'GROQ_API_KEY'
  | 'GROQ_MODEL'
  | 'AI_TIMEOUT_MS'
>;

/** Substituições para testes. Omitido = implementação real. */
export interface ContainerOverrides {
  /** `null` desativa a IA explicitamente, mesmo com chave configurada. */
  ai?: AiAssistant | null;
  storage?: FileStorage;
  pdf?: PdfTextExtractor;
  xml?: XmlDocumentParser;
}

/**
 * Composition root: é o único lugar que conhece as implementações concretas.
 * Os casos de uso recebem apenas os contratos (ports).
 */
export function createContainer(
  prisma: PrismaClient,
  env: ContainerConfig,
  overrides: ContainerOverrides = {},
) {
  // Repositórios (infrastructure)
  const users = new PrismaUserRepository(prisma);
  const companies = new PrismaCompanyRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const documents = new PrismaDocumentRepository(prisma);
  const analyses = new PrismaAnalysisRepository(prisma);
  const conversations = new PrismaConversationRepository(prisma);

  // Segurança (infrastructure)
  const hasher = new Argon2PasswordHasher();
  const accessTokens = new JoseAccessTokenService(env.JWT_SECRET);
  const refreshTokens = new CryptoRefreshTokenCodec();

  // Documentos e IA (infrastructure)
  const storage = overrides.storage ?? new LocalFileStorage(env.STORAGE_DIR);
  const pdf = overrides.pdf ?? new UnpdfTextExtractor();
  const xml = overrides.xml ?? new NfeXmlParser();
  const ai = resolveAi(env, overrides);

  // Serviços de aplicação
  const sessionIssuer = new SessionIssuer(sessions, accessTokens, refreshTokens, {
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  });
  const companyAccess = new CompanyAccessService(companies);
  const analysisService = new DocumentAnalysisService(analyses, ai);

  return {
    checkHealth: new CheckSystemHealthUseCase(new PrismaDatabaseHealth(prisma)),

    register: new RegisterUserUseCase(users, hasher, sessionIssuer),
    login: new LoginUseCase(users, hasher, sessionIssuer),
    refreshSession: new RefreshSessionUseCase(sessions, refreshTokens, sessionIssuer),
    logout: new LogoutUseCase(sessions, refreshTokens),
    authenticateRequest: new AuthenticateRequestUseCase(accessTokens, sessions),
    getCurrentUser: new GetCurrentUserUseCase(users),
    setActiveCompany: new SetActiveCompanyUseCase(companyAccess, sessions),

    createCompany: new CreateCompanyUseCase(companies),
    listUserCompanies: new ListUserCompaniesUseCase(companies),
    getActiveCompany: new GetActiveCompanyUseCase(companies),
    getCompany: new GetCompanyUseCase(companyAccess),
    updateCompany: new UpdateCompanyUseCase(companyAccess, companies),
    listCompanyMembers: new ListCompanyMembersUseCase(companyAccess, companies),
    addCompanyMember: new AddCompanyMemberUseCase(companyAccess, companies, users),
    removeCompanyMember: new RemoveCompanyMemberUseCase(companyAccess, companies, sessions),

    uploadDocument: new UploadDocumentUseCase(
      companyAccess,
      documents,
      storage,
      pdf,
      xml,
      analysisService,
      env.MAX_UPLOAD_MB * 1024 * 1024,
    ),
    listDocuments: new ListDocumentsUseCase(companyAccess, documents),
    getDocument: new GetDocumentUseCase(companyAccess, documents, analyses, analysisService),
    downloadDocument: new DownloadDocumentUseCase(companyAccess, documents, storage),
    analyzeDocument: new AnalyzeDocumentUseCase(companyAccess, documents, analysisService),

    dashboard: new GetDashboardUseCase(companyAccess, documents, analyses, analysisService),

    createConversation: new CreateConversationUseCase(companyAccess, conversations),
    listConversations: new ListConversationsUseCase(companyAccess, conversations),
    listMessages: new ListMessagesUseCase(companyAccess, conversations),
    sendMessage: new SendMessageUseCase(companyAccess, conversations, documents, analysisService, ai),

    /** Provedor de IA em uso (null = modo sem IA). Exposto para o status da configuração. */
    aiModel: ai?.model ?? null,
  };
}

function resolveAi(env: ContainerConfig, overrides: ContainerOverrides): AiAssistant | null {
  if (overrides.ai !== undefined) return overrides.ai;
  if (!env.GROQ_API_KEY) return null;
  return new GroqAssistant({
    apiKey: env.GROQ_API_KEY,
    model: env.GROQ_MODEL,
    timeoutMs: env.AI_TIMEOUT_MS,
  });
}

export type Container = ReturnType<typeof createContainer>;
