import type { RequestHandler } from 'express';
import type { AddCompanyMemberUseCase } from '../../../application/use-cases/companies/add-company-member.use-case.js';
import type { CreateCompanyUseCase } from '../../../application/use-cases/companies/create-company.use-case.js';
import type { GetActiveCompanyUseCase } from '../../../application/use-cases/companies/get-active-company.use-case.js';
import type { GetCompanyUseCase } from '../../../application/use-cases/companies/get-company.use-case.js';
import type { ListCompanyMembersUseCase } from '../../../application/use-cases/companies/list-company-members.use-case.js';
import type { ListUserCompaniesUseCase } from '../../../application/use-cases/companies/list-user-companies.use-case.js';
import type { RemoveCompanyMemberUseCase } from '../../../application/use-cases/companies/remove-company-member.use-case.js';
import type { UpdateCompanyUseCase } from '../../../application/use-cases/companies/update-company.use-case.js';
import {
  toCompanyWithRoleDto,
  toMemberDto,
  toCompanyDto,
} from '../presenters.js';
import type {
  AddMemberBody,
  CompanyParams,
  CreateCompanyBody,
  MemberParams,
  UpdateCompanyBody,
} from '../validators/company.schemas.js';
import { requireAuth } from './auth.controller.js';

export interface CompaniesControllerDependencies {
  createCompany: CreateCompanyUseCase;
  listUserCompanies: ListUserCompaniesUseCase;
  getActiveCompany: GetActiveCompanyUseCase;
  getCompany: GetCompanyUseCase;
  updateCompany: UpdateCompanyUseCase;
  listCompanyMembers: ListCompanyMembersUseCase;
  addCompanyMember: AddCompanyMemberUseCase;
  removeCompanyMember: RemoveCompanyMemberUseCase;
}

export function createCompaniesController(deps: CompaniesControllerDependencies) {
  const create: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const result = await deps.createCompany.execute(auth.userId, req.body as CreateCompanyBody);
    res.status(201).json(toCompanyWithRoleDto(result));
  };

  const list: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const companies = await deps.listUserCompanies.execute(auth.userId);
    res.json({ companies: companies.map(toCompanyWithRoleDto) });
  };

  const getActive: RequestHandler = async (req, res) => {
    const result = await deps.getActiveCompany.execute(requireAuth(req.auth));
    res.json(toCompanyWithRoleDto(result));
  };

  const get: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId } = req.params as CompanyParams;
    const result = await deps.getCompany.execute(auth.userId, companyId);
    res.json(toCompanyWithRoleDto(result));
  };

  const update: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId } = req.params as CompanyParams;
    const result = await deps.updateCompany.execute(
      auth.userId,
      companyId,
      req.body as UpdateCompanyBody,
    );
    res.json({ company: toCompanyDto(result.company), role: result.role });
  };

  const listMembers: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId } = req.params as CompanyParams;
    const members = await deps.listCompanyMembers.execute(auth.userId, companyId);
    res.json({ members: members.map(toMemberDto) });
  };

  const addMember: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId } = req.params as CompanyParams;
    const membership = await deps.addCompanyMember.execute(
      auth.userId,
      companyId,
      req.body as AddMemberBody,
    );
    res.status(201).json({
      userId: membership.userId,
      companyId: membership.companyId,
      role: membership.role,
      joinedAt: membership.createdAt,
    });
  };

  const removeMember: RequestHandler = async (req, res) => {
    const auth = requireAuth(req.auth);
    const { companyId, userId } = req.params as MemberParams;
    await deps.removeCompanyMember.execute(auth.userId, companyId, userId);
    res.status(204).end();
  };

  return { create, list, getActive, get, update, listMembers, addMember, removeMember };
}
