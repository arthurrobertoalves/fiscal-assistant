import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';
import type {
  AccessTokenClaims,
  AccessTokenService,
  AccessTokenVerification,
} from '../../application/ports/security.ports.js';

const ISSUER = 'fiscal-assistant';
const ALGORITHM = 'HS256';

/**
 * Access tokens JWT (HS256). O payload leva apenas o userId (sub) e o sessionId (sid).
 * Nenhum dado pessoal ou de empresa vai no token.
 */
export class JoseAccessTokenService implements AccessTokenService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async issue(
    claims: AccessTokenClaims,
    ttlSeconds: number,
  ): Promise<{ token: string; expiresAt: Date }> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = issuedAt + ttlSeconds;

    const token = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAtSeconds)
      .sign(this.key);

    return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
  }

  async verify(token: string): Promise<AccessTokenVerification> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
      });

      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        return { status: 'invalid' };
      }
      return { status: 'valid', userId: payload.sub, sessionId: payload.sid };
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired) {
        return { status: 'expired' };
      }
      return { status: 'invalid' };
    }
  }
}
