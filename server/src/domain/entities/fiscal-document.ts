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
  code?: string | null;
  ncm?: string | null;
  cfop?: string | null;
  unit?: string | null;
  unitPrice?: number | null;
  icms?: number | null;
  pis?: number | null;
  cofins?: number | null;
}

/** Detalhes da NF-e além dos campos principais: endereços, impostos, pagamento e observações. */
export interface NfeDetails {
  operationNature: string | null;
  operationType: 'ENTRADA' | 'SAIDA' | null;
  issuerAddress: string | null;
  recipientAddress: string | null;
  taxes: {
    icmsBase: number | null;
    icms: number | null;
    pis: number | null;
    cofins: number | null;
    ipi: number | null;
    discount: number | null;
    freight: number | null;
  };
  payments: { method: string | null; amount: number | null }[];
  carrier: string | null;
  additionalInfo: string | null;
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
  details: NfeDetails | null;
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
  details: null,
};
