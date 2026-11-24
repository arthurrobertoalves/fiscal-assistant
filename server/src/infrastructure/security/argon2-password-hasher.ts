import argon2 from 'argon2';
import type { PasswordHasher } from '../../application/ports/security.ports.js';

// Parâmetros mínimos recomendados pela OWASP para Argon2id
// (19 MiB de memória, 2 iterações, 1 de paralelismo).
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2PasswordHasher implements PasswordHasher {
  hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, plainPassword);
    } catch {
      // Hash malformado ou erro interno da biblioteca: tratamos como senha não conferida.
      return false;
    }
  }
}
