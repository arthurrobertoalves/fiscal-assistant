import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { friendlyError } from "../error-messages";

describe("friendlyError", () => {
  it("traduz códigos conhecidos da API para uma explicação com o próximo passo", () => {
    expect(friendlyError(new ApiError("x", 401, "INVALID_CREDENTIALS"), "fallback")).toMatch(/confiram|Confira/);
    expect(friendlyError(new ApiError("x", 413, "FILE_TOO_LARGE"), "fallback")).toMatch(/10 MB/);
  });

  it("usa o texto de reserva para códigos desconhecidos, sem vazar detalhes técnicos", () => {
    expect(friendlyError(new ApiError("stack interna", 500, "INTERNAL_ERROR"), "Não foi possível agora.")).toBe("Não foi possível agora.");
  });

  it("explica falha de conexão quando a requisição nem chega à API", () => {
    expect(friendlyError(new TypeError("Failed to fetch"), "fallback")).toMatch(/conexão/);
  });
});
