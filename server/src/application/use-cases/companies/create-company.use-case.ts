import { isValidCnpj, normalizeCnpj } from '../../../domain/value-objects/cnpj.js';
import { errors, AppError } from '../../../shared/errors/app-error.js';
import type { CompanyRepository, CompanyWithRole } from '../../ports/company.repository.js';

export interface CreateCompanyInput {
  name: string;
  document: string;
}

export class CreateCompanyUseCase {
  constructor(private readonly companies: CompanyRepository) {}

  async execute(ownerUserId: string, input: CreateCompanyInput): Promise<CompanyWithRole> {
    const document = normalizeCnpj(input.document);
    if (!isValidCnpj(document)) {
      throw new AppError(422, 'INVALID_CNPJ', 'CNPJ inválido.');
    }

    if (await this.companies.findByDocument(document)) {
      throw errors.conflict('COMPANY_DOCUMENT_ALREADY_REGISTERED', 'Já existe uma empresa com este CNPJ.');
    }

    // O criador entra automaticamente como OWNER.
    return this.companies.createWithOwner({ name: input.name.trim(), document }, ownerUserId);
  }
}
