import { canManageMembers, canRemoveMember } from '../../../domain/policies/company-permissions.js';
import { errors } from '../../../shared/errors/app-error.js';
import type { CompanyRepository } from '../../ports/company.repository.js';
import type { SessionRepository } from '../../ports/session.repository.js';
import type { CompanyAccessService } from '../../services/company-access.service.js';

/**
 * Remove um membro da empresa. Qualquer membro pode sair por conta própria
 * (exceto o OWNER); remover outros exige OWNER ou ADMIN, respeitando a matriz de papéis.
 */
export class RemoveCompanyMemberUseCase {
  constructor(
    private readonly access: CompanyAccessService,
    private readonly companies: CompanyRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async execute(actorUserId: string, companyId: string, targetUserId: string): Promise<void> {
    const actor = await this.access.requireMembership(actorUserId, companyId);
    const isSelf = actorUserId === targetUserId;

    if (!isSelf && !canManageMembers(actor.role)) {
      throw errors.forbidden();
    }

    const target = await this.companies.findMembership(targetUserId, companyId);
    if (!target) {
      throw errors.notFound('MEMBER_NOT_FOUND', 'Membro não encontrado nesta empresa.');
    }

    if (!canRemoveMember(actor.role, target.role, isSelf)) {
      throw errors.forbidden('Você não pode remover este membro.');
    }

    await this.companies.removeMember(companyId, targetUserId);
    // A empresa deixa de ser ativa nas sessões do ex-membro.
    await this.sessions.clearActiveCompanyForUser(targetUserId, companyId);
  }
}
