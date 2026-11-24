import { z } from 'zod';

const uuid = z.uuid({ message: 'Identificador inválido.' });

export const documentParamsSchema = z.object({
  companyId: uuid,
  documentId: uuid,
});

export const conversationParamsSchema = z.object({
  companyId: uuid,
  conversationId: uuid,
});

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const createConversationSchema = z
  .strictObject({
    title: z.string().trim().max(120, 'Título muito longo.').optional(),
  })
  .optional();

export const sendMessageSchema = z.strictObject({
  // O tamanho é validado no caso de uso (com mensagem própria).
  content: z.string(),
});

export type DocumentParams = z.infer<typeof documentParamsSchema>;
export type ConversationParams = z.infer<typeof conversationParamsSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
export type CreateConversationBody = z.infer<typeof createConversationSchema>;
export type SendMessageBody = z.infer<typeof sendMessageSchema>;
