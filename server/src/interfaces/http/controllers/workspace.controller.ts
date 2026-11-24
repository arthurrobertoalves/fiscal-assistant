import type { RequestHandler } from 'express';
import type { GetDashboardUseCase } from '../../../application/use-cases/dashboard/get-dashboard.use-case.js';
import type {
  AnalyzeDocumentUseCase,
  DownloadDocumentUseCase,
  GetDocumentUseCase,
  ListDocumentsUseCase,
} from '../../../application/use-cases/documents/document-queries.use-cases.js';
import type { UploadDocumentUseCase } from '../../../application/use-cases/documents/upload-document.use-case.js';
import type {
  CreateConversationUseCase,
  ListConversationsUseCase,
  ListMessagesUseCase,
  SendMessageUseCase,
} from '../../../application/use-cases/chat/chat.use-cases.js';
import { errors } from '../../../shared/errors/app-error.js';
import {
  toAnalysisDto,
  toConversationDto,
  toDashboardDto,
  toDocumentDetailDto,
  toDocumentDto,
  toMessageDto,
} from '../presenters-documents.js';
import {
  conversationParamsSchema,
  documentParamsSchema,
  listDocumentsQuerySchema,
  type ConversationParams,
  type CreateConversationBody,
  type DocumentParams,
  type SendMessageBody,
} from '../validators/mvp.schemas.js';
import { requireAuth } from './auth.controller.js';
import { companyParams } from './company-params.js';

export interface WorkspaceControllerDependencies {
  uploadDocument: UploadDocumentUseCase;
  listDocuments: ListDocumentsUseCase;
  getDocument: GetDocumentUseCase;
  downloadDocument: DownloadDocumentUseCase;
  analyzeDocument: AnalyzeDocumentUseCase;
  dashboard: GetDashboardUseCase;
  createConversation: CreateConversationUseCase;
  listConversations: ListConversationsUseCase;
  listMessages: ListMessagesUseCase;
  sendMessage: SendMessageUseCase;
}

/** Controllers de documentos, painel e chat. Sem regras de negócio: só HTTP ↔ casos de uso. */
export function createWorkspaceController(deps: WorkspaceControllerDependencies) {
  const upload: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId } = companyParams(req.params);
    if (!req.file) {
      throw errors.unprocessable('FILE_REQUIRED', 'Envie um arquivo no campo "file".');
    }
    const result = await deps.uploadDocument.execute(auth.userId, companyId, {
      originalName: req.file.originalname,
      content: req.file.buffer,
    });
    res.status(201).json({
      document: toDocumentDto(result.document),
      analysis: result.analysis ? toAnalysisDto(result.analysis) : null,
    });
  };

  const list: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId } = companyParams(req.params);
    const query = listDocumentsQuerySchema.parse(req.query);
    const page = await deps.listDocuments.execute(auth.userId, companyId, query.page, query.pageSize);
    res.json({
      items: page.items.map(toDocumentDto),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
    });
  };

  const get: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId, documentId } = documentParamsSchema.parse(req.params) as DocumentParams;
    const detail = await deps.getDocument.execute(auth.userId, companyId, documentId);
    res.json(toDocumentDetailDto(detail));
  };

  const download: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId, documentId } = documentParamsSchema.parse(req.params) as DocumentParams;
    const file = await deps.downloadDocument.execute(auth.userId, companyId, documentId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.content.length));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.content);
  };

  const analyze: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId, documentId } = documentParamsSchema.parse(req.params) as DocumentParams;
    const analysis = await deps.analyzeDocument.execute(auth.userId, companyId, documentId);
    res.status(201).json(toAnalysisDto(analysis));
  };

  const dashboard: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId } = companyParams(req.params);
    res.json(toDashboardDto(await deps.dashboard.execute(auth.userId, companyId)));
  };

  const createConversation: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId } = companyParams(req.params);
    const body = req.body as CreateConversationBody;
    const conversation = await deps.createConversation.execute(auth.userId, companyId, body?.title);
    res.status(201).json(toConversationDto(conversation));
  };

  const listConversations: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId } = companyParams(req.params);
    const conversations = await deps.listConversations.execute(auth.userId, companyId);
    res.json({ conversations: conversations.map(toConversationDto) });
  };

  const getMessages: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId, conversationId } = conversationParamsSchema.parse(req.params) as ConversationParams;
    const messages = await deps.listMessages.execute(auth.userId, companyId, conversationId);
    res.json({ messages: messages.map(toMessageDto) });
  };

  const postMessage: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId, conversationId } = conversationParamsSchema.parse(req.params) as ConversationParams;
    const body = req.body as SendMessageBody;
    const result = await deps.sendMessage.execute(auth.userId, companyId, conversationId, body.content);
    res.status(201).json({
      userMessage: toMessageDto(result.userMessage),
      assistantMessage: toMessageDto(result.assistantMessage),
    });
  };

  return {
    upload,
    list,
    get,
    download,
    analyze,
    dashboard,
    createConversation,
    listConversations,
    getMessages,
    postMessage,
  };
}
