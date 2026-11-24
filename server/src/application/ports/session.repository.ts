import type { Session } from '../../domain/entities/session.js';

export interface NewSession {
  userId: string;
  refreshTokenHash: string;
  activeCompanyId: string | null;
  expiresAt: Date;
}

export interface SessionMatch {
  session: Session;
  /** true se o hash for o token atual; false se for o token anterior (reuso). */
  isCurrentToken: boolean;
}

export interface SessionRepository {
  create(data: NewSession): Promise<Session>;
  findById(id: string): Promise<Session | null>;
  findByRefreshTokenHash(hash: string): Promise<SessionMatch | null>;
  /** Substitui o refresh token atual; o hash atual passa a ser o "anterior". */
  rotateRefreshToken(sessionId: string, newHash: string, previousHash: string): Promise<void>;
  revoke(sessionId: string, at: Date): Promise<void>;
  setActiveCompany(sessionId: string, companyId: string | null): Promise<void>;
  /** Remove a empresa ativa de todas as sessões do usuário naquela empresa. */
  clearActiveCompanyForUser(userId: string, companyId: string): Promise<void>;
}
