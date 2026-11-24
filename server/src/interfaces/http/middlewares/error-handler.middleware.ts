import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../../../shared/errors/app-error.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Converte qualquer erro em resposta JSON padronizada.
 * Erros inesperados (500) recebem mensagem genérica: detalhes internos não vão ao cliente.
 */
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const { statusCode, body } = toErrorResponse(error);

  if (statusCode >= 500) {
    // Loga só o tipo e a mensagem, nunca o corpo da requisição.
    console.error('[error]', describeError(error));
  }

  res.status(statusCode).json(body);
};

function toErrorResponse(error: unknown): { statusCode: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos.',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
    };
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return {
        statusCode: 413,
        body: { error: { code: 'FILE_TOO_LARGE', message: 'O arquivo excede o tamanho máximo permitido.' } },
      };
    }
    return {
      statusCode: 400,
      body: { error: { code: 'UPLOAD_ERROR', message: 'Não foi possível receber o arquivo enviado.' } },
    };
  }

  // Erros de parsing do body-parser (JSON malformado, payload grande etc.) trazem `status` 4xx.
  const status = getClientErrorStatus(error);
  if (status !== undefined) {
    return {
      statusCode: status,
      body: { error: { code: 'BAD_REQUEST', message: 'Requisição inválida.' } },
    };
  }

  return {
    statusCode: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' } },
  };
}

function getClientErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return 'Erro desconhecido';
}
