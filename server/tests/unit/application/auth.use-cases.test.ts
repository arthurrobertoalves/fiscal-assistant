import { describe, expect, it } from 'vitest';
import { AuthenticateRequestUseCase } from '../../../src/application/use-cases/auth/authenticate-request.use-case.js';
import { LoginUseCase } from '../../../src/application/use-cases/auth/login.use-case.js';
import { LogoutUseCase } from '../../../src/application/use-cases/auth/logout.use-case.js';
import { RefreshSessionUseCase } from '../../../src/application/use-cases/auth/refresh-session.use-case.js';
import { RegisterUserUseCase } from '../../../src/application/use-cases/auth/register-user.use-case.js';
import { SessionIssuer } from '../../../src/application/services/session-issuer.js';
import { CryptoRefreshTokenCodec } from '../../../src/infrastructure/security/crypto-refresh-token.codec.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import {
  FakeAccessTokenService,
  FakeClock,
  FakePasswordHasher,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from '../../fakes/in-memory.js';

const ACCESS_TTL_SECONDS = 900;
const REFRESH_TTL_DAYS = 30;

function setup() {
  const clock = new FakeClock();
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository(clock);
  const hasher = new FakePasswordHasher();
  const accessTokens = new FakeAccessTokenService(clock);
  const refreshTokens = new CryptoRefreshTokenCodec();
  const issuer = new SessionIssuer(
    sessions,
    accessTokens,
    refreshTokens,
    { accessTokenTtlSeconds: ACCESS_TTL_SECONDS, refreshTokenTtlDays: REFRESH_TTL_DAYS },
    clock.now,
  );

  return {
    clock,
    users,
    sessions,
    register: new RegisterUserUseCase(users, hasher, issuer),
    login: new LoginUseCase(users, hasher, issuer),
    refresh: new RefreshSessionUseCase(sessions, refreshTokens, issuer, clock.now),
    logout: new LogoutUseCase(sessions, refreshTokens, clock.now),
    authenticate: new AuthenticateRequestUseCase(accessTokens, sessions, clock.now),
  };
}

