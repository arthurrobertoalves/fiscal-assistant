import type { RefreshTokenCodec } from '../../ports/security.ports.js';
import type { SessionRepository } from '../../ports/session.repository.js';

/** Revoga a sessão associada ao refresh token. É idempotente. */
export class LogoutUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly refreshTokens: RefreshTokenCodec,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    const match = await this.sessions.findByRefreshTokenHash(this.refreshTokens.hash(refreshToken));
    if (match && match.session.revokedAt === null) {
      await this.sessions.revoke(match.session.id, this.now());
    }
  }
}
