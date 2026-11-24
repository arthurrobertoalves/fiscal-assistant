import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from '../../../src/infrastructure/security/argon2-password-hasher.js';
import { CryptoRefreshTokenCodec } from '../../../src/infrastructure/security/crypto-refresh-token.codec.js';
import { JoseAccessTokenService } from '../../../src/infrastructure/security/jose-access-token.service.js';

const SECRET = 'segredo-de-teste-com-pelo-menos-32-caracteres';

describe('Argon2PasswordHasher (Argon2id)', () => {
  const hasher = new Argon2PasswordHasher();

  it('gera hash Argon2id, nunca a senha em texto puro', async () => {
    const hash = await hasher.hash('minha-senha-123');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('minha-senha-123');
  });

  it('verifica a senha correta e rejeita a incorreta', async () => {
    const hash = await hasher.hash('minha-senha-123');

    await expect(hasher.verify(hash, 'minha-senha-123')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'senha-errada')).resolves.toBe(false);
  });

  it('gera hashes diferentes para a mesma senha (salt aleatório)', async () => {
    const first = await hasher.hash('mesma-senha');
    const second = await hasher.hash('mesma-senha');

    expect(first).not.toBe(second);
  });

  it('trata hash malformado como senha não conferida, sem lançar erro', async () => {
    await expect(hasher.verify('nao-e-um-hash', 'qualquer')).resolves.toBe(false);
  });
});

describe('JoseAccessTokenService (JWT HS256)', () => {
  const service = new JoseAccessTokenService(SECRET);

  it('emite token válido com sub e sid, sem dados pessoais no payload', async () => {
    const { token, expiresAt } = await service.issue({ userId: 'user-1', sessionId: 'sess-1' }, 900);

    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(service.verify(token)).resolves.toEqual({
      status: 'valid',
      userId: 'user-1',
      sessionId: 'sess-1',
    });
  });

  it('rejeita token expirado com status próprio', async () => {
    const past = Math.floor(Date.now() / 1000) - 120;
    const expired = await new SignJWT({ sid: 'sess-1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuer('fiscal-assistant')
      .setIssuedAt(past - 900)
      .setExpirationTime(past)
      .sign(new TextEncoder().encode(SECRET));

    await expect(service.verify(expired)).resolves.toEqual({ status: 'expired' });
  });

  it('rejeita token assinado com outro segredo', async () => {
    const forged = await new JoseAccessTokenService('outro-segredo-muito-diferente-32-chars')
      .issue({ userId: 'user-1', sessionId: 'sess-1' }, 900);

    await expect(service.verify(forged.token)).resolves.toEqual({ status: 'invalid' });
  });

  it('rejeita token adulterado e token sem o formato esperado', async () => {
    const { token } = await service.issue({ userId: 'user-1', sessionId: 'sess-1' }, 900);
    const [header, , signature] = token.split('.');
    const tampered = `${header}.${Buffer.from('{"sub":"admin","sid":"x"}').toString('base64url')}.${signature}`;

    await expect(service.verify(tampered)).resolves.toEqual({ status: 'invalid' });
    await expect(service.verify('abc')).resolves.toEqual({ status: 'invalid' });
  });

  it('rejeita token com algoritmo "none"', async () => {
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
      '{"sub":"user-1","sid":"sess-1","iss":"fiscal-assistant"}',
    ).toString('base64url')}.`;

    await expect(service.verify(unsigned)).resolves.toEqual({ status: 'invalid' });
  });
});

describe('CryptoRefreshTokenCodec', () => {
  const codec = new CryptoRefreshTokenCodec();

  it('gera tokens opacos e únicos com 256 bits de entropia', () => {
    const a = codec.generate();
    const b = codec.generate();

    expect(a).not.toBe(b);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
  });

  it('armazena apenas o SHA-256 (64 caracteres hexadecimais), determinístico', () => {
    const token = codec.generate();
    const hash = codec.hash(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(codec.hash(token)).toBe(hash);
  });
});
