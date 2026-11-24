import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestPrisma, getTestDatabaseUrl, resetTestDatabase } from '../helpers/test-db.js';
import { CNPJ_OWNER_COMPANY, CNPJ_SECOND_COMPANY, authHeader, buildTestApp, registerUser, MAX_UPLOAD_MB } from './support.js';
import { buildNfeXml, buildPdf } from '../fixtures/documents.js';

const url = getTestDatabaseUrl();

describe.skipIf(!url)('API de documentos fiscais (PostgreSQL de teste)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma(url!);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Cria um usuário dono e uma empresa; devolve os dados necessários para os cenários. */
  async function setupCompany(app: ReturnType<typeof buildTestApp>, cnpj = CNPJ_OWNER_COMPANY) {
    const owner = await registerUser(app, 'dono');
    const created = await request(app)
      .post('/companies')
      .set(authHeader(owner.accessToken))
      .send({ name: 'Padaria Central', document: cnpj })
      .expect(201);
    return { owner, companyId: created.body.company.id as string };
  }

  function upload(app: ReturnType<typeof buildTestApp>, token: string, companyId: string, content: Buffer, filename: string, contentType = 'application/octet-stream') {
    return request(app)
      .post(`/companies/${companyId}/documents`)
      .set(authHeader(token))
      .attach('file', content, { filename, contentType });
  }

  describe('envio (upload)', () => {
    it('aceita PDF, extrai o texto e registra a análise como SKIPPED sem IA configurada', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);

      const response = await upload(app, owner.accessToken, companyId, buildPdf(['Pedido 987 total 150,00']), 'pedido.pdf', 'application/pdf').expect(201);

      expect(response.body.document).toMatchObject({ name: 'pedido.pdf', kind: 'PDF', status: 'PROCESSED', hasText: true });
      expect(response.body.analysis).toMatchObject({ status: 'SKIPPED' });
    });

    it('aceita NF-e e extrai os campos fiscais', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);

      const response = await upload(app, owner.accessToken, companyId, Buffer.from(buildNfeXml()), 'nfe.xml', 'text/xml').expect(201);

      expect(response.body.document.kind).toBe('XML');
      expect(response.body.document.fiscal).toMatchObject({
        documentType: 'NFE',
        documentNumber: '1234',
        totalAmount: 150,
        issuer: { name: 'Padaria Central Ltda', document: '11222333000181' },
      });
      expect(response.body.document.fiscal.items).toHaveLength(2);
    });

    it('recusa arquivo que não é PDF nem XML, mesmo com extensão .pdf', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);

      const response = await upload(app, owner.accessToken, companyId, Buffer.from('MZ executável'), 'falso.pdf', 'application/pdf').expect(422);

      expect(response.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    });

    it('recusa XML malformado e não grava nada', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);

      const response = await upload(app, owner.accessToken, companyId, Buffer.from('<NFe><infNFe></NFe>'), 'ruim.xml').expect(422);

      expect(response.body.error.code).toBe('INVALID_FILE');
      expect(await prisma.document.count()).toBe(0);
    });

    it('registra XML válido de outro tipo como FAILED, com motivo, em vez de descartá-lo', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);
      const cte = Buffer.from('<?xml version="1.0"?><cte><infCte Id="CTe1"/></cte>');

      const response = await upload(app, owner.accessToken, companyId, cte, 'transporte.xml').expect(201);

      expect(response.body.document.status).toBe('FAILED');
      expect(response.body.document.failureReason).toMatch(/Apenas NF-e/);
      expect(response.body.analysis).toBeNull();
    });

    it('recusa arquivo acima do limite de tamanho com 413', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);
      const huge = Buffer.alloc(MAX_UPLOAD_MB * 1024 * 1024 + 1, 0x20);

      const response = await upload(app, owner.accessToken, companyId, huge, 'grande.xml').expect(413);

      expect(response.body.error.code).toBe('FILE_TOO_LARGE');
    });

    it('recusa arquivo vazio e requisição sem o campo "file"', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);

      await upload(app, owner.accessToken, companyId, Buffer.alloc(0), 'vazio.xml').expect(422);
      const missing = await request(app)
        .post(`/companies/${companyId}/documents`)
        .set(authHeader(owner.accessToken))
        .send();
      expect(missing.status).toBe(422);
      expect(missing.body.error.code).toBe('FILE_REQUIRED');
    });

    it('recusa o mesmo documento duas vezes na mesma empresa', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);
      const xml = Buffer.from(buildNfeXml());
      await upload(app, owner.accessToken, companyId, xml, 'nfe.xml').expect(201);

      const duplicate = await upload(app, owner.accessToken, companyId, xml, 'copia.xml').expect(409);

      expect(duplicate.body.error.code).toBe('DOCUMENT_ALREADY_UPLOADED');
      expect(duplicate.body.error.details.documentId).toBeTruthy();
    });

    it('usa o nome do arquivo apenas para exibição, sem caminhos', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);

      const response = await upload(app, owner.accessToken, companyId, Buffer.from(buildNfeXml()), '../../../etc/passwd.xml').expect(201);

      expect(response.body.document.name).toBe('passwd.xml');
      const stored = await prisma.document.findUniqueOrThrow({ where: { id: response.body.document.id } });
      expect(stored.storageKey).not.toContain('passwd');
    });
  });

  describe('listagem, detalhe e download', () => {
    it('lista os documentos da empresa do mais recente para o mais antigo, com paginação', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);
      await upload(app, owner.accessToken, companyId, Buffer.from(buildNfeXml({ number: '1' })), 'a.xml').expect(201);
      await upload(app, owner.accessToken, companyId, Buffer.from(buildNfeXml({ number: '2', accessKey: undefined, total: '20.00' })), 'b.xml').expect(201);

      const page = await request(app)
        .get(`/companies/${companyId}/documents?pageSize=1`)
        .set(authHeader(owner.accessToken))
        .expect(200);

      expect(page.body.total).toBe(2);
      expect(page.body.items).toHaveLength(1);
      expect(page.body.items[0].name).toBe('b.xml');
      expect(JSON.stringify(page.body)).not.toContain('storageKey');
    });

    it('detalhe inclui alertas automáticos (ex.: valor zero)', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);
      const uploaded = await upload(app, owner.accessToken, companyId, Buffer.from(buildNfeXml({ total: '0.00' })), 'zero.xml').expect(201);

      const detail = await request(app)
        .get(`/companies/${companyId}/documents/${uploaded.body.document.id}`)
        .set(authHeader(owner.accessToken))
        .expect(200);

      expect(detail.body.ruleIssues.map((issue: { code: string }) => issue.code)).toContain('TOTAL_NOT_POSITIVE');
    });

    it('devolve o arquivo original com cabeçalhos de segurança', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);
      const xml = Buffer.from(buildNfeXml());
      const uploaded = await upload(app, owner.accessToken, companyId, xml, 'nfe.xml').expect(201);

      const file = await request(app)
        .get(`/companies/${companyId}/documents/${uploaded.body.document.id}/file`)
        .set(authHeader(owner.accessToken))
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(Buffer.from(file.body).equals(xml)).toBe(true);
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(file.headers['content-security-policy']).toBe("default-src 'none'");
      expect(file.headers['content-type']).toMatch(/xml/);
    });
  });

  describe('isolamento entre empresas', () => {
    it('documentos de uma empresa não aparecem para outra, nem por id direto', async () => {
      const app = buildTestApp(prisma);
      const a = await setupCompany(app, CNPJ_OWNER_COMPANY);
      const b = await setupCompany(app, CNPJ_SECOND_COMPANY);
      const doc = await upload(app, a.owner.accessToken, a.companyId, Buffer.from(buildNfeXml()), 'secreto.xml').expect(201);
      const documentId = doc.body.document.id;

      // Lista da empresa B não contém o documento da A.
      const list = await request(app).get(`/companies/${b.companyId}/documents`).set(authHeader(b.owner.accessToken)).expect(200);
      expect(list.body.items).toEqual([]);

      // Acesso direto por id, usando a empresa B no caminho: 404 (o documento não existe ali).
      const detail = await request(app).get(`/companies/${b.companyId}/documents/${documentId}`).set(authHeader(b.owner.accessToken));
      expect(detail.status).toBe(404);
      expect(detail.body.error.code).toBe('DOCUMENT_NOT_FOUND');

      const file = await request(app).get(`/companies/${b.companyId}/documents/${documentId}/file`).set(authHeader(b.owner.accessToken));
      expect(file.status).toBe(404);

      // Usuário da B tentando usar a empresa A no caminho: 404 de empresa, sem revelar nada.
      const crossCompany = await request(app).get(`/companies/${a.companyId}/documents`).set(authHeader(b.owner.accessToken));
      expect(crossCompany.status).toBe(404);
      expect(crossCompany.body.error.code).toBe('COMPANY_NOT_FOUND');
    });

    it('impede envio de documento para empresa da qual o usuário não é membro', async () => {
      const app = buildTestApp(prisma);
      const a = await setupCompany(app, CNPJ_OWNER_COMPANY);
      const intruder = await registerUser(app, 'intruso');

      const response = await upload(app, intruder.accessToken, a.companyId, Buffer.from(buildNfeXml()), 'x.xml').expect(404);

      expect(response.body.error.code).toBe('COMPANY_NOT_FOUND');
      expect(await prisma.document.count()).toBe(0);
    });

    it('membro com papel MEMBER pode enviar e consultar documentos', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);
      const member = await registerUser(app, 'membro');
      await request(app)
        .post(`/companies/${companyId}/members`)
        .set(authHeader(owner.accessToken))
        .send({ email: member.email, role: 'MEMBER' })
        .expect(201);

      const uploaded = await upload(app, member.accessToken, companyId, Buffer.from(buildNfeXml()), 'membro.xml').expect(201);
      const list = await request(app).get(`/companies/${companyId}/documents`).set(authHeader(member.accessToken)).expect(200);

      expect(uploaded.body.document.name).toBe('membro.xml');
      expect(list.body.total).toBe(1);
    });

    it('exige autenticação para todas as rotas de documentos', async () => {
      const app = buildTestApp(prisma);
      const { companyId } = await setupCompany(app);

      await request(app).get(`/companies/${companyId}/documents`).expect(401);
    });
  });

  describe('análise com IA', () => {
    it('reanalisa um documento processado e grava a análise da IA', async () => {
      const app = buildTestApp(prisma, {
        ai: {
          model: 'modelo-teste',
          analyzeDocument: async () => ({ explanation: 'Venda de pães.', insufficientInformation: false }),
          answerQuestion: async () => 'ok',
        },
      });
      const { owner, companyId } = await setupCompany(app);
      const uploaded = await upload(app, owner.accessToken, companyId, Buffer.from(buildNfeXml()), 'nfe.xml').expect(201);

      const analysis = await request(app)
        .post(`/companies/${companyId}/documents/${uploaded.body.document.id}/analysis`)
        .set(authHeader(owner.accessToken))
        .expect(201);

      expect(analysis.body).toMatchObject({ status: 'COMPLETED', summary: 'Venda de pães.', aiModel: 'modelo-teste' });
    });

    it('falha da IA não impede o envio: o documento fica processado e a análise registra FAILED', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const app = buildTestApp(prisma, {
        ai: {
          model: 'modelo-teste',
          analyzeDocument: async () => {
            throw new Error('timeout no provedor');
          },
          answerQuestion: async () => 'ok',
        },
      });
      const { owner, companyId } = await setupCompany(app);

      const response = await upload(app, owner.accessToken, companyId, Buffer.from(buildNfeXml()), 'nfe.xml').expect(201);

      expect(response.body.document.status).toBe('PROCESSED');
      expect(response.body.analysis.status).toBe('FAILED');
      expect(JSON.stringify(response.body)).not.toContain('timeout no provedor');
      errorSpy.mockRestore();
    });

    it('não reanalisa documento que falhou no processamento', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);
      const failed = await upload(app, owner.accessToken, companyId, Buffer.from('<?xml version="1.0"?><cte><x/></cte>'), 'cte.xml').expect(201);

      const response = await request(app)
        .post(`/companies/${companyId}/documents/${failed.body.document.id}/analysis`)
        .set(authHeader(owner.accessToken))
        .expect(409);

      expect(response.body.error.code).toBe('DOCUMENT_NOT_PROCESSED');
    });
  });
});
