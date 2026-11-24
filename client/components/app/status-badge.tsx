import { Badge } from "@/components/ui/badge";
import { SEVERITY_LABELS } from "@/lib/format";

/*
 * Semântica dos estados (única fonte de verdade para badges do app):
 * sucesso = verde claro · atenção = amarelo discreto · erro = vermelho discreto · neutro = cinza.
 */

const DOCUMENT_STATUS: Record<string, { label: string; variant: "success" | "destructive" }> = {
  PROCESSED: { label: "Processado", variant: "success" },
  FAILED: { label: "Falhou", variant: "destructive" },
};

const ANALYSIS_STATUS: Record<string, { label: string; variant: "success" | "destructive" | "outline" }> = {
  COMPLETED: { label: "Análise de IA", variant: "success" },
  FAILED: { label: "IA indisponível", variant: "destructive" },
  SKIPPED: { label: "Sem IA", variant: "outline" },
};

const SEVERITY_VARIANT: Record<string, "destructive" | "warning" | "info"> = {
  ERROR: "destructive",
  WARNING: "warning",
  INFO: "info",
};

export function DocumentStatusBadge({ status }: { status: string }) {
  const entry = DOCUMENT_STATUS[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

export function AnalysisStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline">Não analisado</Badge>;
  const entry = ANALYSIS_STATUS[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge variant={SEVERITY_VARIANT[severity] ?? "info"}>{SEVERITY_LABELS[severity] ?? severity}</Badge>;
}
