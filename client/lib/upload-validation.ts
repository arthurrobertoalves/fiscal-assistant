/**
 * Validação do arquivo no navegador, só para dar retorno rápido ao usuário.
 * A validação de verdade é feita pelo servidor (assinatura do arquivo e limite de tamanho).
 */

/** Deve acompanhar MAX_UPLOAD_MB do servidor (padrão: 10 MB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = [".pdf", ".xml"] as const;

export function validateUploadFile(file: { name: string; size: number }): string | null {
  if (file.size === 0) {
    return "O arquivo está vazio.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "O arquivo excede o limite de 10 MB.";
  }
  const lower = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    return "Envie um arquivo PDF ou XML.";
  }
  return null;
}
