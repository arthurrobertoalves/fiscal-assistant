import type { DocumentRecord } from '../ports/document.repository.js';

// Palavras muito comuns que não ajudam a encontrar documentos.
const STOP_WORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'um', 'uma', 'para', 'por',
  'com', 'que', 'qual', 'quais', 'quanto', 'quanta', 'como', 'se', 'no', 'na', 'nos', 'nas',
  'foi', 'ser', 'ao', 'aos', 'meu', 'minha', 'me', 'sobre', 'the', 'and', 'of',
]);

/**
 * Recuperação simples por palavras-chave (sem RAG): pontua cada documento pela sobreposição
 * de termos da pergunta com nome, campos fiscais e texto. Retorna os mais relevantes.
 */
export function selectRelevantDocuments(
  question: string,
  documents: DocumentRecord[],
  limit: number,
): DocumentRecord[] {
  const terms = new Set(tokenize(question));
  if (terms.size === 0) return [];

  return documents
    .map((document) => ({ document, score: scoreDocument(document, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.document.createdAt.getTime() - a.document.createdAt.getTime())
    .slice(0, limit)
    .map((entry) => entry.document);
}

function scoreDocument(document: DocumentRecord, terms: Set<string>): number {
  const haystack = new Set(tokenize(searchableText(document)));
  let score = 0;
  for (const term of terms) {
    if (haystack.has(term)) score += 1;
  }
  return score;
}

function searchableText(document: DocumentRecord): string {
  const { fiscal } = document;
  return [
    document.originalName,
    document.kind,
    fiscal.documentType,
    fiscal.documentNumber,
    fiscal.issuerName,
    fiscal.recipientName,
    fiscal.items.map((item) => item.description).join(' '),
    document.extractedText ?? '',
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
}

/** Minúsculas, sem acentos, somente letras e números; descarta termos curtos e palavras vazias. */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}
