import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AiAssistant, DocumentContextForAi } from '../../src/application/ports/document-processing.ports.js';
import { createTestPrisma, getTestDatabaseUrl, resetTestDatabase } from '../helpers/test-db.js';
import { CNPJ_OWNER_COMPANY, CNPJ_SECOND_COMPANY, authHeader, buildTestApp, registerUser } from './support.js';
import { buildNfeXml, buildPdf } from '../fixtures/documents.js';

const url = getTestDatabaseUrl();

/** IA falsa que registra o contexto recebido, para verificar o isolamento entre empresas. */
function recordingAi(answer: string | Error = 'Resposta de teste.') {
  const received: DocumentContextForAi[][] = [];
  const ai: AiAssistant = {
    model: 'modelo-teste',
    analyzeDocument: async () => ({ summary: 'ok', insufficientInformation: false, issues: [] }),
    answerQuestion: async (_question, documents) => {
      received.push(documents);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return { ai, received };
}

describe.skipIf(!url)('API de chat e painel (PostgreSQL de teste)', () => {
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

  async function setupCompany(app: ReturnType<typeof buildTestApp>, cnpj = CNPJ_OWNER_COMPANY) {
    const owner = await registerUser(app, 'dono');
    const created = await request(app)
      .post('/companies')
      .set(authHeader(owner.accessToken))
      .send({ name: 'Padaria Central', document: cnpj })
      .expect(201);
    return { owner, companyId: created.body.company.id as string };
  }

  function uploadXml(app: ReturnType<typeof buildTestApp>, token: string, companyId: string, xml: string, filename: string) {
    return request(app)
      .post(`/companies/${companyId}/documents`)
      .set(authHeader(token))
      .attach('file', Buffer.from(xml), { filename, contentType: 'text/xml' })
      .expect(201);
  }

  async function createConversation(app: ReturnType<typeof buildTestApp>, token: string, companyId: string) {
    const response = await request(app)
      .post(`/companies/${companyId}/conversations`)
      .set(authHeader(token))
      .send({ title: 'Dúvidas de março' })
      .expect(201);
    return response.body.id as string;
  }

  describe('conversas', () => {
    it('cria conversa e lista apenas as do próprio usuário', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);
      const other = await registerUser(app, 'outro');
      await request(app).post(`/companies/${companyId}/members`).set(authHeader(owner.accessToken)).send({ email: other.email, role: 'MEMBER' }).expect(201);
      await createConversation(app, owner.accessToken, companyId);

      const mine = await request(app).get(`/companies/${companyId}/conversations`).set(authHeader(owner.accessToken)).expect(200);
      const theirs = await request(app).get(`/companies/${companyId}/conversations`).set(authHeader(other.accessToken)).expect(200);

      expect(mine.body.conversations).toHaveLength(1);
      expect(mine.body.conversations[0].title).toBe('Dúvidas de março');
      expect(theirs.body.conversations).toEqual([]);
    });

    it('não permite ler as mensagens de conversa de outro usuário da mesma empresa', async () => {
      const app = buildTestApp(prisma, { ai: recordingAi().ai });
      const { owner, companyId } = await setupCompany(app);
      const other = await registerUser(app, 'colega');
      await request(app).post(`/companies/${companyId}/members`).set(authHeader(owner.accessToken)).send({ email: other.email, role: 'MEMBER' }).expect(201);
      const conversationId = await createConversation(app, owner.accessToken, companyId);

      const response = await request(app)
        .get(`/companies/${companyId}/conversations/${conversationId}/messages`)
        .set(authHeader(other.accessToken))
        .expect(404);

      expect(response.body.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('não permite enviar mensagem para conversa de outra empresa', async () => {
      const app = buildTestApp(prisma, { ai: recordingAi().ai });
      const a = await setupCompany(app, CNPJ_OWNER_COMPANY);
      const b = await setupCompany(app, CNPJ_SECOND_COMPANY);
      const conversationOfA = await createConversation(app, a.owner.accessToken, a.companyId);

      const response = await request(app)
        .post(`/companies/${b.companyId}/conversations/${conversationOfA}/messages`)
        .set(authHeader(b.owner.accessToken))
        .send({ content: 'quanto custou?' });

      expect(response.status).toBe(404);
      expect(await prisma.message.count()).toBe(0);
    });
  });

  describe('perguntas ao assistente', () => {
    it('responde com base nos documentos da empresa e registra as fontes', async () => {
      const { ai, received } = recordingAi('O pão custou R$ 100,00 na nota 1234.');
      const app = buildTestApp(prisma, { ai });
      const { owner, companyId } = await setupCompany(app);
      await uploadXml(app, owner.accessToken, companyId, buildNfeXml({ number: '1234' }), 'nota-padaria.xml');
      const conversationId = await createConversation(app, owner.accessToken, companyId);

      const response = await request(app)
        .post(`/companies/${companyId}/conversations/${conversationId}/messages`)
        .set(authHeader(owner.accessToken))
        .send({ content: 'Quanto custou o pão?' })
        .expect(201);

      expect(response.body.userMessage).toMatchObject({ role: 'USER', content: 'Quanto custou o pão?' });
      expect(response.body.assistantMessage).toMatchObject({ role: 'ASSISTANT', content: 'O pão custou R$ 100,00 na nota 1234.' });
      expect(response.body.assistantMessage.sourceDocumentIds).toHaveLength(1);
      expect(received[0]?.[0]?.name).toBe('nota-padaria.xml');
    });

    it('envia à IA somente documentos da própria empresa, mesmo que a pergunta combine termos', async () => {
      const { ai, received } = recordingAi();
      const app = buildTestApp(prisma, { ai });
      const a = await setupCompany(app, CNPJ_OWNER_COMPANY);
      const b = await setupCompany(app, CNPJ_SECOND_COMPANY);
      await uploadXml(app, b.owner.accessToken, b.companyId, buildNfeXml({ number: '9999', recipientName: 'Padaria Central' }), 'nota-da-outra-empresa.xml');
      const conversationId = await createConversation(app, a.owner.accessToken, a.companyId);

      await request(app)
        .post(`/companies/${a.companyId}/conversations/${conversationId}/messages`)
        .set(authHeader(a.owner.accessToken))
        .send({ content: 'padaria central nota' })
        .expect(201);

      // A empresa A não tem documentos: a IA não recebe nada da empresa B.
      expect(received[0]).toEqual([]);
    });

    it('sem IA configurada, lista os documentos relacionados em vez de inventar resposta', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);
      await uploadXml(app, owner.accessToken, companyId, buildNfeXml(), 'nota-padaria.xml');
      const conversationId = await createConversation(app, owner.accessToken, companyId);

      const response = await request(app)
        .post(`/companies/${companyId}/conversations/${conversationId}/messages`)
        .set(authHeader(owner.accessToken))
        .send({ content: 'nota da padaria' })
        .expect(201);

      expect(response.body.assistantMessage.content).toMatch(/não está configurado/);
      expect(response.body.assistantMessage.content).toContain('nota-padaria.xml');
    });

    it('falha da IA retorna 503 e mantém a pergunta registrada', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { ai } = recordingAi(new Error('timeout'));
      const app = buildTestApp(prisma, { ai });
      const { owner, companyId } = await setupCompany(app);
      const conversationId = await createConversation(app, owner.accessToken, companyId);

      const response = await request(app)
        .post(`/companies/${companyId}/conversations/${conversationId}/messages`)
        .set(authHeader(owner.accessToken))
        .send({ content: 'alguma pergunta' })
        .expect(503);

      expect(response.body.error.code).toBe('AI_UNAVAILABLE');
      expect(await prisma.message.count({ where: { role: 'USER' } })).toBe(1);
      expect(await prisma.message.count({ where: { role: 'ASSISTANT' } })).toBe(0);
      errorSpy.mockRestore();
    });

    it('recusa pergunta vazia e pergunta acima de 2000 caracteres', async () => {
      const app = buildTestApp(prisma, { ai: recordingAi().ai });
      const { owner, companyId } = await setupCompany(app);
      const conversationId = await createConversation(app, owner.accessToken, companyId);
      const path = `/companies/${companyId}/conversations/${conversationId}/messages`;

      const empty = await request(app).post(path).set(authHeader(owner.accessToken)).send({ content: '   ' });
      const long = await request(app).post(path).set(authHeader(owner.accessToken)).send({ content: 'a'.repeat(2001) });

      expect(empty.status).toBe(422);
      expect(empty.body.error.code).toBe('EMPTY_MESSAGE');
      expect(long.status).toBe(422);
      expect(long.body.error.code).toBe('MESSAGE_TOO_LONG');
    });

    it('usa PDF com texto extraído como fonte de resposta', async () => {
      const { ai, received } = recordingAi();
      const app = buildTestApp(prisma, { ai });
      const { owner, companyId } = await setupCompany(app);
      await request(app)
        .post(`/companies/${companyId}/documents`)
        .set(authHeader(owner.accessToken))
        .attach('file', buildPdf(['Contrato de fornecimento de farinha de trigo']), { filename: 'contrato.pdf', contentType: 'application/pdf' })
        .expect(201);
      const conversationId = await createConversation(app, owner.accessToken, companyId);

      await request(app)
        .post(`/companies/${companyId}/conversations/${conversationId}/messages`)
        .set(authHeader(owner.accessToken))
        .send({ content: 'o contrato de farinha' })
        .expect(201);

      expect(received[0]?.[0]?.text).toContain('farinha de trigo');
    });
  });

  describe('painel', () => {
    it('mostra contagens, pendências e histórico da empresa', async () => {
      const app = buildTestApp(prisma);
      const { owner, companyId } = await setupCompany(app);
      await uploadXml(app, owner.accessToken, companyId, buildNfeXml({ total: '0.00', number: '1' }), 'zerada.xml');
      await uploadXml(app, owner.accessToken, companyId, buildNfeXml({ number: '2' }), 'ok.xml');
      await request(app)
        .post(`/companies/${companyId}/documents`)
        .set(authHeader(owner.accessToken))
        .attach('file', Buffer.from('<?xml version="1.0"?><cte><x/></cte>'), { filename: 'cte.xml', contentType: 'text/xml' })
        .expect(201);

      const dashboard = await request(app).get(`/companies/${companyId}/dashboard`).set(authHeader(owner.accessToken)).expect(200);

      expect(dashboard.body.counts).toMatchObject({
        documents: 3,
        processedDocuments: 2,
        failedDocuments: 1,
        documentsWithPendings: 2,
      });
      // Documento com falha de processamento também é pendência, com o motivo real.
      const names = dashboard.body.pendings.map((pending: { name: string }) => pending.name);
      expect(names).toEqual(expect.arrayContaining(['zerada.xml', 'cte.xml']));
      expect(dashboard.body.pendings.find((p: { name: string }) => p.name === 'zerada.xml')).toMatchObject({ severity: 'ERROR' });
      expect(dashboard.body.history).toHaveLength(3);
    });

    it('não expõe o painel de outra empresa', async () => {
      const app = buildTestApp(prisma);
      const a = await setupCompany(app, CNPJ_OWNER_COMPANY);
      const b = await setupCompany(app, CNPJ_SECOND_COMPANY);
      await uploadXml(app, a.owner.accessToken, a.companyId, buildNfeXml({ total: '0.00' }), 'zerada.xml');

      const response = await request(app).get(`/companies/${a.companyId}/dashboard`).set(authHeader(b.owner.accessToken));

      expect(response.status).toBe(404);
    });
  });
});
