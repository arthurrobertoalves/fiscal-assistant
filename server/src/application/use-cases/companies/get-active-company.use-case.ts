import { errors } from '../../../shared/errors/app-error.js';
import type { CompanyRepository, CompanyWithRole } from '../../ports/company.repository.js';
import type { AuthContext } from '../auth/authenticate-request.use-case.js';

/**
 * Retorna a empresa ativa da sessão, revalidando a associação do usuário.
 * Se o vínculo deixou de existir, a empresa ativa é tratada como inexistente.
 */
export class GetActiveCompanyUseCase {
  constructor(private readonly companies: CompanyRepository) {}

  async execute(auth: AuthContext): Promise<CompanyWithRole> {
    if (!auth.activeCompanyId) {
      throw errors.conflict('NO_ACTIVE_COMPANY', 'Nenhuma empresa ativa selecionada.');
    }

    const membership = await this.companies.findMembership(auth.userId, auth.activeCompanyId);
    if (!membership) {
      throw errors.conflict('NO_ACTIVE_COMPANY', 'Nenhuma empresa ativa selecionada.');
    }

    return membership;
  }
}
