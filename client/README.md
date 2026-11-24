# Frontend — Assistente Fiscal

Interface em Next.js (App Router), React, TypeScript, Tailwind CSS e shadcn/ui.

- A comunicação com a API é feita só via HTTP, em [lib/api.ts](lib/api.ts).
- Variáveis públicas (navegador) usam o prefixo `NEXT_PUBLIC_`. Veja [.env.example](.env.example).
- Componentes com dados dinâmicos ficam dentro de `<Suspense>` (Cache Components).

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

Visão geral do projeto: [../README.md](../README.md).
