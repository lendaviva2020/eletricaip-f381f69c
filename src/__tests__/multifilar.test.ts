// Modo multifilar — inferência de condutores, geração e reversibilidade.
import { describe, expect, it } from "vitest";
import { applyCommand, invertCommand, type Command } from "@/lib/diagram/commands";
import { createEmptyDoc, makeEdge, makeNode } from "@/lib/diagram/model";
import {
  buildMultifilarCommands,
  clearMultifilarCommands,
  inferCircuitConfig,
} from "@/lib/diagram/multifilar";
import type {
  DiagramDoc,
  DiagramEdge,
  DiagramNode,
  NodeParams,
  SheetKind,
} from "@/lib/diagram/schema";

const node = (
  id: string,
  params: NodeParams,
  sheet: SheetKind = "unifilar",
  x = 0,
  y = 0,
): DiagramNode => makeNode({ id, sheet, params, position: { x, y }, label: id });

const edge = (
  id: string,
  source: string,
  target: string,
  sheet: SheetKind = "unifilar",
  extra: Partial<DiagramEdge> = {},
): DiagramEdge => makeEdge({ id, sheet, source, target, kind: "power", ...extra });

const docWith = (nodes: DiagramNode[], edges: DiagramEdge[]): DiagramDoc =>
  createEmptyDoc({
    sheets: ["unifilar", "multifilar", "ladder"],
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    edges: Object.fromEntries(edges.map((e) => [e.id, e])),
  });

describe("inferCircuitConfig", () => {
  it("ground → PE e neutral → N", () => {
    const breaker = node("b1", { kind: "breaker", in_A: 20, curve: "C", poles: 2 });
    const gnd = node("g1", { kind: "ground" });
    const neu = node("nn1", { kind: "neutral" });
    expect(inferCircuitConfig(edge("e1", "b1", "g1"), breaker, gnd)).toBe("PE");
    expect(inferCircuitConfig(edge("e2", "b1", "nn1"), breaker, neu)).toBe("N");
  });

  it("motor ligado a disjuntor → 3F", () => {
    const breaker = node("b1", { kind: "breaker", in_A: 20, curve: "C", poles: 2 });
    const motor = node("m1", { kind: "motor", power_kW: 5, voltage_V: 380, startMethod: "DOL" });
    expect(inferCircuitConfig(edge("e1", "b1", "m1"), breaker, motor)).toBe("3F");
  });

  it("socket sozinho → F+N", () => {
    const socket = node("s1", { kind: "socket", current_A: 10, voltage_V: 220 });
    expect(inferCircuitConfig(edge("e1", "s1", "x1"), socket, undefined)).toBe("F+N");
  });

  it("usa poles quando ambos os lados são dispositivos de passagem", () => {
    const breaker = node("b1", { kind: "breaker", in_A: 40, curve: "C", poles: 3 });
    const contactor = node("c1", { kind: "contactor", in_A: 40, coil_V: 24 });
    expect(inferCircuitConfig(edge("e1", "b1", "c1"), breaker, contactor)).toBe("3F");
  });

  it("fallback F+N sem informação útil", () => {
    const t1 = node("t1", { kind: "terminal" });
    const t2 = node("t2", { kind: "terminal" });
    expect(inferCircuitConfig(edge("e1", "t1", "t2"), t1, t2)).toBe("F+N");
  });

  it("circuitConfig explícito vence a inferência", () => {
    const gnd = node("g1", { kind: "ground" });
    const motor = node("m1", { kind: "motor", power_kW: 5, voltage_V: 380, startMethod: "DOL" });
    const e = edge("e1", "g1", "m1", "unifilar", { circuitConfig: "3F+N+PE" });
    expect(inferCircuitConfig(e, gnd, motor)).toBe("3F+N+PE");
  });
});

