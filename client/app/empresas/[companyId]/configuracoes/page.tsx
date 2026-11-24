"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/app/loading-state";
import { apiJson } from "@/lib/api";
import { friendlyError } from "@/lib/error-messages";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, formatDocument, ROLE_LABELS } from "@/lib/format";
import { emailMessage, isValidEmail } from "@/lib/masks";
import type { CompanyRole, CompanyWithRole, Member } from "@/lib/types";

/** Permissões aqui são só para a interface: o servidor sempre confere cada operação. */
const CAN_MANAGE: CompanyRole[] = ["OWNER", "ADMIN"];

export default function SettingsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { state } = useAuth();
  const currentUserId = state.status === "authenticated" ? state.user.id : null;
  const [data, setData] = useState<CompanyWithRole | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Remoção pede confirmação na própria linha, em vez de uma janela do navegador.
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [company, list] = await Promise.all([
      apiJson<CompanyWithRole>(`/companies/${companyId}`),
      apiJson<{ members: Member[] }>(`/companies/${companyId}/members`),
    ]);
    setData(company);
    setName(company.company.name);
    setMembers(list.members);
  }, [companyId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [company, list] = await Promise.all([
          apiJson<CompanyWithRole>(`/companies/${companyId}`),
          apiJson<{ members: Member[] }>(`/companies/${companyId}/members`),
        ]);
        if (!active) return;
        setData(company);
        setName(company.company.name);
        setMembers(list.members);
      } catch {
        if (active) setError("Não foi possível carregar as configurações.");
      }
    })();
    return () => {
      active = false;
    };
  }, [companyId]);

  const canManage = data ? CAN_MANAGE.includes(data.role) : false;

  async function run(action: () => Promise<unknown>, success: string) {
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      await load();
    } catch (caught) {
      setError(friendlyError(caught, "A operação não pôde ser concluída. Tente de novo."));
    }
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    await run(() => apiJson(`/companies/${companyId}`, { method: "PATCH", json: { name } }), "Nome atualizado.");
  }

  async function addMember(event: FormEvent) {
    event.preventDefault();
    await run(
      () => apiJson(`/companies/${companyId}/members`, { json: { email: memberEmail, role: memberRole } }),
      "Membro adicionado.",
    );
    setMemberEmail("");
  }

  async function removeMember(userId: string, self: boolean) {
    setPendingRemoval(null);
    await run(() => apiJson(`/companies/${companyId}/members/${userId}`, { method: "DELETE" }), self ? "Você saiu da empresa." : "Membro removido.");
  }

  if (!data) {
    return error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : <LoadingState label="Carregando..." />;
  }

  return (
    <div className="flex flex-col gap-10">
      {message && <Alert variant="success"><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Dados da empresa</h2>
          <p className="text-sm text-muted-foreground">CNPJ {formatDocument(data.company.document)}. O CNPJ não pode ser alterado.</p>
        </div>
        <form onSubmit={saveName} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2 sm:max-w-md">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} disabled={!canManage} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" disabled={!canManage || name.trim() === data.company.name}>Salvar</Button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Membros</h2>
          <p className="text-sm text-muted-foreground">Usuários já cadastrados que têm acesso à empresa.</p>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead className="hidden sm:table-cell">Desde</TableHead>
                <TableHead><span className="sr-only">Ações</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const isOwner = member.role === "OWNER";
                const isSelf = member.userId === currentUserId;
                return (
                  <TableRow key={member.userId}>
                    <TableCell className="whitespace-normal font-medium">
                      {member.name}
                      {/* No mobile, email e data aparecem abaixo do nome (as colunas ficam ocultas). */}
                      <p className="mt-0.5 text-xs font-normal break-all text-muted-foreground sm:hidden">
                        {member.email} · desde {formatDateTime(member.joinedAt)}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{member.email}</TableCell>
                    <TableCell>{ROLE_LABELS[member.role]}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDateTime(member.joinedAt)}</TableCell>
                    <TableCell className="text-right">
                      {!isOwner && (canManage || isSelf) && (
                        pendingRemoval === member.userId ? (
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPendingRemoval(null)}>Cancelar</Button>
                            <Button variant="destructive" size="sm" onClick={() => removeMember(member.userId, isSelf)}>{isSelf ? "Confirmar saída" : "Confirmar remoção"}</Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setPendingRemoval(member.userId)}>{isSelf ? "Sair" : "Remover"}</Button>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {canManage && (
          <div className="flex flex-col gap-4 border-t pt-6">
            <h3 className="text-sm font-medium">Adicionar membro</h3>
            <form onSubmit={addMember} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-2 sm:max-w-xs">
                <Label htmlFor="member-email">Email do usuário</Label>
                <Input id="member-email" type="email" required aria-invalid={emailMessage(memberEmail) !== null} value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} />
                {emailMessage(memberEmail) && <p className="text-xs text-destructive">{emailMessage(memberEmail)}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="member-role">Papel</Label>
                <select
                  id="member-role"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-ring/40"
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value as "ADMIN" | "MEMBER")}
                >
                  {data.role === "OWNER" && <option value="ADMIN">Administrador</option>}
                  <option value="MEMBER">Membro</option>
                </select>
              </div>
              <Button type="submit" disabled={!isValidEmail(memberEmail)}>Adicionar</Button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
