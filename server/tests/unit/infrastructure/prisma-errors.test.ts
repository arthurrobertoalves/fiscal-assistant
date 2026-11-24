import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { mapUniqueViolation } from '../../../src/infrastructure/database/prisma-errors.js';
import { AppError } from '../../../src/shared/errors/app-error.js';

function knownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('erro simulado', { code, clientVersion: '6.19.3' });
}

describe('mapUniqueViolation', () => {
  it('converte violação de unique (P2002) em conflito 409 genérico', async () => {
    const operation = () => Promise.reject(knownError('P2002'));

    const error = await mapUniqueViolation(operation).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(409);
    expect((error as AppError).code).toBe('CONFLICT');
  });

  it('repassa outros erros do Prisma sem alterá-los', async () => {
    const original = knownError('P2025');

    const error = await mapUniqueViolation(() => Promise.reject(original)).catch((caught: unknown) => caught);

    expect(error).toBe(original);
  });

  it('retorna o resultado da operação quando não há erro', async () => {
    await expect(mapUniqueViolation(async () => 42)).resolves.toBe(42);
  });
});
