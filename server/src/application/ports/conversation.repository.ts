export interface ConversationRecord {
  id: string;
  companyId: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  sourceDocumentIds: string[];
  createdAt: Date;
}

export interface ConversationRepository {
  createConversation(data: { companyId: string; userId: string; title: string }): Promise<ConversationRecord>;
  /** Conversa do próprio usuário dentro da empresa; nula caso contrário. */
  findConversation(companyId: string, userId: string, id: string): Promise<ConversationRecord | null>;
  listConversations(companyId: string, userId: string, limit: number): Promise<ConversationRecord[]>;
  addMessage(data: Omit<MessageRecord, 'id' | 'createdAt'>): Promise<MessageRecord>;
  listMessages(conversationId: string, limit: number): Promise<MessageRecord[]>;
}
