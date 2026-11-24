import { describe, expect, it } from 'vitest';
import { isValidAccessKey } from '../../../src/domain/value-objects/access-key.js';
import { checkDocumentConsistency } from '../../../src/domain/rules/document-rules.js';
import { detectUploadKind, sanitizeFileName } from '../../../src/domain/value-objects/upload.js';
import { EMPTY_FISCAL_DATA, type FiscalData } from '../../../src/domain/entities/fiscal-document.js';
import { VALID_ACCESS_KEY, accessKeyWithCheckDigit, buildPdf } from '../../fixtures/documents.js';

const NOW = new Date('2026-06-01T12:00:00.000Z');

function nfe(overrides: Partial<FiscalData> = {}): FiscalData {
  return {
    ...EMPTY_FISCAL_DATA,
    documentType: 'NFE',
    documentNumber: '1234',
    accessKey: VALID_ACCESS_KEY,
    issuerDocument: '11222333000181',
    recipientDocument: '11444777000161',
    issuedAt: new Date('2026-05-10T10:00:00-03:00'),
    totalAmount: 150,
    items: [
      { description: 'Pão', quantity: 10, total: 100 },
      { description: 'Café', quantity: 5, total: 50 },
    ],
    ...overrides,
  };
}

describe('chave de acesso da NF-e', () => {
  it('aceita chave com dígito verificador correto', () => {
    expect(VALID_ACCESS_KEY).toHaveLength(44);
    expect(isValidAccessKey(VALID_ACCESS_KEY)).toBe(true);
  });

  it('rejeita chave com dígito verificador errado', () => {
    const wrong = VALID_ACCESS_KEY.slice(0, 43) + ((Number(VALID_ACCESS_KEY[43]) + 1) % 10);
    expect(isValidAccessKey(wrong)).toBe(false);
  });

  it('rejeita tamanho incorreto e caracteres não numéricos', () => {
    expect(isValidAccessKey(VALID_ACCESS_KEY.slice(1))).toBe(false);
    expect(isValidAccessKey(`${VALID_ACCESS_KEY.slice(0, 43)}X`)).toBe(false);
  });

  it('calcula DV 0 quando o resto da soma é 0 ou 1', () => {
    const key = accessKeyWithCheckDigit('0'.repeat(43));
    expect(key.endsWith('0')).toBe(true);
    expect(isValidAccessKey(key)).toBe(true);
  });
});

describe('detecção do tipo de arquivo (pelo conteúdo)', () => {
  it('reconhece PDF pela assinatura %PDF-', () => {
    expect(detectUploadKind(buildPdf(['teste']))).toBe('PDF');
  });

  it('reconhece XML mesmo com BOM e espaços antes da declaração', () => {
    const xml = Buffer.from('\uFEFF   <?xml version="1.0"?><root/>', 'utf8');
    expect(detectUploadKind(xml)).toBe('XML');
  });

  it('rejeita conteúdo que não é PDF nem XML, mesmo com extensão enganosa', () => {
    expect(detectUploadKind(Buffer.from('MZ\x90\x00 executável disfarçado'))).toBeNull();
    expect(detectUploadKind(Buffer.from('texto simples'))).toBeNull();
    expect(detectUploadKind(Buffer.alloc(0))).toBeNull();
  });
});

describe('sanitização do nome original', () => {
  it('remove caminhos e controla o tamanho', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\temp\\nota.xml')).toBe('nota.xml');
    expect(sanitizeFileName('nota\u0000\u0007 fiscal  .pdf')).toBe('nota fiscal .pdf');
    expect(sanitizeFileName('   ')).toBe('documento');
    expect(sanitizeFileName('a'.repeat(400))).toHaveLength(255);
  });
});

describe('verificações de consistência (sem IA)', () => {
  it('não aponta nada para NF-e consistente', () => {
    expect(checkDocumentConsistency({ kind: 'XML', data: nfe(), hasText: false, now: NOW })).toEqual([]);
  });

  it('marca valor total zero ou negativo como erro', () => {
    const issues = checkDocumentConsistency({ kind: 'XML', data: nfe({ totalAmount: 0 }), hasText: false, now: NOW });
    expect(issues.map((issue) => issue.code)).toContain('TOTAL_NOT_POSITIVE');
  });

  it('avisa quando o total não foi encontrado, sem supor um valor', () => {
    const issues = checkDocumentConsistency({ kind: 'XML', data: nfe({ totalAmount: null }), hasText: false, now: NOW });
    expect(issues.map((issue) => issue.code)).toContain('TOTAL_MISSING');
  });

  it('aponta chave de acesso e CNPJ com dígitos verificadores inválidos', () => {
    const issues = checkDocumentConsistency({
      kind: 'XML',
      data: nfe({ accessKey: '1'.repeat(44), issuerDocument: '11222333000182' }),
      hasText: false,
      now: NOW,
    });
    const codes = issues.map((issue) => issue.code);
    expect(codes).toContain('ACCESS_KEY_INVALID');
    expect(codes).toContain('ISSUER_DOCUMENT_INVALID');
  });

  it('não valida CPF de destinatário como CNPJ', () => {
    const issues = checkDocumentConsistency({
      kind: 'XML',
      data: nfe({ recipientDocument: '52998224725' }),
      hasText: false,
      now: NOW,
    });
    expect(issues.map((issue) => issue.code)).not.toContain('RECIPIENT_DOCUMENT_INVALID');
  });

  it('marca data de emissão futura', () => {
    const issues = checkDocumentConsistency({
      kind: 'XML',
      data: nfe({ issuedAt: new Date('2027-01-01T00:00:00Z') }),
      hasText: false,
      now: NOW,
    });
    expect(issues.map((issue) => issue.code)).toContain('ISSUED_IN_FUTURE');
  });

  it('aponta divergência entre soma dos itens e total, sem concluir sobre impostos', () => {
    const issues = checkDocumentConsistency({
      kind: 'XML',
      data: nfe({ totalAmount: 200 }),
      hasText: false,
      now: NOW,
    });
    const divergence = issues.find((issue) => issue.code === 'ITEMS_TOTAL_DIVERGENT');
    expect(divergence?.severity).toBe('WARNING');
    expect(divergence?.message).toMatch(/impostos, fretes ou descontos/);
  });

  it('PDF sem texto extraído é alerta; PDF com texto só recebe a observação de que é não estruturado', () => {
    const noText = checkDocumentConsistency({ kind: 'PDF', data: EMPTY_FISCAL_DATA, hasText: false, now: NOW });
    const withText = checkDocumentConsistency({ kind: 'PDF', data: EMPTY_FISCAL_DATA, hasText: true, now: NOW });

    expect(noText[0]?.code).toBe('NO_TEXT');
    expect(withText[0]?.code).toBe('PDF_UNSTRUCTURED');
    expect(withText[0]?.severity).toBe('INFO');
  });
});
