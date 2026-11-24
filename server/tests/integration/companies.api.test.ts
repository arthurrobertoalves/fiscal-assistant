import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestPrisma, getTestDatabaseUrl, resetTestDatabase } from '../helpers/test-db.js';
import { CNPJ_OWNER_COMPANY, CNPJ_SECOND_COMPANY, authHeader, buildTestApp, registerUser } from './support.js';

const url = getTestDatabaseUrl();

describe.skipIf(!url)('API de empresas (PostgreSQL de teste)', () => {
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

  async function createCompany(app: ReturnType<typeof buildTestApp>, token: string, document: string, name = 'Padaria Central') {
    return request(app)
      .post('/companies')
      .set(authHeader(token))
      .send({ name, document })
      .expect(201);
  }

  describe('cadastro de empresa', () => {
    it('cria a empresa com o criador como OWNER', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');

      const response = await createCompany(app, owner.accessToken, CNPJ_OWNER_COMPANY);

      expect(response.body).toMatchObject({
        role: 'OWNER',
        company: { name: 'Padaria Central', document: '11222333000181' },
      });
    });

    it('rejeita CNPJ inválido com 422 e CNPJ duplicado com 409', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');

      await request(app)
        .post('/companies')
        .set(authHeader(owner.accessToken))
        .send({ name: 'Empresa', document: '11.222.333/0001-82' })
        .expect(422);

      await createCompany(app, owner.accessToken, CNPJ_OWNER_COMPANY);
      const duplicate = await request(app)
        .post('/companies')
        .set(authHeader(owner.accessToken))
        .send({ name: 'Outra', document: '11222333000181' })
        .expect(409);
      expect(duplicate.body.error.code).toBe('COMPANY_DOCUMENT_ALREADY_REGISTERED');
    });

    it('não aceita campos fora da lista (ex.: tentativa de definir o papel)', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');

      await request(app)
        .post('/companies')
        .set(authHeader(owner.accessToken))
        .send({ name: 'Empresa', document: CNPJ_OWNER_COMPANY, role: 'OWNER', companyId: 'x' })
        .expect(400);
    });

    it('exige autenticação', async () => {
      const app = buildTestApp(prisma);

      await request(app)
        .post('/companies')
        .send({ name: 'Empresa', document: CNPJ_OWNER_COMPANY })
        .expect(401);
    });
  });

  describe('isolamento entre empresas (IDOR)', () => {
    it('usuário sem vínculo não consulta, não lista membros e não altera a empresa de outro', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');
      const intruder = await registerUser(app, 'intruso');
      const created = await createCompany(app, owner.accessToken, CNPJ_OWNER_COMPANY);
      const companyId = created.body.company.id;

      const get = await request(app).get(`/companies/${companyId}`).set(authHeader(intruder.accessToken));
      const members = await request(app)
        .get(`/companies/${companyId}/members`)
        .set(authHeader(intruder.accessToken));
      const patch = await request(app)
        .patch(`/companies/${companyId}`)
        .set(authHeader(intruder.accessToken))
        .send({ name: 'Invadida' });

      // Mesma resposta para "não existe" e "não é membro": não revela a existência da empresa.
      expect(get.status).toBe(404);
      expect(get.body.error.code).toBe('COMPANY_NOT_FOUND');
      expect(members.status).toBe(404);
      expect(patch.status).toBe(404);
    });

    it('a lista de empresas mostra apenas as associações do próprio usuário', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');
      const other = await registerUser(app, 'outro');
      await createCompany(app, owner.accessToken, CNPJ_OWNER_COMPANY, 'Empresa do dono');
      await createCompany(app, other.accessToken, CNPJ_SECOND_COMPANY, 'Empresa do outro');

      const response = await request(app).get('/companies').set(authHeader(owner.accessToken)).expect(200);

      expect(response.body.companies.map((item: { company: { name: string } }) => item.company.name)).toEqual([
        'Empresa do dono',
      ]);
    });

    it('recusa identificador de empresa mal formado com 400', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');

      await request(app).get('/companies/nao-e-uuid').set(authHeader(owner.accessToken)).expect(400);
    });
  });

  describe('permissões por papel', () => {
    it('MEMBER consulta, mas não altera a empresa nem adiciona membros', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');
      const member = await registerUser(app, 'membro');
      const { body } = await createCompany(app, owner.accessToken, CNPJ_OWNER_COMPANY);
      const companyId = body.company.id;
      await request(app)
        .post(`/companies/${companyId}/members`)
        .set(authHeader(owner.accessToken))
        .send({ email: member.email, role: 'MEMBER' })
        .expect(201);

      await request(app).get(`/companies/${companyId}`).set(authHeader(member.accessToken)).expect(200);
      await request(app)
        .patch(`/companies/${companyId}`)
        .set(authHeader(member.accessToken))
        .send({ name: 'Nova' })
        .expect(403);
      await request(app)
        .post(`/companies/${companyId}/members`)
        .set(authHeader(member.accessToken))
        .send({ email: owner.email, role: 'MEMBER' })
        .expect(403);
    });

    it('ADMIN não atribui o papel ADMIN; OWNER não é atribuível pela API', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');
      const admin = await registerUser(app, 'admin');
      const other = await registerUser(app, 'outro');
      const { body } = await createCompany(app, owner.accessToken, CNPJ_OWNER_COMPANY);
      const companyId = body.company.id;
      await request(app)
        .post(`/companies/${companyId}/members`)
        .set(authHeader(owner.accessToken))
        .send({ email: admin.email, role: 'ADMIN' })
        .expect(201);

      await request(app)
        .post(`/companies/${companyId}/members`)
        .set(authHeader(admin.accessToken))
        .send({ email: other.email, role: 'ADMIN' })
        .expect(403);
      await request(app)
        .post(`/companies/${companyId}/members`)
        .set(authHeader(owner.accessToken))
        .send({ email: other.email, role: 'OWNER' })
        .expect(400);
    });

    it('impede adicionar o mesmo usuário duas vezes e usuário sem conta', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');
      const member = await registerUser(app, 'membro');
      const { body } = await createCompany(app, owner.accessToken, CNPJ_OWNER_COMPANY);
      const companyId = body.company.id;
      const add = (email: string) =>
        request(app)
          .post(`/companies/${companyId}/members`)
          .set(authHeader(owner.accessToken))
          .send({ email, role: 'MEMBER' });

      await add(member.email).expect(201);
      const duplicate = await add(member.email).expect(409);
      const unknown = await add('sem-conta@teste.com').expect(404);

      expect(duplicate.body.error.code).toBe('ALREADY_MEMBER');
      expect(unknown.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('lista membros sem expor hashes de senha', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');
      const { body } = await createCompany(app, owner.accessToken, CNPJ_OWNER_COMPANY);

      const response = await request(app)
        .get(`/companies/${body.company.id}/members`)
        .set(authHeader(owner.accessToken))
        .expect(200);

      expect(response.body.members).toHaveLength(1);
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('MEMBER sai da empresa por conta própria; OWNER não pode sair', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');
      const member = await registerUser(app, 'membro');
      const { body } = await createCompany(app, owner.accessToken, CNPJ_OWNER_COMPANY);
      const companyId = body.company.id;
      await request(app)
        .post(`/companies/${companyId}/members`)
        .set(authHeader(owner.accessToken))
        .send({ email: member.email, role: 'MEMBER' })
        .expect(201);

      await request(app)
        .delete(`/companies/${companyId}/members/${member.id}`)
        .set(authHeader(member.accessToken))
        .expect(204);
      await request(app).get(`/companies/${companyId}`).set(authHeader(member.accessToken)).expect(404);

      await request(app)
        .delete(`/companies/${companyId}/members/${owner.id}`)
        .set(authHeader(owner.accessToken))
        .expect(403);
    });
  });

  describe('usuário com múltiplas empresas e empresa ativa', () => {
    it('seleciona a empresa ativa, troca entre empresas e consulta a ativa', async () => {
      const app = buildTestApp(prisma);
      const user = await registerUser(app, 'multi');
      const first = await createCompany(app, user.accessToken, CNPJ_OWNER_COMPANY, 'Primeira');
      const second = await createCompany(app, user.accessToken, CNPJ_SECOND_COMPANY, 'Segunda');

      await request(app).get('/companies/active').set(authHeader(user.accessToken)).expect(409);

      await request(app)
        .put('/auth/active-company')
        .set(authHeader(user.accessToken))
        .send({ companyId: first.body.company.id })
        .expect(200);
      const activeFirst = await request(app).get('/companies/active').set(authHeader(user.accessToken)).expect(200);
      expect(activeFirst.body.company.name).toBe('Primeira');

      await request(app)
        .put('/auth/active-company')
        .set(authHeader(user.accessToken))
        .send({ companyId: second.body.company.id })
        .expect(200);
      const activeSecond = await request(app).get('/companies/active').set(authHeader(user.accessToken)).expect(200);
      expect(activeSecond.body.company.name).toBe('Segunda');
    });

    it('recusa definir como ativa uma empresa da qual não é membro', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');
      const intruder = await registerUser(app, 'intruso');
      const { body } = await createCompany(app, owner.accessToken, CNPJ_OWNER_COMPANY);

      // O frontend envia um companyId arbitrário: o backend verifica a associação.
      const response = await request(app)
        .put('/auth/active-company')
        .set(authHeader(intruder.accessToken))
        .send({ companyId: body.company.id })
        .expect(404);

      expect(response.body.error.code).toBe('COMPANY_NOT_FOUND');
      await request(app).get('/companies/active').set(authHeader(intruder.accessToken)).expect(409);
    });

    it('empresa ativa deixa de valer quando o vínculo é removido', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');
      const member = await registerUser(app, 'membro');
      const { body } = await createCompany(app, owner.accessToken, CNPJ_OWNER_COMPANY);
      const companyId = body.company.id;
      await request(app)
        .post(`/companies/${companyId}/members`)
        .set(authHeader(owner.accessToken))
        .send({ email: member.email, role: 'MEMBER' })
        .expect(201);
      await request(app)
        .put('/auth/active-company')
        .set(authHeader(member.accessToken))
        .send({ companyId })
        .expect(200);

      await request(app)
        .delete(`/companies/${companyId}/members/${member.id}`)
        .set(authHeader(owner.accessToken))
        .expect(204);

      const response = await request(app).get('/companies/active').set(authHeader(member.accessToken)).expect(409);
      expect(response.body.error.code).toBe('NO_ACTIVE_COMPANY');
    });
  });

  describe('atualização de empresa', () => {
    it('OWNER altera o nome; CNPJ não é alterado pela API', async () => {
      const app = buildTestApp(prisma);
      const owner = await registerUser(app, 'dono');
      const { body } = await createCompany(app, owner.accessToken, CNPJ_OWNER_COMPANY);

      const response = await request(app)
        .patch(`/companies/${body.company.id}`)
        .set(authHeader(owner.accessToken))
        .send({ name: 'Padaria Nova', document: CNPJ_SECOND_COMPANY })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');

      const ok = await request(app)
        .patch(`/companies/${body.company.id}`)
        .set(authHeader(owner.accessToken))
        .send({ name: 'Padaria Nova' })
        .expect(200);
      expect(ok.body.company).toMatchObject({ name: 'Padaria Nova', document: '11222333000181' });
    });
  });
});
