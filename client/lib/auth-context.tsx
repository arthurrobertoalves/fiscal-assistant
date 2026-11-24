"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiJson, refreshAccessToken, setAccessToken, setRefreshHandler } from "./api";
import type { User } from "./types";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: User };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Mantém a sessão do usuário. Ao abrir a página, tenta restaurar a sessão pelo cookie de refresh.
 * O access token fica só em memória; quando expira, é renovado automaticamente pela API client.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const renew = useCallback(async (): Promise<boolean> => {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      setAccessToken(null);
      return false;
    }
    setAccessToken(refreshed.accessToken);
    return true;
  }, []);

  useEffect(() => {
    setRefreshHandler(renew);
    let cancelled = false;

    (async () => {
      const renewed = await renew();
      if (!renewed) {
        if (!cancelled) setState({ status: "anonymous" });
        return;
      }
      try {
        const me = await apiJson<{ user: User }>("/auth/me");
        if (!cancelled) setState({ status: "authenticated", user: me.user });
      } catch {
        if (!cancelled) setState({ status: "anonymous" });
      }
    })();

    return () => {
      cancelled = true;
      setRefreshHandler(null);
    };
  }, [renew]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiJson<{ user: User; accessToken: string }>("/auth/login", {
      json: { email, password },
      anonymous: true,
    });
    setAccessToken(response.accessToken);
    setState({ status: "authenticated", user: response.user });
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const response = await apiJson<{ user: User; accessToken: string }>("/auth/register", {
      json: { name, email, password },
      anonymous: true,
    });
    setAccessToken(response.accessToken);
    setState({ status: "authenticated", user: response.user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiJson<void>("/auth/logout", { method: "POST", anonymous: true });
    } finally {
      setAccessToken(null);
      setState({ status: "anonymous" });
    }
  }, []);

  const value = useMemo(() => ({ state, login, register, logout }), [state, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }
  return context;
}
