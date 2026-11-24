import multer from 'multer';
import type { RequestHandler } from 'express';
import { errors } from '../../../shared/errors/app-error.js';

/**
 * Recebe um único arquivo (campo "file") em memória, com limite de tamanho.
 * A validação de tipo é feita pelo conteúdo (assinatura), no caso de uso.
 */
export function singleFileUpload(maxBytes: number): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 2 },
  }).single('file');

  return (req, res, next) => {
    upload(req, res, (error: unknown) => {
      if (error) {
        next(error);
        return;
      }
      if (!req.file) {
        next(errors.unprocessable('FILE_REQUIRED', 'Envie um arquivo no campo "file".'));
        return;
      }
      next();
    });
  };
}
