// Cliente HTTP da API. O frontend nunca acessa o banco: tudo passa por aqui.
// Variáveis NEXT_PUBLIC_* são expostas ao navegador; nunca coloque segredos aqui.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Access token fica só em memória (não vai para localStorage). O refresh é um cookie HttpOnly. */
let accessToken: string | null = null;
let refreshHandler: (() => Promise<boolean>) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Registrado pelo AuthProvider: renova o access token quando a API responde 401. */
export function setRefreshHandler(handler: (() => Promise<boolean>) | null): void {
  refreshHandler = handler;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  json?: unknown;
  body?: FormData;
  /** Rotas públicas (login, cadastro) não tentam renovar a sessão. */
  anonymous?: boolean;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.json !== undefined) headers["Content-Type"] = "application/json";
  if (!options.anonymous && accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  return fetch(`${API_URL}${path}`, {
    method: options.method ?? (options.json !== undefined || options.body ? "POST" : "GET"),
    headers,
    body: options.body ?? (options.json !== undefined ? JSON.stringify(options.json) : undefined),
    credentials: "include",
    cache: "no-store",
  });
}

/** Executa a requisição; em 401 tenta renovar a sessão uma vez e repete. */
async function request(path: string, options: RequestOptions): Promise<Response> {
  let response = await send(path, options);
  if (response.status === 401 && !options.anonymous && refreshHandler) {
    const renewed = await refreshHandler();
    if (renewed) response = await send(path, options);
  }
  return response;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const error = body?.error;
  return new ApiError(
    error?.message ?? "Não foi possível completar a solicitação.",
    response.status,
    error?.code ?? "UNKNOWN",
    error?.details,
  );
}

export async function apiJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await request(path, options);
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const response = await request(path, {});
  if (!response.ok) throw await toApiError(response);
  return response.blob();
}

/** Renova o access token usando o cookie de refresh. Não usa o handler (evita laço). */
export async function refreshAccessToken(): Promise<{ accessToken: string } | null> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as { accessToken: string };
}
