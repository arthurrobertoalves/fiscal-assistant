"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/** Ponto de entrada: leva o usuário para suas empresas (ou para o login). */
export default function HomePage() {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "authenticated") router.replace("/empresas");
    if (state.status === "anonymous") router.replace("/login");
  }, [state.status, router]);

  return <p className="p-8 text-sm text-muted-foreground">Carregando...</p>;
}
