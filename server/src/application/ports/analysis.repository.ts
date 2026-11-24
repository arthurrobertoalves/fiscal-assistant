import type { DocumentIssue } from '../../domain/entities/fiscal-document.js';

export type AnalysisStatus = 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface AnalysisRecord {
  id: string;
  documentId: string;
  status: AnalysisStatus;
  summary: string | null;
  issues: DocumentIssue[];
  aiModel: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

export type NewAnalysis = Omit<AnalysisRecord, 'id' | 'createdAt'>;

export interface AnalysisRepository {
  create(data: NewAnalysis): Promise<AnalysisRecord>;
  findLatest(documentId: string): Promise<AnalysisRecord | null>;
  /** Última análise de cada documento informado. */
  findLatestForDocuments(documentIds: string[]): Promise<Map<string, AnalysisRecord>>;
  countCompletedForCompany(companyId: string): Promise<number>;
}
