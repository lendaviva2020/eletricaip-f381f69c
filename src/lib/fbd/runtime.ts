import type { FbdBlock, FbdConnection, FbdBlockKind } from "./types";

const TIME_UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

/** Converte um literal de tempo IEC 61131-3 (ex: "T#5s", "T#1m30s",
 * "T#500ms") em milissegundos. Aceita número puro como passagem direta
 * (compat). Retorna fallbackMs se não conseguir interpretar. */
export function parseTimeLiteral(v: unknown, fallbackMs = 1000): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return fallbackMs;
  const body = v.trim().replace(/^t#/i, "");
  const re = /(\d+(?:\.\d+)?)\s*(ms|s|m|h)/gi;
  let total = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    matched = true;
    total += parseFloat(m[1]) * TIME_UNIT_MS[m[2].toLowerCase()];
  }
  return matched ? total : fallbackMs;
}

export interface FbdRuntimeState {
  blockOutputs: Record<string, Record<string, any>>;
  timerStates: Record<string, { accum: number; running: boolean; done: boolean; prevIn: boolean }>;
  counterStates: Record<string, { count: number; done: boolean; prevCu: boolean; prevCd: boolean }>;
  srStates: Record<string, boolean>;
}

export interface FbdScanResult {
  outputs: Record<string, any>;
  state: FbdRuntimeState;
}

const TYPES = ["BOOL", "INT", "REAL", "TIME", "ANY"] as const;

function getPinOutput(
  blockId: string,
  pinId: string,
  outputs: Record<string, Record<string, any>>,
): any {
  return outputs[blockId]?.[pinId] ?? false;
}

function setPinOutput(
  blockId: string,
  pinLabel: string,
  value: any,
  outputs: Record<string, Record<string, any>>,
) {
  if (!outputs[blockId]) outputs[blockId] = {};
  outputs[blockId][pinLabel] = value;
}

function findPin(block: FbdBlock, label: string) {
  return block.pins.find((p) => p.label === label);
}

function getInputValue(
  block: FbdBlock,
  pinLabel: string,
  connections: FbdConnection[],
  outputs: Record<string, Record<string, any>>,
  defaultVal: any = false,
): any {
  const pin = findPin(block, pinLabel);
  if (!pin) return defaultVal;
  const conn = connections.find((c) => c.targetPin === pin.id);
  if (conn) {
    const val = getPinOutput(conn.sourcePin.split(".")[0], conn.sourcePin.split(".")[1], outputs);
    if (val !== undefined) return val;
  }
  // Fallback: check direct external input stored in outputs
  const direct = outputs[block.id]?.[pinLabel];
  return direct !== undefined ? direct : defaultVal;
}

export function createInitialState(): FbdRuntimeState {
  return {
    blockOutputs: {},
    timerStates: {},
    counterStates: {},
    srStates: {},
  };
}

