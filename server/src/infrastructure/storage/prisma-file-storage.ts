import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { FileStorage } from '../../application/ports/document-processing.ports.js';
import { errors } from '../../shared/errors/app-error.js';

/** Guarda os arquivos na tabela FileBlob (útil em hospedagem sem disco persistente). */
export class PrismaFileStorage implements FileStorage {
  constructor(private readonly prisma: PrismaClient) {}

  async save(companyId: string, content: Buffer, extension: 'pdf' | 'xml'): Promise<string> {
    const storageKey = `${companyId}/${randomUUID()}.${extension}`;
    await this.prisma.fileBlob.create({ data: { storageKey, content: new Uint8Array(content) } });
    return storageKey;
  }

  async read(storageKey: string): Promise<Buffer> {
    const row = await this.prisma.fileBlob.findUnique({ where: { storageKey } });
    if (!row) throw errors.notFound('FILE_NOT_FOUND', 'Arquivo não encontrado.');
    return Buffer.from(row.content);
  }
}
