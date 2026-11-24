/*
 * Máscaras e validações de campos de formulário. São aplicadas enquanto a pessoa digita,
 * e o botão de envio só libera com o valor no formato certo. O servidor valida de novo.
 */

/** Só dígitos, até 14, formatados como 00.000.000/0000-00 conforme a digitação. */
export function maskCnpj(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 14);
  let out = d.slice(0, 2);
  if (d.length > 2) out += "." + d.slice(2, 5);
  if (d.length > 5) out += "." + d.slice(5, 8);
  if (d.length > 8) out += "/" + d.slice(8, 12);
  if (d.length > 12) out += "-" + d.slice(12, 14);
  return out;
}

const CNPJ_FORMAT = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

/** Formato completo e dígitos verificadores corretos (mesmo cálculo do servidor). */
export function isValidCnpj(value: string): boolean {
  if (!CNPJ_FORMAT.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  if (/^(\d)\1+$/.test(digits)) return false;
  const dv = (base: string, weights: number[]) => {
    const sum = weights.reduce((t, w, i) => t + Number(base[i]) * w, 0) % 11;
    return sum < 2 ? 0 : 11 - sum;
  };
  const first = dv(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = dv(digits.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
}

const EMAIL_FORMAT = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_FORMAT.test(value.trim());
}

/** Mensagem do campo CNPJ enquanto ele não está completo ou é inválido. Vazio = sem mensagem. */
export function cnpjMessage(value: string): string | null {
  if (value.length === 0) return null;
  if (value.replace(/\D/g, "").length < 14) return "Digite os 14 dígitos do CNPJ.";
  return isValidCnpj(value) ? null : "CNPJ inválido. Confira os dígitos.";
}

export function emailMessage(value: string): string | null {
  if (value.length === 0) return null;
  return isValidEmail(value) ? null : "Digite um email válido, como nome@empresa.com.";
}
