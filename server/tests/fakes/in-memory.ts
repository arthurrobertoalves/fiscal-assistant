import { randomUUID } from 'node:crypto';
import type { Company, CompanyMembership, CompanyRole } from '../../src/domain/entities/company.js';
import type { Session } from '../../src/domain/entities/session.js';
import type { User } from '../../src/domain/entities/user.js';
import type {
  CompanyMemberView,
  CompanyRepository,
  CompanyWithRole,
  NewCompany,
} from '../../src/application/ports/company.repository.js';
import type {
  NewUser,
  UserRepository,
  UserWithCredentials,
} from '../../src/application/ports/user.repository.js';
import type {
  NewSession,
  SessionMatch,
  SessionRepository,
} from '../../src/application/ports/session.repository.js';
import type {
  AccessTokenClaims,
  AccessTokenService,
  AccessTokenVerification,
  PasswordHasher,
} from '../../src/application/ports/security.ports.js';
import { errors } from '../../src/shared/errors/app-error.js';

/** Relógio controlável: permite testar expiração sem esperar tempo real. */
export class FakeClock {
  constructor(private current = new Date('2026-06-01T12:00:00.000Z')) {}

  now = (): Date => new Date(this.current.getTime());

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

export class InMemoryUserRepository implements UserRepository {
  readonly rows = new Map<string, UserWithCredentials>();

  async create(data: NewUser): Promise<User> {
    if ([...this.rows.values()].some((row) => row.email === data.email)) {
      throw errors.conflict('CONFLICT', 'Já existe um registro com estes dados.');
    }
    const now = new Date();
    const row: UserWithCredentials = { id: randomUUID(), createdAt: now, updatedAt: now, ...data };
    this.rows.set(row.id, row);
    return toPublicUser(row);
  }

  async findById(id: string): Promise<User | null> {
    const row = this.rows.get(id);
    return row ? toPublicUser(row) : null;
  }

  async findByEmail(email: string): Promise<UserWithCredentials | null> {
    return [...this.rows.values()].find((row) => row.email === email) ?? null;
  }
}

export class InMemoryCompanyRepository implements CompanyRepository {
  readonly companies = new Map<string, Company>();
  readonly memberships: CompanyMembership[] = [];

  constructor(private readonly users: InMemoryUserRepository) {}

  async createWithOwner(data: NewCompany, ownerUserId: string): Promise<CompanyWithRole> {
    const now = new Date();
    const company: Company = { id: randomUUID(), createdAt: now, updatedAt: now, ...data };
    this.companies.set(company.id, company);
    this.memberships.push({ companyId: company.id, userId: ownerUserId, role: 'OWNER', createdAt: now });
    return { company, role: 'OWNER' };
  }

  async findById(id: string): Promise<Company | null> {
    return this.companies.get(id) ?? null;
  }

  async findByDocument(document: string): Promise<Company | null> {
    return [...this.companies.values()].find((company) => company.document === document) ?? null;
  }

  async listForUser(userId: string): Promise<CompanyWithRole[]> {
    return this.memberships
      .filter((membership) => membership.userId === userId)
      .map((membership) => ({
        company: this.companies.get(membership.companyId)!,
        role: membership.role,
      }));
  }

  async findMembership(userId: string, companyId: string): Promise<CompanyWithRole | null> {
    const membership = this.memberships.find(
      (item) => item.userId === userId && item.companyId === companyId,
    );
    const company = this.companies.get(companyId);
    return membership && company ? { company, role: membership.role } : null;
  }

  async update(companyId: string, data: { name?: string }): Promise<Company> {
    const company = { ...this.companies.get(companyId)!, ...data, updatedAt: new Date() };
    this.companies.set(companyId, company);
    return company;
  }

  async listMembers(companyId: string): Promise<CompanyMemberView[]> {
    return this.memberships
      .filter((membership) => membership.companyId === companyId)
      .map((membership) => {
        const user = this.users.rows.get(membership.userId)!;
        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: membership.role,
          joinedAt: membership.createdAt,
        };
      });
  }

  async addMember(companyId: string, userId: string, role: CompanyRole): Promise<CompanyMembership> {
    const membership: CompanyMembership = { companyId, userId, role, createdAt: new Date() };
    this.memberships.push(membership);
    return membership;
  }

  async removeMember(companyId: string, userId: string): Promise<void> {
    const index = this.memberships.findIndex(
      (item) => item.companyId === companyId && item.userId === userId,
    );
    if (index >= 0) this.memberships.splice(index, 1);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  readonly rows = new Map<string, Session>();

  constructor(private readonly clock: FakeClock) {}

  async create(data: NewSession): Promise<Session> {
    const session: Session = {
      id: randomUUID(),
      previousRefreshTokenHash: null,
      revokedAt: null,
      createdAt: this.clock.now(),
      ...data,
    };
    this.rows.set(session.id, session);
    return session;
  }

  async findById(id: string): Promise<Session | null> {
    return this.rows.get(id) ?? null;
  }

  async findByRefreshTokenHash(hash: string): Promise<SessionMatch | null> {
    for (const session of this.rows.values()) {
      if (session.refreshTokenHash === hash) return { session, isCurrentToken: true };
      if (session.previousRefreshTokenHash === hash) return { session, isCurrentToken: false };
    }
    return null;
  }

  async rotateRefreshToken(sessionId: string, newHash: string, previousHash: string): Promise<void> {
    const session = this.rows.get(sessionId)!;
    this.rows.set(sessionId, { ...session, refreshTokenHash: newHash, previousRefreshTokenHash: previousHash });
  }

  async revoke(sessionId: string, at: Date): Promise<void> {
    const session = this.rows.get(sessionId)!;
    this.rows.set(sessionId, { ...session, revokedAt: at });
  }

  async setActiveCompany(sessionId: string, companyId: string | null): Promise<void> {
    const session = this.rows.get(sessionId)!;
    this.rows.set(sessionId, { ...session, activeCompanyId: companyId });
  }

  async clearActiveCompanyForUser(userId: string, companyId: string): Promise<void> {
    for (const session of this.rows.values()) {
      if (session.userId === userId && session.activeCompanyId === companyId) {
        this.rows.set(session.id, { ...session, activeCompanyId: null });
      }
    }
  }
}

/** Hash determinístico: rápido e suficiente para testar fluxos (o Argon2 tem testes próprios). */
export class FakePasswordHasher implements PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return `hashed:${plainPassword}`;
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    return passwordHash === `hashed:${plainPassword}`;
  }
}

/** Tokens em memória com expiração medida pelo FakeClock. */
export class FakeAccessTokenService implements AccessTokenService {
  private readonly tokens = new Map<string, { claims: AccessTokenClaims; expiresAt: number }>();

  constructor(private readonly clock: FakeClock) {}

  async issue(claims: AccessTokenClaims, ttlSeconds: number) {
    const token = `access-${randomUUID()}`;
    const expiresAt = this.clock.now().getTime() + ttlSeconds * 1000;
    this.tokens.set(token, { claims, expiresAt });
    return { token, expiresAt: new Date(expiresAt) };
  }

  async verify(token: string): Promise<AccessTokenVerification> {
    const entry = this.tokens.get(token);
    if (!entry) return { status: 'invalid' };
    if (this.clock.now().getTime() >= entry.expiresAt) return { status: 'expired' };
    return { status: 'valid', ...entry.claims };
  }
}

function toPublicUser(row: UserWithCredentials): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
