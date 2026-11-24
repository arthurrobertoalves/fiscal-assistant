import type { RequestHandler } from 'express';
import type { CheckSystemHealthUseCase } from '../../../application/use-cases/check-system-health.use-case.js';

export function createHealthController(
  checkHealth: CheckSystemHealthUseCase,
): RequestHandler {
  return async (_req, res) => {
    const report = await checkHealth.execute();
    const statusCode = report.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(report);
  };
}
