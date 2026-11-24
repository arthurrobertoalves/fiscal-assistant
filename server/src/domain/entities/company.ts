// Papéis de um usuário dentro de uma empresa.
export const COMPANY_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export interface Company {
  id: string;
  name: string;
  document: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyMembership {
  companyId: string;
  userId: string;
  role: CompanyRole;
  createdAt: Date;
}
