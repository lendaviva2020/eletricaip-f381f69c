/**
 * Compilador FBD: Domain Model → validação → Dependency Graph → tipagem → AST → IR.
 * Nunca retorna IR quando há diagnóstico de severidade "error".
 */
import {
  canImplicitlyConvert,
  coerceValue,
  defaultValue,
  ELEMENTARY_TYPES,
  isElementaryType,
  isGenericType,
  isValidLiteral,
  matchesType,
  widenings,
  type ElementaryType,
  type FbdValue,
  type PortType,
} from "./datatypes";
import type { FbdConnectionModel, FbdDocument, FbdNodeModel, FbdVariable } from "./model";
import {
  effectiveInputs,
  effectiveOutputs,
  type BlockDefinition,
  type BlockRegistry,
} from "./registry";

// ── Diagnósticos ─────────────────────────────────────────────────────────
export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";
export type DiagnosticCode =
  | "UNKNOWN_BLOCK"
  | "UNKNOWN_NETWORK"
  | "UNKNOWN_PORT"
  | "INVALID_CONNECTION"
  | "DANGLING_CONNECTION"
  | "MULTIPLE_DRIVERS"
  | "UNCONNECTED_INPUT"
  | "TYPE_MISMATCH"
  | "INVALID_PARAMETER"
  | "CYCLIC_DEPENDENCY"
  | "DUPLICATE_ID"
  | "DUPLICATE_INSTANCE"
  | "DUPLICATE_VARIABLE";

export interface FbdDiagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly nodeId?: string;
  readonly port?: string;
  readonly connectionId?: string;
  readonly networkId?: string;
  readonly suggestion?: string;
}

// ── AST ──────────────────────────────────────────────────────────────────
export type AstExpr =
  | { readonly kind: "PortRef"; readonly nodeId: string; readonly port: string }
  | { readonly kind: "Literal"; readonly value: FbdValue; readonly type: ElementaryType }
  | { readonly kind: "Default"; readonly value: FbdValue; readonly type: ElementaryType };

export interface AstInstance {
  readonly kind: "Instance";
  readonly nodeId: string;
  readonly instanceName: string;
  readonly blockType: string;
  readonly inputs: Readonly<Record<string, AstExpr>>;
}
export interface AstNetwork {
  readonly kind: "Network";
  readonly id: string;
  readonly name: string;
  readonly instances: readonly AstInstance[];
}
export interface AstProgram {
  readonly kind: "Program";
  readonly name: string;
  readonly variables: readonly FbdVariable[];
  readonly networks: readonly AstNetwork[];
}

// ── IR ───────────────────────────────────────────────────────────────────
export type IrOperand =
  | { readonly kind: "slot"; readonly slot: number; readonly convertTo?: ElementaryType }
  | { readonly kind: "const"; readonly value: FbdValue };

export interface IrInstruction {
  readonly index: number;
  readonly nodeId: string;
  readonly instanceName: string;
  readonly blockType: string;
  readonly stateful: boolean;
  readonly binding: ElementaryType | null;
  readonly params: Readonly<Record<string, FbdValue>>;
  readonly inputs: Readonly<Record<string, IrOperand>>;
  readonly outputs: Readonly<
    Record<string, { readonly slot: number; readonly type: ElementaryType }>
  >;
  readonly dependencies: readonly string[];
}

export interface IrProgram {
  readonly name: string;
  readonly cycleTimeMs: number;
  readonly instructions: readonly IrInstruction[];
  readonly slotTypes: readonly ElementaryType[];
  readonly variables: readonly FbdVariable[];
}

export interface CompileResult {
  readonly ok: boolean;
  readonly diagnostics: readonly FbdDiagnostic[];
  readonly executionOrder: readonly string[];
  readonly ast: AstProgram | null;
  readonly ir: IrProgram | null;
}

// ── Dependency Graph ─────────────────────────────────────────────────────
export interface DependencyGraph {
  readonly order: readonly string[];
  /** Nós envolvidos em ciclos (não ordenáveis). */
  readonly cyclic: readonly string[];
}

