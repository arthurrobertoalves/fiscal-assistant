import { describe, expect, it } from 'vitest';
import { parseCorsOrigins, parseEnv } from '../../../src/config/env.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5440/db',
  JWT_SECRET: 'segredo-de-teste-com-pelo-menos-32-caracteres',
};

describe('parseEnv', () => {
  it('aplica valores padrão quando as variáveis opcionais estão ausentes', () => {
    const env = parseEnv(validEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.CORS_ORIGIN).toBe('http://localhost:3000');
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.TRUST_PROXY).toBe(false);
  });

  it('converte PORT e TRUST_PROXY para os tipos corretos', () => {
    const env = parseEnv({ ...validEnv, PORT: '8080', TRUST_PROXY: 'true' });

    expect(env.PORT).toBe(8080);
    expect(env.TRUST_PROXY).toBe(true);
  });

  it('falha com mensagem clara quando DATABASE_URL não é informada', () => {
    expect(() => parseEnv({ JWT_SECRET: validEnv.JWT_SECRET })).toThrowError(/DATABASE_URL/);
  });

  it('falha quando JWT_SECRET é ausente ou curto demais', () => {
    expect(() => parseEnv({ DATABASE_URL: validEnv.DATABASE_URL })).toThrowError(/JWT_SECRET/);
    expect(() => parseEnv({ ...validEnv, JWT_SECRET: 'curto' })).toThrowError(/JWT_SECRET/);
  });

  it('rejeita TTL de access token fora do intervalo permitido', () => {
    expect(() => parseEnv({ ...validEnv, ACCESS_TOKEN_TTL_SECONDS: '5' })).toThrowError(
      /ACCESS_TOKEN_TTL_SECONDS/,
    );
  });

  it('rejeita PORT inválida', () => {
    expect(() => parseEnv({ ...validEnv, PORT: 'abc' })).toThrowError(/PORT/);
  });

  it('rejeita NODE_ENV desconhecido', () => {
    expect(() => parseEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrowError(/NODE_ENV/);
  });
});

describe('parseCorsOrigins', () => {
  it('separa origens por vírgula, removendo espaços e vazios', () => {
    expect(parseCorsOrigins('http://a.com, http://b.com,,')).toEqual([
      'http://a.com',
      'http://b.com',
    ]);
  });
});