export function scanFbd(
  blocks: FbdBlock[],
  connections: FbdConnection[],
  inputs: Record<string, any>,
  state: FbdRuntimeState,
  dtMs: number,
): FbdScanResult {
  const outputs: Record<string, Record<string, any>> = { ...state.blockOutputs };

  // Initialize virtual pin outputs from external inputs
  for (const [pinId, value] of Object.entries(inputs)) {
    const [blockId] = pinId.split(".");
    if (!outputs[blockId]) outputs[blockId] = {};
    outputs[blockId][pinId.split(".")[1]] = value;
  }

  for (const block of blocks) {
    const kind: FbdBlockKind = block.kind;

    switch (kind) {
      case "AND": {
        const a = getInputValue(block, "IN1", connections, outputs);
        const b = getInputValue(block, "IN2", connections, outputs);
        setPinOutput(block.id, "OUT", Boolean(a) && Boolean(b), outputs);
        break;
      }
      case "OR": {
        const a = getInputValue(block, "IN1", connections, outputs);
        const b = getInputValue(block, "IN2", connections, outputs);
        setPinOutput(block.id, "OUT", Boolean(a) || Boolean(b), outputs);
        break;
      }
      case "NOT": {
        const a = getInputValue(block, "IN", connections, outputs);
        setPinOutput(block.id, "OUT", !a, outputs);
        break;
      }
      case "XOR": {
        const a = getInputValue(block, "IN1", connections, outputs);
        const b = getInputValue(block, "IN2", connections, outputs);
        setPinOutput(block.id, "OUT", Boolean(a) !== Boolean(b), outputs);
        break;
      }
      case "SR": {
        const s = Boolean(getInputValue(block, "S", connections, outputs));
        const r = Boolean(getInputValue(block, "R", connections, outputs));
        let q = state.srStates[block.id] ?? false;
        if (s) q = true;
        else if (r) q = false;
        state.srStates[block.id] = q;
        setPinOutput(block.id, "Q", q, outputs);
        setPinOutput(block.id, "NQ", !q, outputs);
        break;
      }
      case "RS": {
        const s = Boolean(getInputValue(block, "S", connections, outputs));
        const r = Boolean(getInputValue(block, "R", connections, outputs));
        let q = state.srStates[block.id] ?? false;
        if (r) q = false;
        else if (s) q = true;
        state.srStates[block.id] = q;
        setPinOutput(block.id, "Q", q, outputs);
        setPinOutput(block.id, "NQ", !q, outputs);
        break;
      }
      case "TON": {
        const preset = parseTimeLiteral(block.params.PT, 1000);
        const ts = state.timerStates[block.id] ?? {
          accum: 0,
          running: false,
          done: false,
          prevIn: false,
        };
        const ena = Boolean(getInputValue(block, "IN", connections, outputs));
        if (ena && !ts.prevIn) {
          ts.accum = 0;
          ts.running = true;
          ts.done = false;
        }
        if (!ena) {
          ts.running = false;
          ts.accum = 0;
          ts.done = false;
        }
        if (ts.running && !ts.done) {
          ts.accum += dtMs;
          if (ts.accum >= preset) {
            ts.done = true;
            ts.running = false;
          }
        }
        ts.prevIn = ena;
        state.timerStates[block.id] = ts;
        setPinOutput(block.id, "Q", ts.done, outputs);
        setPinOutput(block.id, "ET", ts.accum, outputs);
        break;
      }
      case "CTU": {
        const preset = Number(block.params.PV) || 10;
        const cs = state.counterStates[block.id] ?? {
          count: 0,
          done: false,
          prevCu: false,
          prevCd: false,
        };
        const cu = Boolean(getInputValue(block, "CU", connections, outputs));
        const r = Boolean(getInputValue(block, "R", connections, outputs));
        if (r) {
          cs.count = 0;
          cs.done = false;
        }
        if (cu && !cs.prevCu) {
          cs.count++;
          if (cs.count >= preset) {
            cs.done = true;
          }
        }
        cs.prevCu = cu;
        state.counterStates[block.id] = cs;
        setPinOutput(block.id, "Q", cs.done, outputs);
        setPinOutput(block.id, "CV", cs.count, outputs);
        break;
      }
      case "ADD": {
        const a = Number(getInputValue(block, "IN1", connections, outputs, 0));
        const b = Number(getInputValue(block, "IN2", connections, outputs, 0));
        setPinOutput(block.id, "OUT", a + b, outputs);
        break;
      }
      case "SUB": {
        const a = Number(getInputValue(block, "IN1", connections, outputs, 0));
        const b = Number(getInputValue(block, "IN2", connections, outputs, 0));
        setPinOutput(block.id, "OUT", a - b, outputs);
        break;
      }
      case "MUL": {
        const a = Number(getInputValue(block, "IN1", connections, outputs, 0));
        const b = Number(getInputValue(block, "IN2", connections, outputs, 0));
        setPinOutput(block.id, "OUT", a * b, outputs);
        break;
      }
      case "DIV": {
        const a = Number(getInputValue(block, "IN1", connections, outputs, 0));
        const b = Number(getInputValue(block, "IN2", connections, outputs, 0));
        setPinOutput(block.id, "OUT", b !== 0 ? a / b : 0, outputs);
        break;
      }
      case "GT": {
        const a = Number(getInputValue(block, "IN1", connections, outputs, 0));
        const b = Number(getInputValue(block, "IN2", connections, outputs, 0));
        setPinOutput(block.id, "OUT", a > b, outputs);
        break;
      }
      case "LT": {
        const a = Number(getInputValue(block, "IN1", connections, outputs, 0));
        const b = Number(getInputValue(block, "IN2", connections, outputs, 0));
        setPinOutput(block.id, "OUT", a < b, outputs);
        break;
      }
      case "EQ": {
        const a = Number(getInputValue(block, "IN1", connections, outputs, 0));
        const b = Number(getInputValue(block, "IN2", connections, outputs, 0));
        setPinOutput(block.id, "OUT", a === b, outputs);
        break;
      }
      case "TOF": {
        const preset = parseTimeLiteral(block.params.PT, 1000);
        const ts = state.timerStates[block.id] ?? {
          accum: 0,
          running: false,
          done: false,
          prevIn: false,
        };
        const ena = Boolean(getInputValue(block, "IN", connections, outputs));
        if (ena && !ts.prevIn) {
          ts.accum = 0;
          ts.running = false;
          ts.done = true;
        }
        if (!ena && ts.prevIn) {
          ts.accum = 0;
          ts.running = true;
        }
        if (!ena && ts.running) {
          ts.accum += dtMs;
          if (ts.accum >= preset) {
            ts.done = false;
            ts.running = false;
          }
        }
        ts.prevIn = ena;
        state.timerStates[block.id] = ts;
        setPinOutput(block.id, "Q", ena || ts.running, outputs);
        setPinOutput(block.id, "ET", ts.accum, outputs);
        break;
      }
      case "TP": {
        const preset = parseTimeLiteral(block.params.PT, 1000);
        const ts = state.timerStates[block.id] ?? {
          accum: 0,
          running: false,
          done: false,
          prevIn: false,
        };
        const ena = Boolean(getInputValue(block, "IN", connections, outputs));
        if (ena && !ts.prevIn && !ts.running) {
          ts.accum = 0;
          ts.running = true;
          ts.done = false;
        }
        if (ts.running) {
          ts.accum += dtMs;
          if (ts.accum >= preset) {
            ts.running = false;
            ts.done = false;
          }
        }
        ts.prevIn = ena;
        state.timerStates[block.id] = ts;
        setPinOutput(block.id, "Q", ts.running, outputs);
        setPinOutput(block.id, "ET", ts.accum, outputs);
        break;
      }
      case "CTD": {
        const preset = Number(block.params.PV) || 10;
        const cs = state.counterStates[block.id] ?? {
          count: preset,
          done: false,
          prevCu: false,
          prevCd: false,
        };
        const cd = Boolean(getInputValue(block, "CD", connections, outputs));
        const ld = Boolean(getInputValue(block, "LD", connections, outputs));
        if (ld) {
          cs.count = preset;
          cs.done = false;
        }
        if (cd && !cs.prevCd) {
          cs.count--;
          if (cs.count <= 0) {
            cs.done = true;
          }
        }
        cs.prevCd = cd;
        state.counterStates[block.id] = cs;
        setPinOutput(block.id, "Q", cs.done, outputs);
        setPinOutput(block.id, "CV", cs.count, outputs);
        break;
      }
      case "GE": {
        const a = Number(getInputValue(block, "IN1", connections, outputs, 0));
        const b = Number(getInputValue(block, "IN2", connections, outputs, 0));
        setPinOutput(block.id, "OUT", a >= b, outputs);
        break;
      }
      case "LE": {
        const a = Number(getInputValue(block, "IN1", connections, outputs, 0));
        const b = Number(getInputValue(block, "IN2", connections, outputs, 0));
        setPinOutput(block.id, "OUT", a <= b, outputs);
        break;
      }
      case "NE": {
        const a = Number(getInputValue(block, "IN1", connections, outputs, 0));
        const b = Number(getInputValue(block, "IN2", connections, outputs, 0));
        setPinOutput(block.id, "OUT", a !== b, outputs);
        break;
      }
      case "MOVE": {
        const en = Boolean(getInputValue(block, "EN", connections, outputs));
        const val = getInputValue(block, "IN", connections, outputs, 0);
        setPinOutput(block.id, "OUT", en ? val : 0, outputs);
        break;
      }
      case "SEL": {
        const g = Boolean(getInputValue(block, "G", connections, outputs));
        const a = getInputValue(block, "IN1", connections, outputs, 0);
        const b = getInputValue(block, "IN2", connections, outputs, 0);
        setPinOutput(block.id, "OUT", g ? b : a, outputs);
        break;
      }
    }
  }

  const resultOutputs: Record<string, any> = {};
  for (const block of blocks) {
    for (const pin of block.pins) {
      if (pin.direction === "output") {
        resultOutputs[`${block.id}.${pin.label}`] = outputs[block.id]?.[pin.label] ?? false;
      }
    }
  }

  return { outputs: resultOutputs, state: { ...state, blockOutputs: outputs } };
}
