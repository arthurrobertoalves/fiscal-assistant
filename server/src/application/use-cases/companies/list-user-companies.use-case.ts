import type { CompanyRepository, CompanyWithRole } from '../../ports/company.repository.js';

export class ListUserCompaniesUseCase {
  constructor(private readonly companies: CompanyRepository) {}

  execute(userId: string): Promise<CompanyWithRole[]> {
    return this.companies.listForUser(userId);
  }
}
