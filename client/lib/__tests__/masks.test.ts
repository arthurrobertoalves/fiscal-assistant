import { describe, expect, it } from "vitest";
import { cnpjMessage, emailMessage, isValidCnpj, isValidEmail, maskCnpj } from "../masks";

describe("maskCnpj", () => {
  it("formata enquanto digita e ignora o que não é dígito", () => {
    expect(maskCnpj("1")).toBe("1");
    expect(maskCnpj("112")).toBe("11.2");
    expect(maskCnpj("11222")).toBe("11.222");
    expect(maskCnpj("11222333")).toBe("11.222.333");
    expect(maskCnpj("11222333000")).toBe("11.222.333/000");
    expect(maskCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81");
    expect(maskCnpj("abc11x222")).toBe("11.222");
  });

  it("não passa de 14 dígitos", () => {
    expect(maskCnpj("112223330001819999")).toBe("11.222.333/0001-81");
  });
});

describe("isValidCnpj", () => {
  it("aceita CNPJ com formato e dígitos verificadores corretos", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.444.777/0001-61")).toBe(true);
  });

  it("recusa dígito verificador errado, formato incompleto e sequências repetidas", () => {
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("11222333000181")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-8")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("aceita emails comuns e recusa formatos inválidos", () => {
    expect(isValidEmail("ana@empresa.com")).toBe(true);
    expect(isValidEmail("  ana.silva+x@mail.empresa.com.br ")).toBe(true);
    expect(isValidEmail("ana@empresa")).toBe(false);
    expect(isValidEmail("ana empresa@x.com")).toBe(false);
    expect(isValidEmail("sem-arroba.com")).toBe(false);
  });
});

describe("mensagens de campo", () => {
  it("não mostra erro para campo vazio, mas mostra enquanto o valor está incompleto", () => {
    expect(cnpjMessage("")).toBeNull();
    expect(cnpjMessage("11.222")).toMatch(/14 dígitos/);
    expect(cnpjMessage("11.222.333/0001-82")).toMatch(/inválido/);
    expect(cnpjMessage("11.222.333/0001-81")).toBeNull();
    expect(emailMessage("ana@")).toMatch(/válido/);
    expect(emailMessage("ana@empresa.com")).toBeNull();
  });
});
