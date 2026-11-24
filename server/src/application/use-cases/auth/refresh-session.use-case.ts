import { isSessionActive } from '../../../domain/entities/session.js';
import { errors } from '../../../shared/errors/app-error.js';
import type { RefreshTokenCodec } from '../../ports/security.ports.js';
import type { SessionRepository } from '../../ports/session.repository.js';
import type { IssuedTokens, SessionIssuer } from '../../services/session-issuer.js';

/**
 * Renova a sessão com rotação do refresh token.
 * Se um token já substituído for apresentado, a sessão é revogada
 * (indício de vazamento do token).
 */
export class RefreshSessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly refreshTokens: RefreshTokenCodec,
    private readonly issuer: SessionIssuer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(refreshToken: string | undefined): Promise<IssuedTokens> {
    if (!refreshToken) {
      throw invalidRefreshToken();
    }

    const currentHash = this.refreshTokens.hash(refreshToken);
    const match = await this.sessions.findByRefreshTokenHash(currentHash);
    if (!match) {
      throw invalidRefreshToken();
    }

    const { session } = match;

    if (!match.isCurrentToken) {
      await this.sessions.revoke(session.id, this.now());
      throw invalidRefreshToken();
    }

    // Sessão revogada (ex.: logout) é um token inválido, não uma sessão expirada.
    if (session.revokedAt) {
      throw invalidRefreshToken();
    }
    if (!isSessionActive(session, this.now())) {
      throw errors.unauthenticated('SESSION_EXPIRED', 'Sessão encerrada. Faça login novamente.');
    }

    const newRefreshToken = this.refreshTokens.generate();
    await this.sessions.rotateRefreshToken(
      session.id,
      this.refreshTokens.hash(newRefreshToken),
      currentHash,
    );

    return this.issuer.buildTokens(
      session.id,
      session.userId,
      newRefreshToken,
      session.expiresAt,
    );
  }
}

function invalidRefreshToken() {
  return errors.unauthenticated('INVALID_REFRESH_TOKEN', 'Sessão inválida. Faça login novamente.');
}
