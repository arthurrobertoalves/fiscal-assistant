"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnalysisStatusBadge, DocumentStatusBadge } from "@/components/app/status-badge";
import { LoadingState } from "@/components/app/loading-state";
import { apiBlob, apiJson, ApiError } from "@/lib/api";
import { formatBytes, formatCurrency, formatDate, formatDateTime, formatDocument } from "@/lib/format";
import type { Analysis, DocumentDetail } from "@/lib/types";

export default function DocumentDetailPage() {
  const { companyId, documentId } = useParams<{ companyId: string; documentId: string }>();
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await apiJson<DocumentDetail>(`/companies/${companyId}/documents/${documentId}`);
    setDetail(data);
    setAnalysis(data.latestAnalysis);
  }, [companyId, documentId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiJson<DocumentDetail>(`/companies/${companyId}/documents/${documentId}`);
        if (!active) return;
        setDetail(data);
        setAnalysis(data.latestAnalysis);
      } catch (caught: unknown) {
        if (active) {
          setError(caught instanceof ApiError && caught.status === 404 ? "Documento não encontrado." : "Não foi possível carregar o documento.");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [companyId, documentId]);

  // Libera a URL do arquivo quando a página é fechada ou o arquivo muda.
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  async function viewFile() {
    setError(null);
    try {
      const blob = await apiBlob(`/companies/${companyId}/documents/${documentId}/file`);
      if (detail?.document.kind === "XML") {
        setFileText((await blob.text()).slice(0, 200_000));
        setFileUrl(null);
      } else {
        setFileUrl(URL.createObjectURL(blob));
        setFileText(null);
      }
    } catch {
      setError("Não foi possível abrir o arquivo.");
    }
  }

  async function reanalyze() {
    setError(null);
    setBusy(true);
    try {
      const result = await apiJson<Analysis>(`/companies/${companyId}/documents/${documentId}/analysis`, { method: "POST" });
      setAnalysis(result);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível analisar o documento.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
        <Link href={`/empresas/${companyId}/documentos`} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-brand-strong hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar para documentos
        </Link>
      </div>
    );
  }
  if (!detail) return <LoadingState label="Carregando documento..." />;

  const doc = detail.document;
  const fiscal = doc.fiscal;
  const showNfeFields = doc.fiscal.documentType === "NFE";

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <Link
              href={`/empresas/${companyId}/documentos`}
              className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Documentos
            </Link>
            <h2 className="truncate text-xl font-semibold tracking-tight">{doc.name}</h2>
            <p className="text-xs text-muted-foreground">
              {doc.kind} · {formatBytes(doc.sizeBytes)} · enviado em {formatDateTime(doc.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={viewFile}>Visualizar arquivo</Button>
            <Button onClick={reanalyze} disabled={busy || doc.status !== "PROCESSED"}>
              {busy ? "Analisando..." : "Analisar com IA"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-y py-5">
          {showNfeFields && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Valor total</span>
              <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatCurrency(fiscal.totalAmount)}</span>
            </div>
          )}
          <div className={showNfeFields ? "ml-auto" : undefined}>
            <DocumentStatusBadge status={doc.status} />
          </div>
        </div>
      </header>

      {doc.status === "FAILED" && (
        <Alert variant="destructive"><AlertDescription>Não foi possível processar este documento: {doc.failureReason}</AlertDescription></Alert>
      )}

      {fileUrl && (
        <iframe src={fileUrl} title={doc.name} className="h-[70vh] w-full rounded-lg border" />
      )}
      {fileText !== null && (
        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-muted/40 p-4 text-xs">{fileText}</pre>
      )}

      <div className="grid gap-10 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Dados extraídos</h2>
            <p className="text-sm text-muted-foreground">Campos ausentes no documento aparecem como &ldquo;—&rdquo;.</p>
          </div>
          {showNfeFields ? (
            <dl className="grid grid-cols-1 gap-x-8 gap-y-5 text-sm sm:grid-cols-2">
              <div className="flex flex-col gap-1"><dt className="text-xs text-muted-foreground">Número</dt><dd>{fiscal.documentNumber ?? "—"}</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-xs text-muted-foreground">Data de emissão</dt><dd>{formatDate(fiscal.issuedAt)}</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-xs text-muted-foreground">Emitente</dt><dd>{fiscal.issuer.name ?? "—"}</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-xs text-muted-foreground">CNPJ do emitente</dt><dd className="tabular-nums">{formatDocument(fiscal.issuer.document)}</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-xs text-muted-foreground">Destinatário</dt><dd>{fiscal.recipient.name ?? "—"}</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-xs text-muted-foreground">Documento do destinatário</dt><dd className="tabular-nums">{formatDocument(fiscal.recipient.document)}</dd></div>
              <div className="flex flex-col gap-1 sm:col-span-2"><dt className="text-xs text-muted-foreground">Chave de acesso</dt><dd className="break-all font-mono text-xs">{fiscal.accessKey ?? "—"}</dd></div>
            </dl>
          ) : null}
        </section>

        
      </div>

      {showNfeFields && fiscal.items.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">Itens</h2>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fiscal.items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="whitespace-normal">{item.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(item.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Análise de IA</h2>
          <p className="text-sm text-muted-foreground">
            {analysis ? `Última análise em ${formatDateTime(analysis.createdAt)}` : "Este documento ainda não foi analisado."}
          </p>
          {analysis && (
            <div className="flex items-center gap-2 pt-1">
              <AnalysisStatusBadge status={analysis.status} />
              {analysis.aiModel && <span className="text-xs text-muted-foreground">{analysis.aiModel}</span>}
            </div>
          )}
        </div>
        {analysis?.errorMessage && <p className="text-sm text-muted-foreground">{analysis.errorMessage}</p>}
        {analysis?.summary && (
          <p className="max-w-3xl border-l-2 border-brand pl-4 text-sm leading-relaxed whitespace-pre-line">{analysis.summary}</p>
        )}
      </section>
    </div>
  );
}
