import type { User } from '../../../domain/entities/user.js';
import { errors } from '../../../shared/errors/app-error.js';
import type { UserRepository } from '../../ports/user.repository.js';

export class GetCurrentUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw errors.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }
    return user;
  }
}
