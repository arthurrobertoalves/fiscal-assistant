import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { createTestPrisma, getTestDatabaseUrl, resetTestDatabase } from '../helpers/test-db.js';

const url = getTestDatabaseUrl();

/** Garante que a restrição é aplicada pelo próprio banco (P2002 = violação de unique). */
async function expectUniqueViolation(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => {
      throw new Error('esperava violação de restrição única');
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
}

describe.skipIf(!url)('integridade do banco (restrições e cascatas)', () => {
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

  async function seed() {
    const user = await prisma.user.create({
      data: { name: 'Maria', email: 'maria@empresa.com', passwordHash: 'hash' },
    });
    const company = await prisma.company.create({
      data: { name: 'Padaria', document: '11222333000181' },
    });
    await prisma.companyMember.create({
      data: { userId: user.id, companyId: company.id, role: 'OWNER' },
    });
    return { user, company };
  }

  it('impede dois usuários com o mesmo email', async () => {
    await seed();

    await expectUniqueViolation(
      prisma.user.create({ data: { name: 'Outra', email: 'maria@empresa.com', passwordHash: 'h' } }),
    );
  });

  it('impede duas empresas com o mesmo CNPJ', async () => {
    await seed();

    await expectUniqueViolation(
      prisma.company.create({ data: { name: 'Outra', document: '11222333000181' } }),
    );
  });

  it('impede dois vínculos do mesmo usuário na mesma empresa (userId + companyId)', async () => {
    const { user, company } = await seed();

    await expectUniqueViolation(
      prisma.companyMember.create({
        data: { userId: user.id, companyId: company.id, role: 'MEMBER' },
      }),
    );
  });

  it('impede que dois refresh tokens tenham o mesmo hash', async () => {
    const { user } = await seed();
    const hash = 'a'.repeat(64);
    await prisma.session.create({
      data: { userId: user.id, refreshTokenHash: hash, expiresAt: new Date('2030-01-01') },
    });

    await expectUniqueViolation(
      prisma.session.create({
        data: { userId: user.id, refreshTokenHash: hash, expiresAt: new Date('2030-01-01') },
      }),
    );
  });

  it('remover uma empresa remove seus vínculos e zera a empresa ativa das sessões', async () => {
    const { user, company } = await seed();
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: 'b'.repeat(64),
        activeCompanyId: company.id,
        expiresAt: new Date('2030-01-01'),
      },
    });

    await prisma.company.delete({ where: { id: company.id } });

    expect(await prisma.companyMember.count({ where: { companyId: company.id } })).toBe(0);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).activeCompanyId).toBeNull();
  });

  it('remover um usuário remove vínculos e sessões, mas preserva a empresa', async () => {
    const { user, company } = await seed();
    await prisma.session.create({
      data: { userId: user.id, refreshTokenHash: 'c'.repeat(64), expiresAt: new Date('2030-01-01') },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.companyMember.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.company.findUnique({ where: { id: company.id } })).not.toBeNull();
  });
});