describe("buildMultifilarCommands", () => {
  it("clona nós e edges da unifilar com ids novos e config inferida", () => {
    const breaker = node("b1", { kind: "breaker", in_A: 20, curve: "C", poles: 2 });
    const motor = node("m1", { kind: "motor", power_kW: 5, voltage_V: 380, startMethod: "DOL" });
    const doc = docWith([breaker, motor], [edge("e1", "b1", "m1")]);

    const commands = buildMultifilarCommands(doc);
    const adds = commands.filter((c) => c.type === "AddNode");
    const addEdges = commands.filter((c) => c.type === "AddEdge");
    expect(adds).toHaveLength(2);
    expect(addEdges).toHaveLength(1);

    for (const c of adds) {
      if (c.type !== "AddNode") continue;
      expect(c.node.sheet).toBe("multifilar");
      expect(["b1", "m1"]).not.toContain(c.node.id);
    }
    const addedEdge = addEdges[0];
    if (addedEdge.type !== "AddEdge") throw new Error("esperado AddEdge");
    expect(addedEdge.edge.sheet).toBe("multifilar");
    expect(addedEdge.edge.id).not.toBe("e1");
    expect(addedEdge.edge.circuitConfig).toBe("3F");
    const newIds = adds.flatMap((c) => (c.type === "AddNode" ? [c.node.id] : []));
    expect(newIds).toContain(addedEdge.edge.source);
    expect(newIds).toContain(addedEdge.edge.target);
  });

  it("ignora nós/edges que já estão em multifilar ou ladder", () => {
    const doc = docWith(
      [
        node("mf1", { kind: "terminal" }, "multifilar"),
        node("mf2", { kind: "terminal" }, "multifilar"),
        node("ld1", { kind: "terminal" }, "ladder"),
        node("ld2", { kind: "terminal" }, "ladder"),
      ],
      [edge("emf", "mf1", "mf2", "multifilar"), edge("eld", "ld1", "ld2", "ladder")],
    );
    expect(buildMultifilarCommands(doc)).toEqual([]);
  });

  it("aplica o Batch e o inverte voltando ao estado original", () => {
    const breaker = node("b1", { kind: "breaker", in_A: 20, curve: "C", poles: 2 });
    const socket = node("s1", { kind: "socket", current_A: 10, voltage_V: 220 }, "unifilar", 80, 0);
    const original = docWith([breaker, socket], [edge("e1", "b1", "s1")]);

    const batch: Command = { type: "Batch", commands: buildMultifilarCommands(original) };
    const applied = applyCommand(original, batch);

    const mfNodes = Object.values(applied.nodes).filter((n) => n.sheet === "multifilar");
    const mfEdges = Object.values(applied.edges).filter((e) => e.sheet === "multifilar");
    expect(mfNodes).toHaveLength(2);
    expect(mfEdges).toHaveLength(1);
    expect(mfEdges[0].circuitConfig).toBe("F+N");

    const inverse = invertCommand(original, batch);
    expect(inverse).not.toBeNull();
    const reverted = applyCommand(applied, inverse as Command);
    expect(reverted.nodes).toEqual(original.nodes);
    expect(reverted.edges).toEqual(original.edges);
  });
});

describe("clearMultifilarCommands", () => {
  it("remove só o que está em multifilar", () => {
    const doc = docWith(
      [
        node("u1", { kind: "terminal" }),
        node("mf1", { kind: "terminal" }, "multifilar"),
        node("ld1", { kind: "terminal" }, "ladder"),
        node("ld2", { kind: "terminal" }, "ladder"),
      ],
      [edge("emf", "mf1", "mf1", "multifilar"), edge("eld", "ld1", "ld2", "ladder")],
    );

    const commands = clearMultifilarCommands(doc);
    expect(commands).toEqual([
      { type: "RemoveEdge", edgeId: "emf" },
      { type: "RemoveNode", nodeId: "mf1" },
    ]);

    const after = applyCommand(doc, { type: "Batch", commands });
    expect(Object.keys(after.nodes).sort()).toEqual(["ld1", "ld2", "u1"]);
    expect(Object.keys(after.edges)).toEqual(["eld"]);
  });
});
