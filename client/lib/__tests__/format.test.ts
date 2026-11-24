import { describe, expect, it } from "vitest";
import { formatBytes, formatCurrency, formatDocument, formatLongDate } from "../format";

describe("formatação", () => {
  it("formata valores em reais no padrão brasileiro", () => {
    expect(formatCurrency(150)).toMatch(/150,00/);
    expect(formatCurrency(null)).toBe("—");
  });

  it("formata CNPJ e CPF; mantém valores fora do padrão", () => {
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
    expect(formatDocument("123")).toBe("123");
    expect(formatDocument(null)).toBe("—");
  });

  it("formata tamanhos de arquivo", () => {
    expect(formatBytes(631)).toBe("631 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("formata a data por extenso no fuso de São Paulo", () => {
    expect(formatLongDate(new Date("2026-11-23T15:00:00Z"))).toBe("23 de novembro de 2026");
  });
});
