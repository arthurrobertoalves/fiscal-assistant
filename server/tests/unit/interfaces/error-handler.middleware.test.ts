import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { errorHandler } from '../../../src/interfaces/http/middlewares/error-handler.middleware.js';

function buildApp(route: express.RequestHandler): express.Express {
  const app = express();
  app.use(express.json());
  app.post('/test', route);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('converte AppError em resposta com status e código próprios', async () => {
    const app = buildApp(() => {
      throw new AppError(409, 'CONFLICT', 'Registro duplicado.');
    });

    const response = await request(app).post('/test').send({});

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: 'CONFLICT', message: 'Registro duplicado.', details: undefined },
    });
  });

  it('converte ZodError em 400 com detalhes por campo', async () => {
    const app = buildApp((req, _res, next) => {
      const result = z.object({ name: z.string().min(2) }).safeParse(req.body);
      if (!result.success) {
        next(result.error);
        return;
      }
      next();
    });

    const response = await request(app).post('/test').send({ name: 'a' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual([
      expect.objectContaining({ path: 'name' }),
    ]);
  });

  it('responde 400 genérico para JSON malformado, sem vazar o corpo', async () => {
    const app = buildApp((_req, res) => {
      res.json({ ok: true });
    });

    const response = await request(app)
      .post('/test')
      .set('Content-Type', 'application/json')
      .send('{"senha": ');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Requisição inválida.' },
    });
    expect(JSON.stringify(response.body)).not.toContain('senha');
  });

  it('responde 500 genérico e não expõe a mensagem interna', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = buildApp(() => {
      throw new Error('detalhe interno sensível');
    });

    const response = await request(app).post('/test').send({});

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' },
    });
    expect(JSON.stringify(response.body)).not.toContain('sensível');
    consoleSpy.mockRestore();
  });
});
