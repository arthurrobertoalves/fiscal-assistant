import { PrismaClient } from '@prisma/client';
import type { DatabaseHealthPort } from '../../application/ports/database-health.port.js';

export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

/** Implementação do DatabaseHealthPort usando o Prisma. */
export class PrismaDatabaseHealth implements DatabaseHealthPort {
  constructor(private readonly prisma: PrismaClient) {}

  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
