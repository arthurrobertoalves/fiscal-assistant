import { Prisma } from '@prisma/client';
import { errors } from '../../shared/errors/app-error.js';

/**
 * Converte violação de restrição única (P2002) em conflito HTTP.
 * Os casos de uso já checam duplicidade antes; isto cobre condições de corrida.
 */
export async function mapUniqueViolation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw errors.conflict('CONFLICT', 'Já existe um registro com estes dados.');
    }
    throw error;
  }
}
