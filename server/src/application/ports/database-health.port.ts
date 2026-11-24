/**
 * Contrato que a aplicação exige para verificar a saúde do banco.
 * A implementação concreta (Prisma) fica em infrastructure/.
 */
export interface DatabaseHealthPort {
  /** Lança erro se o banco não estiver acessível. */
  ping(): Promise<void>;
}
