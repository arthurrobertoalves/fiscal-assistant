import type { PrismaClient, User as UserRow } from '@prisma/client';
import type { User } from '../../domain/entities/user.js';
import type {
  NewUser,
  UserRepository,
  UserWithCredentials,
} from '../../application/ports/user.repository.js';
import { mapUniqueViolation } from './prisma-errors.js';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: NewUser): Promise<User> {
    const row = await mapUniqueViolation(() => this.prisma.user.create({ data }));
    return toPublicUser(row);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toPublicUser(row) : null;
  }

  async findByEmail(email: string): Promise<UserWithCredentials | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? { ...toPublicUser(row), passwordHash: row.passwordHash } : null;
  }
}

function toPublicUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
