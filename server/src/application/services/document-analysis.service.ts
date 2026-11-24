import type { DocumentIssue } from '../../domain/entities/fiscal-document.js';
import { checkDocumentConsistency } from '../../domain/rules/document-rules.js';
import type { AnalysisRecord, AnalysisRepository } from '../ports/analysis.repository.js';
import type { DocumentRecord } from '../ports/document.repository.js';
import type { AiAssistant, DocumentContextForAi } from '../ports/document-processing.ports.js';

/** Limite do texto do PDF enviado à IA (mantém custo e latência previsíveis). */
export const MAX_TEXT_FOR_AI = 8000;

const AI_UNAVAILABLE_MESSAGE = 'Falha ao consultar o assistente de IA. Tente novamente em instantes.';

/**
 * Orquestra a análise de um documento. A explicação mostrada ao usuário é a da IA, em texto corrido.
 * As verificações determinísticas são guardadas apenas para contar pendências no painel.
 */
export class DocumentAnalysisService {
  constructor(
    private readonly analyses: AnalysisRepository,
    private readonly ai: AiAssistant | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Verificações determinísticas do documento, calculadas a partir dos campos já extraídos. */
  ruleIssues(document: DocumentRecord): DocumentIssue[] {
    // Documento que não pôde ser lido não tem campos a verificar: a falha é o alerta.
    if (document.status === 'FAILED') {
      return [
        {
          code: 'PROCESSING_FAILED',
          severity: 'WARNING',
          message: document.failureReason ?? 'Não foi possível processar o documento.',
          source: 'RULE',
        },
      ];
    }
    return checkDocumentConsistency({
      kind: document.kind,
      data: document.fiscal,
      hasText: document.hasText,
      now: this.now(),
    });
  }

  /** Contexto enviado à IA. O texto só é incluído se o documento tiver sido lido. */
  contextFor(document: DocumentRecord): DocumentContextForAi {
    return {
      id: document.id,
      name: document.originalName,
      kind: document.kind,
      fiscal: document.fiscal,
      ruleIssues: this.ruleIssues(document),
      text: document.extractedText ? document.extractedText.slice(0, MAX_TEXT_FOR_AI) : null,
    };
  }

  /** Executa a análise e registra o resultado (COMPLETED, FAILED ou SKIPPED). Nunca lança erro de IA. */
  async analyze(document: DocumentRecord): Promise<AnalysisRecord> {
    if (!this.ai) {
      return this.analyses.create({
        documentId: document.id,
        status: 'SKIPPED',
        summary: null,
        issues: this.ruleIssues(document),
        aiModel: null,
        errorMessage: 'Assistente de IA não configurado.',
      });
    }

    try {
      const result = await this.ai.analyzeDocument(this.contextFor(document));
      return this.analyses.create({
        documentId: document.id,
        status: 'COMPLETED',
        summary: result.explanation,
        issues: this.ruleIssues(document),
        aiModel: this.ai.model,
        errorMessage: null,
      });
    } catch (error) {
      // Detalhes técnicos ficam fora da resposta e do banco.
      console.error('[ai] falha na análise:', error instanceof Error ? error.name : 'erro desconhecido');
      return this.analyses.create({
        documentId: document.id,
        status: 'FAILED',
        summary: null,
        issues: this.ruleIssues(document),
        aiModel: this.ai.model,
        errorMessage: AI_UNAVAILABLE_MESSAGE,
      });
    }
  }
}
