import type { DocumentAnalysis as AnalysisRow, Prisma, PrismaClient } from '@prisma/client';
import type { DocumentIssue } from '../../domain/entities/fiscal-document.js';
import type {
  AnalysisRecord,
  AnalysisRepository,
  NewAnalysis,
} from '../../application/ports/analysis.repository.js';

export class PrismaAnalysisRepository implements AnalysisRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: NewAnalysis): Promise<AnalysisRecord> {
    const row = await this.prisma.documentAnalysis.create({
      data: {
        documentId: data.documentId,
        status: data.status,
        summary: data.summary,
        issues: data.issues as unknown as Prisma.InputJsonValue,
        aiModel: data.aiModel,
        errorMessage: data.errorMessage,
      },
    });
    return toRecord(row);
  }

  async findLatest(documentId: string): Promise<AnalysisRecord | null> {
    const row = await this.prisma.documentAnalysis.findFirst({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toRecord(row) : null;
  }

  async findLatestForDocuments(documentIds: string[]): Promise<Map<string, AnalysisRecord>> {
    const latest = new Map<string, AnalysisRecord>();
    if (documentIds.length === 0) return latest;

    const rows = await this.prisma.documentAnalysis.findMany({
      where: { documentId: { in: documentIds } },
      orderBy: { createdAt: 'desc' },
    });
    // Como vêm em ordem decrescente, o primeiro de cada documento é o mais recente.
    for (const row of rows) {
      if (!latest.has(row.documentId)) {
        latest.set(row.documentId, toRecord(row));
      }
    }
    return latest;
  }

  async countCompletedForCompany(companyId: string): Promise<number> {
    return this.prisma.documentAnalysis.count({
      where: { status: 'COMPLETED', document: { companyId } },
    });
  }
}

function toRecord(row: AnalysisRow): AnalysisRecord {
  return {
    id: row.id,
    documentId: row.documentId,
    status: row.status,
    summary: row.summary,
    issues: row.issues as unknown as DocumentIssue[],
    aiModel: row.aiModel,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  };
}
