import request from 'supertest';
import { SignJWT, decodeJwt } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  createTestPrisma,
  getTestDatabaseUrl,
  resetTestDatabase,
} from '../helpers/test-db.js';
import {
  TEST_JWT_SECRET,
  TEST_ORIGIN,
  authHeader,
  buildTestApp,
  cookieFrom,
  registerUser,
} from './support.js';

const url = getTestDatabaseUrl();

describe.skipIf(!url)('API de autenticação (PostgreSQL de teste)', () => {
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

  describe('cadastro', () => {
    it('cria o usuário, devolve access token e define o refresh token em cookie httpOnly', async () => {
      const app = buildTestApp(prisma);

      const response = await request(app)
        .post('/auth/register')
        .send({ name: 'Maria Silva', email: 'Maria@Empresa.com', password: 'senha-forte-123' })
        .expect(201);

      expect(response.body.user).toMatchObject({ name: 'Maria Silva', email: 'maria@empresa.com' });
      expect(typeof response.body.accessToken).toBe('string');

      const cookie = response.headers['set-cookie']?.[0] ?? '';
      expect(cookie).toMatch(/^refresh_token=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\/auth/);
    });

    it('nunca expõe senha, hash ou refresh token no corpo da resposta', async () => {
      const app = buildTestApp(prisma);

      const response = await request(app)
        .post('/auth/register')
        .send({ name: 'Maria Silva', email: 'maria@empresa.com', password: 'senha-forte-123' })
        .expect(201);

      const body = JSON.stringify(response.body);
      expect(body).not.toContain('passwordHash');
      expect(body).not.toContain('senha-forte-123');
      expect(body).not.toContain('refreshToken');
    });

    it('rejeita email já cadastrado com 409', async () => {
      const app = buildTestApp(prisma);
      await request(app)
        .post('/auth/register')
        .send({ name: 'Maria', email: 'maria@empresa.com', password: 'senha-forte-123' })
        .expect(201);

      const response = await request(app)
        .post('/auth/register')
        .send({ name: 'Outra', email: 'MARIA@empresa.com', password: 'senha-forte-123' })
        .expect(409);

      expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('valida os dados de entrada com 400 e detalhes por campo', async () => {
      const app = buildTestApp(prisma);

      const response = await request(app)
        .post('/auth/register')
        .send({ name: 'M', email: 'nao-e-email', password: 'curta' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      const paths = response.body.error.details.map((issue: { path: string }) => issue.path);
      expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'password']));
    });

    it('rejeita campos fora da lista permitida (ex.: tentativa de definir papel)', async () => {
      const app = buildTestApp(prisma);

      await request(app)
        .post('/auth/register')
        .send({ name: 'Maria', email: 'maria@empresa.com', password: 'senha-forte-123', role: 'ADMIN' })
        .expect(400);
    });

    it('armazena a senha apenas como hash Argon2id no banco', async () => {
      const app = buildTestApp(prisma);
      await request(app)
        .post('/auth/register')
        .send({ name: 'Maria', email: 'maria@empresa.com', password: 'senha-forte-123' })
        .expect(201);

      const row = await prisma.user.findUniqueOrThrow({ where: { email: 'maria@empresa.com' } });
      expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(row.passwordHash).not.toContain('senha-forte-123');
    });
  });

  describe('login', () => {
    it('autentica com credenciais corretas', async () => {
      const app = buildTestApp(prisma);
      const user = await registerUser(app, 'login');

      const response = await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);

      expect(response.body.accessToken).toBeTruthy();
      expect(response.headers['set-cookie']?.[0]).toMatch(/^refresh_token=/);
    });

    it('rejeita senha inválida com 401', async () => {
      const app = buildTestApp(prisma);
      const user = await registerUser(app, 'senha');

      const response = await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: 'senha-errada-999' })
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('usuário inexistente recebe resposta idêntica à de senha inválida', async () => {
      const app = buildTestApp(prisma);
      const user = await registerUser(app, 'existente');

      const wrongPassword = await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: 'senha-errada-999' })
        .expect(401);
      const unknownUser = await request(app)
        .post('/auth/login')
        .send({ email: 'ninguem@teste.com', password: 'senha-errada-999' })
        .expect(401);

      expect(unknownUser.body).toEqual(wrongPassword.body);
    });
  });

  describe('rotas protegidas', () => {
    it('recusa requisição sem token com 401', async () => {
      const app = buildTestApp(prisma);

      const response = await request(app).get('/auth/me').expect(401);

      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('recusa token malformado ou adulterado', async () => {
      const app = buildTestApp(prisma);
      const user = await registerUser(app, 'adulterado');
      const [header, , signature] = user.accessToken.split('.');
      const forgedPayload = Buffer.from('{"sub":"outro","sid":"x"}').toString('base64url');

      await request(app).get('/auth/me').set(authHeader('token-falso')).expect(401);
      await request(app)
        .get('/auth/me')
        .set(authHeader(`${header}.${forgedPayload}.${signature}`))
        .expect(401);
    });

    it('recusa token expirado com código TOKEN_EXPIRED', async () => {
      const app = buildTestApp(prisma);
      const user = await registerUser(app, 'expirado');
      const { sid } = decodeJwt(user.accessToken) as { sid: string };

      const past = Math.floor(Date.now() / 1000) - 60;
      const expired = await new SignJWT({ sid })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setIssuer('fiscal-assistant')
        .setIssuedAt(past - 900)
        .setExpirationTime(past)
        .sign(new TextEncoder().encode(TEST_JWT_SECRET));

      const response = await request(app).get('/auth/me').set(authHeader(expired)).expect(401);

      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('permite acesso com token válido e identifica o usuário', async () => {
      const app = buildTestApp(prisma);
      const user = await registerUser(app, 'autenticado');

      const response = await request(app).get('/auth/me').set(authHeader(user.accessToken)).expect(200);

      expect(response.body.user).toMatchObject({ id: user.id });
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('renovação de sessão e logout', () => {
    it('renova o access token com o cookie e rotaciona o refresh token', async () => {
      const app = buildTestApp(prisma);
      const registered = await request(app)
        .post('/auth/register')
        .send({ name: 'Maria', email: 'maria@empresa.com', password: 'senha-forte-123' })
        .expect(201);
      const originalCookie = cookieFrom(registered);

      const renewed = await request(app)
        .post('/auth/refresh')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', originalCookie)
        .expect(200);

      expect(renewed.body.accessToken).toBeTruthy();
      expect(renewed.body).not.toHaveProperty('refreshToken');
      const rotatedCookie = cookieFrom(renewed);
      expect(rotatedCookie).not.toEqual(originalCookie);
    });

    it('detecta reuso de refresh token antigo e invalida a sessão', async () => {
      const app = buildTestApp(prisma);
      const first = await request(app)
        .post('/auth/register')
        .send({ name: 'Maria', email: 'maria@empresa.com', password: 'senha-forte-123' })
        .expect(201);
      const oldCookie = cookieFrom(first);

      // Primeira renovação com o cookie original: rotaciona.
      const rotated = await request(app)
        .post('/auth/refresh')
        .set('Cookie', oldCookie)
        .expect(200);
      const newCookie = cookieFrom(rotated);

      // Reuso do token antigo: 401 e sessão revogada.
      await request(app).post('/auth/refresh').set('Cookie', oldCookie).expect(401);
      // Até o token novo passa a ser recusado.
      const afterReuse = await request(app).post('/auth/refresh').set('Cookie', newCookie).expect(401);
      expect(afterReuse.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('recusa renovação sem cookie', async () => {
      const app = buildTestApp(prisma);

      await request(app).post('/auth/refresh').expect(401);
    });

    it('logout revoga a sessão: access token e refresh token deixam de funcionar', async () => {
      const app = buildTestApp(prisma);
      const registered = await request(app)
        .post('/auth/register')
        .send({ name: 'Maria', email: 'maria@empresa.com', password: 'senha-forte-123' })
        .expect(201);
      const accessToken = registered.body.accessToken as string;
      const cookie = cookieFrom(registered);

      const logout = await request(app).post('/auth/logout').set('Cookie', cookie).expect(204);
      // O cookie é limpo no navegador.
      expect(logout.headers['set-cookie']?.[0]).toMatch(/refresh_token=;/);

      // Mesmo que o cookie antigo seja reenviado, a sessão está revogada.
      await request(app).get('/auth/me').set(authHeader(accessToken)).expect(401);
      await request(app).post('/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('recusa renovação vinda de origem não permitida (proteção CSRF)', async () => {
      const app = buildTestApp(prisma);
      const user = await registerUser(app, 'csrf');
      const login = await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      const cookie = cookieFrom(login);

      const response = await request(app)
        .post('/auth/refresh')
        .set('Cookie', cookie)
        .set('Origin', 'https://site-malicioso.com')
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('libera CORS com credenciais apenas para a origem configurada', async () => {
      const app = buildTestApp(prisma);

      const allowed = await request(app).get('/health').set('Origin', TEST_ORIGIN);

      expect(allowed.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('limite de tentativas (rate limit)', () => {
    it('bloqueia com 429 após exceder as tentativas de login', async () => {
      const app = buildTestApp(prisma, { rateLimit: { credentials: 2, refresh: 1000 } });
      const payload = { email: 'ninguem@teste.com', password: 'senha-errada-999' };

      await request(app).post('/auth/login').send(payload).expect(401);
      await request(app).post('/auth/login').send(payload).expect(401);
      const blocked = await request(app).post('/auth/login').send(payload).expect(429);

      expect(blocked.body.error.code).toBe('RATE_LIMITED');
    });
  });
});
