import type { DocumentIssue, DocumentKind, FiscalData } from '../entities/fiscal-document.js';
import { isValidAccessKey } from '../value-objects/access-key.js';
import { isValidCnpj, normalizeCnpj } from '../value-objects/cnpj.js';

export interface RuleInput {
  kind: DocumentKind;
  data: FiscalData;
  /** Se algum texto foi extraído do PDF (não exige carregar o texto). */
  hasText: boolean;
  now: Date;
}

/*
 * Verificações determinísticas de consistência. Não fazem juízo tributário:
 * apenas apontam dados ausentes, inválidos ou contraditórios para revisão humana.
 */
export function checkDocumentConsistency(input: RuleInput): DocumentIssue[] {
  if (input.kind === 'PDF') {
    return checkPdf(input);
  }
  return checkNfe(input);
}

function checkPdf({ hasText }: RuleInput): DocumentIssue[] {
  if (!hasText) {
    return [
      rule('NO_TEXT', 'WARNING', 'Não foi possível extrair texto do PDF. Ele pode ser uma imagem digitalizada.'),
    ];
  }
  return [
    rule('PDF_UNSTRUCTURED', 'INFO', 'PDF sem campos fiscais estruturados. A análise usa somente o texto extraído.'),
  ];
}

function checkNfe({ data, now }: RuleInput): DocumentIssue[] {
  const issues: DocumentIssue[] = [];

  if (data.totalAmount === null) {
    issues.push(rule('TOTAL_MISSING', 'WARNING', 'O valor total do documento não foi encontrado.'));
  } else if (data.totalAmount <= 0) {
    issues.push(rule('TOTAL_NOT_POSITIVE', 'ERROR', 'O valor total do documento é zero ou negativo.'));
  }

  if (data.accessKey !== null && !isValidAccessKey(data.accessKey)) {
    issues.push(
      rule('ACCESS_KEY_INVALID', 'ERROR', 'A chave de acesso não passou na validação do dígito verificador.'),
    );
  }

  if (data.issuerDocument !== null && !isValidDocument(data.issuerDocument)) {
    issues.push(rule('ISSUER_DOCUMENT_INVALID', 'ERROR', 'O CNPJ do emitente é inválido.'));
  }

  if (data.recipientDocument !== null && !isValidDocument(data.recipientDocument)) {
    issues.push(rule('RECIPIENT_DOCUMENT_INVALID', 'ERROR', 'O CNPJ/CPF do destinatário é inválido.'));
  }

  if (data.issuedAt !== null && data.issuedAt.getTime() > now.getTime()) {
    issues.push(rule('ISSUED_IN_FUTURE', 'WARNING', 'A data de emissão está no futuro.'));
  }

  if (data.items.length > 0 && data.totalAmount !== null) {
    const itemsSum = data.items.reduce((sum, item) => sum + (item.total ?? 0), 0);
    if (Math.abs(itemsSum - data.totalAmount) > 0.01) {
      issues.push(
        rule(
          'ITEMS_TOTAL_DIVERGENT',
          'WARNING',
          'A soma dos itens difere do valor total. Diferenças podem decorrer de impostos, fretes ou descontos: confira o documento.',
        ),
      );
    }
  }

  return issues;
}

function isValidDocument(value: string): boolean {
  const digits = normalizeCnpj(value);
  // CPF (11 dígitos) não é validado aqui; só CNPJ (14 dígitos) tem validação de DV.
  return digits.length === 14 ? isValidCnpj(digits) : true;
}

function rule(code: string, severity: DocumentIssue['severity'], message: string): DocumentIssue {
  return { code, severity, message, source: 'RULE' };
}
