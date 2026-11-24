import type { User } from '../../domain/entities/user.js';
import type { NewSession, SessionRepository } from '../ports/session.repository.js';
import type { AccessTokenService, RefreshTokenCodec } from '../ports/security.ports.js';

export interface SessionTtlConfig {
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
}

export interface IssuedTokens {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AuthResult {
  user: User;
  tokens: IssuedTokens;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Emite a sessão e seus tokens. Centraliza a política de validade:
 * access token curto; refresh token com validade absoluta da sessão.
 */
export class SessionIssuer {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenCodec,
    private readonly config: SessionTtlConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Cria uma nova sessão (login, cadastro). */
  async startSession(userId: string, activeCompanyId: string | null = null): Promise<IssuedTokens> {
    const refreshToken = this.refreshTokens.generate();
    const expiresAt = new Date(this.now().getTime() + this.config.refreshTokenTtlDays * DAY_IN_MS);

    const data: NewSession = {
      userId,
      refreshTokenHash: this.refreshTokens.hash(refreshToken),
      activeCompanyId,
      expiresAt,
    };
    const session = await this.sessions.create(data);

    return this.buildTokens(session.id, userId, refreshToken, expiresAt);
  }

  /** Emite novos tokens para uma sessão já existente (renovação). */
  async buildTokens(
    sessionId: string,
    userId: string,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
  ): Promise<IssuedTokens> {
    const access = await this.accessTokens.issue(
      { userId, sessionId },
      this.config.accessTokenTtlSeconds,
    );

    return {
      sessionId,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }
}