export function buildDependencyGraph(
  nodes: readonly FbdNodeModel[],
  edges: readonly { from: string; to: string }[],
  networkOrder: ReadonlyMap<string, number>,
): DependencyGraph {
  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    indeg.set(n.id, 0);
    out.set(n.id, []);
  }
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    out.get(e.from)?.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const rank = (id: string): [number, number, number, string] => {
    const n = byId.get(id);
    return [networkOrder.get(n?.networkId ?? "") ?? 0, n?.position.y ?? 0, n?.position.x ?? 0, id];
  };
  const before = (a: string, b: string): boolean => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < 4; i++) {
      const x = ra[i] as number | string;
      const y = rb[i] as number | string;
      if (x !== y) return x < y;
    }
    return false;
  };
  const ready: string[] = [];
  const push = (id: string) => {
    const i = ready.findIndex((r) => before(id, r));
    if (i === -1) ready.push(id);
    else ready.splice(i, 0, id);
  };
  for (const [id, d] of indeg) if (d === 0) push(id);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;
    order.push(id);
    for (const t of out.get(id) ?? []) {
      const d = (indeg.get(t) ?? 0) - 1;
      indeg.set(t, d);
      if (d === 0) push(t);
    }
  }
  const emitted = new Set(order);
  return { order, cyclic: nodes.map((n) => n.id).filter((id) => !emitted.has(id)) };
}

// ── Tipagem genérica ─────────────────────────────────────────────────────
const FALLBACK_PREFERENCE: readonly ElementaryType[] = [
  "BOOL",
  "REAL",
  "INT",
  "DINT",
  "LREAL",
  ...ELEMENTARY_TYPES,
];

function resolveBinding(
  candidates: readonly ElementaryType[],
  genericPorts: readonly PortType[],
  hint: FbdValue | undefined,
): ElementaryType | null {
  const fitsPorts = (t: ElementaryType) => genericPorts.every((g) => matchesType(t, g));
  if (candidates.length === 0) {
    if (typeof hint === "string" && isElementaryType(hint) && fitsPorts(hint)) return hint;
    return FALLBACK_PREFERENCE.find(fitsPorts) ?? null;
  }
  const first = candidates[0];
  if (first === undefined) return null;
  for (const t of [first, ...widenings(first)]) {
    if (fitsPorts(t) && candidates.every((c) => canImplicitlyConvert(c, t))) return t;
  }
  return null;
}

const k = (nodeId: string, port: string) => `${nodeId}::${port}`;

