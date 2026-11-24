import { describe, expect, it } from 'vitest';
import { isSessionActive } from '../../../src/domain/entities/session.js';
import {
  assignableRoles,
  canManageCompany,
  canManageMembers,
  canRemoveMember,
} from '../../../src/domain/policies/company-permissions.js';
import { isValidCnpj, normalizeCnpj } from '../../../src/domain/value-objects/cnpj.js';
import { normalizeEmail } from '../../../src/domain/value-objects/email.js';

describe('CNPJ', () => {
  it('aceita CNPJs com dígitos verificadores corretos, com ou sem pontuação', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11444777000161')).toBe(true);
  });

  it('rejeita CNPJ com dígito verificador errado', () => {
    expect(isValidCnpj('11222333000182')).toBe(false);
  });

  it('rejeita tamanho incorreto e sequências repetidas', () => {
    expect(isValidCnpj('1122233300018')).toBe(false);
    expect(isValidCnpj('111222330001810')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('')).toBe(false);
  });

  it('normaliza removendo tudo que não é dígito', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181');
  });
});

describe('email', () => {
  it('normaliza para minúsculas e remove espaços nas bordas', () => {
    expect(normalizeEmail('  Maria@Empresa.COM ')).toBe('maria@empresa.com');
  });
});

describe('isSessionActive', () => {
  const now = new Date('2026-06-10T00:00:00.000Z');

  it('é ativa quando não revogada e dentro da validade', () => {
    expect(isSessionActive({ revokedAt: null, expiresAt: new Date('2026-06-11T00:00:00.000Z') }, now)).toBe(true);
  });

  it('não é ativa quando revogada', () => {
    expect(isSessionActive({ revokedAt: now, expiresAt: new Date('2026-06-11T00:00:00.000Z') }, now)).toBe(false);
  });

  it('não é ativa após a validade absoluta', () => {
    expect(isSessionActive({ revokedAt: null, expiresAt: new Date('2026-06-09T00:00:00.000Z') }, now)).toBe(false);
  });
});

describe('matriz de permissões por papel', () => {
  it('OWNER e ADMIN podem gerenciar a empresa e membros; MEMBER não', () => {
    expect(canManageCompany('OWNER')).toBe(true);
    expect(canManageCompany('ADMIN')).toBe(true);
    expect(canManageCompany('MEMBER')).toBe(false);

    expect(canManageMembers('OWNER')).toBe(true);
    expect(canManageMembers('ADMIN')).toBe(true);
    expect(canManageMembers('MEMBER')).toBe(false);
  });

  it('OWNER atribui ADMIN e MEMBER; ADMIN atribui apenas MEMBER; MEMBER não atribui nada', () => {
    expect(assignableRoles('OWNER')).toEqual(['ADMIN', 'MEMBER']);
    expect(assignableRoles('ADMIN')).toEqual(['MEMBER']);
    expect(assignableRoles('MEMBER')).toEqual([]);
  });

  it('ninguém remove o OWNER', () => {
    expect(canRemoveMember('OWNER', 'OWNER', false)).toBe(false);
    expect(canRemoveMember('ADMIN', 'OWNER', false)).toBe(false);
  });

  it('OWNER remove ADMIN e MEMBER; ADMIN remove apenas MEMBER', () => {
    expect(canRemoveMember('OWNER', 'ADMIN', false)).toBe(true);
    expect(canRemoveMember('OWNER', 'MEMBER', false)).toBe(true);
    expect(canRemoveMember('ADMIN', 'ADMIN', false)).toBe(false);
    expect(canRemoveMember('ADMIN', 'MEMBER', false)).toBe(true);
  });

  it('qualquer membro não-OWNER pode sair por conta própria', () => {
    expect(canRemoveMember('ADMIN', 'ADMIN', true)).toBe(true);
    expect(canRemoveMember('MEMBER', 'MEMBER', true)).toBe(true);
    expect(canRemoveMember('OWNER', 'OWNER', true)).toBe(false);
  });

  it('MEMBER não remove outros membros', () => {
    expect(canRemoveMember('MEMBER', 'MEMBER', false)).toBe(false);
  });
});
