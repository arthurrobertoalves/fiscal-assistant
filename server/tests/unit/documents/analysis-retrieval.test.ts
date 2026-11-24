import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisRecord, AnalysisRepository, NewAnalysis } from '../../../src/application/ports/analysis.repository.js';
import type { DocumentRecord } from '../../../src/application/ports/document.repository.js';
import type { AiAssistant, DocumentContextForAi } from '../../../src/application/ports/document-processing.ports.js';
import { DocumentAnalysisService, MAX_TEXT_FOR_AI } from '../../../src/application/services/document-analysis.service.js';
import { selectRelevantDocuments, tokenize } from '../../../src/application/services/document-retrieval.js';
import { LocalFileStorage } from '../../../src/infrastructure/storage/local-file-storage.js';
import { EMPTY_FISCAL_DATA } from '../../../src/domain/entities/fiscal-document.js';
import { VALID_ACCESS_KEY } from '../../fixtures/documents.js';

const NOW = new Date('2026-06-01T12:00:00.000Z');

function makeDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    companyId: 'c1',
    uploadedById: 'u1',
    originalName: 'nota.xml',
    kind: 'XML',
    mimeType: 'application/xml',
    sizeBytes: 100,
    sha256: 'a'.repeat(64),
    storageKey: 'c1/x.xml',
    status: 'PROCESSED',
    failureReason: null,
    fiscal: { ...EMPTY_FISCAL_DATA, documentType: 'NFE', accessKey: VALID_ACCESS_KEY, totalAmount: 150 },
    hasText: false,
    extractedText: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Repositório de análises em memória, só o necessário para o serviço. */
function makeAnalysisRepository(): AnalysisRepository & { saved: NewAnalysis[] } {
  const saved: NewAnalysis[] = [];
  return {
    saved,
    async create(data) {
      saved.push(data);
      return { id: 'an-1', createdAt: NOW, ...data } as AnalysisRecord;
    },
    async findLatest() {
      return null;
    },
    async findLatestForDocuments() {
      return new Map();
    },
    async countCompletedForCompany() {
      return 0;
    },
  };
}

function fakeAi(analysis: Partial<{ summary: string; insufficientInformation: boolean }> = {}) {
  const seen: DocumentContextForAi[] = [];
  const ai: AiAssistant & { seen: DocumentContextForAi[] } = {
    model: 'modelo-teste',
    seen,
    async analyzeDocument(doc) {
      seen.push(doc);
      return {
        explanation: analysis.summary ?? 'Resumo do documento.',
        insufficientInformation: analysis.insufficientInformation ?? false,
      };
    },
    async answerQuestion() {
      return 'resposta';
    },
  };
  return ai;
}

describe('DocumentAnalysisService', () => {
  it('sem IA configurada, registra SKIPPED com as verificações automáticas', async () => {
    const repo = makeAnalysisRepository();
    const service = new DocumentAnalysisService(repo, null, () => NOW);

    const result = await service.analyze(makeDocument());

    expect(result.status).toBe('SKIPPED');
    expect(repo.saved[0]?.aiModel).toBeNull();
    expect(repo.saved[0]?.errorMessage).toMatch(/não configurado/);
  });

  it('com IA, registra COMPLETED com a explicação em texto corrido, sem listas', async () => {
    const repo = makeAnalysisRepository();
    const ai = fakeAi({ summary: 'Venda de pães e cafés, emitida em 10/05/2026.' });
    const service = new DocumentAnalysisService(repo, ai, () => NOW);

    await service.analyze(makeDocument());

    const saved = repo.saved[0]!;
    expect(saved.status).toBe('COMPLETED');
    expect(saved.summary).toBe('Venda de pães e cafés, emitida em 10/05/2026.');
    expect(saved.aiModel).toBe('modelo-teste');
    expect(saved.issues.every((issue) => issue.source === 'RULE')).toBe(true);
  });

  it('falha do provedor vira FAILED sem vazar detalhes técnicos e sem derrubar o fluxo', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const repo = makeAnalysisRepository();
    const ai: AiAssistant = {
      model: 'modelo-teste',
      analyzeDocument: async () => {
        throw new Error('chave sk-secreta vazou no erro');
      },
      answerQuestion: async () => '',
    };
    const service = new DocumentAnalysisService(repo, ai, () => NOW);

    const result = await service.analyze(makeDocument());

    expect(result.status).toBe('FAILED');
    expect(repo.saved[0]?.errorMessage).not.toContain('sk-secreta');
    // O log registra só o tipo do erro.
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('sk-secreta');
    errorSpy.mockRestore();
  });

  it('envia à IA apenas o início do texto do PDF', async () => {
    const repo = makeAnalysisRepository();
    const ai = fakeAi();
    const service = new DocumentAnalysisService(repo, ai, () => NOW);
    const longText = 'x'.repeat(MAX_TEXT_FOR_AI + 500);

    await service.analyze(makeDocument({ kind: 'PDF', hasText: true, extractedText: longText }));

    expect(ai.seen[0]?.text).toHaveLength(MAX_TEXT_FOR_AI);
  });
});

describe('recuperação de documentos relevantes (chat)', () => {
  const pao = makeDocument({ id: 'pao', originalName: 'nota-padaria.xml', fiscal: { ...EMPTY_FISCAL_DATA, issuerName: 'Padaria Central', items: [{ description: 'Pão francês', quantity: 1, total: 10 }] } });
  const cafe = makeDocument({ id: 'cafe', originalName: 'cafe.pdf', kind: 'PDF', hasText: true, extractedText: 'Compra de cafe torrado e moído' });
  const frete = makeDocument({ id: 'frete', originalName: 'frete.xml', fiscal: { ...EMPTY_FISCAL_DATA, issuerName: 'Transportadora Rápida' } });

  it('ranqueia pelos documentos com mais termos em comum com a pergunta', () => {
    const result = selectRelevantDocuments('quanto custou o pão da padaria?', [frete, cafe, pao], 5);

    expect(result.map((doc) => doc.id)).toEqual(['pao']);
  });

  it('ignora acentos e palavras vazias na comparação', () => {
    expect(tokenize('Quanto custou o CAFÉ?')).toEqual(['custou', 'cafe']);
    const result = selectRelevantDocuments('café', [pao, cafe], 5);
    expect(result.map((doc) => doc.id)).toEqual(['cafe']);
  });

  it('retorna vazio quando nenhum documento tem termos em comum', () => {
    expect(selectRelevantDocuments('previsão do tempo amanhã', [pao, cafe, frete], 5)).toEqual([]);
  });

  it('respeita o limite de documentos', () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      makeDocument({ id: `doc-${index}`, originalName: `padaria-${index}.xml` }),
    );
    expect(selectRelevantDocuments('padaria', many, 5)).toHaveLength(5);
  });
});

describe('LocalFileStorage', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'storage-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('grava com nome gerado dentro da pasta da empresa e lê de volta', async () => {
    const storage = new LocalFileStorage(dir);
    const key = await storage.save('empresa-1', Buffer.from('conteudo'), 'xml');

    expect(key).toMatch(/^empresa-1\/[0-9a-f-]{36}\.xml$/);
    expect((await storage.read(key)).toString()).toBe('conteudo');
  });

  it('recusa caminhos que saem da pasta base (path traversal)', async () => {
    const storage = new LocalFileStorage(dir);

    await expect(storage.read('../../etc/passwd')).rejects.toMatchObject({ statusCode: 403 });
    await expect(storage.read('../outra-pasta/arquivo.pdf')).rejects.toMatchObject({ statusCode: 403 });
  });
});
