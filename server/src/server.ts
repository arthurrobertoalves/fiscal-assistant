import 'dotenv/config';
import { createApp } from './app.js';
import { parseCorsOrigins, parseEnv } from './config/env.js';
import { createContainer } from './composition/container.js';
import { createPrismaClient } from './infrastructure/database/prisma.js';

// Ponto de entrada: lê a configuração e faz a composição das dependências.
const env = parseEnv(process.env);
const isProduction = env.NODE_ENV === 'production';

const prisma = createPrismaClient();
const container = createContainer(prisma, env);

const app = createApp({
  container,
  http: {
    corsOrigins: parseCorsOrigins(env.CORS_ORIGIN),
    maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
    trustProxy: env.TRUST_PROXY,
    cookies: {
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    },
    rateLimits: {
      // Login e cadastro: 10 tentativas a cada 15 minutos por IP.
      credentials: { windowMs: 15 * 60 * 1000, limit: 10 },
      // Renovação de sessão: uso normal é de poucas chamadas por hora.
      refresh: { windowMs: 15 * 60 * 1000, limit: 60 },
    },
  },
});

const server = app.listen(env.PORT, () => {
  console.log(`API do Assistente Fiscal escutando em http://localhost:${env.PORT}`);
  console.log(
    container.aiModel
      ? `IA ativa (${container.aiModel})`
      : 'IA desativada: defina GROQ_API_KEY para habilitar análise e chat.',
  );
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`Recebido ${signal}, encerrando...`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
