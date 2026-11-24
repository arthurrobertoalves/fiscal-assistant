"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/error-messages";
import { useAuth } from "@/lib/auth-context";
import { emailMessage, isValidEmail } from "@/lib/masks";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailError = emailMessage(email);
  const passwordError = password.length > 0 && password.length < 8 ? "A senha deve ter pelo menos 8 caracteres." : null;
  const formValid = name.trim().length >= 2 && isValidEmail(email) && password.length >= 8;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      await register(name, email, password);
      router.replace("/empresas");
    } catch (caught) {
      setError(friendlyError(caught, "Não foi possível criar a conta. Tente novamente."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Criar conta</h1>
        <p className="text-sm text-muted-foreground">
          Depois do cadastro, você pode criar uma empresa ou ser convidado por um administrador.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" required minLength={2} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required aria-invalid={emailError !== null} value={email} onChange={(e) => setEmail(e.target.value)} />
          {emailError && <p className="text-xs text-destructive">{emailError}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} aria-invalid={passwordError !== null} value={password} onChange={(e) => setPassword(e.target.value)} />
          {passwordError ? (
            <p className="text-xs text-destructive">{passwordError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
          )}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={submitting || !formValid} className="h-9 w-full">
          {submitting ? "Criando conta..." : "Criar conta"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-brand-strong underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </main>
  );
}
