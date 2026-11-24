import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { FiscalData, NfeDetails, NfeItem } from '../../domain/entities/fiscal-document.js';
import {
  XmlParseError,
  type XmlDocumentParser,
  type XmlParseResult,
} from '../../application/ports/document-processing.ports.js';

const MAX_ITEMS = 200;
const PAYMENT_METHODS: Record<string, string> = {
  '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de crédito', '04': 'Cartão de débito',
  '05': 'Crédito loja', '10': 'Vale alimentação', '11': 'Vale refeição', '12': 'Vale presente',
  '13': 'Vale combustível', '15': 'Boleto bancário', '16': 'Depósito bancário',
  '17': 'Pix', '18': 'Transferência bancária', '19': 'Programa de fidelidade', '90': 'Sem pagamento', '99': 'Outros',
};

type Node = Record<string, unknown>;

/**
 * Lê NF-e (modelo 55) a partir do XML. Campos ausentes viram null.
 * Não resolve entidades externas: o parser não faz requisições de rede nem lê arquivos.
 */
export class NfeXmlParser implements XmlDocumentParser {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });

  parse(content: Buffer): XmlParseResult {
    const text = content.toString('utf8').replace(/^﻿/, '');

    const validation = XMLValidator.validate(text);
    if (validation !== true) {
      throw new XmlParseError(validation.err.msg);
    }

    let root: Node;
    try {
      root = this.parser.parse(text) as Node;
    } catch {
      // DOCTYPE com entidades é recusado pelo parser (proteção contra XXE): tratado como XML inválido.
      throw new XmlParseError('XML com DOCTYPE ou entidades não é aceito.');
    }
    const infNFe = findFirst(root, 'infNFe');
    if (!infNFe) {
      return { supported: false, reason: 'XML válido, mas não é uma NF-e. Apenas NF-e é suportada nesta versão.' };
    }

    return { supported: true, data: toFiscalData(root, infNFe) };
  }
}

function toFiscalData(root: Node, infNFe: Node): FiscalData {
  const ide = asNode(infNFe.ide);
  const emit = asNode(infNFe.emit);
  const dest = asNode(infNFe.dest);
  const total = asNode(asNode(infNFe.total).ICMSTot);

  const id = String(asNode(infNFe)['@_Id'] ?? '');
  const accessKey = id.startsWith('NFe') ? id.slice(3) : null;

  return {
    documentType: 'NFE',
    documentNumber: text(ide.nNF),
    accessKey: accessKey && /^\d{44}$/.test(accessKey) ? accessKey : null,
    issuerName: text(emit.xNome),
    issuerDocument: documentOf(emit),
    recipientName: text(dest.xNome),
    recipientDocument: documentOf(dest),
    issuedAt: parseDate(text(ide.dhEmi) ?? text(ide.dEmi)),
    totalAmount: number(total.vNF),
    items: toItems(infNFe),
    details: toDetails(infNFe, ide, emit, dest, total),
  };
}

function toItems(infNFe: Node): NfeItem[] {
  const detList = asArray(infNFe.det).slice(0, MAX_ITEMS);
  return detList.map((det) => {
    const node = asNode(det);
    const prod = asNode(node.prod);
    const imposto = asNode(node.imposto);
    const icms = asNode(asNode(imposto.ICMS)[Object.keys(asNode(imposto.ICMS))[0] ?? '']);
    return {
      description: text(prod.xProd) ?? '',
      quantity: number(prod.qCom),
      total: number(prod.vProd),
      code: text(prod.cProd),
      ncm: text(prod.NCM),
      cfop: text(prod.CFOP),
      unit: text(prod.uCom),
      unitPrice: number(prod.vUnCom),
      icms: number(icms.vICMS),
      pis: number(asNode(asNode(asNode(imposto.PIS)[Object.keys(asNode(imposto.PIS))[0] ?? '']) ).vPIS),
      cofins: number(asNode(asNode(asNode(imposto.COFINS)[Object.keys(asNode(imposto.COFINS))[0] ?? '']) ).vCOFINS),
    };
  });
}

function toDetails(infNFe: Node, ide: Node, emit: Node, dest: Node, total: Node): NfeDetails {
  const pagNode = asNode(infNFe.pag);
  const payments = asArray(pagNode.detPag).map((payment) => {
    const p = asNode(payment);
    const code = text(p.tPag);
    return {
      method: code ? (PAYMENT_METHODS[code] ?? `Código ${code}`) : null,
      amount: number(p.vPag),
    };
  });
  const transporta = asNode(asNode(infNFe.transp).transporta);

  return {
    operationNature: text(ide.natOp),
    operationType: text(ide.tpNF) === '0' ? 'ENTRADA' : text(ide.tpNF) === '1' ? 'SAIDA' : null,
    issuerAddress: address(asNode(emit.enderEmit)),
    recipientAddress: address(asNode(dest.enderDest)),
    taxes: {
      icmsBase: number(total.vBC),
      icms: number(total.vICMS),
      pis: number(total.vPIS),
      cofins: number(total.vCOFINS),
      ipi: number(total.vIPI),
      discount: number(total.vDesc),
      freight: number(total.vFrete),
    },
    payments,
    carrier: text(transporta.xNome),
    additionalInfo: text(asNode(infNFe.infAdic).infCpl),
  };
}

function address(node: Node): string | null {
  const parts = [
    [text(node.xLgr), text(node.nro)].filter(Boolean).join(', '),
    text(node.xBairro),
    [text(node.xMun), text(node.UF)].filter(Boolean).join('/'),
    text(node.CEP) ? `CEP ${text(node.CEP)}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' - ') : null;
}

function documentOf(party: Node): string | null {
  return text(party.CNPJ) ?? text(party.CPF);
}

/** Busca recursiva do primeiro nó com o nome indicado (ignora o nó nfeProc/NFe externo). */
function findFirst(node: unknown, name: string): Node | null {
  if (node === null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirst(item, name);
      if (found) return found;
    }
    return null;
  }
  const record = node as Node;
  if (name in record) {
    const value = record[name];
    return value !== null && typeof value === 'object' ? (value as Node) : {};
  }
  for (const value of Object.values(record)) {
    const found = findFirst(value, name);
    if (found) return found;
  }
  return null;
}

function asNode(value: unknown): Node {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Node) : {};
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

function number(value: unknown): number | null {
  const raw = text(value);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(raw: string | null): Date | null {
  if (raw === null) return null;
  // dEmi vem como "AAAA-MM-DD"; sem fuso, usa o fuso de Brasília.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00-03:00` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
