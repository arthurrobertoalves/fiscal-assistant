import type { Company, CompanyRole } from '../../domain/entities/company.js';
import type { User } from '../../domain/entities/user.js';
import type {
  CompanyMemberView,
  CompanyWithRole,
} from '../../application/ports/company.repository.js';
import type { AuthResult, IssuedTokens } from '../../application/services/session-issuer.js';

/*
 * Converte entidades internas em respostas da API.
 * Nunca inclua hashes de senha, refresh tokens ou dados de outras empresas.
 */

export function toUserDto(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export function toCompanyDto(company: Company) {
  return {
    id: company.id,
    name: company.name,
    document: company.document,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  };
}

export function toCompanyWithRoleDto({ company, role }: CompanyWithRole) {
  return { company: toCompanyDto(company), role };
}

export function toMemberDto(member: CompanyMemberView) {
  return {
    userId: member.userId,
    name: member.name,
    email: member.email,
    role: member.role satisfies CompanyRole,
    joinedAt: member.joinedAt,
  };
}

export function toAuthResponse({ user, tokens }: AuthResult) {
  return {
    user: toUserDto(user),
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
  };
}

export function toAccessTokenResponse(tokens: IssuedTokens) {
  return {
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
  };
}
