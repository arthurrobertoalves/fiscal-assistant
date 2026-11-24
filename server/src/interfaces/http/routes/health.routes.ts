import { Router } from 'express';
import type { CheckSystemHealthUseCase } from '../../../application/use-cases/check-system-health.use-case.js';
import { createHealthController } from '../controllers/health.controller.js';

export function createHealthRouter(checkHealth: CheckSystemHealthUseCase): Router {
  const router = Router();
  router.get('/health', createHealthController(checkHealth));
  return router;
}
