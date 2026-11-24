# Arquitetura do Assistente Fiscal

Escrito para: desenvolvedores do projeto e revisores das decisões de arquitetura.

Este documento registra as decisões de arquitetura das Etapas 1 (fundação) e 2 (autenticação e
empresas), além das pendências que ainda exigem decisão ou implementação.

## 1. Visão geral

```
Navegador
   ↓  HTTP (NEXT_PUBLIC_API_URL)
Next.js (client/)         — interface
   ↓  HTTP/REST (JSON) + cookie de refresh (Etapa 2)
Express (server/)         — API REST, validações, casos de uso
   ↓  Prisma ORM
PostgreSQL                — dados (docker-compose na raiz)
```

- O frontend **nunca** acessa o banco. Toda leitura e escrita passa pela API.
- Frontend e backend são pacotes independentes, cada um com seu `package.json`.
  A raiz só agrega scripts de conveniência.

## 2. Estrutura de diretórios (backend)

```
server/
├── prisma/
│   ├── schema.prisma
│   └── migrations/           # 20261124002649_etapa2_autenticacao_empresas
├── src/
│   ├── config/               # variáveis de ambiente validadas com Zod (env.ts)
│   ├── domain/               # regras puras, sem Express nem Prisma
│   │   ├── entities/         # company, user, session (tipos e isSessionActive)
│   │   ├── policies/         # matriz de permissões por papel
│   │   └── value-objects/    # cnpj (dígitos verificadores), email (normalização)
│   ├── application/
│   │   ├── ports/            # contratos: repositórios e segurança (interfaces)
│   │   ├── services/         # SessionIssuer, CompanyAccessService
│   │   └── use-cases/
│   │       ├── auth/         # register, login, refresh, logout, authenticate, me, active-company
│   │       └── companies/    # create, list, get, update, members (list/add/remove), active
│   ├── infrastructure/
│   │   ├── database/         # repositórios Prisma (implementam os ports)
│   │   └── security/         # Argon2id, JWT (jose), refresh token (SHA-256)
│   ├── interfaces/http/
│   │   ├── controllers/      # traduzem HTTP ↔ casos de uso (sem regra de negócio)
│   │   ├── middlewares/      # authenticate, validate, rate limit, origin guard, erros
│   │   ├── routes/           # só direcionam requisições
│   │   ├── validators/       # schemas Zod de body e params
│   │   ├── cookies.ts        # cookie de refresh (path, flags, SameSite)
│   │   └── presenters.ts     # entidades → respostas (nunca expõe hashes)
│   ├── composition/
│   │   └── container.ts      # ÚNICO lugar que conhece as implementações concretas
│   ├── shared/errors/        # AppError e fábricas de erro
│   ├── app.ts                # monta o Express a partir do container
│   └── server.ts             # lê env, cria o container, sobe o servidor
└── tests/
    ├── fakes/                # repositórios em memória e relógio controlável
    ├── helpers/              # banco de testes (com guarda de nome "_test")
    ├── unit/                 # domínio, casos de uso, adapters de segurança
    └── integration/         # HTTP completo e restrições do banco (Prisma real)
```

### Regras de dependência

| Camada | Pode depender de | Não pode depender de |
|---|---|---|
| `domain` | nada externo | Express, Prisma, infraestrutura |
| `application` | `domain`, `shared`, próprios `ports` | Prisma, Express, argon2, jose |
| `infrastructure` | `application` (implementa `ports`), Prisma | `interfaces` |
| `interfaces` | `application`, `shared` | Prisma diretamente |
| `composition`, `server.ts` | tudo (é onde se compõe) | — |

A composição das dependências acontece **só** em `composition/container.ts`. Os casos de uso
recebem contratos pelo construtor, o que permite testá-los com implementações em memória.

---

## 3. Modelagem do banco

