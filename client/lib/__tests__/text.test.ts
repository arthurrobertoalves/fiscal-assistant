import { describe, expect, it } from "vitest";
import { stripMarkdown } from "../text";

describe("stripMarkdown", () => {
  it("remove a negrito e mantém o texto", () => {
    expect(stripMarkdown("valor de **R$ 150,00** na nota **1234**")).toBe("valor de R$ 150,00 na nota 1234");
  });

  it("remove o itálico simples sem tocar em listas ou asteriscos isolados", () => {
    expect(stripMarkdown("o campo *totalAmount* do documento")).toBe("o campo totalAmount do documento");
    expect(stripMarkdown("2 * 3 = 6")).toBe("2 * 3 = 6");
  });

  it("não altera texto sem marcação", () => {
    expect(stripMarkdown("Resposta simples.")).toBe("Resposta simples.");
  });
});
