import { isSessionActive } from '../../../domain/entities/session.js';
import { errors } from '../../../shared/errors/app-error.js';
import type { AccessTokenService } from '../../ports/security.ports.js';
import type { SessionRepository } from '../../ports/session.repository.js';

/** Contexto de autenticação disponível para os casos de uso protegidos. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  activeCompanyId: string | null;
}

/**
 * Valida o access token e confere a sessão no banco.
 * Conferir a sessão permite que logout e revogação tenham efeito imediato,
 * sem esperar o access token expirar.
 */
export class AuthenticateRequestUseCase {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly sessions: SessionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(accessToken: string): Promise<AuthContext> {
    const verification = await this.accessTokens.verify(accessToken);

    if (verification.status === 'expired') {
      throw errors.unauthenticated('TOKEN_EXPIRED', 'Token de acesso expirado.');
    }
    if (verification.status === 'invalid') {
      throw errors.unauthenticated('INVALID_TOKEN', 'Token de acesso inválido.');
    }

    const session = await this.sessions.findById(verification.sessionId);
    if (
      !session ||
      session.userId !== verification.userId ||
      !isSessionActive(session, this.now())
    ) {
      throw errors.unauthenticated('SESSION_INVALID', 'Sessão inválida ou encerrada.');
    }

    return {
      userId: session.userId,
      sessionId: session.id,
      activeCompanyId: session.activeCompanyId,
    };
  }
}