| Modelo | Campos principais | Restrições e índices |
|---|---|---|
| `User` | id (UUID), name, email, passwordHash, createdAt, updatedAt | `email` único (sempre minúsculo) |
| `Company` | id (UUID), name, document (CNPJ, 14 dígitos), createdAt, updatedAt | `document` único |
| `CompanyMember` | id (UUID), userId, companyId, role (`OWNER`/`ADMIN`/`MEMBER`), createdAt | `(userId, companyId)` único; índice em `companyId`; FK com `ON DELETE CASCADE` |
| `Session` | id (UUID), userId, refreshTokenHash, previousRefreshTokenHash, activeCompanyId, expiresAt, revokedAt, createdAt, updatedAt | hashes únicos; índices em `userId` e `activeCompanyId`; `activeCompanyId` com `ON DELETE SET NULL` |

### Decisões de modelagem

- **IDs em UUID**, não sequenciais. Reduz o risco de IDOR por enumeração de identificadores.
- **Campos adicionais avaliados e não incluídos**: não há telefone, CPF, endereço nem data de
  nascimento. A coleta mínima (LGPD, princípio da necessidade) foi preferida até que alguma
  funcionalidade exija dados a mais.
- **Sessão como modelo próprio** (`Session`): sem ele não é possível revogar sessões (logout,
  reuso de token), nem guardar a empresa ativa por sessão. Não é um campo extra em `User`
  porque um usuário tem várias sessões (vários dispositivos).
- **Empresa ativa na sessão** (`Session.activeCompanyId`), e não no token: a empresa pode ser
  trocada sem reemitir credenciais, e a revogação de vínculo é aplicada imediatamente.
- **Email único em minúsculas**: a aplicação normaliza antes de gravar e comparar. Sem isso,
  `Maria@x.com` e `maria@x.com` seriam duas contas.
- **CNPJ armazenado só com dígitos** e validado pelos dígitos verificadores no domínio.

### Migration

`20261124002649_etapa2_autenticacao_empresas`:
- Cria o tipo `CompanyRole` e as tabelas `User`, `Company`, `CompanyMember` e `Session`, com
  índices, unicidades e chaves estrangeiras.
- **Impacto nos dados existentes: nenhum.** Antes desta migration o banco não tinha tabelas de
  domínio (só o schema vazio da Etapa 1). Não há `DROP`, `ALTER` destrutivo nem reset.
- Aplicada no banco de desenvolvimento (vazio) e no banco de testes.

---

## 4. Autenticação

| Item | Estratégia |
|---|---|
| Senha | **Argon2id** (19 MiB de memória, 2 iterações, paralelismo 1, parâmetros mínimos da OWASP). Salt aleatório por senha. Nunca armazenada em texto puro. |
| Access token | **JWT HS256**, validade de **15 minutos** (configurável). Payload só com `sub` (userId), `sid` (sessionId) e `iss`. Sem dados pessoais. |
| Verificação do access token | Assinatura + expiração **e** checagem da sessão no banco a cada requisição. Logout e revogação têm efeito imediato, sem esperar o token expirar. |
| Refresh token | 256 bits aleatórios, opaco. Enviado em **cookie `HttpOnly`**, `Path=/auth`. No banco fica só o **SHA-256**. |
| Renovação | **Rotação**: cada uso emite um refresh token novo e guarda o hash do anterior. |
| Reuso de token | Se um token já substituído for apresentado, a **sessão inteira é revogada** (indício de vazamento). |
| Validade da sessão | **Absoluta de 30 dias** a partir do login. As renovações não estendem esse prazo. Depois, novo login. |
| Logout | Revoga a sessão e limpa o cookie. É idempotente e não exige access token válido. |
| Recuperação de senha | **Não implementada.** Exige envio de email, que o projeto ainda não tem (ver pendências). |

### Proteção contra enumeração e abuso

