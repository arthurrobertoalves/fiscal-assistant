import type { CompanyWithRole } from '../../ports/company.repository.js';
import type { CompanyAccessService } from '../../services/company-access.service.js';

export class GetCompanyUseCase {
  constructor(private readonly access: CompanyAccessService) {}

  execute(userId: string, companyId: string): Promise<CompanyWithRole> {
    return this.access.requireMembership(userId, companyId);
  }
}
