import type { CompanyRole } from '../entities/company.js';

/*
 * Matriz de permissões (regras puras, sem I/O):
 *
 * Ação                         OWNER   ADMIN   MEMBER
 * Ver empresa e membros          ✔       ✔       ✔
 * Alterar dados da empresa       ✔       ✔       ✘
 * Adicionar membros              ✔       ✔       ✘
 *   - papel atribuível           ADMIN,  MEMBER  -
 *                                MEMBER
 * Remover membros                ✔*      ✔*      ✘
 *   - papéis removíveis          ADMIN,  MEMBER  -
 *                                MEMBER
 * Sair da empresa (si mesmo)     ✔**     ✔       ✔
 *
 * *  OWNER nunca é removido pela API.
 * ** O OWNER não pode sair, para a empresa nunca ficar sem dono.
 */

export function canManageCompany(role: CompanyRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function canManageMembers(role: CompanyRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function assignableRoles(actorRole: CompanyRole): CompanyRole[] {
  switch (actorRole) {
    case 'OWNER':
      return ['ADMIN', 'MEMBER'];
    case 'ADMIN':
      return ['MEMBER'];
    default:
      return [];
  }
}

export function canRemoveMember(
  actorRole: CompanyRole,
  targetRole: CompanyRole,
  isSelf: boolean,
): boolean {
  if (targetRole === 'OWNER') {
    return false;
  }
  if (isSelf) {
    return true;
  }
  // Quem pode atribuir um papel também pode removê-lo.
  return assignableRoles(actorRole).includes(targetRole);
}
