import type { CompanyWithRole } from '../../ports/company.repository.js';
import type { SessionRepository } from '../../ports/session.repository.js';
import type { CompanyAccessService } from '../../services/company-access.service.js';
import type { AuthContext } from './authenticate-request.use-case.js';

/** Define a empresa ativa da sessão. Só é aceita se o usuário for membro. */
export class SetActiveCompanyUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly sessions: SessionRepository,
  ) {}

  async execute(auth: AuthContext, companyId: string): Promise<CompanyWithRole> {
    const membership = await this.access.requireMembership(auth.userId, companyId);
    await this.sessions.setActiveCompany(auth.sessionId, companyId);
    return membership;
  }
}
