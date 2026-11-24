"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/app/empty-state";
import { LoadingState } from "@/components/app/loading-state";
import { AnalysisStatusBadge, DocumentStatusBadge, SeverityBadge } from "@/components/app/status-badge";
import { apiJson } from "@/lib/api";
import { formatDateTime, formatLongDate } from "@/lib/format";
import type { Dashboard } from "@/lib/types";

export default function DashboardPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Dashboard>(`/companies/${companyId}/dashboard`)
      .then(setData)
      .catch(() => setError("Não foi possível carregar o painel."));
  }, [companyId]);

  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;
  if (!data) return <LoadingState label="Carregando painel..." />;

  const { counts } = data;
  // Verde = informação positiva; amarelo = pendência que pede revisão; sem cor = contagem neutra.
  const metrics = [
    { label: "Documentos cadastrados", value: counts.documents, dot: null },
    { label: "Processados", value: counts.processedDocuments, dot: "bg-brand" },
    { label: "Análises de IA concluídas", value: counts.analysesCompleted, dot: "bg-brand" },
    { label: "Documentos com pendências", value: counts.documentsWithPendings, dot: counts.documentsWithPendings > 0 ? "bg-warning-border" : null },
  ];

  return (
    <div className="flex flex-col gap-10">
      <p className="-mt-4 text-sm text-muted-foreground">{formatLongDate(new Date())}</p>

      <section aria-label="Resumo" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex flex-col gap-3 bg-background p-5">
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{metric.value}</p>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              {metric.dot && <span className={`size-1.5 rounded-full ${metric.dot}`} aria-hidden="true" />}
              {metric.label}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Pendências identificadas</h2>
            <p className="text-sm text-muted-foreground">Itens que precisam de revisão, nos documentos mais recentes.</p>
          </div>
          {data.pendings.length === 0 ? (
            <EmptyState title="Nenhuma pendência encontrada." description="Quando um documento precisar de revisão, ele aparece aqui." />
          ) : (
            <ul className="divide-y border-y">
              {data.pendings.map((pending) => (
                <li key={pending.documentId}>
                  <Link
                    href={`/empresas/${companyId}/documentos/${pending.documentId}`}
                    className="-mx-2 flex flex-col gap-1.5 rounded-md px-2 py-3 transition-colors hover:bg-brand-soft"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <SeverityBadge severity={pending.severity} />
                      <span className="truncate text-sm font-medium">{pending.name}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Histórico recente</h2>
            <p className="text-sm text-muted-foreground">Últimos envios da empresa.</p>
          </div>
          {data.history.length === 0 ? (
            <EmptyState title="Nenhum documento enviado ainda." description="Envie um PDF ou XML de NF-e na aba Documentos." />
          ) : (
            <ul className="divide-y border-y">
              {data.history.map((entry) => (
                <li key={entry.documentId}>
                  <Link
                    href={`/empresas/${companyId}/documentos/${entry.documentId}`}
                    className="-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-brand-soft"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <DocumentStatusBadge status={entry.status} />
                      <AnalysisStatusBadge status={entry.analysisStatus} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="border-t pt-6 text-xs text-muted-foreground">
        As análises são apoio à decisão e não substituem um contador ou consultor tributário.
      </p>
    </div>
  );
}
