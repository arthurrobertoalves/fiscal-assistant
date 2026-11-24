import { canManageCompany } from '../../../domain/policies/company-permissions.js';
import { errors } from '../../../shared/errors/app-error.js';
import type { CompanyRepository, CompanyWithRole } from '../../ports/company.repository.js';
import type { CompanyAccessService } from '../../services/company-access.service.js';

export interface UpdateCompanyInput {
  // CNPJ é imutável nesta etapa: alterá-lo exigiria reconciliação fiscal.
  name?: string;
}

export class UpdateCompanyUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly companies: CompanyRepository,
  ) {}

  async execute(userId: string, companyId: string, input: UpdateCompanyInput): Promise<CompanyWithRole> {
    const membership = await this.access.requireMembership(userId, companyId);
    if (!canManageCompany(membership.role)) {
      throw errors.forbidden();
    }

    if (input.name !== undefined) {
      const company = await this.companies.update(companyId, { name: input.name.trim() });
      return { company, role: membership.role };
    }

    return membership;
  }
}