- **Login**: "email ou senha inválidos" para qualquer falha, com a mesma resposta. Quando a
  conta não existe, a aplicação executa mesmo assim uma verificação Argon2 contra um hash
  descartável, para o tempo de resposta não revelar a existência da conta.
- **Cadastro**: retorna 409 se o email já existe. Isso **revela** a existência de contas. É um
  trade-off consciente, porque sem essa resposta o usuário não consegue corrigir o cadastro.
  O rate limit mitiga a enumeração em massa.
- **Rate limit** por IP (`express-rate-limit`): login e cadastro com 10 tentativas a cada 15
  minutos; renovação com 60. Resposta `429` no mesmo formato de erro da API.
- **Limite de corpo**: 100 KB.

### Cookie de refresh e CSRF

- Em **produção**, frontend e API estão em sites diferentes (ex.: Vercel e Render). Por isso o
  cookie usa `SameSite=None; Secure`. Com `SameSite=Strict` ou `Lax`, o navegador não enviaria o
  cookie na renovação cross-site.
- Com `SameSite=None`, a proteção CSRF deixa de vir do próprio cookie. Ela vem do **origin
  guard**: as rotas `/auth/refresh` e `/auth/logout` recusam (403) requisições cujo header
  `Origin` não esteja em `CORS_ORIGIN`. Navegadores sempre enviam `Origin` em requisições
  cross-site. Requisições sem `Origin` (clientes não navegadores) seguem o fluxo normal.
- Em desenvolvimento, `SameSite=Lax` (frontend e API em `localhost`, mesmo site).

---

## 5. Autorização

### Empresa ativa

1. O usuário seleciona uma empresa com `PUT /auth/active-company { companyId }`.
2. A aplicação **verifica o vínculo** antes de gravar. Sem vínculo, responde 404.
3. Recursos da empresa usam `GET /companies/active` ou o `companyId` da rota, e **sempre**
   revalidam o vínculo do usuário no banco.

**Nunca se confia em `companyId` vindo do frontend sem verificar a associação.** O teste
`recusa definir como ativa uma empresa da qual não é membro` cobre esse caso.

### Não-membro recebe 404, não 403

Quem não tem vínculo recebe `404 COMPANY_NOT_FOUND`, igual ao caso em que a empresa não existe.
Assim a resposta não revela se o identificador corresponde a uma empresa real (proteção contra
IDOR e enumeração). Um membro **sem permissão** recebe `403`, porque já sabe que a empresa existe.

Ponto único de verificação: `CompanyAccessService.requireMembership`, usado por todos os casos
de uso de empresa.

### Matriz de permissões

Definida em `domain/policies/company-permissions.ts`, sem I/O e testada isoladamente.

| Ação | OWNER | ADMIN | MEMBER |
|---|:-:|:-:|:-:|
| Ver empresa e membros | ✔ | ✔ | ✔ |
| Alterar dados da empresa (nome) | ✔ | ✔ | ✘ |
| Adicionar membro | ✔ (ADMIN, MEMBER) | ✔ (só MEMBER) | ✘ |
| Remover membro | ✔ (ADMIN, MEMBER) | ✔ (só MEMBER) | ✘ |
| Sair da empresa | ✘ | ✔ | ✔ |

- **OWNER** nunca é removido pela API e não pode sair, para a empresa nunca ficar sem dono.
- **OWNER não é atribuível pela API.** A empresa tem um único dono, o criador no cadastro.
- Ao remover um membro, a empresa deixa de ser ativa nas sessões dele.

### Usuário com múltiplas empresas

Um usuário pode ter vínculos com várias empresas, com papéis diferentes em cada uma. Trocar a
empresa ativa não afeta as demais. `GET /companies` lista apenas as associações do próprio
usuário.

---

