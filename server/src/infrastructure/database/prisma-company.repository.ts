import type { Company as CompanyRow, CompanyMember as CompanyMemberRow, PrismaClient } from '@prisma/client';
import type { Company, CompanyMembership, CompanyRole } from '../../domain/entities/company.js';
import type {
  CompanyMemberView,
  CompanyRepository,
  CompanyWithRole,
  NewCompany,
} from '../../application/ports/company.repository.js';
import { mapUniqueViolation } from './prisma-errors.js';

export class PrismaCompanyRepository implements CompanyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createWithOwner(data: NewCompany, ownerUserId: string): Promise<CompanyWithRole> {
    return mapUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({ data });
        await tx.companyMember.create({
          data: { userId: ownerUserId, companyId: company.id, role: 'OWNER' },
        });
        return { company: toCompany(company), role: 'OWNER' as const };
      }),
    );
  }

  async findById(id: string): Promise<Company | null> {
    const row = await this.prisma.company.findUnique({ where: { id } });
    return row ? toCompany(row) : null;
  }

  async findByDocument(document: string): Promise<Company | null> {
    const row = await this.prisma.company.findUnique({ where: { document } });
    return row ? toCompany(row) : null;
  }

  async listForUser(userId: string): Promise<CompanyWithRole[]> {
    const rows = await this.prisma.companyMember.findMany({
      where: { userId },
      include: { company: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({ company: toCompany(row.company), role: row.role }));
  }

  async findMembership(userId: string, companyId: string): Promise<CompanyWithRole | null> {
    const row = await this.prisma.companyMember.findUnique({
      where: { userId_companyId: { userId, companyId } },
      include: { company: true },
    });
    return row ? { company: toCompany(row.company), role: row.role } : null;
  }

  async update(companyId: string, data: { name?: string }): Promise<Company> {
    const row = await this.prisma.company.update({ where: { id: companyId }, data });
    return toCompany(row);
  }

  async listMembers(companyId: string): Promise<CompanyMemberView[]> {
    const rows = await this.prisma.companyMember.findMany({
      where: { companyId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      userId: row.user.id,
      name: row.user.name,
      email: row.user.email,
      role: row.role,
      joinedAt: row.createdAt,
    }));
  }

  async addMember(companyId: string, userId: string, role: CompanyRole): Promise<CompanyMembership> {
    const row = await mapUniqueViolation(() =>
      this.prisma.companyMember.create({ data: { companyId, userId, role } }),
    );
    return toMembership(row);
  }

  async removeMember(companyId: string, userId: string): Promise<void> {
    await this.prisma.companyMember.deleteMany({ where: { companyId, userId } });
  }
}

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    document: row.document,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMembership(row: CompanyMemberRow): CompanyMembership {
  return {
    companyId: row.companyId,
    userId: row.userId,
    role: row.role,
    createdAt: row.createdAt,
  };
}
