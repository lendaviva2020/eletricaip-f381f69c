import { describe, expect, it } from "vitest";
import { isSafeRedirect } from "@/lib/safe-redirect";

describe("isSafeRedirect", () => {
  it("aceita caminhos relativos comuns", () => {
    expect(isSafeRedirect("/dashboard")).toBe(true);
    expect(isSafeRedirect("/invite/abc?x=1")).toBe(true);
    expect(isSafeRedirect("/workspace/projeto-123")).toBe(true);
  });

  it("rejeita URLs protocol-relative", () => {
    expect(isSafeRedirect("//evil.com")).toBe(false);
    expect(isSafeRedirect("//evil.com/dashboard")).toBe(false);
  });

  it("rejeita barras invertidas protocol-relative", () => {
    expect(isSafeRedirect("/\\evil.com")).toBe(false);
    expect(isSafeRedirect("/\\evil.com/dashboard")).toBe(false);
  });

  it("rejeita URLs absolutas e esquemas arbitrários", () => {
    expect(isSafeRedirect("https://evil.com")).toBe(false);
    expect(isSafeRedirect("http://localhost/dashboard")).toBe(false);
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false);
    expect(isSafeRedirect("mailto:test@example.com")).toBe(false);
  });

  it("rejeita string vazia e valores não-string", () => {
    expect(isSafeRedirect("")).toBe(false);
    expect(isSafeRedirect(undefined)).toBe(false);
    expect(isSafeRedirect(null)).toBe(false);
    expect(isSafeRedirect(123)).toBe(false);
    expect(isSafeRedirect({})).toBe(false);
    expect(isSafeRedirect(["/dashboard"])).toBe(false);
  });
});
