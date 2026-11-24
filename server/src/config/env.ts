import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  // Segredo de assinatura dos access tokens. Nunca versionar.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  // Ative apenas atrás de um proxy confiável (ex.: Render), para o rate limit usar o IP real.
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Pasta onde os arquivos enviados são guardados (fora do repositório).
  STORAGE_DIR: z.string().min(1).default('./storage'),
  STORAGE_DRIVER: z.enum(['local', 'database']).default('local'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(10),
  // IA (Groq). Sem a chave, a análise e o chat funcionam em modo degradado, sem IA.
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().min(1).default('openai/gpt-oss-120b'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida as variáveis de ambiente e falha cedo, com mensagem clara,
 * caso a configuração esteja incompleta ou inválida.
 */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `- ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuração inválida de ambiente:\n${problems}`);
  }

  return result.data;
}

export function parseCorsOrigins(corsOrigin: string): string[] {
  return corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
