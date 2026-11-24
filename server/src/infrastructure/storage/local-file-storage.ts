import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FileStorage } from '../../application/ports/document-processing.ports.js';
import { errors } from '../../shared/errors/app-error.js';

/**
 * Armazena arquivos em disco, em uma pasta por empresa. O nome do arquivo é um UUID,
 * então o nome enviado pelo cliente nunca chega ao sistema de arquivos.
 */
export class LocalFileStorage implements FileStorage {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  async save(companyId: string, content: Buffer, extension: 'pdf' | 'xml'): Promise<string> {
    const companyDir = this.resolveInside(companyId);
    await mkdir(companyDir, { recursive: true });

    const fileName = `${randomUUID()}.${extension}`;
    await writeFile(path.join(companyDir, fileName), content, { mode: 0o600 });
    return `${companyId}/${fileName}`;
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.resolveInside(storageKey));
  }

  /** Garante que o caminho resolvido continua dentro da pasta base (anti path traversal). */
  private resolveInside(relativePath: string): string {
    const resolved = path.resolve(this.baseDir, relativePath);
    if (resolved !== this.baseDir && !resolved.startsWith(this.baseDir + path.sep)) {
      throw errors.forbidden('Caminho de arquivo inválido.');
    }
    return resolved;
  }
}
