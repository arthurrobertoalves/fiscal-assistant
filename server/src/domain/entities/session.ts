export interface Session {
  id: string;
  userId: string;
  refreshTokenHash: string;
  previousRefreshTokenHash: string | null;
  activeCompanyId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Uma sessão é utilizável se não foi revogada e ainda está dentro da validade absoluta. */
export function isSessionActive(session: Pick<Session, 'revokedAt' | 'expiresAt'>, now: Date): boolean {
  return session.revokedAt === null && session.expiresAt.getTime() > now.getTime();
}
