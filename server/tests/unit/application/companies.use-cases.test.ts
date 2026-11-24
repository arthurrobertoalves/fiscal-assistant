import { describe, expect, it } from 'vitest';
import { AddCompanyMemberUseCase } from '../../../src/application/use-cases/companies/add-company-member.use-case.js';
import { CreateCompanyUseCase } from '../../../src/application/use-cases/companies/create-company.use-case.js';
import { GetActiveCompanyUseCase } from '../../../src/application/use-cases/companies/get-active-company.use-case.js';
import { GetCompanyUseCase } from '../../../src/application/use-cases/companies/get-company.use-case.js';
import { ListCompanyMembersUseCase } from '../../../src/application/use-cases/companies/list-company-members.use-case.js';
import { ListUserCompaniesUseCase } from '../../../src/application/use-cases/companies/list-user-companies.use-case.js';
import { RemoveCompanyMemberUseCase } from '../../../src/application/use-cases/companies/remove-company-member.use-case.js';
import { UpdateCompanyUseCase } from '../../../src/application/use-cases/companies/update-company.use-case.js';
import { SetActiveCompanyUseCase } from '../../../src/application/use-cases/auth/set-active-company.use-case.js';
import type { AuthContext } from '../../../src/application/use-cases/auth/authenticate-request.use-case.js';
import { CompanyAccessService } from '../../../src/application/services/company-access.service.js';
import type { CompanyRole } from '../../../src/domain/entities/company.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import {
  FakeClock,
  InMemoryCompanyRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from '../../fakes/in-memory.js';

const CNPJ_A = '11.222.333/0001-81';
const CNPJ_B = '11.444.777/0001-61';

function setup() {
  const clock = new FakeClock();
  const users = new InMemoryUserRepository();
  const companies = new InMemoryCompanyRepository(users);
  const sessions = new InMemorySessionRepository(clock);
  const access = new CompanyAccessService(companies);

  return {
    users,
    companies,
    sessions,
    create: new CreateCompanyUseCase(companies),
    list: new ListUserCompaniesUseCase(companies),
    get: new GetCompanyUseCase(access),
    getActive: new GetActiveCompanyUseCase(companies),
    update: new UpdateCompanyUseCase(access, companies),
    listMembers: new ListCompanyMembersUseCase(access, companies),
    addMember: new AddCompanyMemberUseCase(access, companies, users),
    removeMember: new RemoveCompanyMemberUseCase(access, companies, sessions),
    setActive: new SetActiveCompanyUseCase(access, sessions),
  };
}

