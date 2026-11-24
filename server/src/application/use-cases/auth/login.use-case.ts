import { randomUUID } from 'node:crypto';
import type { User } from '../../../domain/entities/user.js';
import { normalizeEmail } from '../../../domain/value-objects/email.js';
import { errors } from '../../../shared/errors/app-error.js';
import type { UserRepository } from '../../ports/user.repository.js';
import type { PasswordHasher } from '../../ports/security.ports.js';
import type { AuthResult, SessionIssuer } from '../../services/session-issuer.js';

export interface LoginInput {
  email: string;
  password: string;
}

export class LoginUseCase {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: LoginInput): Promise<AuthResult> {
    const user = await this.users.findByEmail(normalizeEmail(input.email));

    // Sempre executa a verificação de senha, mesmo sem usuário,
    // para o tempo de resposta não revelar se a conta existe.
    const hashToCheck = user?.passwordHash ?? (await this.getDummyHash());
    const passwordMatches = await this.hasher.verify(hashToCheck, input.password);

    if (!user || !passwordMatches) {
      throw errors.unauthenticated('INVALID_CREDENTIALS', 'Email ou senha inválidos.');
    }

    const tokens = await this.sessions.startSession(user.id);
    return { user: toPublicUser(user), tokens };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(randomUUID());
    return this.dummyHash;
  }
}

function toPublicUser(user: User & { passwordHash: string }): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
