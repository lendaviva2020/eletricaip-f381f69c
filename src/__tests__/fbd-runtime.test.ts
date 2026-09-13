import { describe, it, expect } from "vitest";
import { createInitialState, scanFbd, parseTimeLiteral } from "../lib/fbd/runtime";
import type { FbdBlock, FbdConnection } from "../lib/fbd/types";

function makePin(
  blockId: string,
  label: string,
  direction: "input" | "output",
  type: string = "BOOL",
): any {
  return { id: `${blockId}.${label}`, blockId, label, direction, type };
}

function makeBlock(
  id: string,
  kind: any,
  label: string,
  inputs: string[],
  outputs: string[],
  params: any = {},
): FbdBlock {
  const pins = [
    ...inputs.map((l) => makePin(id, l, "input")),
    ...outputs.map((l) => makePin(id, l, "output")),
  ];
  return { id, kind, label, position: { x: 0, y: 0 }, params, pins };
}

function connect(
  fromBlock: string,
  fromPin: string,
  toBlock: string,
  toPin: string,
): FbdConnection {
  return {
    id: `${fromBlock}.${fromPin}->${toBlock}.${toPin}`,
    sourcePin: `${fromBlock}.${fromPin}`,
    targetPin: `${toBlock}.${toPin}`,
  };
}

describe("FBD AND block", () => {
  it("returns true only when both inputs are true", () => {
    const block = makeBlock("b1", "AND", "AND1", ["IN1", "IN2"], ["OUT"]);
    const state = createInitialState();
    const r1 = scanFbd([block], [], { "b1.IN1": true, "b1.IN2": true }, state, 0);
    expect(r1.outputs["b1.OUT"]).toBe(true);
    const r2 = scanFbd([block], [], { "b1.IN1": true, "b1.IN2": false }, state, 0);
    expect(r2.outputs["b1.OUT"]).toBe(false);
    const r3 = scanFbd([block], [], { "b1.IN1": false, "b1.IN2": true }, state, 0);
    expect(r3.outputs["b1.OUT"]).toBe(false);
  });
});

describe("FBD OR block", () => {
  it("returns true when at least one input is true", () => {
    const block = makeBlock("b1", "OR", "OR1", ["IN1", "IN2"], ["OUT"]);
    const state = createInitialState();
    expect(
      scanFbd([block], [], { "b1.IN1": false, "b1.IN2": true }, state, 0).outputs["b1.OUT"],
    ).toBe(true);
    expect(
      scanFbd([block], [], { "b1.IN1": false, "b1.IN2": false }, state, 0).outputs["b1.OUT"],
    ).toBe(false);
  });
});

describe("FBD NOT block", () => {
  it("inverts input", () => {
    const block = makeBlock("b1", "NOT", "NOT1", ["IN"], ["OUT"]);
    const state = createInitialState();
    expect(scanFbd([block], [], { "b1.IN": true }, state, 0).outputs["b1.OUT"]).toBe(false);
    expect(scanFbd([block], [], { "b1.IN": false }, state, 0).outputs["b1.OUT"]).toBe(true);
  });
});

describe("FBD SR flip-flop", () => {
  it("set dominates reset", () => {
    const block = makeBlock("b1", "SR", "SR1", ["S", "R"], ["Q", "NQ"]);
    const state = createInitialState();
    // Set
    const r1 = scanFbd([block], [], { "b1.S": true, "b1.R": false }, state, 0);
    expect(r1.outputs["b1.Q"]).toBe(true);
    // Both active -> set dominates
    const r2 = scanFbd([block], [], { "b1.S": true, "b1.R": true }, state, 0);
    expect(r2.outputs["b1.Q"]).toBe(true);
    // Reset only
    const r3 = scanFbd([block], [], { "b1.S": false, "b1.R": true }, state, 0);
    expect(r3.outputs["b1.Q"]).toBe(false);
  });
});

