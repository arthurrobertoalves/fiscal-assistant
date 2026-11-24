import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createApp, type HttpSettings } from '../../src/app.js';
import { createContainer, type Container } from '../../src/composition/container.js';
import type { AiAssistant } from '../../src/application/ports/document-processing.ports.js';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TEST_JWT_SECRET = 'segredo-de-integracao-com-pelo-menos-32-caracteres';
export const TEST_ORIGIN = 'http://localhost:3000';
export const CNPJ_OWNER_COMPANY = '11.222.333/0001-81';
export const CNPJ_SECOND_COMPANY = '11.444.777/0001-61';

export interface BuildAppOptions {
  rateLimit?: { credentials: number; refresh: number };
  overrideContainer?: (container: Container) => Container;
  /** IA falsa para os testes. Omitido = IA desativada (nenhuma chamada de rede). */
  ai?: AiAssistant | null;
}

/** Diretório temporário de arquivos, isolado por execução de teste. */
const storageDir = mkdtempSync(path.join(os.tmpdir(), 'fiscal-assistant-test-'));

export const MAX_UPLOAD_MB = 1;

/** Monta o app com a composição real (Prisma + Argon2 + JWT) sobre o banco de testes. */
export function buildTestApp(prisma: PrismaClient, options: BuildAppOptions = {}) {
  const baseContainer = createContainer(
    prisma,
    {
      JWT_SECRET: TEST_JWT_SECRET,
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
      STORAGE_DIR: storageDir,
      MAX_UPLOAD_MB,
      GROQ_API_KEY: undefined,
      GROQ_MODEL: 'openai/gpt-oss-120b',
      AI_TIMEOUT_MS: 30000,
    },
    { ai: options.ai ?? null },
  );
  const container = options.overrideContainer?.(baseContainer) ?? baseContainer;

  const http: HttpSettings = {
    corsOrigins: [TEST_ORIGIN],
    maxUploadBytes: MAX_UPLOAD_MB * 1024 * 1024,
    trustProxy: false,
    // Em testes não há HTTPS: o cookie não é Secure. SameSite=Lax equivale ao ambiente local.
    cookies: { secure: false, sameSite: 'lax' },
    rateLimits: {
      credentials: { windowMs: 60_000, limit: options.rateLimit?.credentials ?? 1000 },
      refresh: { windowMs: 60_000, limit: options.rateLimit?.refresh ?? 1000 },
    },
  };

  return createApp({ container, http });
}

export interface RegisteredUser {
  id: string;
  accessToken: string;
  email: string;
  password: string;
}

let sequence = 0;

/** Cadastra um usuário com email único e devolve o token de acesso. */
export async function registerUser(
  app: ReturnType<typeof buildTestApp>,
  label = 'usuario',
): Promise<RegisteredUser> {
  sequence += 1;
  const email = `${label}${sequence}@teste.com`;
  const password = 'senha-forte-123';

  const response = await request(app)
    .post('/auth/register')
    .send({ name: `Usuário ${label}`, email, password })
    .expect(201);

  return {
    id: response.body.user.id,
    accessToken: response.body.accessToken,
    email,
    password,
  };
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Extrai o par "nome=valor" do primeiro cookie definido na resposta,
 * pronto para ser reenviado no header Cookie (como o navegador faz).
 */
export function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  const first = setCookie?.[0];
  if (!first) {
    throw new Error('Resposta sem cookie set-cookie.');
  }
  return first.split(';')[0] ?? '';
}
