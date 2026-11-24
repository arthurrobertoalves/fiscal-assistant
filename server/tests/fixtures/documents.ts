/*
 * Documentos de exemplo para os testes. Todos os dados são fictícios.
 * CNPJs usados têm dígitos verificadores válidos, mas não pertencem a empresas reais
 * de exemplo fora dos testes.
 */

export const ISSUER_CNPJ = '11.222.333/0001-81';
export const RECIPIENT_CNPJ = '11.444.777/0001-61';

/** Calcula o DV módulo 11 da chave de acesso (implementação independente, só para os testes). */
export function accessKeyWithCheckDigit(first43: string): string {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9];
  let sum = 0;
  for (let i = 0; i < first43.length; i += 1) {
    const digit = Number(first43[first43.length - 1 - i]);
    sum += digit * weights[i % weights.length]!;
  }
  const remainder = sum % 11;
  const dv = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return `${first43}${dv}`;
}

export const VALID_ACCESS_KEY = accessKeyWithCheckDigit('3526051122233300018155001000000001100000001');

export interface NfeFixtureOptions {
  accessKey?: string;
  number?: string;
  issuerCnpj?: string;
  recipientCnpj?: string;
  recipientName?: string;
  issuedAt?: string;
  total?: string;
  items?: { description: string; quantity: string; total: string }[];
  wrapInProc?: boolean;
}

/** NF-e mínima e bem formada, com os campos que o sistema extrai. */
export function buildNfeXml(options: NfeFixtureOptions = {}): string {
  const accessKey = options.accessKey ?? VALID_ACCESS_KEY;
  const items = options.items ?? [
    { description: 'Pão francês', quantity: '10.0000', total: '100.00' },
    { description: 'Café expresso', quantity: '5.0000', total: '50.00' },
  ];
  const itemsXml = items
    .map(
      (item, index) => `
    <det nItem="${index + 1}">
      <prod>
        <cProd>${index + 1}</cProd>
        <xProd>${item.description}</xProd>
        <qCom>${item.quantity}</qCom>
        <vProd>${item.total}</vProd>
      </prod>
    </det>`,
    )
    .join('');

  const nfe = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe${accessKey}" versao="4.00">
    <ide>
      <cUF>35</cUF>
      <natOp>Venda</natOp>
      <mod>55</mod>
      <serie>1</serie>
      <nNF>${options.number ?? '1234'}</nNF>
      <dhEmi>${options.issuedAt ?? '2026-05-10T10:00:00-03:00'}</dhEmi>
    </ide>
    <emit>
      <CNPJ>${(options.issuerCnpj ?? ISSUER_CNPJ).replace(/\D/g, '')}</CNPJ>
      <xNome>Padaria Central Ltda</xNome>
    </emit>
    <dest>
      <CNPJ>${(options.recipientCnpj ?? RECIPIENT_CNPJ).replace(/\D/g, '')}</CNPJ>
      <xNome>${options.recipientName ?? 'Mercado Sul ME'}</xNome>
    </dest>
    ${itemsXml}
    <total>
      <ICMSTot>
        <vNF>${options.total ?? '150.00'}</vNF>
      </ICMSTot>
    </total>
  </infNFe>
</NFe>`;

  if (options.wrapInProc) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${nfe}</nfeProc>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${nfe}`;
}

/** PDF mínimo, com uma página e o texto informado (lido de verdade pelo extrator). */
export function buildPdf(lines: string[]): Buffer {
  const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = lines
    .map((line, index) => `BT /F1 12 Tf 50 ${760 - index * 18} Td (${escape(line)}) Tj ET`)
    .join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body, 'latin1');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body + xref, 'latin1');
}
