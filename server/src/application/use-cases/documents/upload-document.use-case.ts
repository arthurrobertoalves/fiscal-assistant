import { createHash } from 'node:crypto';
import type { DocumentKind, FiscalData } from '../../../domain/entities/fiscal-document.js';
import { EMPTY_FISCAL_DATA } from '../../../domain/entities/fiscal-document.js';
import { detectUploadKind, mimeTypeFor, sanitizeFileName } from '../../../domain/value-objects/upload.js';
import { AppError, errors } from '../../../shared/errors/app-error.js';
import type { AnalysisRecord } from '../../ports/analysis.repository.js';
import type { DocumentRecord, DocumentRepository, NewDocument } from '../../ports/document.repository.js';
import {
  XmlParseError,
  type FileStorage,
  type PdfTextExtractor,
  type XmlDocumentParser,
} from '../../ports/document-processing.ports.js';
import type { CompanyAccessService } from '../../services/company-access.service.js';
import type { DocumentAnalysisService } from '../../services/document-analysis.service.js';

/** Texto máximo guardado por documento PDF. */
export const MAX_EXTRACTED_TEXT = 20_000;

export interface UploadInput {
  originalName: string;
  content: Buffer;
}

export interface UploadResult {
  document: DocumentRecord;
  analysis: AnalysisRecord | null;
}

interface ProcessingOutcome {
  status: 'PROCESSED' | 'FAILED';
  failureReason: string | null;
  fiscal: FiscalData;
  hasText: boolean;
  extractedText: string | null;
}

export class UploadDocumentUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly documents: DocumentRepository,
    private readonly storage: FileStorage,
    private readonly pdf: PdfTextExtractor,
    private readonly xml: XmlDocumentParser,
    private readonly analysis: DocumentAnalysisService,
    private readonly maxBytes: number,
  ) {}

  async execute(userId: string, companyId: string, input: UploadInput): Promise<UploadResult> {
    await this.access.requireMembership(userId, companyId);

    if (input.content.length === 0) {
      throw new AppError(422, 'EMPTY_FILE', 'O arquivo está vazio.');
    }
    if (input.content.length > this.maxBytes) {
      throw new AppError(413, 'FILE_TOO_LARGE', `O arquivo excede o limite de ${Math.round(this.maxBytes / 1024 / 1024)} MB.`);
    }

    const kind = detectUploadKind(input.content);
    if (!kind) {
      throw new AppError(422, 'UNSUPPORTED_FILE_TYPE', 'Envie um arquivo PDF ou XML.');
    }

    const sha256 = createHash('sha256').update(input.content).digest('hex');
    const duplicate = await this.documents.findBySha256(companyId, sha256);
    if (duplicate) {
      throw new AppError(409, 'DOCUMENT_ALREADY_UPLOADED', 'Este documento já foi enviado para a empresa.', {
        documentId: duplicate.id,
      });
    }

    // Validação de conteúdo antes de gravar: XML malformado é recusado e nada é guardado.
    const outcome = await this.process(kind, input.content);

    const storageKey = await this.storage.save(companyId, input.content, kind === 'PDF' ? 'pdf' : 'xml');
    const data: NewDocument = {
      companyId,
      uploadedById: userId,
      originalName: sanitizeFileName(input.originalName),
      kind,
      mimeType: mimeTypeFor(kind),
      sizeBytes: input.content.length,
      sha256,
      storageKey,
      status: outcome.status,
      failureReason: outcome.failureReason,
      fiscal: outcome.fiscal,
      hasText: outcome.hasText,
      extractedText: outcome.extractedText,
    };
    const document = await this.documents.create(data);

    const analysis = document.status === 'PROCESSED' ? await this.analysis.analyze(document) : null;
    return { document, analysis };
  }

  private async process(kind: DocumentKind, content: Buffer): Promise<ProcessingOutcome> {
    if (kind === 'PDF') {
      return this.processPdf(content);
    }
    return this.processXml(content);
  }

  private async processPdf(content: Buffer): Promise<ProcessingOutcome> {
    try {
      const text = (await this.pdf.extractText(content)).trim();
      return {
        status: 'PROCESSED',
        failureReason: null,
        fiscal: EMPTY_FISCAL_DATA,
        hasText: text.length > 0,
        extractedText: text.length > 0 ? text.slice(0, MAX_EXTRACTED_TEXT) : null,
      };
    } catch {
      return failed('Não foi possível ler o conteúdo do PDF.');
    }
  }

  private processXml(content: Buffer): ProcessingOutcome {
    let parsed;
    try {
      parsed = this.xml.parse(content);
    } catch (error) {
      if (error instanceof XmlParseError) {
        throw errors.unprocessable('INVALID_FILE', 'O arquivo XML está malformado.');
      }
      throw error;
    }

    if (!parsed.supported) {
      return failed(parsed.reason);
    }
    return {
      status: 'PROCESSED',
      failureReason: null,
      fiscal: parsed.data,
      hasText: false,
      extractedText: null,
    };
  }
}

function failed(reason: string): ProcessingOutcome {
  return {
    status: 'FAILED',
    failureReason: reason,
    fiscal: EMPTY_FISCAL_DATA,
    hasText: false,
    extractedText: null,
  };
}
