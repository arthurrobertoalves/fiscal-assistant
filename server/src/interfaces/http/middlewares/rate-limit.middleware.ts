import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
}

/** Limita tentativas por IP. Resposta no mesmo formato de erro da API. */
export function createRateLimiter({ windowMs, limit }: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        },
      });
    },
  });
}
