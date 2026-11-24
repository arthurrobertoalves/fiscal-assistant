/** Hash de senha (Argon2id na implementação). */
export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
  verify(passwordHash: string, plainPassword: string): Promise<boolean>;
}

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

export type AccessTokenVerification =
  | ({ status: 'valid' } & AccessTokenClaims)
  | { status: 'expired' }
  | { status: 'invalid' };

/** Emissão e verificação de access tokens de curta duração. */
export interface AccessTokenService {
  issue(claims: AccessTokenClaims, ttlSeconds: number): Promise<{ token: string; expiresAt: Date }>;
  verify(token: string): Promise<AccessTokenVerification>;
}

/** Geração de refresh tokens opacos e seu hash para armazenamento. */
export interface RefreshTokenCodec {
  generate(): string;
  hash(token: string): string;
}