## 6. Endpoints

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| GET | `/health` | — | Status da API e do banco (200 ok / 503 degraded) |
| POST | `/auth/register` | — | Cadastro; devolve access token e define cookie de refresh (201) |
| POST | `/auth/login` | — | Login; mesmo formato do cadastro (200) |
| POST | `/auth/refresh` | cookie + origin | Renova a sessão; rotaciona o refresh token (200) |
| POST | `/auth/logout` | cookie + origin | Revoga a sessão e limpa o cookie (204) |
| GET | `/auth/me` | Bearer | Usuário autenticado e empresa ativa |
| PUT | `/auth/active-company` | Bearer | Define a empresa ativa da sessão |
| POST | `/companies` | Bearer | Cria empresa; o criador vira OWNER (201) |
| GET | `/companies` | Bearer | Lista as empresas do usuário, com o papel em cada uma |
| GET | `/companies/active` | Bearer | Empresa ativa com o papel do usuário (409 se não houver) |
| GET | `/companies/:companyId` | Bearer, membro | Dados da empresa |
| PATCH | `/companies/:companyId` | Bearer, OWNER/ADMIN | Altera o nome (CNPJ é imutável) |
| GET | `/companies/:companyId/members` | Bearer, membro | Lista membros (nome, email, papel) |
| POST | `/companies/:companyId/members` | Bearer, OWNER/ADMIN | Adiciona usuário já cadastrado por email (201) |
| DELETE | `/companies/:companyId/members/:userId` | Bearer | Remove membro, ou sai da empresa (204) |

### Respostas de erro

Formato único: `{ "error": { "code": "...", "message": "...", "details?": ... } }`.

| Código HTTP | Códigos principais |
|---|---|
| 400 | `VALIDATION_ERROR` (detalhes por campo), `BAD_REQUEST` (JSON malformado) |
| 401 | `INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `SESSION_INVALID`, `INVALID_REFRESH_TOKEN`, `SESSION_EXPIRED` |
| 403 | `FORBIDDEN`, origem não permitida |
| 404 | `COMPANY_NOT_FOUND`, `USER_NOT_FOUND`, `MEMBER_NOT_FOUND` |
| 409 | `EMAIL_ALREADY_REGISTERED`, `COMPANY_DOCUMENT_ALREADY_REGISTERED`, `ALREADY_MEMBER`, `NO_ACTIVE_COMPANY` |
| 422 | `INVALID_CNPJ` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` (mensagem genérica; o detalhe só vai para o log, sem corpo da requisição) |

---

## 7. Configuração (novas variáveis)

| Variável | Padrão | Observação |
|---|---|---|
| `JWT_SECRET` | — (obrigatória) | Mínimo 32 caracteres. Falha no boot se ausente ou curta. |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | Entre 60 e 3600. |
| `REFRESH_TOKEN_TTL_DAYS` | 30 | Validade absoluta da sessão, entre 1 e 90. |
| `TRUST_PROXY` | false | `true` só atrás de proxy confiável (ex.: Render). Sem isso, o rate limit enxerga o IP do proxy. |
| `TEST_DATABASE_URL` | — | Banco de testes. O nome precisa terminar em `_test`; caso contrário os testes recusam rodar. |

---

## 8. Estratégia de testes

- **Unitários** (`tests/unit`): regras de domínio (CNPJ, permissões, validade de sessão), casos
  de uso com repositórios em memória e relógio controlável (para testar expiração sem esperar),
  e adapters de segurança com Argon2 e JWT reais.
- **Integração** (`tests/integration`): HTTP completo com Prisma real sobre o banco
  `fiscal_assistant_test`. Cobre cadastro, login, senha inválida, usuário inexistente, token
  expirado, token adulterado, rotas protegidas, renovação, reuso de token, logout, CSRF, rate
  limit, isolamento entre empresas, permissões por papel e múltiplas empresas. Também valida as
  restrições únicas e as cascatas diretamente no PostgreSQL.
- Os testes de integração rodam em sequência (`fileParallelism: false`), porque compartilham o
  mesmo banco.
