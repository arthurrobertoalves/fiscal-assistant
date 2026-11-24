import type { PrismaClient, Session as SessionRow } from '@prisma/client';
import type { Session } from '../../domain/entities/session.js';
import type {
  NewSession,
  SessionMatch,
  SessionRepository,
} from '../../application/ports/session.repository.js';
import { mapUniqueViolation } from './prisma-errors.js';

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: NewSession): Promise<Session> {
    const row = await mapUniqueViolation(() => this.prisma.session.create({ data }));
    return toSession(row);
  }

  async findById(id: string): Promise<Session | null> {
    const row = await this.prisma.session.findUnique({ where: { id } });
    return row ? toSession(row) : null;
  }

  async findByRefreshTokenHash(hash: string): Promise<SessionMatch | null> {
    const row = await this.prisma.session.findFirst({
      where: {
        OR: [{ refreshTokenHash: hash }, { previousRefreshTokenHash: hash }],
      },
    });
    if (!row) return null;
    return { session: toSession(row), isCurrentToken: row.refreshTokenHash === hash };
  }

  async rotateRefreshToken(sessionId: string, newHash: string, previousHash: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { refreshTokenHash: newHash, previousRefreshTokenHash: previousHash },
    });
  }

  async revoke(sessionId: string, at: Date): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: at },
    });
  }

  async setActiveCompany(sessionId: string, companyId: string | null): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { activeCompanyId: companyId },
    });
  }

  async clearActiveCompanyForUser(userId: string, companyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, activeCompanyId: companyId },
      data: { activeCompanyId: null },
    });
  }
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.userId,
    refreshTokenHash: row.refreshTokenHash,
    previousRefreshTokenHash: row.previousRefreshTokenHash,
    activeCompanyId: row.activeCompanyId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}
