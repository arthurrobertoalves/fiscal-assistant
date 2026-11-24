import type { DocumentKind, DocumentStatus, FiscalData } from '../../domain/entities/fiscal-document.js';

export interface DocumentRecord {
  id: string;
  companyId: string;
  uploadedById: string | null;
  originalName: string;
  kind: DocumentKind;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  status: DocumentStatus;
  failureReason: string | null;
  fiscal: FiscalData;
  /** Indica se algum texto foi extraído (PDF). Usado pelas regras sem carregar o texto. */
  hasText: boolean;
  /** Texto extraído do PDF. Nulo nas listagens e no painel; carregado só para IA e chat. */
  extractedText: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewDocument = Omit<DocumentRecord, 'id' | 'createdAt' | 'updatedAt'>;

export interface DocumentStats {
  total: number;
  processed: number;
  failed: number;
}

export interface DocumentRepository {
  create(data: NewDocument): Promise<DocumentRecord>;
  /** Busca um documento dentro da empresa. Nunca retorna documento de outra empresa. */
  findById(companyId: string, id: string): Promise<DocumentRecord | null>;
  findBySha256(companyId: string, sha256: string): Promise<DocumentRecord | null>;
  list(companyId: string, options: { limit: number; offset: number }): Promise<{ items: DocumentRecord[]; total: number }>;
  /** Documentos com texto e dados, para a recuperação do chat. */
  listForRetrieval(companyId: string, limit: number): Promise<DocumentRecord[]>;
  stats(companyId: string): Promise<DocumentStats>;
}
