import type { DocumentKind } from '../entities/fiscal-document.js';

export const MAX_FILE_NAME_LENGTH = 255;

/**
 * Identifica o tipo real do arquivo pelo conteúdo (assinatura), não pela extensão
 * nem pelo Content-Type informado pelo cliente. Retorna null se não for suportado.
 */
export function detectUploadKind(buffer: Buffer): DocumentKind | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'PDF';
  }

  // XML: após BOM e espaços, o primeiro caractere deve ser "<".
  const text = buffer.subarray(0, 512).toString('utf8').replace(/^﻿/, '').trimStart();
  if (text.startsWith('<')) {
    return 'XML';
  }

  return null;
}

export function mimeTypeFor(kind: DocumentKind): string {
  return kind === 'PDF' ? 'application/pdf' : 'application/xml';
}

/**
 * Remove caminhos e caracteres de controle do nome enviado pelo cliente.
 * O nome original é apenas exibido; nunca é usado para gravar o arquivo.
 */
export function sanitizeFileName(rawName: string): string {
  const baseName = rawName.split(/[\\/]/).pop() ?? '';
  const cleaned = baseName
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const fallback = cleaned.length > 0 ? cleaned : 'documento';
  return fallback.slice(0, MAX_FILE_NAME_LENGTH);
}
