import { describe, expect, it } from "vitest";
import {
  compileFbd,
  createDefaultRegistry,
  FbdRuntime,
  FbdSimulation,
  type FbdConnectionModel,
  type FbdDocument,
  type FbdNodeModel,
  type FbdValue,
  type FbdVariable,
} from "@/lib/fbd/engine";

const reg = createDefaultRegistry();
let y = 0;
function n(id: string, blockType: string, params: Record<string, FbdValue> = {}): FbdNodeModel {
  y += 10;
  return { id, instanceName: id, blockType, networkId: "N1", params, position: { x: 0, y } };
}
function w(from: string, to: string): FbdConnectionModel {
  const [sn = "", sp = ""] = from.split(".");
  const [tn = "", tp = ""] = to.split(".");
  return { id: `${from}->${to}`, source: { nodeId: sn, port: sp }, target: { nodeId: tn, port: tp } };
}
function doc(nodes: FbdNodeModel[], connections: FbdConnectionModel[], variables: FbdVariable[]): FbdDocument {
  return {
    id: "d", name: "Teste", version: 1, cycleTimeMs: 100,
    networks: [{ id: "N1", name: "Rede 1", executionOrder: 1, enabled: true }],
    nodes, connections, variables,
  };
}
const boolVar = (name: string, direction: FbdVariable["direction"]): FbdVariable => ({ name, dataType: "BOOL", direction });

describe("FBD P0 · Compiler (validação)", () => {
  it("detecta bloco desconhecido e entrada obrigatória desconectada", () => {
    const r = compileFbd(doc([n("X", "FOO"), n("T1", "TON")], [], []), reg);
    expect(r.ok).toBe(false);
    expect(r.ir).toBeNull();
    const codes = r.diagnostics.map((d) => d.code);
    expect(codes).toContain("UNKNOWN_BLOCK");
    expect(codes).toContain("UNCONNECTED_INPUT");
  });

  it("detecta type mismatch REAL → BOOL e sugere conversão", () => {
    const r = compileFbd(
      doc([n("C", "CONST", { dataType: "REAL", value: 1.5 }), n("A", "NOT"), n("O", "VAR_OUT", { name: "Y" })],
        [w("C.OUT", "A.IN"), w("A.OUT", "O.IN")], [boolVar("Y", "output")]),
      reg,
    );
    const mm = r.diagnostics.find((d) => d.code === "TYPE_MISMATCH");
    expect(mm).toBeDefined();
  });

  it("detecta múltiplas fontes e conexão saída→saída", () => {
    const r = compileFbd(
      doc([n("A", "VAR_IN", { name: "A" }), n("B", "VAR_IN", { name: "B" }), n("G", "NOT")],
        [w("A.OUT", "G.IN"), w("B.OUT", "G.IN"), w("A.OUT", "B.OUT")], [boolVar("A", "input"), boolVar("B", "input")]),
      reg,
    );
    const codes = r.diagnostics.map((d) => d.code);
    expect(codes).toContain("MULTIPLE_DRIVERS");
    expect(codes).toContain("INVALID_CONNECTION");
  });

  it("detecta laço algébrico", () => {
    const r = compileFbd(doc([n("A", "NOT"), n("B", "NOT")], [w("A.OUT", "B.IN"), w("B.OUT", "A.IN")], []), reg);
    expect(r.diagnostics.filter((d) => d.code === "CYCLIC_DEPENDENCY")).toHaveLength(2);
  });

  it("insere conversão implícita segura INT → REAL e gera AST/IR em ordem topológica", () => {
    const r = compileFbd(
      doc(
        [n("S", "VAR_OUT", { name: "R" }), n("ADD1", "ADD"), n("I", "VAR_IN", { name: "I" }), n("K", "CONST", { dataType: "REAL", value: 0.5 })],
        [w("I.OUT", "ADD1.IN1"), w("K.OUT", "ADD1.IN2"), w("ADD1.OUT", "S.IN")],
        [{ name: "I", dataType: "INT", direction: "input", initialValue: 2 }, { name: "R", dataType: "REAL", direction: "output" }],
      ),
      reg,
    );
    expect(r.ok).toBe(true);
    expect(r.executionOrder.indexOf("ADD1")).toBeGreaterThan(r.executionOrder.indexOf("I"));
    expect(r.executionOrder.at(-1)).toBe("S");
    const add = r.ir?.instructions.find((i) => i.nodeId === "ADD1");
    expect(add?.binding).toBe("REAL");
    expect(add?.inputs.IN1).toMatchObject({ kind: "slot", convertTo: "REAL" });
    expect(r.ast?.networks[0]?.instances).toHaveLength(4);
    const rt = new FbdRuntime(r.ir!, reg);
    rt.scan(100);
    expect(rt.getVariable("R")).toBe(2.5);
  });
});

