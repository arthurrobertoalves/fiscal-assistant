const ACCESS_KEY_LENGTH = 44;
const WEIGHTS = [2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Valida a chave de acesso de NF-e (44 dígitos) pelo dígito verificador (módulo 11),
 * que é o último dígito da chave. Não consulta a SEFAZ.
 */
export function isValidAccessKey(value: string): boolean {
  if (!/^\d{44}$/.test(value)) return false;

  const body = value.slice(0, ACCESS_KEY_LENGTH - 1);
  let sum = 0;
  // Pesos de 2 a 9, aplicados da direita para a esquerda e repetidos.
  for (let i = 0; i < body.length; i += 1) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * WEIGHTS[i % WEIGHTS.length]!;
  }
  const remainder = sum % 11;
  const expected = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;

  return Number(value[ACCESS_KEY_LENGTH - 1]) === expected;
}
