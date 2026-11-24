"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/app/empty-state";
import { LoadingState } from "@/components/app/loading-state";
import { RequireAuth } from "@/components/app/require-auth";
import { apiJson, ApiError } from "@/lib/api";
import { formatDocument, ROLE_LABELS } from "@/lib/format";
import type { CompanyWithRole } from "@/lib/types";

export default function CompaniesPage() {
  return (
    <RequireAuth>
      <CompaniesContent />
    </RequireAuth>
  );
}

function CompaniesContent() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyWithRole[] | null>(null);
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const response = await apiJson<{ companies: CompanyWithRole[] }>("/companies");
    setCompanies(response.companies);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await apiJson<{ companies: CompanyWithRole[] }>("/companies");
        if (active) setCompanies(response.companies);
      } catch {
        if (active) setError("Não foi possível carregar suas empresas.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await apiJson<CompanyWithRole>("/companies", {
        json: { name, document },
      });
      setName("");
      setDocument("");
      await load();
      await open(created.company.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível criar a empresa.");
    } finally {
      setSubmitting(false);
    }
  }

  /** Seleciona a empresa ativa na sessão e abre o painel dela. */
  async function open(companyId: string) {
    await apiJson("/auth/active-company", { method: "PUT", json: { companyId } });
    router.push(`/empresas/${companyId}/painel`);
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Suas empresas</h1>
        <p className="text-sm text-muted-foreground">Escolha uma empresa para ver documentos, análises e o chat.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_320px] md:gap-16">
        <section className="flex flex-col gap-4">
          {companies === null && !error && <LoadingState label="Carregando empresas..." />}
          {companies?.length === 0 && (
            <EmptyState title="Você ainda não tem empresas." description="Crie uma ao lado para começar." />
          )}
          {companies && companies.length > 0 && (
            <ul className="divide-y border-y">
              {companies.map(({ company, role }) => (
                <li key={company.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{company.name}</span>
                      <span className="shrink-0 rounded-md border px-1.5 py-px text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">CNPJ {formatDocument(company.document)}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => open(company.id)}>Abrir empresa</Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Nova empresa</h2>
            <p className="text-sm text-muted-foreground">Você será o proprietário da empresa criada.</p>
          </div>
          <form onSubmit={handleCreate} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="company-name">Nome</Label>
              <Input id="company-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="company-document">CNPJ</Label>
              <Input id="company-document" required inputMode="numeric" placeholder="00.000.000/0000-00" value={document} onChange={(e) => setDocument(e.target.value)} />
            </div>
            <Button type="submit" disabled={submitting} className="h-9">
              {submitting ? "Criando..." : "Criar empresa"}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
