import type { DocumentIssue } from '../../../domain/entities/fiscal-document.js';
import { errors } from '../../../shared/errors/app-error.js';
import type { AnalysisRecord, AnalysisRepository } from '../../ports/analysis.repository.js';
import type { DocumentRecord, DocumentRepository } from '../../ports/document.repository.js';
import type { FileStorage } from '../../ports/document-processing.ports.js';
import type { CompanyAccessService } from '../../services/company-access.service.js';
import type { DocumentAnalysisService } from '../../services/document-analysis.service.js';
import { mimeTypeFor } from '../../../domain/value-objects/upload.js';

export interface DocumentPage {
  items: DocumentRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/** Lista os documentos da empresa, do mais recente para o mais antigo. */
export class ListDocumentsUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly documents: DocumentRepository,
  ) {}

  async execute(userId: string, companyId: string, page: number, pageSize: number): Promise<DocumentPage> {
    await this.access.requireMembership(userId, companyId);
    const result = await this.documents.list(companyId, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { ...result, page, pageSize };
  }
}

export interface DocumentDetail {
  document: DocumentRecord;
  ruleIssues: DocumentIssue[];
  latestAnalysis: AnalysisRecord | null;
}

/** Detalhe do documento: campos extraídos, alertas automáticos e última análise de IA. */
export class GetDocumentUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly documents: DocumentRepository,
    private readonly analyses: AnalysisRepository,
    private readonly analysis: DocumentAnalysisService,
  ) {}

  async execute(userId: string, companyId: string, documentId: string): Promise<DocumentDetail> {
    await this.access.requireMembership(userId, companyId);
    const document = await this.documents.findById(companyId, documentId);
    if (!document) {
      throw errors.notFound('DOCUMENT_NOT_FOUND', 'Documento não encontrado.');
    }

    return {
      document: { ...document, extractedText: null },
      ruleIssues: this.analysis.ruleIssues(document),
      latestAnalysis: await this.analyses.findLatest(document.id),
    };
  }
}

export interface DocumentFile {
  content: Buffer;
  mimeType: string;
  fileName: string;
}

/** Entrega o arquivo original, somente para membros da empresa dona do documento. */
export class DownloadDocumentUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly documents: DocumentRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(userId: string, companyId: string, documentId: string): Promise<DocumentFile> {
    await this.access.requireMembership(userId, companyId);
    const document = await this.documents.findById(companyId, documentId);
    if (!document) {
      throw errors.notFound('DOCUMENT_NOT_FOUND', 'Documento não encontrado.');
    }

    return {
      content: await this.storage.read(document.storageKey),
      mimeType: mimeTypeFor(document.kind),
      fileName: document.originalName,
    };
  }
}

/** Reexecuta a análise de um documento já processado (ex.: após configurar a IA). */
export class AnalyzeDocumentUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly documents: DocumentRepository,
    private readonly analysis: DocumentAnalysisService,
  ) {}

  async execute(userId: string, companyId: string, documentId: string): Promise<AnalysisRecord> {
    await this.access.requireMembership(userId, companyId);
    const document = await this.documents.findById(companyId, documentId);
    if (!document) {
      throw errors.notFound('DOCUMENT_NOT_FOUND', 'Documento não encontrado.');
    }
    if (document.status !== 'PROCESSED') {
      throw errors.conflict('DOCUMENT_NOT_PROCESSED', 'Só é possível analisar documentos processados com sucesso.');
    }
    return this.analysis.analyze(document);
  }
}
