const CNPJ_LENGTH = 14;
const FIRST_DIGIT_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_DIGIT_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Remove pontuação, deixando apenas os dígitos. */
export function normalizeCnpj(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Valida um CNPJ pelos dígitos verificadores (módulo 11).
 * Aceita com ou sem pontuação. Não consulta a Receita Federal.
 */
export function isValidCnpj(value: string): boolean {
  const digits = normalizeCnpj(value);

  if (digits.length !== CNPJ_LENGTH) return false;
  // Sequências repetidas (ex.: 00000000000000) passam na conta mas não são CNPJs válidos.
  if (/^(\d)\1+$/.test(digits)) return false;

  const firstDigit = checkDigit(digits.slice(0, 12), FIRST_DIGIT_WEIGHTS);
  const secondDigit = checkDigit(digits.slice(0, 12) + firstDigit, SECOND_DIGIT_WEIGHTS);

  return digits.endsWith(`${firstDigit}${secondDigit}`);
}

function checkDigit(base: string, weights: number[]): number {
  const sum = weights.reduce((total, weight, index) => total + Number(base[index]) * weight, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}
