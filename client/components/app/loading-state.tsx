import { LoaderCircle } from "lucide-react";

/** Indicador de carregamento discreto, usado em todas as páginas que buscam dados. */
export function LoadingState({ label = "Carregando..." }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin text-brand-strong" aria-hidden="true" />
      {label}
    </p>
  );
}