const maria = { name: 'Maria Silva', email: 'Maria@Empresa.com', password: 'senha-forte-123' };

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppError> {
  const error = await promise.then(
    () => {
      throw new Error('esperava erro, mas a operação teve sucesso');
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

describe('cadastro (RegisterUserUseCase)', () => {
  it('cria o usuário com email normalizado e inicia uma sessão', async () => {
    const { register, users } = setup();

    const result = await register.execute(maria);

    expect(result.user.email).toBe('maria@empresa.com');
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
    expect(users.rows.size).toBe(1);
  });

  it('não expõe o hash de senha no resultado', async () => {
    const { register } = setup();

    const result = await register.execute(maria);

    expect(JSON.stringify(result.user)).not.toContain('passwordHash');
  });

  it('rejeita email já cadastrado, ignorando diferença de maiúsculas', async () => {
    const { register } = setup();
    await register.execute(maria);

    await expectAppError(
      register.execute({ ...maria, email: 'MARIA@empresa.com' }),
      'EMAIL_ALREADY_REGISTERED',
    );
  });
});

describe('login (LoginUseCase)', () => {
  it('autentica com credenciais corretas', async () => {
    const { register, login } = setup();
    await register.execute(maria);

    const result = await login.execute({ email: maria.email, password: maria.password });

    expect(result.user.email).toBe('maria@empresa.com');
    expect(result.tokens.accessToken).toBeTruthy();
  });

  it('rejeita senha inválida com a mesma mensagem de usuário inexistente', async () => {
    const { register, login } = setup();
    await register.execute(maria);

    const wrongPassword = await expectAppError(
      login.execute({ email: maria.email, password: 'senha-errada' }),
      'INVALID_CREDENTIALS',
    );
    const unknownUser = await expectAppError(
      login.execute({ email: 'ninguem@empresa.com', password: 'qualquer-coisa' }),
      'INVALID_CREDENTIALS',
    );

    // Mensagens idênticas impedem enumeração de contas.
    expect(wrongPassword.message).toBe(unknownUser.message);
  });

  it('rejeita usuário inexistente', async () => {
    const { login } = setup();

    await expectAppError(
      login.execute({ email: 'ninguem@empresa.com', password: 'senha-forte-123' }),
      'INVALID_CREDENTIALS',
    );
  });
});

describe('renovação de sessão (RefreshSessionUseCase)', () => {
  it('rotaciona o refresh token e emite novo access token', async () => {
    const { register, refresh } = setup();
    const { tokens } = await register.execute(maria);

    const renewed = await refresh.execute(tokens.refreshToken);

    expect(renewed.refreshToken).not.toBe(tokens.refreshToken);
    expect(renewed.accessToken).not.toBe(tokens.accessToken);
    expect(renewed.sessionId).toBe(tokens.sessionId);
  });

  it('mantém a validade absoluta da sessão após a renovação', async () => {
    const { register, refresh } = setup();
    const { tokens } = await register.execute(maria);

    const renewed = await refresh.execute(tokens.refreshToken);

    expect(renewed.refreshTokenExpiresAt.getTime()).toBe(tokens.refreshTokenExpiresAt.getTime());
  });

  it('detecta reuso de refresh token já substituído e revoga a sessão', async () => {
    const { register, refresh } = setup();
    const { tokens } = await register.execute(maria);
    const rotated = await refresh.execute(tokens.refreshToken);

    // Alguém apresenta o token antigo, já substituído.
    await expectAppError(refresh.execute(tokens.refreshToken), 'INVALID_REFRESH_TOKEN');

    // Por consequência, o token atual também deixa de funcionar.
    await expectAppError(refresh.execute(rotated.refreshToken), 'INVALID_REFRESH_TOKEN');
  });

  it('rejeita refresh token inexistente ou ausente', async () => {
    const { refresh } = setup();

    await expectAppError(refresh.execute('token-inventado'), 'INVALID_REFRESH_TOKEN');
    await expectAppError(refresh.execute(undefined), 'INVALID_REFRESH_TOKEN');
  });

  it('rejeita sessão expirada pela validade absoluta', async () => {
    const { clock, register, refresh } = setup();
    const { tokens } = await register.execute(maria);

    clock.advanceSeconds(REFRESH_TTL_DAYS * 24 * 60 * 60 + 1);

    await expectAppError(refresh.execute(tokens.refreshToken), 'SESSION_EXPIRED');
  });
});

describe('logout (LogoutUseCase)', () => {
  it('revoga a sessão e impede novas renovações', async () => {
    const { register, logout, refresh } = setup();
    const { tokens } = await register.execute(maria);

    await logout.execute(tokens.refreshToken);

    await expectAppError(refresh.execute(tokens.refreshToken), 'INVALID_REFRESH_TOKEN');
  });

  it('é idempotente e aceita ausência de token', async () => {
    const { register, logout } = setup();
    const { tokens } = await register.execute(maria);

    await logout.execute(tokens.refreshToken);
    await expect(logout.execute(tokens.refreshToken)).resolves.toBeUndefined();
    await expect(logout.execute(undefined)).resolves.toBeUndefined();
  });
});

describe('autenticação de requisições (AuthenticateRequestUseCase)', () => {
  it('aceita access token válido e devolve o contexto da sessão', async () => {
    const { register, authenticate } = setup();
    const { user, tokens } = await register.execute(maria);

    const context = await authenticate.execute(tokens.accessToken);

    expect(context).toEqual({ userId: user.id, sessionId: tokens.sessionId, activeCompanyId: null });
  });

  it('rejeita access token expirado com código próprio', async () => {
    const { clock, register, authenticate } = setup();
    const { tokens } = await register.execute(maria);

    clock.advanceSeconds(ACCESS_TTL_SECONDS + 1);

    await expectAppError(authenticate.execute(tokens.accessToken), 'TOKEN_EXPIRED');
  });

  it('rejeita token desconhecido', async () => {
    const { authenticate } = setup();

    await expectAppError(authenticate.execute('token-falso'), 'INVALID_TOKEN');
  });

  it('rejeita token de sessão já revogada, sem esperar o token expirar', async () => {
    const { register, logout, authenticate } = setup();
    const { tokens } = await register.execute(maria);

    await logout.execute(tokens.refreshToken);

    await expectAppError(authenticate.execute(tokens.accessToken), 'SESSION_INVALID');
  });
});

describe('usuário autenticado em múltiplos dispositivos', () => {
  it('sessões são independentes: sair de uma não derruba a outra', async () => {
    const { register, login, logout, refresh } = setup();
    await register.execute(maria);
    const laptop = await login.execute({ email: maria.email, password: maria.password });
    const phone = await login.execute({ email: maria.email, password: maria.password });

    await logout.execute(laptop.tokens.refreshToken);

    await expect(refresh.execute(phone.tokens.refreshToken)).resolves.toBeDefined();
  });
});
