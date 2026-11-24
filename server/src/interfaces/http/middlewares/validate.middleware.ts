import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

interface RequestSchemas {
  body?: ZodType;
  params?: ZodType;
}

/**
 * Valida body e params com Zod antes do controller.
 * Os valores já parseados substituem os originais (campos fora do schema são rejeitados).
 * Erros de validação seguem para o errorHandler global (400).
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
