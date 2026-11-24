# Assistente Fiscal

Assistente fiscal com IA para pequenas e médias empresas: ajuda a compreender,
organizar e acompanhar obrigações fiscais.

> A IA funciona como apoio e **não substitui** um contador ou consultor tributário.

A arquitetura, as decisões e as pendências estão em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Node.js, Express, TypeScript, Clean Architecture, Zod, Vitest
- **Banco:** PostgreSQL com Prisma ORM
- **Comunicação:** API REST; frontend e backend totalmente separados

## Estrutura

```
client/   Next.js (interface)
server/   Express (API REST)
docs/     Documentação de arquitetura
```

## Como executar localmente

Pré-requisitos: Node.js 24+, npm e Docker.

```bash
# 1. Dependências
npm run install:all

# 2. Banco de dados (PostgreSQL na porta 5440)
npm run db:up

# 3. Configuração
cp server/.env.example server/.env
cp client/.env.example client/.env.local

# 4. Schema do banco (sem migrations ainda, só gera o cliente Prisma)
npm --prefix server run prisma:generate

# 5. Em terminais separados
npm run dev:server   # API em http://localhost:3001
npm run dev:client   # Interface em http://localhost:3000
```

Verificação rápida: `curl http://localhost:3001/health` deve responder `200` com
`"status":"ok"`.

## Testes e build

Os testes de integração usam um banco separado, cujo nome termina em `_test`
(a suíte recusa rodar contra outro nome, para não apagar dados de desenvolvimento).

```bash
# Uma única vez: cria o banco de testes e aplica as migrations nele
docker compose exec postgres createdb -U fiscal fiscal_assistant_test
DATABASE_URL="postgresql://fiscal:fiscal@localhost:5440/fiscal_assistant_test?schema=public" \
  npm --prefix server run prisma:deploy

npm test                              # testes do servidor (unitários e de integração)
npm run lint                          # lint do frontend
npm run build                         # build de servidor e frontend
```

A variável `TEST_DATABASE_URL` em `server/.env` define o banco de testes. Sem ela, os
testes de integração são pulados (aparecem como "skipped").

## Funcionalidades do MVP

- **Documentos:** envio de PDF e XML de NF-e (até 10 MB), validação pelo conteúdo, detalhe com campos extraídos e visualização do arquivo original.
- **Verificações automáticas:** valor, chave de acesso, CNPJ e data, sem IA.
- **Análise com IA (Groq):** resumo e observações. Sem `GROQ_API_KEY`, funciona sem IA.
- **Chat fiscal:** perguntas sobre os documentos da própria empresa, com fontes.
- **Painel:** contagens, pendências e histórico.

> Com a IA ativa, o conteúdo dos documentos é enviado ao Groq. Veja a seção 12.3 de [docs/ARQUITETURA.md](docs/ARQUITETURA.md) antes de usar dados reais.

## Endpoints principais

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `GET /auth/me`, `PUT /auth/active-company`
- `POST /companies`, `GET /companies`, `GET /companies/active`, `GET|PATCH /companies/:companyId`
- `GET|POST /companies/:companyId/members`, `DELETE /companies/:companyId/members/:userId`
- `POST|GET /companies/:companyId/documents`, `GET /companies/:companyId/documents/:documentId`, `GET .../file`, `POST .../analysis`
- `GET /companies/:companyId/dashboard`
- `POST|GET /companies/:companyId/conversations`, `GET|POST .../conversations/:conversationId/messages`

Detalhes, códigos de erro e matriz de permissões: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Estado do projeto

- [x] Etapa 1 — Fundação: monorepo, Express, Prisma/PostgreSQL, variáveis de ambiente validadas, health check, tratamento global de erros, testes
- [x] Etapa 2 — Autenticação e empresas (API): cadastro, login, logout, renovação com rotação, Argon2id, empresas, membros e papéis. Telas de frontend e recuperação de senha ficam para depois
- [x] Etapa 3 — Documentos fiscais (PDF e XML de NF-e): envio, armazenamento, listagem e visualização
- [x] Etapa 4 — Inteligência artificial (Groq): análise de documentos e chat com fontes
- [x] MVP — frontend de autenticação, empresas, documentos, chat e painel
- [ ] Base de conhecimento com busca semântica (RAG): fora do MVP, só quando houver necessidade comprovada
