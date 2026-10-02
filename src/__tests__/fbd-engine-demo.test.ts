// Demonstração ponta a ponta do bloco IEC 61131-3 TON (temporizador com atraso
// na energização): modelo → compilação (AST + IR) → simulação com ciclo fixo.
import { describe, expect, it } from "vitest";
import {
  compileFbd,
  createDefaultRegistry,
  FbdRuntime,
  FbdSimulation,
  type FbdDocument,
} from "@/lib/fbd/engine";

const doc: FbdDocument = {
  id: "demo-ton",
  name: "Partida temporizada",
  version: 1,
  cycleTimeMs: 100,
  networks: [{ id: "N1", name: "Rede 1", executionOrder: 1, enabled: true }],
  nodes: [
    {
      id: "IN",
      instanceName: "IN",
      blockType: "VAR_IN",
      networkId: "N1",
      params: { name: "START" },
      position: { x: 0, y: 0 },
    },
    {
      id: "T1",
      instanceName: "T1",
      blockType: "TON",
      networkId: "N1",
      params: { PT: "T#300ms" },
      position: { x: 100, y: 0 },
    },
    {
      id: "OUT",
      instanceName: "OUT",
      blockType: "VAR_OUT",
      networkId: "N1",
      params: { name: "MOTOR" },
      position: { x: 200, y: 0 },
    },
  ],
  connections: [
    { id: "c1", source: { nodeId: "IN", port: "OUT" }, target: { nodeId: "T1", port: "IN" } },
    { id: "c2", source: { nodeId: "T1", port: "Q" }, target: { nodeId: "OUT", port: "IN" } },
  ],
  variables: [
    { name: "START", dataType: "BOOL", direction: "input" },
    { name: "MOTOR", dataType: "BOOL", direction: "output" },
  ],
};

describe("FBD · demonstração TON (compilar + simular)", () => {
  it("gera AST e IR e liga MOTOR após 300 ms", () => {
    const reg = createDefaultRegistry();
    const r = compileFbd(doc, reg);
    if (process.env.FBD_DEMO) {
      console.log("AST:\n" + JSON.stringify(r.ast, null, 2));
      console.log("IR:\n" + JSON.stringify(r.ir, null, 2));
    }
    expect(r.ok).toBe(true);
    expect(r.executionOrder).toEqual(["IN", "T1", "OUT"]);

    const rt = new FbdRuntime(r.ir!, reg);
    const sim = new FbdSimulation(rt, doc.cycleTimeMs);
    rt.setVariable("START", true);
    const trace: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      sim.step();
      trace.push(rt.getVariable("MOTOR") === true);
    }
    if (process.env.FBD_DEMO) console.log("MOTOR por ciclo:", trace);
    expect(trace).toEqual([false, false, true, true]);
  });
});
