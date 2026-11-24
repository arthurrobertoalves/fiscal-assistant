import type { Conversation as ConversationRow, Message as MessageRow, PrismaClient } from '@prisma/client';
import type {
  ConversationRecord,
  ConversationRepository,
  MessageRecord,
} from '../../application/ports/conversation.repository.js';

export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createConversation(data: { companyId: string; userId: string; title: string }) {
    const row = await this.prisma.conversation.create({ data });
    return toConversation(row);
  }

  async findConversation(companyId: string, userId: string, id: string) {
    const row = await this.prisma.conversation.findFirst({ where: { id, companyId, userId } });
    return row ? toConversation(row) : null;
  }

  async listConversations(companyId: string, userId: string, limit: number) {
    const rows = await this.prisma.conversation.findMany({
      where: { companyId, userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return rows.map(toConversation);
  }

  async addMessage(data: Omit<MessageRecord, 'id' | 'createdAt'>): Promise<MessageRecord> {
    const row = await this.prisma.message.create({
      data: {
        conversationId: data.conversationId,
        role: data.role,
        content: data.content,
        sourceDocumentIds: data.sourceDocumentIds,
      },
    });
    // Mantém a conversa ordenada pela atividade mais recente.
    await this.prisma.conversation.update({
      where: { id: data.conversationId },
      data: { updatedAt: new Date() },
    });
    return toMessage(row);
  }

  async listMessages(conversationId: string, limit: number): Promise<MessageRecord[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map(toMessage);
  }
}

function toConversation(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    userId: row.userId,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessage(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    sourceDocumentIds: Array.isArray(row.sourceDocumentIds) ? (row.sourceDocumentIds as string[]) : [],
    createdAt: row.createdAt,
  };
}
