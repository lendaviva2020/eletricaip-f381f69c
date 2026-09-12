// Modo multifilar — base de dados/lógica: inferência de condutores por
// circuito e geração da sheet "multifilar" a partir da "unifilar".
import type { Command } from "./commands";
import { makeEdge, makeNode } from "./model";
import type { CircuitConfig, DiagramDoc, DiagramEdge, DiagramNode, NodeKind } from "./schema";

export const CONDUCTOR_LABELS: Record<CircuitConfig, string[]> = {
  F: ["L1"],
  "F+N": ["L1", "N"],
  "F+N+PE": ["L1", "N", "PE"],
  "3F": ["L1", "L2", "L3"],
  "3F+N": ["L1", "L2", "L3", "N"],
  "3F+N+PE": ["L1", "L2", "L3", "N", "PE"],
  N: ["N"],
  PE: ["PE"],
};

const CONFIG_BY_KIND: Partial<Record<NodeKind, CircuitConfig>> = {
  motor: "3F",
  load: "F+N",
  lamp: "F+N",
  socket: "F+N",
  transformer: "3F+N",
  vfd: "3F+N",
  softstarter: "3F+N",
  busbar: "3F+N",
  ccm: "3F+N",
  psu: "F+N",
};

/**
 * Infere a configuração de circuito de uma edge a partir dos nós que ela
 * conecta. edge.circuitConfig explícito sempre tem prioridade. Nós
 * "ground"/"neutral" forçam PE/N (são o próprio condutor de referência).
 * Para dispositivos de passagem (disjuntor, contator etc.) sem um nó de
 * carga do outro lado, usa o campo `poles` do disjuntor/DR quando
 * disponível; senão assume "F+N" (caso mais comum) como fallback seguro.
 */
export function inferCircuitConfig(
  edge: DiagramEdge,
  srcNode: DiagramNode | undefined,
  tgtNode: DiagramNode | undefined,
): CircuitConfig {
  if (edge.circuitConfig) return edge.circuitConfig;

  for (const node of [srcNode, tgtNode]) {
    if (node?.params.kind === "ground") return "PE";
    if (node?.params.kind === "neutral") return "N";
  }
  for (const node of [srcNode, tgtNode]) {
    const cfg = node && CONFIG_BY_KIND[node.params.kind];
    if (cfg) return cfg;
  }
  for (const node of [srcNode, tgtNode]) {
    const p = node?.params;
    if (p && (p.kind === "breaker" || p.kind === "rcd") && "poles" in p) {
      if (p.poles === 1) return "F";
      if (p.poles === 2) return "F+N";
      if (p.poles === 3) return "3F";
      if (p.poles === 4) return "3F+N";
    }
  }
  return "F+N";
}

/** Comandos para remover tudo que hoje está na sheet "multifilar" (usado
 * antes de regenerar, pra não duplicar a cada clique). Cascade de RemoveNode
 * já cuida das edges dependentes, mas removemos edges primeiro por
 * segurança/clareza. */
export function clearMultifilarCommands(doc: DiagramDoc): Command[] {
  const commands: Command[] = [];
  for (const e of Object.values(doc.edges)) {
    if (e.sheet === "multifilar") commands.push({ type: "RemoveEdge", edgeId: e.id });
  }
  for (const n of Object.values(doc.nodes)) {
    if (n.sheet === "multifilar") commands.push({ type: "RemoveNode", nodeId: n.id });
  }
  return commands;
}

/** Gera os comandos AddNode/AddEdge que criam a sheet "multifilar" a
 * partir do estado atual da sheet "unifilar". */
export function buildMultifilarCommands(doc: DiagramDoc): Command[] {
  const unifilarNodes = Object.values(doc.nodes).filter((n) => n.sheet === "unifilar");
  const unifilarEdges = Object.values(doc.edges).filter((e) => e.sheet === "unifilar");
  const commands: Command[] = [];
  const idMap = new Map<string, string>();

  for (const n of unifilarNodes) {
    const clone = makeNode({
      sheet: "multifilar",
      params: n.params,
      position: n.position,
      label: n.label,
      rotation: n.rotation,
    });
    idMap.set(n.id, clone.id);
    commands.push({ type: "AddNode", node: clone });
  }

  for (const e of unifilarEdges) {
    const newSource = idMap.get(e.source);
    const newTarget = idMap.get(e.target);
    if (!newSource || !newTarget) continue;
    const config = inferCircuitConfig(e, doc.nodes[e.source], doc.nodes[e.target]);
    const clone = makeEdge({
      sheet: "multifilar",
      source: newSource,
      target: newTarget,
      sourcePort: e.sourcePort,
      targetPort: e.targetPort,
      kind: e.kind,
      cable: e.cable,
      circuitConfig: config,
    });
    commands.push({ type: "AddEdge", edge: clone });
  }

  return commands;
}
