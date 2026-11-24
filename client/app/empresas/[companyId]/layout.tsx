"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingState } from "@/components/app/loading-state";
import { RequireAuth } from "@/components/app/require-auth";
import { apiJson, ApiError } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";
import type { CompanyWithRole } from "@/lib/types";

const MAIN_SECTIONS = [
  { href: "painel", label: "Visão geral" },
  { href: "documentos", label: "Documentos" },
  { href: "chat", label: "Chat" },
];

const SETTINGS_SECTION = { href: "configuracoes", label: "Configurações" };

const ALL_SECTIONS = [...MAIN_SECTIONS, SETTINGS_SECTION];

export default function CompanyLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <CompanyShell>{children}</CompanyShell>
    </RequireAuth>
  );
}

function CompanyShell({ children }: { children: ReactNode }) {
  const { companyId } = useParams<{ companyId: string }>();
  const pathname = usePathname();
  const [data, setData] = useState<CompanyWithRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<CompanyWithRole>(`/companies/${companyId}`)
      .then(setData)
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError && caught.status === 404 ? "Empresa não encontrada." : "Não foi possível carregar a empresa.");
      });
  }, [companyId]);

  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10 md:px-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Link href="/empresas" className="text-sm font-medium text-brand-strong underline-offset-4 hover:underline">
          Voltar para suas empresas
        </Link>
      </main>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 md:px-8">
        <LoadingState label="Carregando empresa..." />
      </div>
    );
  }

  const sectionHref = (href: string) => `/empresas/${companyId}/${href}`;
  const active = ALL_SECTIONS.find((section) => pathname.startsWith(sectionHref(section.href)));

  function renderLink(section: { href: string; label: string }) {
    const isActive = pathname.startsWith(sectionHref(section.href));
    return (
      <Link
        key={section.href}
        href={sectionHref(section.href)}
        aria-current={isActive ? "page" : undefined}
        className={`relative flex shrink-0 items-center whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
          isActive
            ? "bg-brand-tint font-medium text-brand-strong md:before:absolute md:before:inset-y-2 md:before:left-0 md:before:w-0.5 md:before:rounded-full md:before:bg-brand"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {section.label}
      </Link>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col md:flex-row">
      <nav
        aria-label="Seções da empresa"
        className="flex gap-1 overflow-x-auto border-b px-4 py-3 md:w-56 md:shrink-0 md:flex-col md:gap-0.5 md:border-b-0 md:border-r md:pl-8 md:pr-4 md:py-8"
      >
        {MAIN_SECTIONS.map(renderLink)}
        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border md:mx-0 md:my-3 md:h-px md:w-auto" />
        {renderLink(SETTINGS_SECTION)}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-8 px-4 py-8 md:px-10">
        <header className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            {data.company.name} · {ROLE_LABELS[data.role]}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{active?.label ?? data.company.name}</h1>
        </header>
        {children}
      </div>
    </div>
  );
}