- O banco de testes é limpo antes de cada teste. A guarda recusa qualquer URL cujo banco não
  termine em `_test`, então a limpeza nunca atinge o banco de desenvolvimento.

---

## 9. Decisões da Etapa 1 (mantidas)

- **Express em vez de NestJS**: escopo pede Express com Clean Architecture explícita. Mantivemos
  a filosofia do Quick Order (monorepo, Prisma, cliente de API centralizado), sem o acoplamento
  a decoradores e módulos.
- **Zod** para validar variáveis de ambiente e corpos de requisição.
- **Modelo de erros**: `AppError` com `statusCode` e `code` estável, em `shared/`. Decisão
  consciente para evitar uma camada de mapeamento sem necessidade no estágio atual.
- **Health check** com status `degraded` (503) quando o banco não responde, sem expor o motivo.
- **Prisma 6.19** (a mesma linha do Quick Order). O Prisma 7 exige `prisma.config.ts` e driver
  adapter; a migração fica para um passo separado (ver pendências).
- **PostgreSQL** via `docker-compose`, em `127.0.0.1:5440` (5432 e 5433 já estavam ocupadas).
- **Frontend com Cache Components**: dados dinâmicos ficam dentro de `<Suspense>`.
- **shadcn/ui** com o preset `nova` na base Radix, igual ao Quick Order.

---

## 10. Segurança e LGPD

- Credenciais e `JWT_SECRET` só em `.env`, que é ignorado pelo git. Versionamos apenas
  `.env.example` com placeholders.
- Senhas: Argon2id. Hashes, senhas e refresh tokens não aparecem nas respostas da API (há
  testes de integração para isso).
- Logs de erro registram apenas tipo e mensagem da exceção, sem corpo da requisição. **Não há
  teste automatizado para os logs**; a garantia hoje depende da revisão do código do error
  handler.
- Dados pessoais coletados: nome, email e vínculos com empresas. Lista de membros expõe nome e
  email **apenas** aos membros da própria empresa.
- CORS restrito a `CORS_ORIGIN`, com credenciais.
- Corpo JSON limitado a 100 KB, `x-powered-by` desabilitado.

---

## 11. Pendências e riscos

1. **Recuperação de senha**: depende de um provedor de email (transacional) e de tokens de uso
   único com validade curta. Não implementada, para não criar um fluxo sem infraestrutura de
   envio.
2. **Direitos do titular (LGPD)**: não há exclusão nem exportação de conta. Precisa ser
   implementado antes de dados reais de empresas entrarem no sistema.
3. **Auditoria**: eventos de login, reuso de token e mudança de papel não são registrados em
   trilha própria. Hoje só há o log de erro.
4. **Sessões expiradas acumulam**: não há rotina de limpeza. Deve virar job periódico.
5. **Corrida na renovação**: duas renovações simultâneas com o mesmo refresh token podem ser
   lidas como reuso e encerrar a sessão. Aceitável para o MVP; o cliente deve serializar as
   renovações.
6. **Cadastro revela existência de email** (409). Trade-off documentado na seção 4.
7. **Adicionar membro só para usuário já cadastrado**: não há convite por email.
8. **Rate limit em memória**: por processo. Com mais de uma instância, cada uma conta sozinha.
   Pede store compartilhado (ex.: Redis) quando houver escala horizontal.
9. **Vulnerabilidades do `npm audit` (4, severidade alta)**: vêm da cadeia do Prisma 6
   (`@prisma/config` → `effect` e `deepmerge-ts`). O npm sugere `npm audit fix --force`, que
   instala o Prisma 7 e exige mudanças de configuração. Não aplicado automaticamente. Recomenda-se
   migrar antes de dados reais.
10. **Frontend**: a Etapa 2 entrega a API. Telas de cadastro, login e seleção de empresa ainda
    não existem.
11. **Provedor de IA, OCR e deploy**: ainda não escolhidos (Etapas 3 e 4).

---

## 12. MVP: documentos, IA, chat e painel

