import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { CheckSystemHealthUseCase } from '../../src/application/use-cases/check-system-health.use-case.js';
import { createTestPrisma, getTestDatabaseUrl } from '../helpers/test-db.js';
import { buildTestApp } from './support.js';

const url = getTestDatabaseUrl();

describe.skipIf(!url)('GET /health (PostgreSQL de teste)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma(url!);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('responde 200 com status ok quando o banco está acessível', async () => {
    const app = buildTestApp(prisma);

    const response = await request(app).get('/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', checks: { database: 'up' } });
  });

  it('responde 503 com status degraded quando o banco está indisponível', async () => {
    const app = buildTestApp(prisma, {
      overrideContainer: (container) => ({
        ...container,
        checkHealth: new CheckSystemHealthUseCase({
          ping: async () => {
            throw new Error('offline');
          },
        }),
      }),
    });

    const response = await request(app).get('/health').expect(503);

    expect(response.body).toMatchObject({ status: 'degraded', checks: { database: 'down' } });
  });

  it('responde 404 no formato padrão para rota inexistente', async () => {
    const app = buildTestApp(prisma);

    const response = await request(app).get('/nao-existe').expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
