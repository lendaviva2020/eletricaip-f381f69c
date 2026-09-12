import { describe, it, expect } from "vitest";
import { canAddModule, validateRack } from "@/lib/plc/rack-validation";
import type { PlcRack, PlcModule, ModuleCategory } from "@/lib/plc/types";

function makeRack(modules: PlcModule[]): PlcRack {
  return { id: "rack-1", label: "Rack Principal", modules };
}

function makeModule(category: ModuleCategory, slot: number, label = "Mod"): PlcModule {
  return {
    id: `mod-${category}-${slot}`,
    catalogKey: "generic",
    category,
    label,
    description: "Test module",
    slot,
    channels: category === "di" || category === "do" ? 8 : 0,
    params: {},
  };
}

describe("validateRack", () => {
  it("rack vazio não emite aviso de fonte", () => {
    const issues = validateRack(makeRack([]));
    expect(issues).toHaveLength(0);
  });

  it("detecta rack sem CPU", () => {
    const rack = makeRack([makeModule("di", 1)]);
    const issues = validateRack(rack);
    expect(issues).toEqual([
      { level: "error", message: "Rack sem CPU configurada." },
      { level: "warning", message: "Rack sem módulo de fonte de alimentação (PS)." },
    ]);
  });

  it("detecta rack com 2 CPUs", () => {
    const rack = makeRack([
      makeModule("cpu", 1, "CPU 1"),
      makeModule("cpu", 2, "CPU 2"),
      makeModule("power", 3),
    ]);
    const issues = validateRack(rack);
    expect(issues).toEqual([
      { level: "error", message: "Rack com 2 CPUs — apenas uma é suportada." },
    ]);
  });

  it("avisa quando CPU não ocupa o primeiro slot", () => {
    const rack = makeRack([makeModule("di", 1), makeModule("cpu", 2), makeModule("power", 3)]);
    const issues = validateRack(rack);
    expect(issues).toEqual([
      { level: "warning", message: "A CPU deveria ocupar o primeiro slot do rack." },
    ]);
  });

  it("avisa rack sem fonte de alimentação", () => {
    const rack = makeRack([makeModule("cpu", 1), makeModule("di", 2)]);
    const issues = validateRack(rack);
    expect(issues).toEqual([
      { level: "warning", message: "Rack sem módulo de fonte de alimentação (PS)." },
    ]);
  });

  it("rack válido (CPU no slot 1 + fonte) retorna zero issues", () => {
    const rack = makeRack([makeModule("cpu", 1), makeModule("power", 2), makeModule("di", 3)]);
    expect(validateRack(rack)).toHaveLength(0);
  });
});

describe("canAddModule", () => {
  it("permite adicionar qualquer módulo exceto CPU repetida", () => {
    const rack = makeRack([makeModule("cpu", 1)]);
    const allowedCategories: ModuleCategory[] = ["di", "do", "ai", "ao", "comm", "power"];
    for (const category of allowedCategories) {
      expect(canAddModule(rack, category)).toEqual({ allowed: true });
    }
  });

  it("bloqueia segunda CPU", () => {
    const rack = makeRack([makeModule("cpu", 1)]);
    const result = canAddModule(rack, "cpu");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Só é permitida uma CPU por rack.");
  });

  it("permite primeira CPU", () => {
    const rack = makeRack([]);
    expect(canAddModule(rack, "cpu")).toEqual({ allowed: true });
  });
});
