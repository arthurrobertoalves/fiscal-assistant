import { extractText, getDocumentProxy } from 'unpdf';
import type { PdfTextExtractor } from '../../application/ports/document-processing.ports.js';

/** Extrai o texto de todas as páginas de um PDF. Não executa scripts do documento. */
export class UnpdfTextExtractor implements PdfTextExtractor {
  async extractText(content: Buffer): Promise<string> {
    const pdf = await getDocumentProxy(new Uint8Array(content));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
}
