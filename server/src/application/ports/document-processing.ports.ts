import type { DocumentIssue, FiscalData } from '../../domain/entities/fiscal-document.js';

/** Armazena os arquivos fora do banco. O nome do arquivo é gerado, nunca o original. */
export interface FileStorage {
  save(companyId: string, content: Buffer, extension: 'pdf' | 'xml'): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
}

/** Extrai o texto de um PDF. Lança erro se o arquivo não puder ser lido. */
export interface PdfTextExtractor {
  extractText(content: Buffer): Promise<string>;
}

export type XmlParseResult =
  | { supported: true; data: FiscalData }
  | { supported: false; reason: string };

/** Interpreta um XML fiscal. Lança XmlParseError se o conteúdo não for XML válido. */
export interface XmlDocumentParser {
  parse(content: Buffer): XmlParseResult;
}

export class XmlParseError extends Error {
  constructor(message = 'Conteúdo XML inválido.') {
    super(message);
    this.name = 'XmlParseError';
  }
}

/** Contexto de um documento enviado à IA. */
export interface DocumentContextForAi {
  id: string;
  name: string;
  kind: 'PDF' | 'XML';
  fiscal: FiscalData;
  ruleIssues: DocumentIssue[];
  text: string | null;
}

export interface AiDocumentAnalysis {
  explanation: string;
  insufficientInformation: boolean;
}

/** Provedor de IA. Quando não configurado, o caso de uso registra a análise como SKIPPED. */
export interface AiAssistant {
  readonly model: string;
  analyzeDocument(document: DocumentContextForAi): Promise<AiDocumentAnalysis>;
  answerQuestion(question: string, documents: DocumentContextForAi[]): Promise<string>;
}
