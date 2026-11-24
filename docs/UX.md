# UX e UI do Assistente Fiscal

Escrito para: equipe de desenvolvimento e avaliadores da disciplina.

Este documento relaciona os princípios de UX e UI usados na interface com o que foi implementado.
Base: heurísticas de Nielsen, hierarquia visual e acessibilidade (WCAG).

## Heurísticas de Nielsen aplicadas

| Heurística | Como foi aplicada |
|---|---|
| 1. Mostrar o status | Envio de documento mostra "Enviando e analisando..." (o envio inclui a análise da IA). Telas têm estado de carregamento. |
| 3. Permitir desfazer | Remoção de membro pede confirmação na própria linha ("Cancelar" / "Confirmar"), sem janela do navegador. |
| 5. Prevenir erros | Campos de CNPJ e email são formatados e validados enquanto se digita. O botão só libera com dados válidos. |
| 6. Mostrar as opções | Estados vazios indicam o próximo passo (ex.: "Envie o primeiro PDF ou XML acima para começar"). |
| 7. Atalhos | No chat, Enter envia a pergunta e Shift+Enter quebra a linha. |
| 9. Erros que se explicam | Erros da API viram frases com o próximo passo (`lib/error-messages.ts`). Código desconhecido recebe mensagem genérica, sem detalhes técnicos. |
| 10. Ajuda fácil de achar | Textos de apoio nos formulários (ex.: mínimo de 8 caracteres na senha). |

## Fundamentos visuais

- **Hierarquia:** cada tela tem um título, e a ação principal fica em destaque (ex.: "Enviar", "Criar empresa").
- **Linguagem do mundo real:** rótulos em português simples ("Papel", "Empresa ativa", "Fontes").
- **Explicações em texto corrido:** a análise da IA é um parágrafo, sem listas técnicas nem campos que não se aplicam ao documento.

## Pendências (não feitas nesta versão)

- **Contraste:** o material exige no mínimo 4,5:1 (WCAG). Ainda não foi medido nas cores do tema. Recomenda-se testar com WebAIM Contrast Checker.
- **Navegação por teclado completa:** foco visível e ordem de tabulação ainda precisam de revisão em todas as telas.
- **Testes com usuários reais:** não foram feitos testes de usabilidade. O próximo passo do ciclo (Duplo Diamante) é testar com alguns usuários e ajustar.
- **Modo escuro e microinterações:** fora do escopo do MVP.
