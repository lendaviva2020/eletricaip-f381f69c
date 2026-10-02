import { describe, expect, it } from "vitest";
import type { Edge, Node } from "reactflow";
import {
  editorSpecFor,
  editorToFbdDocument,
  getFbdRegistry,
  inputVariableName,
  parseParamValue,
} from "@/lib/fbd/editor-bridge";
import { compileFbd, FbdRuntime, FbdSimulation } from "@/lib/fbd/engine";

const reg = getFbdRegistry();
function block(id: string, type: string, y: number, params?: Record<string, string>): Node {
  const def = reg.get(type);
  if (!def) throw new Error(type);
  const spec = editorSpecFor(def);
  return {
    id,
    type: "fbdBlock",
    position: { x: 0, y },
    data: { label: id, ...spec, params: params ?? spec.params },
  };
}
const edge = (s: string, sh: string, t: string, th: string): Edge => ({
  id: `${s}.${sh}-${t}.${th}`,
  source: s,
  sourceHandle: sh,
  target: t,
  targetHandle: th,
});

describe("Ponte editor FBD → motor IEC", () => {
  it("converte literais digitados no editor", () => {
    expect(parseParamValue("10")).toBe(10);
    expect(parseParamValue("TRUE")).toBe(true);
    expect(parseParamValue("T#5s")).toBe("T#5s");
  });

  it("pinos do editor vêm do registry e incluem EN/ENO", () => {
    const spec = editorSpecFor(reg.get("TON")!);
    expect(spec.inputs.map((p) => p.label)).toEqual(["IN", "PT", "EN"]);
    expect(spec.outputs.map((p) => p.label)).toEqual(["Q", "ET", "ENO"]);
    expect(spec.params).toEqual({ PT: "T#1s" });
  });

  it("compila o diagrama do editor e simula TON → NOT com EN/ENO", () => {
    const nodes = [block("TON_1", "TON", 0, { PT: "T#200ms" }), block("NOT_1", "NOT", 100)];
    const { doc, inputs } = editorToFbdDocument(nodes, [edge("TON_1", "Q", "NOT_1", "IN")], {
      name: "t",
      cycleTimeMs: 100,
    });
    expect(inputs.map((i) => `${i.nodeId}.${i.port}`)).toEqual([
      "TON_1.IN",
      "TON_1.EN",
      "NOT_1.EN",
    ]);
    const r = compileFbd(doc, reg);
    expect(r.ok).toBe(true);
    expect(r.ast?.networks[0]?.instances.find((i) => i.nodeId === "TON_1")?.inputs.EN).toEqual({
      kind: "PortRef",
      nodeId: `__in_${inputVariableName("TON_1", "EN")}`,
      port: "OUT",
    });
    const ton = r.ir?.instructions.find((i) => i.nodeId === "TON_1");
    expect(ton?.outputs.ENO?.type).toBe("BOOL");

    const rt = new FbdRuntime(r.ir!, reg);
    const sim = new FbdSimulation(rt, 100);
    rt.setVariable(inputVariableName("TON_1", "IN"), true);
    sim.runCycles(2);
    expect(rt.read("TON_1", "Q")).toBe(true);
    expect(rt.read("NOT_1", "OUT")).toBe(false);
    expect(rt.read("TON_1", "ENO")).toBe(true);

    // EN = FALSE: bloco congela saídas e ENO = FALSE.
    rt.setVariable(inputVariableName("NOT_1", "EN"), false);
    rt.setVariable(inputVariableName("TON_1", "IN"), false);
    sim.step();
    expect(rt.read("NOT_1", "ENO")).toBe(false);
    expect(rt.read("NOT_1", "OUT")).toBe(false);
    expect(rt.read("TON_1", "Q")).toBe(false);
  });

  it("snapshot salvo permite continuar a simulação após reabrir", () => {
    const nodes = [block("TON_1", "TON", 0, { PT: "T#500ms" })];
    const { doc } = editorToFbdDocument(nodes, [], { name: "t", cycleTimeMs: 100 });
    const r = compileFbd(doc, reg);
    const rt = new FbdRuntime(r.ir!, reg);
    rt.setVariable(inputVariableName("TON_1", "IN"), true);
    rt.scan(100);
    rt.scan(100);
    rt.scan(100);
    const saved = JSON.parse(JSON.stringify(rt.exportSnapshot()));

    const reopened = new FbdRuntime(r.ir!, reg);
    reopened.restoreSnapshot(saved);
    reopened.setVariable(inputVariableName("TON_1", "IN"), true);
    expect(reopened.scans).toBe(3);
    reopened.scan(100);
    expect(reopened.read("TON_1", "Q")).toBe(false);
    reopened.scan(100);
    expect(reopened.read("TON_1", "Q")).toBe(true);
  });
});
