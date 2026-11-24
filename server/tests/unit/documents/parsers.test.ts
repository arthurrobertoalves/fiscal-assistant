import { describe, expect, it } from 'vitest';
import { NfeXmlParser } from '../../../src/infrastructure/parsers/nfe-xml-parser.js';
import { UnpdfTextExtractor } from '../../../src/infrastructure/parsers/pdf-text-extractor.js';
import { XmlParseError } from '../../../src/application/ports/document-processing.ports.js';
import { VALID_ACCESS_KEY, buildNfeXml, buildPdf, ISSUER_CNPJ } from '../../fixtures/documents.js';

const parser = new NfeXmlParser();

describe('NfeXmlParser (NF-e)', () => {
  it('extrai os campos fiscais de uma NF-e', () => {
    const result = parser.parse(Buffer.from(buildNfeXml()));

    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.data).toMatchObject({
      documentType: 'NFE',
      documentNumber: '1234',
      accessKey: VALID_ACCESS_KEY,
      issuerName: 'Padaria Central Ltda',
      issuerDocument: '11222333000181',
      recipientName: 'Mercado Sul ME',
      totalAmount: 150,
    });
    expect(result.data.issuedAt?.toISOString()).toBe('2026-05-10T13:00:00.000Z');
  });

  it('lê os itens da nota, inclusive quando há um único item', () => {
    const many = parser.parse(Buffer.from(buildNfeXml()));
    const one = parser.parse(
      Buffer.from(buildNfeXml({ items: [{ description: 'Água', quantity: '2', total: '4.00' }] })),
    );

    expect(many.supported && many.data.items).toHaveLength(2);
    expect(one.supported && one.data.items).toEqual([{ description: 'Água', quantity: 2, total: 4 }]);
  });

  it('aceita NF-e envelopada em nfeProc', () => {
    const result = parser.parse(Buffer.from(buildNfeXml({ wrapInProc: true })));

    expect(result.supported && result.data.accessKey).toBe(VALID_ACCESS_KEY);
  });

  it('deixa campos ausentes como null, sem supor valores', () => {
    const xml = buildNfeXml().replace(/<vNF>.*<\/vNF>/, '');
    const result = parser.parse(Buffer.from(xml));

    expect(result.supported && result.data.totalAmount).toBeNull();
  });

  it('informa XML válido que não é NF-e, sem lançar erro', () => {
    const result = parser.parse(Buffer.from('<?xml version="1.0"?><cte><infCte/></cte>'));

    expect(result.supported).toBe(false);
    if (!result.supported) {
      expect(result.reason).toMatch(/não é uma NF-e/);
    }
  });

  it('rejeita XML malformado com XmlParseError', () => {
    expect(() => parser.parse(Buffer.from('<NFe><infNFe Id="NFe1"></NFe>'))).toThrow(XmlParseError);
    expect(() => parser.parse(Buffer.from('isto não é xml'))).toThrow(XmlParseError);
  });

  it('não resolve entidades externas (proteção contra XXE)', () => {
    const malicious = `<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<NFe><infNFe Id="NFe${VALID_ACCESS_KEY}"><ide><nNF>&xxe;</nNF></ide><emit><CNPJ>${ISSUER_CNPJ.replace(/\D/g, '')}</CNPJ></emit><total><ICMSTot><vNF>1.00</vNF></ICMSTot></total></infNFe></NFe>`;

    // Recusado como XML inválido: nenhuma entidade externa é resolvida.
    expect(() => parser.parse(Buffer.from(malicious))).toThrow(XmlParseError);
  });
});

describe('UnpdfTextExtractor (PDF)', () => {
  const extractor = new UnpdfTextExtractor();

  it('extrai o texto de um PDF real', async () => {
    const text = await extractor.extractText(buildPdf(['Nota fiscal numero 1234', 'Valor total 150,00']));

    expect(text).toContain('Nota fiscal numero 1234');
    expect(text).toContain('Valor total 150,00');
  });

  it('lança erro para conteúdo que não é um PDF legível', async () => {
    await expect(extractor.extractText(Buffer.from('%PDF-1.4 conteúdo quebrado'))).rejects.toThrow();
  });
});
