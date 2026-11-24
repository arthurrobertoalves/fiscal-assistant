import type { CompanyMemberView, CompanyRepository } from '../../ports/company.repository.js';
import type { CompanyAccessService } from '../../services/company-access.service.js';

export class ListCompanyMembersUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly companies: CompanyRepository,
  ) {}

  async execute(userId: string, companyId: string): Promise<CompanyMemberView[]> {
    await this.access.requireMembership(userId, companyId);
    return this.companies.listMembers(companyId);
  }
}
