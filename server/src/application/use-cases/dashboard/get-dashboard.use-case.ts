import type { DocumentIssue, IssueSeverity } from '../../../domain/entities/fiscal-document.js';
import type { AnalysisRecord, AnalysisRepository } from '../../ports/analysis.repository.js';
import type { DocumentRecord, DocumentRepository } from '../../ports/document.repository.js';
import type { CompanyAccessService } from '../../services/company-access.service.js';
import type { DocumentAnalysisService } from '../../services/document-analysis.service.js';

/** Quantidade de documentos recentes considerados para pendências e histórico. */
const RECENT_WINDOW = 200;
const PENDING_PREVIEW = 5;
const HISTORY_SIZE = 10;

export interface PendingDocument {
  documentId: string;
  name: string;
  severity: IssueSeverity;
  message: string;
}

export interface HistoryEntry {
  documentId: string;
  name: string;
  status: DocumentRecord['status'];
  createdAt: Date;
  analysisStatus: AnalysisRecord['status'] | null;
}

export interface DashboardData {
  counts: {
    documents: number;
    processedDocuments: number;
    failedDocuments: number;
    analysesCompleted: number;
    documentsWithPendings: number;
  };
  pendings: PendingDocument[];
  history: HistoryEntry[];
  /** Quantos documentos recentes foram considerados nas pendências. */
  windowSize: number;
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { INFO: 0, WARNING: 1, ERROR: 2 };

export class GetDashboardUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly documents: DocumentRepository,
    private readonly analyses: AnalysisRepository,
    private readonly analysis: DocumentAnalysisService,
  ) {}

  async execute(userId: string, companyId: string): Promise<DashboardData> {
    await this.access.requireMembership(userId, companyId);

    const [stats, analysesCompleted, recent] = await Promise.all([
      this.documents.stats(companyId),
      this.analyses.countCompletedForCompany(companyId),
      this.documents.list(companyId, { limit: RECENT_WINDOW, offset: 0 }),
    ]);

    const latest = await this.analyses.findLatestForDocuments(recent.items.map((item) => item.id));

    const pendings: PendingDocument[] = [];
    let documentsWithPendings = 0;
    for (const document of recent.items) {
      const issues = [...this.analysis.ruleIssues(document), ...(latest.get(document.id)?.issues ?? [])];
      const relevant = issues.filter((issue) => issue.severity !== 'INFO');
      if (relevant.length === 0) continue;

      documentsWithPendings += 1;
      const worst = highestSeverity(relevant);
      if (pendings.length < PENDING_PREVIEW) {
        pendings.push({
          documentId: document.id,
          name: document.originalName,
          severity: worst.severity,
          message: worst.message,
        });
      }
    }

    const history: HistoryEntry[] = recent.items.slice(0, HISTORY_SIZE).map((document) => ({
      documentId: document.id,
      name: document.originalName,
      status: document.status,
      createdAt: document.createdAt,
      analysisStatus: latest.get(document.id)?.status ?? null,
    }));

    return {
      counts: {
        documents: stats.total,
        processedDocuments: stats.processed,
        failedDocuments: stats.failed,
        analysesCompleted,
        documentsWithPendings,
      },
      pendings,
      history,
      windowSize: recent.items.length,
    };
  }
}

function highestSeverity(issues: DocumentIssue[]): DocumentIssue {
  return issues.reduce((worst, issue) =>
    SEVERITY_RANK[issue.severity] > SEVERITY_RANK[worst.severity] ? issue : worst,
  );
}
