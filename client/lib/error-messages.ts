import { ApiError } from "./api";

/*
 * Mensagens de erro que explicam o que aconteceu e o que fazer (heurística 9 de Nielsen).
 * Códigos desconhecidos recebem uma mensagem genérica, sem detalhes técnicos.
 */
const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Email ou senha não conferem. Confira os dados e tente de novo.",
  EMAIL_ALREADY_REGISTERED: "Já existe uma conta com este email. Tente entrar com ele.",
  UNAUTHENTICATED: "Sua sessão expirou. Entre novamente para continuar.",
  TOKEN_EXPIRED: "Sua sessão expirou. Entre novamente para continuar.",
  SESSION_INVALID: "Sua sessão foi encerrada. Entre novamente para continuar.",
  INVALID_REFRESH_TOKEN: "Sua sessão foi encerrada. Entre novamente para continuar.",
  COMPANY_NOT_FOUND: "Não encontramos esta empresa entre as suas.",
  COMPANY_DOCUMENT_ALREADY_REGISTERED: "Este CNPJ já está cadastrado em outra empresa.",
  INVALID_CNPJ: "O CNPJ não é válido. Confira os dígitos.",
  ALREADY_MEMBER: "Esta pessoa já faz parte da empresa.",
  USER_NOT_FOUND: "Não há conta com este email. Peça para a pessoa se cadastrar primeiro.",
  FORBIDDEN: "Seu papel nesta empresa não permite essa ação.",
  DOCUMENT_ALREADY_UPLOADED: "Este documento já foi enviado para esta empresa.",
  UNSUPPORTED_FILE_TYPE: "Esse arquivo não é um PDF ou XML. Envie um desses formatos.",
  INVALID_FILE: "O XML está malformado e não pôde ser lido. Confira o arquivo e envie de novo.",
  FILE_TOO_LARGE: "O arquivo é grande demais. O limite é de 10 MB.",
  EMPTY_FILE: "O arquivo está vazio. Escolha outro arquivo.",
  FILE_REQUIRED: "Escolha um arquivo antes de enviar.",
  DOCUMENT_NOT_FOUND: "Este documento não existe mais ou não pertence a esta empresa.",
  DOCUMENT_NOT_PROCESSED: "Só é possível analisar documentos que foram processados com sucesso.",
  NO_ACTIVE_COMPANY: "Escolha uma empresa para continuar.",
  CONVERSATION_NOT_FOUND: "Esta conversa não existe mais. Crie uma nova.",
  EMPTY_MESSAGE: "Digite uma pergunta antes de enviar.",
  MESSAGE_TOO_LONG: "A pergunta é longa demais. Use até 2000 caracteres.",
  AI_UNAVAILABLE: "O assistente de IA está indisponível agora. Tente de novo em alguns minutos.",
  RATE_LIMITED: "Muitas tentativas em pouco tempo. Aguarde alguns minutos.",
  VALIDATION_ERROR: "Algum campo está preenchido de forma incorreta. Revise os campos destacados.",
};

/** Texto amigável para o usuário a partir de um erro da API (ou de rede). */
export function friendlyError(caught: unknown, fallback: string): string {
  if (caught instanceof ApiError) {
    return MESSAGES[caught.code] ?? fallback;
  }
  // Falha de rede (servidor fora do ar ou adormecido): explica a causa provável.
  return "Não conseguimos falar com o servidor. Verifique sua conexão e tente de novo em instantes.";
}
