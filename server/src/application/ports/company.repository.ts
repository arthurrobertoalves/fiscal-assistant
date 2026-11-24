import type { Company, CompanyMembership, CompanyRole } from '../../domain/entities/company.js';

export interface NewCompany {
  name: string;
  document: string;
}

export interface CompanyWithRole {
  company: Company;
  role: CompanyRole;
}

export interface CompanyMemberView {
  userId: string;
  name: string;
  email: string;
  role: CompanyRole;
  joinedAt: Date;
}

export interface CompanyRepository {
  /** Cria a empresa e o vínculo OWNER do criador, na mesma transação. */
  createWithOwner(data: NewCompany, ownerUserId: string): Promise<CompanyWithRole>;
  findById(id: string): Promise<Company | null>;
  findByDocument(document: string): Promise<Company | null>;
  listForUser(userId: string): Promise<CompanyWithRole[]>;
  /** Retorna a empresa e o papel do usuário nela, ou null se não houver vínculo. */
  findMembership(userId: string, companyId: string): Promise<CompanyWithRole | null>;
  update(companyId: string, data: Partial<Pick<Company, 'name'>>): Promise<Company>;
  listMembers(companyId: string): Promise<CompanyMemberView[]>;
  addMember(companyId: string, userId: string, role: CompanyRole): Promise<CompanyMembership>;
  removeMember(companyId: string, userId: string): Promise<void>;
}
