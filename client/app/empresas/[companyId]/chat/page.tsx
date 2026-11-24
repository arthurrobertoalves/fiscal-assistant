"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/empty-state";
import { LoadingState } from "@/components/app/loading-state";
import { apiJson, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { stripMarkdown } from "@/lib/text";
import type { ChatMessage, Conversation } from "@/lib/types";

const MAX_QUESTION = 2000;

export default function ChatPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const data = await apiJson<{ conversations: Conversation[] }>(`/companies/${companyId}/conversations`);
    setConversations(data.conversations);
    return data.conversations;
  }, [companyId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiJson<{ conversations: Conversation[] }>(`/companies/${companyId}/conversations`);
        if (!active) return;
        setConversations(data.conversations);
        setActiveId((current) => current ?? data.conversations[0]?.id ?? null);
      } catch {
        if (active) setError("Não foi possível carregar as conversas.");
      }
    })();
    return () => {
      active = false;
    };
  }, [companyId]);

  useEffect(() => {
    if (!activeId) return;
    let active = true;
    (async () => {
      try {
        const data = await apiJson<{ messages: ChatMessage[] }>(`/companies/${companyId}/conversations/${activeId}/messages`);
        if (active) setMessages(data.messages);
      } catch {
        if (active) setError("Não foi possível carregar a conversa.");
      }
    })();
    return () => {
      active = false;
    };
  }, [companyId, activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function newConversation() {
    setError(null);
    try {
      const created = await apiJson<Conversation>(`/companies/${companyId}/conversations`, { json: {} });
      await loadConversations();
      setActiveId(created.id);
    } catch {
      setError("Não foi possível criar a conversa.");
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!activeId) return;
    setError(null);
    const content = question.trim();
    if (!content) return;
    if (content.length > MAX_QUESTION) {
      setError(`A pergunta deve ter no máximo ${MAX_QUESTION} caracteres.`);
      return;
    }

    setSending(true);
    try {
      const result = await apiJson<{ userMessage: ChatMessage; assistantMessage: ChatMessage }>(
        `/companies/${companyId}/conversations/${activeId}/messages`,
        { json: { content } },
      );
      setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
      setQuestion("");
      // Atualiza a ordem da lista (a conversa mais recente sobe).
      await loadConversations();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível enviar a pergunta.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
      <aside className="flex flex-col gap-3">
        <Button variant="outline" onClick={newConversation} className="w-full justify-start">
          Nova conversa
        </Button>
        {conversations === null && <LoadingState label="Carregando conversas..." />}
        {conversations?.length === 0 && <p className="px-1 text-sm text-muted-foreground">Nenhuma conversa ainda.</p>}
        {conversations && conversations.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {conversations.map((conversation) => {
              const selected = conversation.id === activeId;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(conversation.id)}
                    aria-current={selected ? "true" : undefined}
                    className={`flex w-full flex-col gap-0.5 rounded-md border-l-2 px-3 py-2 text-left transition-colors ${
                      selected ? "border-brand bg-brand-tint" : "border-transparent hover:bg-muted"
                    }`}
                  >
                    <span className={`truncate text-sm ${selected ? "font-medium text-brand-strong" : ""}`}>{conversation.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(conversation.updatedAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="flex min-h-[60vh] min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Chat fiscal</h2>
          <p className="text-sm text-muted-foreground">
            Respostas baseadas somente nos documentos desta empresa. Não substituem um contador.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
          {!activeId && <EmptyState title="Crie uma conversa para começar." description="Use “Nova conversa” ao lado." />}
          {activeId && messages.length === 0 && (
            <EmptyState title="Pergunte sobre seus documentos fiscais." description="As respostas citam os documentos usados como fonte." />
          )}
          {messages.map((message) =>
            message.role === "USER" ? (
              <div key={message.id} className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-muted px-4 py-3 text-sm leading-relaxed">
                <p className="whitespace-pre-line">{stripMarkdown(message.content)}</p>
              </div>
            ) : (
              <div key={message.id} className="max-w-[88%] border-l-2 border-brand pl-4 text-sm leading-relaxed">
                <p className="whitespace-pre-line">{stripMarkdown(message.content)}</p>
                {message.sourceDocumentIds.length > 0 && (
                  <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Fontes:</span>
                    {message.sourceDocumentIds.map((id, index) => (
                      <Link
                        key={id}
                        href={`/empresas/${companyId}/documentos/${id}`}
                        className="rounded-md bg-brand-tint px-2 py-0.5 font-medium text-brand-strong transition-colors hover:bg-brand/40"
                      >
                        documento {index + 1}
                      </Link>
                    ))}
                  </p>
                )}
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="flex flex-col gap-3 border-t pt-5">
          <Textarea
            placeholder="Pergunte sobre os documentos da empresa..."
            rows={3}
            maxLength={MAX_QUESTION + 500}
            value={question}
            disabled={!activeId || sending}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">{question.length}/{MAX_QUESTION}</span>
            <Button type="submit" disabled={!activeId || sending || question.trim().length === 0}>
              {sending ? "Consultando..." : "Enviar"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
