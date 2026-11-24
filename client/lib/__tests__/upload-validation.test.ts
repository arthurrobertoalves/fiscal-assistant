import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, validateUploadFile } from "../upload-validation";

describe("validateUploadFile", () => {
  it("aceita PDF e XML, sem diferenciar maiúsculas", () => {
    expect(validateUploadFile({ name: "nota.xml", size: 100 })).toBeNull();
    expect(validateUploadFile({ name: "CONTRATO.PDF", size: 100 })).toBeNull();
  });

  it("recusa arquivo vazio", () => {
    expect(validateUploadFile({ name: "nota.xml", size: 0 })).toMatch(/vazio/);
  });

  it("recusa arquivo acima do limite de 10 MB", () => {
    expect(validateUploadFile({ name: "nota.xml", size: MAX_UPLOAD_BYTES + 1 })).toMatch(/10 MB/);
    expect(validateUploadFile({ name: "nota.xml", size: MAX_UPLOAD_BYTES })).toBeNull();
  });

  it("recusa extensões que não são PDF nem XML", () => {
    expect(validateUploadFile({ name: "planilha.xlsx", size: 100 })).toMatch(/PDF ou XML/);
    expect(validateUploadFile({ name: "nota.xml.exe", size: 100 })).toMatch(/PDF ou XML/);
  });
});
