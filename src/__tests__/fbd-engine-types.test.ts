import { describe, expect, it } from "vitest";
import {
  canImplicitlyConvert,
  coerceValue,
  matchesType,
  parseFbdDocument,
  parseTimeLiteral,
  createDefaultRegistry,
  BlockRegistry,
} from "@/lib/fbd/engine";

describe("FBD P0 · Data Types", () => {
  it("parseia literais de tempo IEC", () => {
    expect(parseTimeLiteral("T#5s")).toBe(5000);
    expect(parseTimeLiteral("TIME#1h2m3s4ms")).toBe(3_723_004);
    expect(parseTimeLiteral("T#1.5s")).toBe(1500);
    expect(parseTimeLiteral("T#5x")).toBeNull();
  });
  it("aceita apenas alargamentos sem perda", () => {
    expect(canImplicitlyConvert("INT", "DINT")).toBe(true);
    expect(canImplicitlyConvert("INT", "REAL")).toBe(true);
    expect(canImplicitlyConvert("DINT", "REAL")).toBe(false);
    expect(canImplicitlyConvert("REAL", "BOOL")).toBe(false);
    expect(canImplicitlyConvert("REAL", "INT")).toBe(false);
  });
  it("resolve membros de tipos genéricos", () => {
    expect(matchesType("INT", "ANY_NUM")).toBe(true);
    expect(matchesType("BOOL", "ANY_NUM")).toBe(false);
    expect(matchesType("WORD", "ANY_BIT")).toBe(true);
  });
  it("faz wrap de inteiros pela largura de bits", () => {
    expect(coerceValue(32768, "INT")).toBe(-32768);
    expect(coerceValue(256, "USINT")).toBe(0);
    expect(coerceValue(-1, "UINT")).toBe(65535);
    expect(coerceValue(3.9, "INT")).toBe(3);
  });
});

describe("FBD P0 · Domain Model", () => {
  it("rejeita documento externo inválido", () => {
    const r = parseFbdDocument({ id: "x", name: "", networks: [] });
    expect(r.ok).toBe(false);
  });
});

describe("FBD P0 · Block Registry", () => {
  it("registra a biblioteca IEC sem duplicatas", () => {
    const reg = createDefaultRegistry();
    for (const t of [
      "AND",
      "TON",
      "TOF",
      "TP",
      "CTU",
      "CTD",
      "CTUD",
      "R_TRIG",
      "SEL",
      "LIMIT",
      "REAL_TO_INT",
    ]) {
      expect(reg.has(t)).toBe(true);
    }
  });
  it("impede registro duplicado", () => {
    const reg = createDefaultRegistry();
    const and = reg.get("AND");
    expect(and).toBeDefined();
    const fresh = new BlockRegistry();
    if (and) {
      fresh.register(and);
      expect(() => fresh.register(and)).toThrow();
    }
  });
});
