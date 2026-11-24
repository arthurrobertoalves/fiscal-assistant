import type { CompanyRole, CompanyMembership } from '../../../domain/entities/company.js';
import { assignableRoles, canManageMembers } from '../../../domain/policies/company-permissions.js';
import { normalizeEmail } from '../../../domain/value-objects/email.js';
import { errors } from '../../../shared/errors/app-error.js';
import type { CompanyRepository } from '../../ports/company.repository.js';
import type { UserRepository } from '../../ports/user.repository.js';
import type { CompanyAccessService } from '../../services/company-access.service.js';

export interface AddCompanyMemberInput {
  email: string;
  role: CompanyRole;
}

/**
 * Associa um usuário já cadastrado à empresa.
 * Não há convites por email nesta etapa (sem infraestrutura de envio).
 */
export class AddCompanyMemberUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly companies: CompanyRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(
    actorUserId: string,
    companyId: string,
    input: AddCompanyMemberInput,
  ): Promise<CompanyMembership> {
    const actor = await this.access.requireMembership(actorUserId, companyId);

    if (!canManageMembers(actor.role)) {
      throw errors.forbidden();
    }
    if (!assignableRoles(actor.role).includes(input.role)) {
      throw errors.forbidden('Você não pode atribuir este papel.');
    }

    const target = await this.users.findByEmail(normalizeEmail(input.email));
    if (!target) {
      throw errors.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }

    if (await this.companies.findMembership(target.id, companyId)) {
      throw errors.conflict('ALREADY_MEMBER', 'Este usuário já faz parte da empresa.');
    }

    return this.companies.addMember(companyId, target.id, input.role);
  }
}
