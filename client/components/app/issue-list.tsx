import { CheckCircle2 } from "lucide-react";
import { SeverityBadge } from "@/components/app/status-badge";
import type { DocumentIssue } from "@/lib/types";

/** Lista de alertas. A origem (verificação automática ou IA) é exibida para o usuário saber quem apontou. */
export function IssueList({ issues }: { issues: DocumentIssue[] }) {
  if (issues.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-brand-strong">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
        Nenhum alerta encontrado.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y">
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={issue.severity} />
            <span className="text-xs text-muted-foreground">
              {issue.source === "AI" ? "Observação da IA" : "Verificação automática"}
            </span>
          </div>
          <p className="text-sm leading-relaxed">{issue.message}</p>
        </li>
      ))}
    </ul>
  );
}
