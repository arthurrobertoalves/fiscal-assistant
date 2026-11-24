import type { User } from '../../domain/entities/user.js';

export interface NewUser {
  name: string;
  email: string;
  passwordHash: string;
}

/** Usuário com o hash de senha. Só é usado internamente, na autenticação. */
export interface UserWithCredentials extends User {
  passwordHash: string;
}

export interface UserRepository {
  create(data: NewUser): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<UserWithCredentials | null>;
}
