import type { AnalysisRecord } from '../../application/ports/analysis.repository.js';
import type { ConversationRecord, MessageRecord } from '../../application/ports/conversation.repository.js';
import type { DocumentRecord } from '../../application/ports/document.repository.js';
import type { DashboardData } from '../../application/use-cases/dashboard/get-dashboard.use-case.js';
import type { DocumentDetail } from '../../application/use-cases/documents/document-queries.use-cases.js';

/*
 * Respostas dos módulos de documentos. Nunca expõem caminhos de armazenamento,
 * hashes de arquivo nem IDs de usuários que enviaram documentos.
 */

export function toDocumentDto(document: DocumentRecord) {
  return {
    id: document.id,
    name: document.originalName,
    kind: document.kind,
    sizeBytes: document.sizeBytes,
    status: document.status,
    failureReason: document.failureReason,
    hasText: document.hasText,
    fiscal: {
      documentType: document.fiscal.documentType,
      documentNumber: document.fiscal.documentNumber,
      accessKey: document.fiscal.accessKey,
      issuer: { name: document.fiscal.issuerName, document: document.fiscal.issuerDocument },
      recipient: { name: document.fiscal.recipientName, document: document.fiscal.recipientDocument },
      issuedAt: document.fiscal.issuedAt,
      totalAmount: document.fiscal.totalAmount,
      items: document.fiscal.items,
    },
    createdAt: document.createdAt,
  };
}

export function toAnalysisDto(analysis: AnalysisRecord) {
  return {
    id: analysis.id,
    status: analysis.status,
    summary: analysis.summary,
    issues: analysis.issues,
    aiModel: analysis.aiModel,
    errorMessage: analysis.errorMessage,
    createdAt: analysis.createdAt,
  };
}

export function toDocumentDetailDto(detail: DocumentDetail) {
  return {
    document: toDocumentDto(detail.document),
    ruleIssues: detail.ruleIssues,
    latestAnalysis: detail.latestAnalysis ? toAnalysisDto(detail.latestAnalysis) : null,
  };
}

export function toConversationDto(conversation: ConversationRecord) {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export function toMessageDto(message: MessageRecord) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    sourceDocumentIds: message.sourceDocumentIds,
    createdAt: message.createdAt,
  };
}

export function toDashboardDto(data: DashboardData) {
  return {
    counts: data.counts,
    pendings: data.pendings,
    history: data.history,
    windowSize: data.windowSize,
  };
}
