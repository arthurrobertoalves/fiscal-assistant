"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export function AppHeader() {
  const { state, logout } = useAuth();
  const router = useRouter();
  const userName = state.status === "authenticated" ? state.user.name : null;

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
        <Link href="/empresas" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
          Assistente Fiscal
        </Link>
        {userName && (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span>
            <span className="hidden h-4 w-px bg-border sm:inline" aria-hidden="true" />
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
              Sair
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
