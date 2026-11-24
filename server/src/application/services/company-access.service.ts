import { errors } from '../../shared/errors/app-error.js';
import type { CompanyRepository, CompanyWithRole } from '../ports/company.repository.js';

/**
 * Ponto único de verificação de acesso a uma empresa.
 * Quem não é membro recebe 404 (e não 403), para não revelar se a empresa existe.
 */
export class CompanyAccessService {
  constructor(private readonly companies: CompanyRepository) {}

  async requireMembership(userId: string, companyId: string): Promise<CompanyWithRole> {
    const membership = await this.companies.findMembership(userId, companyId);
    if (!membership) {
      throw errors.notFound('COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    }
    return membership;
  }
}
