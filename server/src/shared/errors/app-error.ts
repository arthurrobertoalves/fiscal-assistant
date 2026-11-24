/**
 * Erro de aplicação com status HTTP e código estável para o cliente.
 * Use-cases lançam AppError; o middleware global de erros o converte em resposta.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Fábricas de erros comuns, para manter mensagens e códigos consistentes. */
export const errors = {
  unauthenticated: (code: string, message: string) => new AppError(401, code, message),
  forbidden: (message = 'Você não tem permissão para realizar esta ação.') =>
    new AppError(403, 'FORBIDDEN', message),
  notFound: (code: string, message: string) => new AppError(404, code, message),
  conflict: (code: string, message: string) => new AppError(409, code, message),
  unprocessable: (code: string, message: string) => new AppError(422, code, message),
};