describe("FBD P0 · Runtime e Basic Simulation", () => {
  it("auto-retenção de motor (START/STOP) via variáveis", () => {
    const d = doc(
      [n("START", "VAR_IN", { name: "START" }), n("FB", "VAR_IN", { name: "MOTOR" }), n("STOP", "VAR_IN", { name: "STOP" }),
        n("OR1", "OR"), n("NOT1", "NOT"), n("AND1", "AND"), n("OUT", "VAR_OUT", { name: "MOTOR" })],
      [w("START.OUT", "OR1.IN1"), w("FB.OUT", "OR1.IN2"), w("STOP.OUT", "NOT1.IN"), w("OR1.OUT", "AND1.IN1"), w("NOT1.OUT", "AND1.IN2"), w("AND1.OUT", "OUT.IN")],
      [boolVar("START", "input"), boolVar("STOP", "input"), boolVar("MOTOR", "output")],
    );
    const r = compileFbd(d, reg);
    expect(r.ok).toBe(true);
    const rt = new FbdRuntime(r.ir!, reg);
    rt.setVariable("START", true); rt.scan(10);
    expect(rt.getVariable("MOTOR")).toBe(true);
    rt.setVariable("START", false); rt.scan(10);
    expect(rt.getVariable("MOTOR")).toBe(true);
    rt.setVariable("STOP", true); rt.scan(10);
    expect(rt.getVariable("MOTOR")).toBe(false);
  });

  it("TON com PT=T#500ms liga após 5 ciclos de 100 ms (simulação determinística)", () => {
    const d = doc(
      [n("IN", "VAR_IN", { name: "IN" }), n("T1", "TON", { PT: "T#500ms" }), n("Q", "VAR_OUT", { name: "Q" })],
      [w("IN.OUT", "T1.IN"), w("T1.Q", "Q.IN")],
      [boolVar("IN", "input"), boolVar("Q", "output")],
    );
    const r = compileFbd(d, reg);
    expect(r.ok).toBe(true);
    const rt = new FbdRuntime(r.ir!, reg);
    const sim = new FbdSimulation(rt, 100, () => () => undefined);
    rt.setVariable("IN", true);
    sim.runCycles(4);
    expect(rt.getVariable("Q")).toBe(false);
    expect(rt.read("T1", "ET")).toBe(400);
    sim.step();
    expect(rt.getVariable("Q")).toBe(true);
    rt.setVariable("IN", false);
    sim.step();
    expect(rt.getVariable("Q")).toBe(false);
    expect(rt.read("T1", "ET")).toBe(0);
    sim.reset();
    expect(rt.scans).toBe(0);
  });

  it("CTU conta bordas e estados não são compartilhados entre instâncias", () => {
    const d = doc(
      [n("CU", "VAR_IN", { name: "CU" }), n("C1", "CTU", { PV: 3 }), n("C2", "CTU", { PV: 3 })],
      [w("CU.OUT", "C1.CU")],
      [boolVar("CU", "input")],
    );
    const r = compileFbd(d, reg);
    expect(r.ok).toBe(true);
    const rt = new FbdRuntime(r.ir!, reg);
    for (let i = 0; i < 3; i++) {
      rt.setVariable("CU", true); rt.scan(10);
      rt.setVariable("CU", false); rt.scan(10);
    }
    expect(rt.read("C1", "CV")).toBe(3);
    expect(rt.read("C1", "Q")).toBe(true);
    expect(rt.read("C2", "CV")).toBe(0);
  });

  it("forçamento sobrepõe a saída e DIV por zero gera falha de runtime", () => {
    const d = doc(
      [n("A", "CONST", { dataType: "INT", value: 7 }), n("B", "CONST", { dataType: "INT", value: 0 }), n("D", "DIV")],
      [w("A.OUT", "D.IN1"), w("B.OUT", "D.IN2")],
      [],
    );
    const r = compileFbd(d, reg);
    expect(r.ok).toBe(true);
    const rt = new FbdRuntime(r.ir!, reg);
    const rep = rt.scan(10);
    expect(rep.faults[0]?.code).toBe("DIV_BY_ZERO");
    rt.force("D", "OUT", 42);
    rt.scan(10);
    expect(rt.read("D", "OUT")).toBe(42);
    expect(rt.isForced("D", "OUT")).toBe(true);
  });
});
