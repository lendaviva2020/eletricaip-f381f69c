/**
 * Ponte editor visual ⇄ Domain Model do motor FBD.
 * O editor (ReactFlow) só representa o diagrama; esta camada traduz nós/arestas
 * para `FbdDocument` sem lógica de execução — a semântica fica no motor.
 */
import type { Edge, Node } from "reactflow";
import {
  createDefaultRegistry,
  effectiveInputs,
  effectiveOutputs,
  type BlockDefinition,
  type BlockRegistry,
  type FbdConnectionModel,
  type FbdDocument,
  type FbdNodeModel,
  type FbdValue,
  type FbdVariable,
  type PortDef,
} from "@/lib/fbd/engine";

export interface EditorPin {
  id: string;
  label: string;
  type: string;
}

export interface EditorBlockData {
  label: string;
  type: string;
  inputs: EditorPin[];
  outputs: EditorPin[];
  params?: Record<string, string | number | boolean>;
}

export interface SimInputBinding {
  readonly variable: string;
  readonly nodeId: string;
  readonly port: string;
}

export interface BridgeResult {
  readonly doc: FbdDocument;
  readonly inputs: readonly SimInputBinding[];
}

const NETWORK_ID = "N1";

let sharedRegistry: BlockRegistry | null = null;
/** Registry único da aplicação (biblioteca IEC + blocos de sistema). */
export function getFbdRegistry(): BlockRegistry {
  sharedRegistry ??= createDefaultRegistry();
  return sharedRegistry;
}

/** Blocos disponíveis na paleta: tudo do registry, menos os blocos de sistema. */
export function paletteDefinitions(registry: BlockRegistry = getFbdRegistry()) {
  return registry.list().filter((d) => d.namespace !== "SYSTEM");
}

export function isEditorBlockData(x: unknown): x is EditorBlockData {
  if (typeof x !== "object" || x === null) return false;
  const d = x as Record<string, unknown>;
  return typeof d.type === "string" && Array.isArray(d.inputs) && Array.isArray(d.outputs);
}

export function sanitizeIdentifier(raw: string): string {
  const s = raw.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(s) ? s : `_${s}`;
}

export function inputVariableName(nodeId: string, port: string): string {
  return `${sanitizeIdentifier(nodeId)}_${port}`;
}

/** Converte o texto digitado no editor em literal: número, BOOL ou string (ex.: T#5s). */
export function parseParamValue(v: string | number | boolean): FbdValue {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (/^true$/i.test(t)) return true;
  if (/^false$/i.test(t)) return false;
  if (t !== "" && /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return Number(t);
  return t;
}

function defaultParamText(p: PortDef): string {
  if (p.type === "TIME") return "T#1s";
  if (p.defaultValue !== undefined) return String(p.defaultValue);
  return "0";
}

/** Pinos e parâmetros iniciais de um bloco recém-solto no canvas (derivados do registry). */
export function editorSpecFor(def: BlockDefinition): Omit<EditorBlockData, "label"> {
  const inputs = effectiveInputs(def).map((p) => ({ id: p.name, label: p.name, type: p.type }));
  const outputs = effectiveOutputs(def).map((p) => ({ id: p.name, label: p.name, type: p.type }));
  const params: Record<string, string> = {};
  for (const p of def.inputs) if (p.type !== "BOOL") params[p.name] = defaultParamText(p);
  return {
    type: def.type,
    inputs,
    outputs,
    params: Object.keys(params).length > 0 ? params : undefined,
  };
}

function portOf(pins: readonly EditorPin[], handle: string | null | undefined): string {
  const pin = pins.find((p) => p.id === handle);
  return (pin?.label ?? handle ?? "").toUpperCase();
}

export function editorToFbdDocument(
  nodes: readonly Node[],
  edges: readonly Edge[],
  opts: { name: string; cycleTimeMs: number; registry?: BlockRegistry },
): BridgeResult {
  const registry = opts.registry ?? getFbdRegistry();
  const dataById = new Map<string, EditorBlockData>();
  const models: FbdNodeModel[] = [];
  for (const n of nodes) {
    if (!isEditorBlockData(n.data)) continue;
    dataById.set(n.id, n.data);
    const params: Record<string, FbdValue> = {};
    for (const [key, val] of Object.entries(n.data.params ?? {}))
      params[key] = parseParamValue(val);
    models.push({
      id: n.id,
      instanceName: sanitizeIdentifier(n.id),
      blockType: n.data.type,
      networkId: NETWORK_ID,
      params,
      position: { x: n.position.x, y: n.position.y },
    });
  }

  const connections: FbdConnectionModel[] = [];
  const driven = new Set<string>();
  for (const e of edges) {
    const src = dataById.get(e.source);
    const dst = dataById.get(e.target);
    const sourcePort = src ? portOf(src.outputs, e.sourceHandle) : (e.sourceHandle ?? "");
    const targetPort = dst ? portOf(dst.inputs, e.targetHandle) : (e.targetHandle ?? "");
    connections.push({
      id: e.id,
      source: { nodeId: e.source, port: sourcePort },
      target: { nodeId: e.target, port: targetPort },
    });
    driven.add(`${e.target}::${targetPort}`);
  }

  // Entradas BOOL livres viram variáveis de entrada do POU — o usuário as
  // aciona no painel de simulação (inclusive EN, que inicia em TRUE).
  const variables: FbdVariable[] = [];
  const inputs: SimInputBinding[] = [];
  for (const m of [...models]) {
    const def = registry.get(m.blockType);
    if (!def || def.namespace === "SYSTEM") continue;
    for (const p of effectiveInputs(def)) {
      if (p.type !== "BOOL" || driven.has(`${m.id}::${p.name}`) || m.params[p.name] !== undefined)
        continue;
      const variable = inputVariableName(m.id, p.name);
      variables.push({
        name: variable,
        dataType: "BOOL",
        direction: "input",
        initialValue: p.name === "EN",
      });
      const inId = `__in_${variable}`;
      models.push({
        id: inId,
        instanceName: `_in_${variable}`,
        blockType: "VAR_IN",
        networkId: NETWORK_ID,
        params: { name: variable },
        position: { x: m.position.x - 120, y: m.position.y },
      });
      connections.push({
        id: `__w_${variable}`,
        source: { nodeId: inId, port: "OUT" },
        target: { nodeId: m.id, port: p.name },
      });
      inputs.push({ variable, nodeId: m.id, port: p.name });
    }
  }

  return {
    doc: {
      id: "editor-fbd",
      name: opts.name,
      version: 1,
      cycleTimeMs: opts.cycleTimeMs,
      networks: [{ id: NETWORK_ID, name: "Rede 1", executionOrder: 1, enabled: true }],
      nodes: models,
      connections,
      variables,
    },
    inputs,
  };
}
