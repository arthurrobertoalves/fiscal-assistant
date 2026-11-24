// Contratos de dados trocados com a API (espelham as respostas do servidor).

export type ComponentStatus = "up" | "down";

export interface HealthReport {
  status: "ok" | "degraded";
  timestamp: string;
  checks: { database: ComponentStatus };
}

export type CompanyRole = "OWNER" | "ADMIN" | "MEMBER";

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  document: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyWithRole {
  company: Company;
  role: CompanyRole;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: CompanyRole;
  joinedAt: string;
}

export type IssueSeverity = "INFO" | "WARNING" | "ERROR";

export interface DocumentIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  source: "RULE" | "AI";
}

export interface NfeItem {
  description: string;
  quantity: number | null;
  total: number | null;
}

export interface Analysis {
  id: string;
  status: "COMPLETED" | "FAILED" | "SKIPPED";
  summary: string | null;
  issues: DocumentIssue[];
  aiModel: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface DocumentSummary {
  id: string;
  name: string;
  kind: "PDF" | "XML";
  sizeBytes: number;
  status: "PROCESSED" | "FAILED";
  failureReason: string | null;
  hasText: boolean;
  fiscal: {
    documentType: "NFE" | null;
    documentNumber: string | null;
    accessKey: string | null;
    issuer: { name: string | null; document: string | null };
    recipient: { name: string | null; document: string | null };
    issuedAt: string | null;
    totalAmount: number | null;
    items: NfeItem[];
  };
  createdAt: string;
}

export interface DocumentDetail {
  document: DocumentSummary;
  ruleIssues: DocumentIssue[];
  latestAnalysis: Analysis | null;
}

export interface Dashboard {
  counts: {
    documents: number;
    processedDocuments: number;
    failedDocuments: number;
    analysesCompleted: number;
    documentsWithPendings: number;
  };
  pendings: { documentId: string; name: string; severity: IssueSeverity; message: string }[];
  history: {
    documentId: string;
    name: string;
    status: "PROCESSED" | "FAILED";
    createdAt: string;
    analysisStatus: Analysis["status"] | null;
  }[];
  windowSize: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  sourceDocumentIds: string[];
  createdAt: string;
}
