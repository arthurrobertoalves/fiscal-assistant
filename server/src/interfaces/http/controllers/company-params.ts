import { companyParamsSchema } from '../validators/company.schemas.js';

/** Valida o parâmetro :companyId (UUID) antes de qualquer acesso. */
export function companyParams(params: unknown): { companyId: string } {
  return companyParamsSchema.parse(params);
}