export function compileFbd(doc: FbdDocument, registry: BlockRegistry): CompileResult {
  const diagnostics: FbdDiagnostic[] = [];
  const err = (d: Omit<FbdDiagnostic, "severity">) => diagnostics.push({ ...d, severity: "error" });

  // 1. Estrutura
  const networkOrder = new Map(doc.networks.map((n) => [n.id, n.executionOrder]));
  const enabledNetworks = new Set(doc.networks.filter((n) => n.enabled).map((n) => n.id));
  const varNames = new Set<string>();
  for (const v of doc.variables) {
    if (varNames.has(v.name))
      err({ code: "DUPLICATE_VARIABLE", message: `Variável duplicada: ${v.name}` });
    varNames.add(v.name);
  }

  const ids = new Set<string>();
  const instanceNames = new Set<string>();
  const entries = new Map<
    string,
    { node: FbdNodeModel; def: BlockDefinition; types: Record<string, PortType> }
  >();
  for (const node of doc.nodes) {
    if (ids.has(node.id)) {
      err({ code: "DUPLICATE_ID", message: `ID de bloco duplicado: ${node.id}`, nodeId: node.id });
      continue;
    }
    ids.add(node.id);
    if (instanceNames.has(node.instanceName)) {
      err({
        code: "DUPLICATE_INSTANCE",
        message: `Nome de instância duplicado: ${node.instanceName}`,
        nodeId: node.id,
      });
    }
    instanceNames.add(node.instanceName);
    if (!networkOrder.has(node.networkId)) {
      err({
        code: "UNKNOWN_NETWORK",
        message: `Network inexistente: ${node.networkId}`,
        nodeId: node.id,
      });
      continue;
    }
    const def = registry.get(node.blockType);
    if (!def) {
      err({
        code: "UNKNOWN_BLOCK",
        message: `Bloco desconhecido: ${node.blockType}`,
        nodeId: node.id,
      });
      continue;
    }
    const types: Record<string, PortType> = {};
    for (const p of [...effectiveInputs(def), ...effectiveOutputs(def)]) types[p.name] = p.type;
    if (def.resolvePortTypes) {
      const r = def.resolvePortTypes(node, doc);
      if (!r.ok) {
        err({
          code: "INVALID_PARAMETER",
          message: `${node.instanceName}: ${r.message}`,
          nodeId: node.id,
        });
        continue;
      }
      Object.assign(types, r.types);
    }
    entries.set(node.id, { node, def, types });
  }

  // 2. Conexões
  const drivers = new Map<string, FbdConnectionModel>();
  const edges: { from: string; to: string }[] = [];
  for (const c of doc.connections) {
    const src = entries.get(c.source.nodeId);
    const dst = entries.get(c.target.nodeId);
    if (!src || !dst) {
      if (!ids.has(c.source.nodeId) || !ids.has(c.target.nodeId)) {
        err({
          code: "DANGLING_CONNECTION",
          message: "Conexão referencia bloco inexistente",
          connectionId: c.id,
        });
      }
      continue;
    }
    const srcIsOut = effectiveOutputs(src.def).some((p) => p.name === c.source.port);
    const dstIsIn = effectiveInputs(dst.def).some((p) => p.name === c.target.port);
    if (!srcIsOut || !dstIsIn) {
      const srcExists = src.types[c.source.port] !== undefined;
      const dstExists = dst.types[c.target.port] !== undefined;
      err({
        code: srcExists && dstExists ? "INVALID_CONNECTION" : "UNKNOWN_PORT",
        message:
          srcExists && dstExists
            ? "Conexões devem ir de uma saída para uma entrada"
            : `Pino inexistente: ${!srcExists ? `${src.node.instanceName}.${c.source.port}` : `${dst.node.instanceName}.${c.target.port}`}`,
        connectionId: c.id,
      });
      continue;
    }
    const key = k(c.target.nodeId, c.target.port);
    if (drivers.has(key)) {
      err({
        code: "MULTIPLE_DRIVERS",
        message: `${dst.node.instanceName}.${c.target.port} possui mais de uma fonte`,
        connectionId: c.id,
        nodeId: c.target.nodeId,
        port: c.target.port,
      });
      continue;
    }
    drivers.set(key, c);
    edges.push({ from: c.source.nodeId, to: c.target.nodeId });
  }

  // 3. Grafo de dependências
  const validNodes = [...entries.values()].map((e) => e.node);
  const graph = buildDependencyGraph(validNodes, edges, networkOrder);
  for (const id of graph.cyclic) {
    err({
      code: "CYCLIC_DEPENDENCY",
      message: `${entries.get(id)?.node.instanceName ?? id} participa de um laço algébrico`,
      nodeId: id,
      suggestion: "Quebre a realimentação por uma variável (VAR_OUT → VAR_IN) ou bloco com estado",
    });
  }

  // 4. Tipagem + IR
  const outTypes = new Map<string, ElementaryType>();
  const outSlots = new Map<string, number>();
  const slotTypes: ElementaryType[] = [];
  const instructions: IrInstruction[] = [];
  const astByNetwork = new Map<string, AstInstance[]>();

  for (const id of graph.order) {
    const entry = entries.get(id);
    if (!entry) continue;
    const { node, def, types } = entry;
    let failed = false;

    const genericPorts = Object.values(types).filter(isGenericType);
    const candidates: ElementaryType[] = [];
    for (const p of def.inputs) {
      const t = types[p.name];
      const drv = drivers.get(k(node.id, p.name));
      if (t !== undefined && isGenericType(t) && drv) {
        const st = outTypes.get(k(drv.source.nodeId, drv.source.port));
        if (st) candidates.push(st);
      }
    }
    let binding: ElementaryType | null = null;
    if (genericPorts.length > 0) {
      binding = resolveBinding(candidates, genericPorts, node.params.dataType);
      if (!binding) {
        err({
          code: "TYPE_MISMATCH",
          message: `${node.instanceName}: tipos de entrada incompatíveis (${candidates.join(", ")})`,
          nodeId: node.id,
        });
        continue;
      }
    }
    const concrete = (p: string): ElementaryType | null => {
      const t = types[p];
      if (t === undefined) return null;
      return isGenericType(t) ? binding : t;
    };

    const inputs: Record<string, IrOperand> = {};
    const astInputs: Record<string, AstExpr> = {};
    const deps = new Set<string>();
    for (const p of effectiveInputs(def)) {
      // EN sem conexão nem parâmetro: bloco sempre habilitado, sem operando no IR.
      if (p.name === "EN" && !drivers.has(k(node.id, "EN")) && node.params.EN === undefined)
        continue;
      const target = concrete(p.name);
      if (!target) {
        failed = true;
        continue;
      }
      const drv = drivers.get(k(node.id, p.name));
      if (drv) {
        const srcKey = k(drv.source.nodeId, drv.source.port);
        const st = outTypes.get(srcKey);
        const slot = outSlots.get(srcKey);
        if (!st || slot === undefined) {
          failed = true;
          continue;
        }
        deps.add(drv.source.nodeId);
        astInputs[p.name] = { kind: "PortRef", nodeId: drv.source.nodeId, port: drv.source.port };
        if (st === target) inputs[p.name] = { kind: "slot", slot };
        else if (canImplicitlyConvert(st, target))
          inputs[p.name] = { kind: "slot", slot, convertTo: target };
        else {
          const conv = `${st}_TO_${target}`;
          err({
            code: "TYPE_MISMATCH",
            message: `${node.instanceName}.${p.name}: esperado ${target}, recebido ${st}`,
            nodeId: node.id,
            port: p.name,
            connectionId: drv.id,
            suggestion: registry.has(conv) ? `Inserir conversão explícita ${conv}` : undefined,
          });
          failed = true;
        }
        continue;
      }
      const param = node.params[p.name];
      if (param !== undefined) {
        if (!isValidLiteral(param, target)) {
          err({
            code: "INVALID_PARAMETER",
            message: `${node.instanceName}.${p.name}: '${String(param)}' não é um literal ${target} válido`,
            nodeId: node.id,
            port: p.name,
          });
          failed = true;
          continue;
        }
        const value = coerceValue(param, target);
        inputs[p.name] = { kind: "const", value };
        astInputs[p.name] = { kind: "Literal", value, type: target };
      } else if (p.required) {
        err({
          code: "UNCONNECTED_INPUT",
          message: `${node.instanceName}.${p.name} é obrigatória`,
          nodeId: node.id,
          port: p.name,
          suggestion: `Conecte um sinal ${target} ou defina o parâmetro ${p.name}`,
        });
        failed = true;
      } else {
        const value = coerceValue(p.defaultValue ?? defaultValue(target), target);
        inputs[p.name] = { kind: "const", value };
        astInputs[p.name] = { kind: "Default", value, type: target };
      }
    }
    if (node.blockType === "CONST") {
      const t = concrete("OUT");
      const v = node.params.value;
      if (t && v !== undefined && !isValidLiteral(v, t)) {
        err({
          code: "INVALID_PARAMETER",
          message: `${node.instanceName}: '${String(v)}' não é um literal ${t} válido`,
          nodeId: node.id,
        });
        failed = true;
      }
    }
    if (failed) continue;

    const outputs: Record<string, { slot: number; type: ElementaryType }> = {};
    for (const p of effectiveOutputs(def)) {
      const t = concrete(p.name);
      if (!t) continue;
      const slot = slotTypes.length;
      slotTypes.push(t);
      outputs[p.name] = { slot, type: t };
      outTypes.set(k(node.id, p.name), t);
      outSlots.set(k(node.id, p.name), slot);
    }

    const ast: AstInstance = {
      kind: "Instance",
      nodeId: node.id,
      instanceName: node.instanceName,
      blockType: node.blockType,
      inputs: astInputs,
    };
    const list = astByNetwork.get(node.networkId) ?? [];
    list.push(ast);
    astByNetwork.set(node.networkId, list);

    if (!enabledNetworks.has(node.networkId)) continue;
    instructions.push({
      index: instructions.length,
      nodeId: node.id,
      instanceName: node.instanceName,
      blockType: node.blockType,
      stateful: def.stateful,
      binding,
      params: node.params,
      inputs,
      outputs,
      dependencies: [...deps],
    });
  }

  const ok = !diagnostics.some((d) => d.severity === "error");
  const ast: AstProgram = {
    kind: "Program",
    name: doc.name,
    variables: doc.variables,
    networks: [...doc.networks]
      .sort((a, b) => a.executionOrder - b.executionOrder)
      .map((n) => ({
        kind: "Network",
        id: n.id,
        name: n.name,
        instances: astByNetwork.get(n.id) ?? [],
      })),
  };
  return {
    ok,
    diagnostics,
    executionOrder: graph.order,
    ast: ok ? ast : null,
    ir: ok
      ? {
          name: doc.name,
          cycleTimeMs: doc.cycleTimeMs,
          instructions,
          slotTypes,
          variables: doc.variables,
        }
      : null,
  };
}
