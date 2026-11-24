import { PrismaClient } from '@prisma/client';

/**
 * Banco exclusivo para testes de integração.
 * Por segurança, recusa qualquer URL cujo banco não termine em "_test":
 * a limpeza de tabelas nunca pode atingir o banco de desenvolvimento.
 */
export function getTestDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return undefined;

  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL deve apontar para um banco terminado em "_test" (recebido: "${databaseName}").`,
    );
  }
  return url;
}

export function createTestPrisma(url: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url } } });
}

/** Apaga os dados de todas as tabelas do banco de testes (mantém o schema). */
export async function resetTestDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Message", "Conversation", "DocumentAnalysis", "Document", "Session", "CompanyMember", "Company", "User" RESTART IDENTITY CASCADE',
  );
}
