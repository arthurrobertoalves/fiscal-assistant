export const DOCUMENT_KINDS = ['PDF', 'XML'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export type DocumentStatus = 'PROCESSED' | 'FAILED';

export type IssueSeverity = 'INFO' | 'WARNING' | 'ERROR';
export type IssueSource = 'RULE' | 'AI';

export interface DocumentIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  source: IssueSource;
}

export interface NfeItem {
  description: string;
  quantity: number | null;
  total: number | null;
}

/**
 * Campos fiscais extraídos de um documento. Campos ausentes no documento ficam nulos;
 * nunca são preenchidos por suposição.
 */
export interface FiscalData {
  documentType: 'NFE' | null;
  documentNumber: string | null;
  accessKey: string | null;
  issuerName: string | null;
  issuerDocument: string | null;
  recipientName: string | null;
  recipientDocument: string | null;
  issuedAt: Date | null;
  totalAmount: number | null;
  items: NfeItem[];
}

export const EMPTY_FISCAL_DATA: FiscalData = {
  documentType: null,
  documentNumber: null,
  accessKey: null,
  issuerName: null,
  issuerDocument: null,
  recipientName: null,
  recipientDocument: null,
  issuedAt: null,
  totalAmount: null,
  items: [],
};
