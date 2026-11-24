import type { Document as DocumentRow, Prisma, PrismaClient } from '@prisma/client';
import type { FiscalData, NfeDetails, NfeItem } from '../../domain/entities/fiscal-document.js';
import type {
  DocumentRecord,
  DocumentRepository,
  DocumentStats,
  NewDocument,
} from '../../application/ports/document.repository.js';
import { mapUniqueViolation } from './prisma-errors.js';

export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: NewDocument): Promise<DocumentRecord> {
    const row = await mapUniqueViolation(() =>
      this.prisma.document.create({ data: toRow(data) }),
    );
    return toRecord(row);
  }

  async findById(companyId: string, id: string): Promise<DocumentRecord | null> {
    const row = await this.prisma.document.findFirst({ where: { id, companyId } });
    return row ? toRecord(row) : null;
  }

  async findBySha256(companyId: string, sha256: string): Promise<DocumentRecord | null> {
    const row = await this.prisma.document.findUnique({
      where: { companyId_sha256: { companyId, sha256 } },
    });
    return row ? toRecord(row, { withText: false }) : null;
  }

  async list(companyId: string, options: { limit: number; offset: number }) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: options.limit,
        skip: options.offset,
      }),
      this.prisma.document.count({ where: { companyId } }),
    ]);
    return { items: rows.map((row) => toRecord(row, { withText: false })), total };
  }

  async listForRetrieval(companyId: string, limit: number): Promise<DocumentRecord[]> {
    const rows = await this.prisma.document.findMany({
      where: { companyId, status: 'PROCESSED' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => toRecord(row));
  }

  async stats(companyId: string): Promise<DocumentStats> {
    const [total, processed, failed] = await this.prisma.$transaction([
      this.prisma.document.count({ where: { companyId } }),
      this.prisma.document.count({ where: { companyId, status: 'PROCESSED' } }),
      this.prisma.document.count({ where: { companyId, status: 'FAILED' } }),
    ]);
    return { total, processed, failed };
  }
}

function toRow(data: NewDocument): Prisma.DocumentUncheckedCreateInput {
  const { fiscal } = data;
  return {
    companyId: data.companyId,
    uploadedById: data.uploadedById,
    originalName: data.originalName,
    kind: data.kind,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
    sha256: data.sha256,
    storageKey: data.storageKey,
    status: data.status,
    failureReason: data.failureReason,
    documentType: fiscal.documentType,
    documentNumber: fiscal.documentNumber,
    accessKey: fiscal.accessKey,
    issuerName: fiscal.issuerName,
    issuerDocument: fiscal.issuerDocument,
    recipientName: fiscal.recipientName,
    recipientDocument: fiscal.recipientDocument,
    issuedAt: fiscal.issuedAt,
    totalAmount: fiscal.totalAmount,
    hasText: data.hasText,
    extractedText: data.extractedText,
    extractedData: { items: fiscal.items, details: fiscal.details } as unknown as Prisma.InputJsonValue,
  };
}

function toRecord(row: DocumentRow, options: { withText?: boolean } = {}): DocumentRecord {
  const stored = (row.extractedData as { items?: NfeItem[]; details?: NfeDetails | null } | null) ?? {};
  const storedItems = stored.items ?? [];
  const fiscal: FiscalData = {
    documentType: row.documentType === 'NFE' ? 'NFE' : null,
    documentNumber: row.documentNumber,
    accessKey: row.accessKey,
    issuerName: row.issuerName,
    issuerDocument: row.issuerDocument,
    recipientName: row.recipientName,
    recipientDocument: row.recipientDocument,
    issuedAt: row.issuedAt,
    totalAmount: row.totalAmount === null ? null : Number(row.totalAmount),
    items: storedItems,
    details: stored.details ?? null,
  };

  return {
    id: row.id,
    companyId: row.companyId,
    uploadedById: row.uploadedById,
    originalName: row.originalName,
    kind: row.kind,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    storageKey: row.storageKey,
    status: row.status,
    failureReason: row.failureReason,
    fiscal,
    hasText: row.hasText,
    extractedText: options.withText === false ? null : row.extractedText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
