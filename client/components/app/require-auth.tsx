"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/app/loading-state";
import { useAuth } from "@/lib/auth-context";

/** Só renderiza as páginas privadas com sessão válida; caso contrário, envia para o login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "anonymous") {
      router.replace("/login");
    }
  }, [state.status, router]);

  if (state.status !== "authenticated") {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 md:px-8">
        <LoadingState />
      </div>
    );
  }
  return <>{children}</>;
}
