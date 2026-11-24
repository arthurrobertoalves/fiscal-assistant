import { normalizeEmail } from '../../../domain/value-objects/email.js';
import { errors } from '../../../shared/errors/app-error.js';
import type { UserRepository } from '../../ports/user.repository.js';
import type { PasswordHasher } from '../../ports/security.ports.js';
import type { AuthResult, SessionIssuer } from '../../services/session-issuer.js';

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
}

export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: RegisterUserInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);

    if (await this.users.findByEmail(email)) {
      throw errors.conflict('EMAIL_ALREADY_REGISTERED', 'Já existe uma conta com este email.');
    }

    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.users.create({
      name: input.name.trim(),
      email,
      passwordHash,
    });
    const tokens = await this.sessions.startSession(user.id);

    return { user, tokens };
  }
}
