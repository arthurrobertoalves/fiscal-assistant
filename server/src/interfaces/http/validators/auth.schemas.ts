import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email muito longo.')
  .pipe(z.email({ message: 'Email inválido.' }));

// Senhas longas são aceitas (até 128 caracteres); o limite evita custo excessivo do Argon2.
const password = z
  .string()
  .min(8, 'A senha deve ter pelo menos 8 caracteres.')
  .max(128, 'A senha deve ter no máximo 128 caracteres.');

export const registerSchema = z.strictObject({
  name: z.string().trim().min(2, 'Informe seu nome.').max(120, 'Nome muito longo.'),
  email,
  password,
});

export const loginSchema = z.strictObject({
  email,
  // Sem regra de tamanho no login: contas antigas não podem ficar presas a uma regra nova.
  password: z.string().min(1, 'Informe a senha.').max(128),
});

export const setActiveCompanySchema = z.strictObject({
  companyId: z.uuid({ message: 'Identificador de empresa inválido.' }),
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type SetActiveCompanyBody = z.infer<typeof setActiveCompanySchema>;
