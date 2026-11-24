"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { LoadingState } from "@/components/app/loading-state";
import { DocumentStatusBadge } from "@/components/app/status-badge";
import { apiJson, ApiError } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { validateUploadFile } from "@/lib/upload-validation";
import type { DocumentSummary } from "@/lib/types";

const PAGE_SIZE = 20;

interface Page {
  items: DocumentSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export default function DocumentsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(
    async (pageNumber: number) => {
      const data = await apiJson<Page>(`/companies/${companyId}/documents?page=${pageNumber}&pageSize=${PAGE_SIZE}`);
      setResult(data);
    },
    [companyId],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiJson<Page>(`/companies/${companyId}/documents?page=${page}&pageSize=${PAGE_SIZE}`);
        if (active) setResult(data);
      } catch {
        if (active) setError("Não foi possível carregar os documentos.");
      }
    })();
    return () => {
      active = false;
    };
  }, [companyId, page]);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError("Escolha um arquivo PDF ou XML.");
      return;
    }
    const problem = validateUploadFile(file);
    if (problem) {
      setError(problem);
      return;
    }

    const body = new FormData();
    body.append("file", file);
    setUploading(true);
    try {
      const response = await apiJson<{ document: DocumentSummary; analysis: { status: string } | null }>(
        `/companies/${companyId}/documents`,
        { body },
      );
      if (response.document.status === "FAILED") {
        setMessage(`"${response.document.name}" foi recebido, mas não pôde ser processado: ${response.document.failureReason}`);
      } else {
        setMessage(`"${response.document.name}" enviado e processado.`);
      }
      if (fileInput.current) fileInput.current.value = "";
      setPage(1);
      await load(1);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Enviar documento</h2>
          <p className="text-sm text-muted-foreground">
            PDF ou XML de NF-e, até 10 MB. O arquivo é verificado pelo conteúdo, não só pela extensão.
          </p>
        </div>
        <form onSubmit={handleUpload} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2 sm:max-w-md">
            <Label htmlFor="file" className="sr-only">Arquivo</Label>
            <Input id="file" type="file" accept=".pdf,.xml,application/pdf,text/xml,application/xml" ref={fileInput} />
          </div>
          <Button type="submit" disabled={uploading} className="sm:w-28">
            {uploading ? "Enviando..." : "Enviar"}
          </Button>
        </form>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {message && (
          <Alert variant="success">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Todos os documentos</h2>
            <p className="text-sm text-muted-foreground">
              {result ? `${result.total} documento(s) cadastrado(s).` : "Carregando..."}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Enviado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!result && !error && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0"><LoadingState label="Carregando documentos..." /></TableCell>
                </TableRow>
              )}
              {result?.items.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState title="Nenhum documento enviado ainda." description="Envie o primeiro PDF ou XML acima para começar." />
                  </TableCell>
                </TableRow>
              )}
              {result?.items.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="whitespace-normal">
                    <Link href={`/empresas/${companyId}/documentos/${doc.id}`} className="font-medium underline-offset-4 hover:text-brand-strong hover:underline">
                      {doc.name}
                    </Link>
                    {/* No mobile, tipo e data aparecem abaixo do nome (as colunas ficam ocultas). */}
                    <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                      {doc.kind}{doc.fiscal.documentType ? ` · ${doc.fiscal.documentType}` : ""} · {formatDateTime(doc.createdAt)}
                    </p>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {doc.kind}{doc.fiscal.documentType ? ` · ${doc.fiscal.documentType}` : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(doc.fiscal.totalAmount)}</TableCell>
                  <TableCell><DocumentStatusBadge status={doc.status} /></TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDateTime(doc.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {result && result.total > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</Button>
            <span className="text-sm text-muted-foreground tabular-nums">Página {page} de {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Próxima</Button>
          </div>
        )}
      </section>
    </div>
  );
}
