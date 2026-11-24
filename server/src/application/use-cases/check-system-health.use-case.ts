import type { DatabaseHealthPort } from '../ports/database-health.port.js';

export type ComponentStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded';
  timestamp: string;
  checks: {
    database: ComponentStatus;
  };
}

export class CheckSystemHealthUseCase {
  constructor(
    private readonly database: DatabaseHealthPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<HealthReport> {
    const databaseStatus = await this.checkDatabase();

    return {
      status: databaseStatus === 'up' ? 'ok' : 'degraded',
      timestamp: this.now().toISOString(),
      checks: { database: databaseStatus },
    };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    try {
      await this.database.ping();
      return 'up';
    } catch {
      // Não expomos o motivo da falha (pode conter dados de conexão).
      return 'down';
    }
  }
}
