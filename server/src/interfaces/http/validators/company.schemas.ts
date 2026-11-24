import { z } from 'zod';

const companyId = z.uuid({ message: 'Identificador de empresa inválido.' });
const userId = z.uuid({ message: 'Identificador de usuário inválido.' });

export const companyParamsSchema = z.object({ companyId });

export const memberParamsSchema = z.object({ companyId, userId });

export const createCompanySchema = z.strictObject({
  name: z.string().trim().min(2, 'Informe o nome da empresa.').max(160, 'Nome muito longo.'),
  // A validação dos dígitos verificadores do CNPJ fica no caso de uso (domínio).
  document: z.string().max(32, 'CNPJ inválido.'),
});

export const updateCompanySchema = z
  .strictObject({
    name: z.string().trim().min(2, 'Informe o nome da empresa.').max(160, 'Nome muito longo.').optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

export const addMemberSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email({ message: 'Email inválido.' })),
  // OWNER não é atribuível pela API: a empresa tem um único dono, criado no cadastro.
  role: z.enum(['ADMIN', 'MEMBER'], { message: 'Papel inválido.' }),
});

export type CreateCompanyBody = z.infer<typeof createCompanySchema>;
export type UpdateCompanyBody = z.infer<typeof updateCompanySchema>;
export type AddMemberBody = z.infer<typeof addMemberSchema>;
export type CompanyParams = z.infer<typeof companyParamsSchema>;
export type MemberParams = z.infer<typeof memberParamsSchema>;