describe("FBD TON timer", () => {
  it("fires after preset ms", () => {
    const block = makeBlock("b1", "TON", "TON1", ["IN", "PT"], ["Q", "ET"], { PT: "T#50ms" });
    const state = createInitialState();
    // Start timer
    const r1 = scanFbd([block], [], { "b1.IN": true }, state, 0);
    expect(r1.outputs["b1.Q"]).toBe(false);
    // Advance 30ms - not enough
    const r2 = scanFbd([block], [], { "b1.IN": true }, state, 30);
    expect(r2.outputs["b1.Q"]).toBe(false);
    // Advance 30ms more - should fire
    const r3 = scanFbd([block], [], { "b1.IN": true }, state, 30);
    expect(r3.outputs["b1.Q"]).toBe(true);
    expect(r3.outputs["b1.ET"]).toBe(60);
  });

  it("uses PT time literal and falls back when missing", () => {
    const block = makeBlock("b1", "TON", "TON1", ["IN", "PT"], ["Q", "ET"], { PT: "T#100ms" });
    const state = createInitialState();
    const r1 = scanFbd([block], [], { "b1.IN": true }, state, 0);
    expect(r1.outputs["b1.Q"]).toBe(false);
    const r2 = scanFbd([block], [], { "b1.IN": true }, state, 110);
    expect(r2.outputs["b1.Q"]).toBe(true);

    const fallback = makeBlock("b2", "TON", "TON2", ["IN", "PT"], ["Q", "ET"], {});
    const state2 = createInitialState();
    const f1 = scanFbd([fallback], [], { "b2.IN": true }, state2, 0);
    expect(f1.outputs["b2.Q"]).toBe(false);
    const f2 = scanFbd([fallback], [], { "b2.IN": true }, state2, 1001);
    expect(f2.outputs["b2.Q"]).toBe(true);
  });
});

describe("FBD CTU counter", () => {
  it("counts rising edges and fires at preset", () => {
    const block = makeBlock("b1", "CTU", "CTU1", ["CU", "R", "PV"], ["Q", "CV"], { preset: 3 });
    const state = createInitialState();
    const tick = (cu: boolean) =>
      scanFbd([block], [], { "b1.CU": cu, "b1.R": false }, state, 0).outputs;
    // Rising edge 1
    expect(tick(true)["b1.CV"]).toBe(1);
    expect(tick(false)["b1.CV"]).toBe(1);
    // Rising edge 2
    expect(tick(true)["b1.CV"]).toBe(2);
    expect(tick(false)["b1.CV"]).toBe(2);
    // Rising edge 3
    const r3 = tick(true);
    expect(r3["b1.CV"]).toBe(3);
    expect(r3["b1.Q"]).toBe(true);
  });
});

describe("FBD ADD block", () => {
  it("sums two numbers", () => {
    const block = makeBlock("b1", "ADD", "ADD1", ["IN1", "IN2"], ["OUT"]);
    const state = createInitialState();
    const r = scanFbd([block], [], { "b1.IN1": 10, "b1.IN2": 5 }, state, 0);
    expect(r.outputs["b1.OUT"]).toBe(15);
  });
});

describe("FBD GT comparator", () => {
  it("returns true when IN1 > IN2", () => {
    const block = makeBlock("b1", "GT", "GT1", ["IN1", "IN2"], ["OUT"]);
    const state = createInitialState();
    expect(scanFbd([block], [], { "b1.IN1": 10, "b1.IN2": 5 }, state, 0).outputs["b1.OUT"]).toBe(
      true,
    );
    expect(scanFbd([block], [], { "b1.IN1": 5, "b1.IN2": 10 }, state, 0).outputs["b1.OUT"]).toBe(
      false,
    );
  });
});

describe("FBD chained blocks", () => {
  it("AND output feeds OR input via connection", () => {
    const andBlock = makeBlock("and1", "AND", "AND1", ["IN1", "IN2"], ["OUT"]);
    const orBlock = makeBlock("or1", "OR", "OR1", ["IN1", "IN2"], ["OUT"]);
    const conn = connect("and1", "OUT", "or1", "IN1");
    const state = createInitialState();
    const r = scanFbd(
      [andBlock, orBlock],
      [conn],
      { "and1.IN1": true, "and1.IN2": true, "or1.IN2": false },
      state,
      0,
    );
    // AND outputs true, OR gets true on IN1 -> OUT = true
    expect(r.outputs["or1.OUT"]).toBe(true);
  });
});