### 12.1 Documentos fiscais

| Item | Decisão |
|---|---|
| Formatos | PDF e XML de NF-e. Outros formatos são recusados. |
| Validação | Pelo **conteúdo** (assinatura `%PDF-` ou XML bem formado), nunca pela extensão ou pelo `Content-Type` enviado. |
| Limite | 10 MB (`MAX_UPLOAD_MB`), aplicado pelo multer e de novo no caso de uso. |
| XML malformado | Recusado com `422 INVALID_FILE`, e **nada é gravado**. |
| XML válido que não é NF-e | Gravado com status `FAILED` e motivo, para revisão. |
| PDF ilegível | Gravado com status `FAILED` e motivo. |
| Duplicidade | SHA-256 único por empresa (`409 DOCUMENT_ALREADY_UPLOADED`). |
| Armazenamento | Disco local em `STORAGE_DIR/<companyId>/<uuid>.<ext>`. O nome original nunca vira caminho. Path traversal bloqueado. |
| Download | Só para membros da empresa dona. Cabeçalhos `nosniff`, `Content-Security-Policy: default-src 'none'` e `Cache-Control: no-store`. |
| Processamento | **Síncrono**, dentro da requisição de upload. Não há fila. |

**Por que síncrono:** a extração é local e rápida, e a IA responde em segundos. Uma fila adicionaria infraestrutura sem necessidade no MVP. O custo é que uma IA lenta deixa o envio mais demorado (limitado por `AI_TIMEOUT_MS`).

**Campos fiscais:** extraídos só do XML, e ausentes ficam `null`. Nada é preenchido por suposição.

### 12.2 Verificações determinísticas (sem IA)

Implementadas em `domain/rules/document-rules.ts`, testadas isoladamente:

- valor total ausente, zero ou negativo;
- chave de acesso com dígito verificador inválido (módulo 11);
- CNPJ do emitente ou do destinatário com dígito verificador inválido (CPF não é validado);
- data de emissão no futuro;
- soma dos itens diferente do total (apontado como **atenção**, sem concluir sobre impostos);
- documento que não foi lido: a falha vira o próprio alerta, sem regras sobre campos vazios.

As verificações **não fazem juízo tributário**. Apontam dados ausentes ou inconsistentes para revisão humana.

### 12.3 Análise com IA (Groq)

| Item | Decisão |
|---|---|
| Provedor | **Groq**, pela API de chat completions, com o SDK oficial `groq-sdk`. |
| Modelo | `openai/gpt-oss-120b` por padrão (`GROQ_MODEL`). Verificado na conta de teste; `llama-3.3-70b-versatile` não estava disponível. |
| Saída | JSON Schema estrito (`strict: true`), validado com Zod depois. |
| Timeout | `AI_TIMEOUT_MS` (padrão 30 s), com 1 retentativa. |
| Sem chave | Modo degradado: a análise é registrada como `SKIPPED` e o chat lista os documentos relacionados, sem inventar respostas. |
| Falha | Registrada como `FAILED` com mensagem genérica. Detalhes técnicos ficam só no log, sem a chave nem o corpo da requisição. |
| Prompt injection | O conteúdo dos documentos vai dentro de `<documento>`, é tratado como dado nas instruções do sistema, e marcadores de fechamento dentro do texto são removidos. Há teste para isso. |
| Limites | Texto do PDF truncado em 8.000 caracteres para análise e 20.000 para armazenamento. |

A IA é apoio: a análise traz **resumo**, **observações** e **informação insuficiente** quando for o caso. Ela não substitui as verificações determinísticas, que ficam sempre visíveis, com a origem indicada (verificação automática ou IA).

> **Atenção de privacidade (LGPD):** quando a IA está ativa, o conteúdo dos documentos (nomes, CNPJs, valores, itens e o texto de PDFs) é **enviado ao Groq**, um fornecedor externo. Antes de usar com dados reais de empresas, é preciso informar os usuários, formalizar o tratamento de dados com o fornecedor e avaliar a transferência internacional. Sem `GROQ_API_KEY`, nenhum dado sai do sistema.

