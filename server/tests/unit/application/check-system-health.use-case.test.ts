import { describe, expect, it, vi } from 'vitest';
import type { DatabaseHealthPort } from '../../../src/application/ports/database-health.port.js';
import { CheckSystemHealthUseCase } from '../../../src/application/use-cases/check-system-health.use-case.js';

const FIXED_DATE = new Date('2026-01-01T12:00:00.000Z');

function makeDatabase(ping: () => Promise<void>): DatabaseHealthPort {
  return { ping: vi.fn(ping) };
}

describe('CheckSystemHealthUseCase', () => {
  it('retorna status ok quando o banco responde', async () => {
    const useCase = new CheckSystemHealthUseCase(
      makeDatabase(async () => undefined),
      () => FIXED_DATE,
    );

    const report = await useCase.execute();

    expect(report).toEqual({
      status: 'ok',
      timestamp: '2026-01-01T12:00:00.000Z',
      checks: { database: 'up' },
    });
  });

  it('retorna status degraded quando o banco falha', async () => {
    const useCase = new CheckSystemHealthUseCase(
      makeDatabase(async () => {
        throw new Error('connection refused postgresql://user:senha@host');
      }),
      () => FIXED_DATE,
    );

    const report = await useCase.execute();

    expect(report.status).toBe('degraded');
    expect(report.checks.database).toBe('down');
  });

  it('não expõe o motivo técnico da falha no relatório', async () => {
    const useCase = new CheckSystemHealthUseCase(
      makeDatabase(async () => {
        throw new Error('senha vazada');
      }),
    );

    const report = JSON.stringify(await useCase.execute());

    expect(report).not.toContain('senha vazada');
  });
});