/** Cria um usuário diretamente no repositório (o cadastro tem testes próprios). */
async function createUser(users: InMemoryUserRepository, name: string) {
  return users.create({ name, email: `${name.toLowerCase()}@teste.com`, passwordHash: 'x' });
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => {
      throw new Error('esperava erro, mas a operação teve sucesso');
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

/** Cria uma empresa com um OWNER e devolve os ids úteis para os cenários. */
async function scenarioWithCompany(ctx: ReturnType<typeof setup>) {
  const owner = await createUser(ctx.users, 'Owner');
  const { company } = await ctx.create.execute(owner.id, { name: 'Padaria Central', document: CNPJ_A });
  return { owner, company };
}

/** Adiciona um usuário com o papel informado, usando o próprio caso de uso. */
async function addWithRole(
  ctx: ReturnType<typeof setup>,
  actorId: string,
  companyId: string,
  name: string,
  role: CompanyRole,
) {
  const user = await createUser(ctx.users, name);
  await ctx.addMember.execute(actorId, companyId, { email: user.email, role });
  return user;
}

describe('criação de empresa', () => {
  it('cria a empresa e torna o criador OWNER', async () => {
    const ctx = setup();
    const owner = await createUser(ctx.users, 'Owner');

    const result = await ctx.create.execute(owner.id, { name: '  Padaria Central ', document: CNPJ_A });

    expect(result.role).toBe('OWNER');
    expect(result.company.name).toBe('Padaria Central');
    expect(result.company.document).toBe('11222333000181');
  });

  it('rejeita CNPJ com dígito verificador inválido', async () => {
    const ctx = setup();
    const owner = await createUser(ctx.users, 'Owner');

    await expectAppError(
      ctx.create.execute(owner.id, { name: 'Empresa', document: '11.222.333/0001-82' }),
      'INVALID_CNPJ',
    );
  });

  it('rejeita CNPJ já cadastrado, mesmo com outra formatação', async () => {
    const ctx = setup();
    const owner = await createUser(ctx.users, 'Owner');
    await ctx.create.execute(owner.id, { name: 'Empresa A', document: CNPJ_A });

    await expectAppError(
      ctx.create.execute(owner.id, { name: 'Empresa B', document: '11222333000181' }),
      'COMPANY_DOCUMENT_ALREADY_REGISTERED',
    );
  });
});

describe('isolamento entre empresas (IDOR)', () => {
  it('usuário sem vínculo recebe 404 ao consultar a empresa, sem saber se ela existe', async () => {
    const ctx = setup();
    const { company } = await scenarioWithCompany(ctx);
    const intruder = await createUser(ctx.users, 'Intruso');

    await expectAppError(ctx.get.execute(intruder.id, company.id), 'COMPANY_NOT_FOUND');
  });

  it('usuário sem vínculo não consegue listar membros nem alterar a empresa', async () => {
    const ctx = setup();
    const { company } = await scenarioWithCompany(ctx);
    const intruder = await createUser(ctx.users, 'Intruso');

    await expectAppError(ctx.listMembers.execute(intruder.id, company.id), 'COMPANY_NOT_FOUND');
    await expectAppError(
      ctx.update.execute(intruder.id, company.id, { name: 'Invadida' }),
      'COMPANY_NOT_FOUND',
    );
  });

  it('não aceita como empresa ativa uma empresa da qual o usuário não é membro', async () => {
    const ctx = setup();
    const { company } = await scenarioWithCompany(ctx);
    const intruder = await createUser(ctx.users, 'Intruso');
    const session = await ctx.sessions.create({
      userId: intruder.id,
      refreshTokenHash: 'h',
      activeCompanyId: null,
      expiresAt: new Date('2030-01-01'),
    });
    const auth: AuthContext = { userId: intruder.id, sessionId: session.id, activeCompanyId: null };

    await expectAppError(ctx.setActive.execute(auth, company.id), 'COMPANY_NOT_FOUND');
    expect((await ctx.sessions.findById(session.id))?.activeCompanyId).toBeNull();
  });
});

describe('permissões por papel', () => {
  it('MEMBER pode consultar, mas não alterar a empresa nem adicionar membros', async () => {
    const ctx = setup();
    const { owner, company } = await scenarioWithCompany(ctx);
    const member = await addWithRole(ctx, owner.id, company.id, 'Membro', 'MEMBER');

    await expect(ctx.get.execute(member.id, company.id)).resolves.toMatchObject({ role: 'MEMBER' });
    await expectAppError(ctx.update.execute(member.id, company.id, { name: 'Nova' }), 'FORBIDDEN');
    await expectAppError(
      ctx.addMember.execute(member.id, company.id, { email: 'outro@teste.com', role: 'MEMBER' }),
      'FORBIDDEN',
    );
  });

  it('ADMIN altera a empresa e adiciona MEMBER, mas não adiciona ADMIN', async () => {
    const ctx = setup();
    const { owner, company } = await scenarioWithCompany(ctx);
    const admin = await addWithRole(ctx, owner.id, company.id, 'Admin', 'ADMIN');

    await expect(ctx.update.execute(admin.id, company.id, { name: 'Novo nome' })).resolves.toMatchObject({
      company: { name: 'Novo nome' },
    });
    const newMember = await createUser(ctx.users, 'NovoMembro');
    await expect(
      ctx.addMember.execute(admin.id, company.id, { email: newMember.email, role: 'MEMBER' }),
    ).resolves.toMatchObject({ userId: newMember.id, role: 'MEMBER' });

    const otherUser = await createUser(ctx.users, 'Outro');
    await expectAppError(
      ctx.addMember.execute(admin.id, company.id, { email: otherUser.email, role: 'ADMIN' }),
      'FORBIDDEN',
    );
  });

  it('OWNER adiciona ADMIN e MEMBER', async () => {
    const ctx = setup();
    const { owner, company } = await scenarioWithCompany(ctx);

    const admin = await addWithRole(ctx, owner.id, company.id, 'Admin', 'ADMIN');
    const member = await addWithRole(ctx, owner.id, company.id, 'Membro', 'MEMBER');

    const members = await ctx.listMembers.execute(owner.id, company.id);
    expect(members.map((m) => [m.userId, m.role]).sort()).toEqual(
      [
        [owner.id, 'OWNER'],
        [admin.id, 'ADMIN'],
        [member.id, 'MEMBER'],
      ].sort(),
    );
  });

  it('não adiciona o mesmo usuário duas vezes à empresa', async () => {
    const ctx = setup();
    const { owner, company } = await scenarioWithCompany(ctx);
    const member = await addWithRole(ctx, owner.id, company.id, 'Membro', 'MEMBER');

    await expectAppError(
      ctx.addMember.execute(owner.id, company.id, { email: member.email, role: 'MEMBER' }),
      'ALREADY_MEMBER',
    );
  });

  it('retorna 404 ao tentar adicionar um email que não tem conta', async () => {
    const ctx = setup();
    const { owner, company } = await scenarioWithCompany(ctx);

    await expectAppError(
      ctx.addMember.execute(owner.id, company.id, { email: 'ninguem@teste.com', role: 'MEMBER' }),
      'USER_NOT_FOUND',
    );
  });

  it('MEMBER não remove outros membros, mas pode sair', async () => {
    const ctx = setup();
    const { owner, company } = await scenarioWithCompany(ctx);
    const memberA = await addWithRole(ctx, owner.id, company.id, 'MembroA', 'MEMBER');
    const memberB = await addWithRole(ctx, owner.id, company.id, 'MembroB', 'MEMBER');

    await expectAppError(ctx.removeMember.execute(memberA.id, company.id, memberB.id), 'FORBIDDEN');
    await expect(ctx.removeMember.execute(memberA.id, company.id, memberA.id)).resolves.toBeUndefined();
  });

  it('ADMIN não remove outro ADMIN, mas remove MEMBER', async () => {
    const ctx = setup();
    const { owner, company } = await scenarioWithCompany(ctx);
    const adminA = await addWithRole(ctx, owner.id, company.id, 'AdminA', 'ADMIN');
    const adminB = await addWithRole(ctx, owner.id, company.id, 'AdminB', 'ADMIN');
    const member = await addWithRole(ctx, owner.id, company.id, 'Membro', 'MEMBER');

    await expectAppError(ctx.removeMember.execute(adminA.id, company.id, adminB.id), 'FORBIDDEN');
    await expect(ctx.removeMember.execute(adminA.id, company.id, member.id)).resolves.toBeUndefined();
  });

  it('ninguém remove o OWNER, nem o próprio OWNER', async () => {
    const ctx = setup();
    const { owner, company } = await scenarioWithCompany(ctx);
    const admin = await addWithRole(ctx, owner.id, company.id, 'Admin', 'ADMIN');

    await expectAppError(ctx.removeMember.execute(admin.id, company.id, owner.id), 'FORBIDDEN');
    await expectAppError(ctx.removeMember.execute(owner.id, company.id, owner.id), 'FORBIDDEN');
  });

  it('ao remover um membro, a empresa deixa de ser ativa nas sessões dele', async () => {
    const ctx = setup();
    const { owner, company } = await scenarioWithCompany(ctx);
    const member = await addWithRole(ctx, owner.id, company.id, 'Membro', 'MEMBER');
    const session = await ctx.sessions.create({
      userId: member.id,
      refreshTokenHash: 'h',
      activeCompanyId: company.id,
      expiresAt: new Date('2030-01-01'),
    });

    await ctx.removeMember.execute(owner.id, company.id, member.id);

    expect((await ctx.sessions.findById(session.id))?.activeCompanyId).toBeNull();
    await expectAppError(ctx.get.execute(member.id, company.id), 'COMPANY_NOT_FOUND');
  });
});

describe('usuário com múltiplas empresas', () => {
  it('lista todas as empresas associadas, com o papel em cada uma', async () => {
    const ctx = setup();
    const { owner: ownerA, company: companyA } = await scenarioWithCompany(ctx);
    const owner = await createUser(ctx.users, 'Dono');
    await ctx.create.execute(owner.id, { name: 'Outra Empresa', document: CNPJ_B });
    const shared = await createUser(ctx.users, 'Compartilhado');
    await ctx.addMember.execute(ownerA.id, companyA.id, { email: shared.email, role: 'ADMIN' });

    const companies = await ctx.list.execute(shared.id);

    expect(companies).toHaveLength(1);
    expect(companies[0]).toMatchObject({ company: { id: companyA.id }, role: 'ADMIN' });

    const ownerCompanies = await ctx.list.execute(owner.id);
    expect(ownerCompanies.map((item) => item.role)).toEqual(['OWNER']);
  });

  it('a empresa ativa de uma sessão não afeta o acesso às demais empresas', async () => {
    const ctx = setup();
    const owner = await createUser(ctx.users, 'Multi');
    const { company: first } = await ctx.create.execute(owner.id, { name: 'Primeira', document: CNPJ_A });
    const { company: second } = await ctx.create.execute(owner.id, { name: 'Segunda', document: CNPJ_B });
    const session = await ctx.sessions.create({
      userId: owner.id,
      refreshTokenHash: 'h',
      activeCompanyId: null,
      expiresAt: new Date('2030-01-01'),
    });
    const auth: AuthContext = { userId: owner.id, sessionId: session.id, activeCompanyId: null };

    await ctx.setActive.execute(auth, first.id);
    await ctx.setActive.execute({ ...auth, activeCompanyId: first.id }, second.id);

    expect((await ctx.sessions.findById(session.id))?.activeCompanyId).toBe(second.id);
    await expect(ctx.get.execute(owner.id, first.id)).resolves.toMatchObject({ role: 'OWNER' });
  });
});

describe('empresa ativa', () => {
  it('retorna 409 quando nenhuma empresa está ativa', async () => {
    const ctx = setup();
    const owner = await createUser(ctx.users, 'Owner');
    const auth: AuthContext = { userId: owner.id, sessionId: 's', activeCompanyId: null };

    await expectAppError(ctx.getActive.execute(auth), 'NO_ACTIVE_COMPANY');
  });

  it('retorna a empresa ativa com o papel do usuário', async () => {
    const ctx = setup();
    const { owner, company } = await scenarioWithCompany(ctx);
    const auth: AuthContext = { userId: owner.id, sessionId: 's', activeCompanyId: company.id };

    await expect(ctx.getActive.execute(auth)).resolves.toMatchObject({
      company: { id: company.id },
      role: 'OWNER',
    });
  });

  it('trata a empresa ativa como inexistente quando o vínculo já não existe', async () => {
    const ctx = setup();
    const { owner, company } = await scenarioWithCompany(ctx);
    const member = await addWithRole(ctx, owner.id, company.id, 'Membro', 'MEMBER');
    await ctx.removeMember.execute(owner.id, company.id, member.id);
    const auth: AuthContext = { userId: member.id, sessionId: 's', activeCompanyId: company.id };

    await expectAppError(ctx.getActive.execute(auth), 'NO_ACTIVE_COMPANY');
  });
});

describe('atualização de empresa', () => {
  it('altera apenas o nome; o CNPJ não é alterado pela API', async () => {
    const ctx = setup();
    const { owner, company } = await scenarioWithCompany(ctx);

    const result = await ctx.update.execute(owner.id, company.id, { name: 'Padaria Nova' });

    expect(result.company.name).toBe('Padaria Nova');
    expect(result.company.document).toBe(company.document);
  });
});