### 12.4 Chat fiscal

- **Recuperação simples (sem RAG):** pontuação por termos em comum entre a pergunta e o nome, os campos fiscais, os itens e o texto de até 100 documentos processados recentes. Os 5 mais relevantes vão como contexto.
- **Isolamento:** a busca e o contexto usam só os documentos da empresa da URL, depois de verificar a associação. Há teste que confirma que a IA não recebe documentos de outra empresa.
- **Fontes:** cada resposta registra os documentos usados.
- **Conversas:** pertencem ao usuário dentro da empresa. Outro membro não lê a conversa (404).
- **Falha da IA:** responde `503 AI_UNAVAILABLE`, e a pergunta fica registrada.

### 12.5 Painel

Contagens (documentos, processados, falhas, análises concluídas e documentos com pendências), lista de pendências e histórico recente. As pendências consideram as verificações automáticas e as observações da IA dos **200 documentos mais recentes**.

### 12.6 Migrations desta fase

- `…_mvp_documentos_ia_chat`: cria `Document`, `DocumentAnalysis`, `Conversation`, `Message` e seus enums. Só cria estruturas novas, sem alterar as existentes.
- `…_documento_has_text`: adiciona `hasText` (booleano, padrão `false`) em `Document`. Aditiva, sem perda de dados.

### 12.7 Frontend

- Telas: cadastro, login, lista de empresas (com criação e seleção da empresa ativa), painel, documentos (envio e lista paginada), detalhe do documento (campos, itens, alertas, análise e visualização do arquivo), chat e configurações (dados da empresa e membros).
- **Token de acesso só em memória.** O cookie de refresh (`HttpOnly`) restaura a sessão ao abrir a página, e a API client renova o token automaticamente quando recebe `401`.
- Permissões na interface são apenas para exibição: o servidor confere cada operação.
- Testes automatizados do frontend cobrem formatação, validação de arquivo e limpeza do markdown. As telas foram verificadas no navegador (ver seção 12.8).

### 12.8 Verificação realizada

- **Servidor:** suíte completa de testes de unidade e integração (incluindo o banco PostgreSQL real), typecheck e build.
- **IA real:** upload de NF-e pela API, análise e pergunta no chat, todos com o Groq. A resposta do chat citou o valor correto (R$ 150,00) e a fonte.
- **Navegador:** cadastro, criação de empresa, upload pela tela, detalhe, chat, configurações, logout e redirecionamento para o login. Não houve erros no console.

### 12.9 Limitações conhecidas

1. **Sem exclusão de documentos** nesta versão.
2. **Sem limite de taxa no upload** nem varredura antivírus. O limite de tamanho e a validação por conteúdo mitigam, mas não substituem essas medidas.
3. **Processamento síncrono**: documentos grandes ou IA lenta deixam o envio mais demorado.
4. **Janelas de busca:** o chat considera 100 documentos e o painel, 200. Empresas com volume maior precisarão de índices de busca.
5. **Recuperação por palavras-chave:** perguntas com sinônimos ou formulações distantes dos termos do documento podem não encontrá-lo.
6. **Títulos de conversa:** ficam como "Nova conversa", porque não há endpoint para renomeá-las.
7. **Respostas da IA** são exibidas como texto puro, sem renderização de markdown além da ênfase.
8. **Armazenamento local:** em produção com mais de uma instância, é preciso um armazenamento compartilhado (ex.: bucket de objetos).
9. **Análise de IA pode repetir observações** das verificações automáticas. Isso é esperado, e a origem de cada item é exibida.
10. **Chave do Groq:** a chave usada durante o desenvolvimento apareceu no histórico de conversa e deve ser **revogada e substituída**.
