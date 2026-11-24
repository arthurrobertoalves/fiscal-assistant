import { createHash, randomBytes } from 'node:crypto';
import type { RefreshTokenCodec } from '../../application/ports/security.ports.js';

/**
 * Refresh tokens são segredos aleatórios de 256 bits, opacos ao cliente.
 * No banco guardamos apenas o SHA-256: um vazamento do banco não entrega tokens válidos.
 */
export class CryptoRefreshTokenCodec implements RefreshTokenCodec {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
