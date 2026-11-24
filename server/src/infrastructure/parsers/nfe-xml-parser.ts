import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { FiscalData, NfeItem } from '../../domain/entities/fiscal-document.js';
import {
  XmlParseError,
  type XmlDocumentParser,
  type XmlParseResult,
} from '../../application/ports/document-processing.ports.js';

const MAX_ITEMS = 200;

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
      throw new XmlParseError("XML com DOCTYPE ou entidades não é aceito.");
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
  };
}

function toItems(infNFe: Node): NfeItem[] {
  const detList = asArray(infNFe.det).slice(0, MAX_ITEMS);
  return detList.map((det) => {
    const prod = asNode(asNode(det).prod);
    return {
      description: text(prod.xProd) ?? '',
      quantity: number(prod.qCom),
      total: number(prod.vProd),
    };
  });
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
