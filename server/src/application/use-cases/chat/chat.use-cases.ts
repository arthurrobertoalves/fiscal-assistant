import { errors, AppError } from '../../../shared/errors/app-error.js';
import type {
  ConversationRecord,
  ConversationRepository,
  MessageRecord,
} from '../../ports/conversation.repository.js';
import type { DocumentRecord, DocumentRepository } from '../../ports/document.repository.js';
import type { AiAssistant } from '../../ports/document-processing.ports.js';
import type { CompanyAccessService } from '../../services/company-access.service.js';
import type { DocumentAnalysisService } from '../../services/document-analysis.service.js';
import { selectRelevantDocuments } from '../../services/document-retrieval.js';

/** Quantos documentos são enviados como contexto a cada pergunta. */
export const CONTEXT_DOCUMENTS = 5;
/** Quantos documentos recentes entram na busca por palavras-chave. */
const SEARCH_WINDOW = 100;
export const MAX_QUESTION_LENGTH = 2000;
const DEFAULT_TITLE = 'Nova conversa';

export class CreateConversationUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly conversations: ConversationRepository,
  ) {}

  async execute(userId: string, companyId: string, title?: string): Promise<ConversationRecord> {
    await this.access.requireMembership(userId, companyId);
    return this.conversations.createConversation({
      companyId,
      userId,
      title: title?.trim().slice(0, 120) || DEFAULT_TITLE,
    });
  }
}

export class ListConversationsUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly conversations: ConversationRepository,
  ) {}

  async execute(userId: string, companyId: string): Promise<ConversationRecord[]> {
    await this.access.requireMembership(userId, companyId);
    return this.conversations.listConversations(companyId, userId, 50);
  }
}

export class ListMessagesUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly conversations: ConversationRepository,
  ) {}

  async execute(userId: string, companyId: string, conversationId: string): Promise<MessageRecord[]> {
    await this.access.requireMembership(userId, companyId);
    await this.requireOwnConversation(userId, companyId, conversationId);
    return this.conversations.listMessages(conversationId, 200);
  }

  private async requireOwnConversation(userId: string, companyId: string, conversationId: string) {
    const conversation = await this.conversations.findConversation(companyId, userId, conversationId);
    if (!conversation) {
      throw errors.notFound('CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
    }
    return conversation;
  }
}

export interface SendMessageResult {
  userMessage: MessageRecord;
  assistantMessage: MessageRecord;
}

/**
 * Responde a uma pergunta usando somente os documentos da própria empresa.
 * A recuperação é por palavras-chave (sem RAG): escolhe os documentos mais relevantes
 * e envia seus dados como contexto. Sem IA configurada, lista os documentos encontrados.
 */
export class SendMessageUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly conversations: ConversationRepository,
    private readonly documents: DocumentRepository,
    private readonly analysis: DocumentAnalysisService,
    private readonly ai: AiAssistant | null,
  ) {}

  async execute(userId: string, companyId: string, conversationId: string, content: string): Promise<SendMessageResult> {
    const question = content.trim();
    if (question.length === 0) {
      throw new AppError(422, 'EMPTY_MESSAGE', 'Digite uma pergunta.');
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      throw new AppError(422, 'MESSAGE_TOO_LONG', `A pergunta deve ter no máximo ${MAX_QUESTION_LENGTH} caracteres.`);
    }

    await this.access.requireMembership(userId, companyId);
    const conversation = await this.conversations.findConversation(companyId, userId, conversationId);
    if (!conversation) {
      throw errors.notFound('CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
    }

    const userMessage = await this.conversations.addMessage({
      conversationId,
      role: 'USER',
      content: question,
      sourceDocumentIds: [],
    });

    const candidates = await this.documents.listForRetrieval(companyId, SEARCH_WINDOW);
    const relevant = selectRelevantDocuments(question, candidates, CONTEXT_DOCUMENTS);
    const sourceIds = relevant.map((document) => document.id);

    const answer = await this.answer(question, relevant);

    const assistantMessage = await this.conversations.addMessage({
      conversationId,
      role: 'ASSISTANT',
      content: answer,
      sourceDocumentIds: sourceIds,
    });

    return { userMessage, assistantMessage };
  }

  private async answer(question: string, relevant: DocumentRecord[]): Promise<string> {
    if (!this.ai) {
      return this.listingAnswer(relevant);
    }

    try {
      return await this.ai.answerQuestion(question, relevant.map((document) => this.analysis.contextFor(document)));
    } catch (error) {
      console.error('[ai] falha no chat:', error instanceof Error ? error.name : 'erro desconhecido');
      throw new AppError(503, 'AI_UNAVAILABLE', 'O assistente de IA está indisponível no momento. Tente novamente.');
    }
  }

  private listingAnswer(relevant: DocumentRecord[]): string {
    if (relevant.length === 0) {
      return 'O assistente de IA não está configurado e não encontrei documentos desta empresa relacionados à sua pergunta.';
    }
    const names = relevant.map((document) => `- ${document.originalName}`).join('\n');
    return `O assistente de IA não está configurado. Estes documentos da empresa parecem relacionados à sua pergunta:\n${names}`;
  }
}
