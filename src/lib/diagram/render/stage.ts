// DiagramStage — encapsula Application Pixi + Viewport e faz diff incremental
// entre o doc atual e o scene graph. Sem React por nó: a UI de topo apenas
// chama `sync(doc, sheet, selected)` quando o store muda.
//
// Recursos: portas/handles, edge-draft com preview ortogonal, marquee
// (Shift+drag), snap-to-grid no commit, context menu, multi-select drag.
import { Application, Container, FederatedPointerEvent, Graphics, Text } from "pixi.js";
import { Viewport } from "pixi-viewport";
import type { DiagramDoc, DiagramEdge, DiagramNode, EdgeKind, SheetKind } from "../schema";
import { drawSymbol } from "./symbols";
import { CONDUCTOR_LABELS } from "../multifilar";
import { getPorts, rotatePort, type PortDef } from "./ports";

const PORT_RADIUS = 4;
const PORT_HIT_RADIUS = 8;
const PORT_COLOR = 0x60a5fa;
const PORT_COLOR_HOVER = 0xfbbf24;
const SELECT_COLOR = 0x22d3ee;

export interface MoveDelta {
  nodeId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface EdgeDraftCommit {
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  kind: EdgeKind;
}

export interface StageEvents {
  onSelectNode?: (id: string | null, ev?: { shiftKey: boolean }) => void;
  onSelectMany?: (ids: string[], additive: boolean) => void;
  onMoveNodes?: (deltas: MoveDelta[]) => void;
  onCommitEdge?: (edge: EdgeDraftCommit) => void;
  onContextMenu?: (target: { nodeId: string | null; clientX: number; clientY: number }) => void;
  /** Aplica snap-to-grid no commit do drag. */
  snap?: (v: number) => number;
}

interface NodeView {
  container: Container;
  symbol: Graphics;
  label: Text;
  selection: Graphics;
  portsLayer: Container;
  portGraphics: Map<string, Graphics>;
  kind: string;
}

interface EdgeView {
  /** Graphics para linha única; Container com N Graphics+Text no multifilar. */
  graphics: Container;
  hash: string;
}

interface DragState {
  pointerId: number;
  origins: Map<string, { x: number; y: number }>;
  start: { x: number; y: number };
  moved: boolean;
  primary: string;
}

interface EdgeDraft {
  pointerId: number;
  source: string;
  sourcePort: PortDef;
  preview: Graphics;
  hoverTarget: { nodeId: string; port: PortDef } | null;
}

interface MarqueeState {
  pointerId: number;
  start: { x: number; y: number };
  rect: Graphics;
  additive: boolean;
}

export class DiagramStage {
  app: Application;
  viewport!: Viewport;
  private nodesLayer = new Container();
  private edgesLayer = new Container();
  private overlayLayer = new Container();
  private nodes = new Map<string, NodeView>();
  private edges = new Map<string, EdgeView>();
  private events: StageEvents = {};
  private selectedIds = new Set<string>();
  private resizeObs?: ResizeObserver;
  private host?: HTMLElement;

  private drag: DragState | null = null;
  private draft: EdgeDraft | null = null;
  private marquee: MarqueeState | null = null;

  constructor() {
    this.app = new Application();
  }

  async init(host: HTMLElement, events: StageEvents = {}) {
    this.host = host;
    this.events = events;
    await this.app.init({
      background: 0x0b0f17,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: host,
    });
    host.appendChild(this.app.canvas);

    this.viewport = new Viewport({
      screenWidth: host.clientWidth,
      screenHeight: host.clientHeight,
      worldWidth: 4000,
      worldHeight: 4000,
      events: this.app.renderer.events,
    });
    this.viewport.drag().pinch().wheel().decelerate().clampZoom({ minScale: 0.2, maxScale: 4 });
    this.app.stage.addChild(this.viewport);
    this.viewport.addChild(this.edgesLayer);
    this.viewport.addChild(this.nodesLayer);
    this.viewport.addChild(this.overlayLayer);

    this.drawGrid();

    this.viewport.eventMode = "static";
    this.viewport.on("pointerdown", (e) => this.onViewportPointerDown(e));
    this.viewport.on("pointermove", (e) => this.onPointerMove(e));
    this.viewport.on("pointerup", (e) => this.onPointerUp(e));
    this.viewport.on("pointerupoutside", (e) => this.onPointerUp(e));
    this.viewport.on("rightclick", (e) => {
      const native = e.nativeEvent as PointerEvent;
      native?.preventDefault?.();
      this.events.onContextMenu?.({
        nodeId: null,
        clientX: native?.clientX ?? 0,
        clientY: native?.clientY ?? 0,
      });
    });

    // Bloqueia menu nativo no canvas (deixamos overlay HTML cuidar).
    this.app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.resizeObs = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w && h) this.viewport.resize(w, h, 4000, 4000);
    });
    this.resizeObs.observe(host);
  }

  destroy() {
    this.resizeObs?.disconnect();
    if (this.app.renderer) {
      if (this.host && this.app.canvas.parentElement === this.host) {
        this.host.removeChild(this.app.canvas);
      }
      this.app.destroy(true, { children: true });
    }
    this.nodes.clear();
    this.edges.clear();
  }

  private drawGrid() {
    const grid = new Graphics();
    const step = 50;
    for (let x = 0; x <= 4000; x += step) grid.moveTo(x, 0).lineTo(x, 4000);
    for (let y = 0; y <= 4000; y += step) grid.moveTo(0, y).lineTo(4000, y);
    grid.stroke({ width: 1, color: 0x1f2937, alpha: 0.4 });
    this.viewport.addChildAt(grid, 0);
  }

  fitView() {
    this.viewport.fit();
    this.viewport.moveCenter(2000, 2000);
  }

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.app.renderer) return { x: 2000, y: 2000 };
    return this.viewport.toWorld(clientX, clientY);
  }

  /** Diff incremental do scene graph contra o doc. */
  sync(doc: DiagramDoc, sheet: SheetKind, selectedIds: string[] = []) {
    const wantNodes = Object.values(doc.nodes).filter((n) => n.sheet === sheet);
    const wantEdges = Object.values(doc.edges).filter((e) => e.sheet === sheet);
    const wantNodeIds = new Set(wantNodes.map((n) => n.id));
    const wantEdgeIds = new Set(wantEdges.map((e) => e.id));

    for (const [id, v] of this.nodes) {
      if (!wantNodeIds.has(id)) {
        v.container.destroy({ children: true });
        this.nodes.delete(id);
      }
    }
    for (const [id, v] of this.edges) {
      if (!wantEdgeIds.has(id)) {
        v.graphics.destroy();
        this.edges.delete(id);
      }
    }

    for (const n of wantNodes) this.upsertNode(n);
    for (const e of wantEdges) this.upsertEdge(e, doc);

    this.selectedIds = new Set(selectedIds);
    for (const [id, v] of this.nodes) this.applySelectionTo(id, v);
  }

  // ============== nodes ==============

  private upsertNode(n: DiagramNode) {
    let view = this.nodes.get(n.id);
    if (!view || view.kind !== n.params.kind) {
      if (view) view.container.destroy({ children: true });
      const container = new Container();
      container.eventMode = "static";
      container.cursor = "grab";
      const selection = new Graphics();
      const symbol = drawSymbol(n.params.kind);
      const label = new Text({
        text: n.label || n.params.kind,
        style: { fill: 0xcbd5e1, fontSize: 10, fontFamily: "system-ui, sans-serif" },
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, 22);
      const portsLayer = new Container();
      container.addChild(selection);
      container.addChild(symbol);
      container.addChild(label);
      container.addChild(portsLayer);
      this.nodesLayer.addChild(container);
      this.attachNodeEvents(container, n.id);
      view = {
        container,
        symbol,
        label,
        selection,
        portsLayer,
        portGraphics: new Map(),
        kind: n.params.kind,
      };
      this.nodes.set(n.id, view);
      this.rebuildPorts(view, n);
    } else {
      view.label.text = n.label || n.params.kind;
    }
    view.container.position.set(n.position.x, n.position.y);
    view.container.rotation = (n.rotation || 0) * (Math.PI / 180);
  }

  private rebuildPorts(view: NodeView, node: DiagramNode) {
    view.portsLayer.removeChildren();
    view.portGraphics.clear();
    for (const port of getPorts(node.params.kind)) {
      const g = new Graphics();
      g.circle(port.x, port.y, PORT_RADIUS)
        .fill({ color: 0x0b0f17 })
        .stroke({ width: 1.5, color: PORT_COLOR });
      g.eventMode = "static";
      g.cursor = "crosshair";
      // hitArea ampliado (raio maior que o desenho) p/ facilitar pegar a porta
      (g as unknown as { hitArea: unknown }).hitArea = {
        contains: (x: number, y: number) =>
          (x - port.x) ** 2 + (y - port.y) ** 2 <= PORT_HIT_RADIUS ** 2,
      };
      g.on("pointerover", () => (g.tint = PORT_COLOR_HOVER));
      g.on("pointerout", () => (g.tint = 0xffffff));
      g.on("pointerdown", (e: FederatedPointerEvent) => this.beginEdgeDraft(e, node.id, port));
      view.portsLayer.addChild(g);
      view.portGraphics.set(port.id, g);
    }
  }

  private applySelectionTo(id: string, view: NodeView) {
    const selected = this.selectedIds.has(id);
    view.selection.clear();
    if (selected) {
      view.selection
        .roundRect(-30, -22, 60, 44, 6)
        .stroke({ width: 1.5, color: SELECT_COLOR, alpha: 0.9 });
    }
    view.container.alpha = 1;
  }

  // ============== edges ==============

  private portWorld(node: DiagramNode, portId: string | undefined): { x: number; y: number } {
    const ports = getPorts(node.params.kind);
    const port = (portId && ports.find((p) => p.id === portId)) || ports[0];
    if (!port) return { ...node.position };
    const rotated = rotatePort(port, node.rotation ?? 0);
    return { x: node.position.x + rotated.x, y: node.position.y + rotated.y };
  }

  private upsertEdge(e: DiagramEdge, doc: DiagramDoc) {
    const srcNode = doc.nodes[e.source];
    const tgtNode = doc.nodes[e.target];
    if (!srcNode || !tgtNode) return;
    const from = this.portWorld(srcNode, e.sourcePort);
    const to = this.portWorld(tgtNode, e.targetPort);
    const hash = `${e.source}:${from.x.toFixed(1)},${from.y.toFixed(1)}->${e.target}:${to.x.toFixed(1)},${to.y.toFixed(1)}:${e.kind}:${e.circuitConfig ?? ""}`;
    const existing = this.edges.get(e.id);
    if (existing && existing.hash === hash) return;
    if (existing) existing.graphics.destroy();
    const midX = (from.x + to.x) / 2;

    // Multifilar: N condutores paralelos, offset perpendicular ao trajeto
    // ortogonal (offset no Y dos segmentos horizontais e no X do vertical).
    const conductors = e.circuitConfig ? CONDUCTOR_LABELS[e.circuitConfig] : null;
    if (conductors && conductors.length > 1) {
      const spacing = 5;
      const total = conductors.length;
      const container = new Container();
      conductors.forEach((label, i) => {
        const offset = (i - (total - 1) / 2) * spacing;
        const color = label === "N" ? 0x38bdf8 : label === "PE" ? 0x84cc16 : 0x60a5fa;
        const g = new Graphics();
        g.moveTo(from.x, from.y + offset)
          .lineTo(midX + offset, from.y + offset)
          .lineTo(midX + offset, to.y + offset)
          .lineTo(to.x, to.y + offset);
        g.stroke({ width: 1.2, color });
        container.addChild(g);
        const text = new Text({
          text: label,
          style: { fill: color, fontSize: 8, fontFamily: "monospace" },
        });
        text.position.set(midX + offset + 2, (from.y + to.y) / 2 + offset - 10);
        container.addChild(text);
      });
      this.edgesLayer.addChild(container);
      this.edges.set(e.id, { graphics: container, hash });
      return;
    }

    const color = colorForEdge(e.kind);
    const g = new Graphics();
    g.moveTo(from.x, from.y).lineTo(midX, from.y).lineTo(midX, to.y).lineTo(to.x, to.y);
    g.stroke({ width: 1.5, color });
    this.edgesLayer.addChild(g);
    this.edges.set(e.id, { graphics: g, hash });
  }

  private refreshEdgesFor(nodeIds: Iterable<string>) {
    const set = new Set(nodeIds);
    for (const [id, v] of this.edges) {
      if ([...set].some((nid) => v.hash.includes(nid))) {
        v.graphics.destroy();
        this.edges.delete(id);
      }
    }
  }

  // ============== pointer pipeline ==============

  private attachNodeEvents(container: Container, id: string) {
    container.on("pointerdown", (e: FederatedPointerEvent) => {
      if (e.button === 2) {
        const native = e.nativeEvent as PointerEvent;
        this.events.onContextMenu?.({
          nodeId: id,
          clientX: native?.clientX ?? 0,
          clientY: native?.clientY ?? 0,
        });
        e.stopPropagation();
        return;
      }
      if (e.button !== 0) return;
      e.stopPropagation();
      const additive = e.shiftKey;
      const wasSelected = this.selectedIds.has(id);
      if (!wasSelected) {
        if (additive) {
          this.events.onSelectMany?.([...this.selectedIds, id], true);
        } else {
          this.events.onSelectNode?.(id, { shiftKey: false });
        }
      }
      // Pré-popular drag com seleção corrente (após eventual atualização vinda do React).
      // Como o React pode demorar 1 frame, capturamos imediatamente o conjunto atual + o id clicado.
      const ids = new Set(this.selectedIds);
      ids.add(id);
      const origins = new Map<string, { x: number; y: number }>();
      for (const nid of ids) {
        const v = this.nodes.get(nid);
        if (v) origins.set(nid, { x: v.container.x, y: v.container.y });
      }
      const world = this.viewport.toWorld(e.global);
      this.viewport.plugins.pause("drag");
      this.drag = {
        pointerId: e.pointerId,
        origins,
        start: { x: world.x, y: world.y },
        moved: false,
        primary: id,
      };
    });
  }

  private onViewportPointerDown(e: FederatedPointerEvent) {
    if (e.target !== this.viewport) return;
    if (e.button !== 0) return;
    // Shift+drag em área vazia → marquee
    if (e.shiftKey) {
      const world = this.viewport.toWorld(e.global);
      const rect = new Graphics();
      this.overlayLayer.addChild(rect);
      this.viewport.plugins.pause("drag");
      this.marquee = {
        pointerId: e.pointerId,
        start: { x: world.x, y: world.y },
        rect,
        additive: e.shiftKey,
      };
      return;
    }
    // clique simples em área vazia → desseleciona
    this.events.onSelectNode?.(null);
  }

  private onPointerMove(e: FederatedPointerEvent) {
    if (this.drag && e.pointerId === this.drag.pointerId) {
      const world = this.viewport.toWorld(e.global);
      const dx = world.x - this.drag.start.x;
      const dy = world.y - this.drag.start.y;
      this.drag.moved = this.drag.moved || Math.abs(dx) + Math.abs(dy) > 1;
      for (const [nid, origin] of this.drag.origins) {
        const v = this.nodes.get(nid);
        if (!v) continue;
        v.container.position.set(origin.x + dx, origin.y + dy);
      }
      this.refreshEdgesFor(this.drag.origins.keys());
      return;
    }
    if (this.draft && e.pointerId === this.draft.pointerId) {
      const world = this.viewport.toWorld(e.global);
      const src = this.findNode(this.draft.source);
      if (!src) return;
      const from = this.portWorldFromView(src, this.draft.sourcePort);
      this.draft.preview.clear();
      const midX = (from.x + world.x) / 2;
      this.draft.preview
        .moveTo(from.x, from.y)
        .lineTo(midX, from.y)
        .lineTo(midX, world.y)
        .lineTo(world.x, world.y)
        .stroke({ width: 1.5, color: 0xfbbf24, alpha: 0.85 });
      this.draft.hoverTarget = this.findPortAt(world.x, world.y, this.draft.source);
      if (this.draft.hoverTarget) {
        const t = this.findNode(this.draft.hoverTarget.nodeId);
        if (t) {
          const tw = this.portWorldFromView(t, this.draft.hoverTarget.port);
          this.draft.preview.circle(tw.x, tw.y, 6).stroke({ width: 1.5, color: 0x22d3ee });
        }
      }
      return;
    }
    if (this.marquee && e.pointerId === this.marquee.pointerId) {
      const world = this.viewport.toWorld(e.global);
      const x = Math.min(this.marquee.start.x, world.x);
      const y = Math.min(this.marquee.start.y, world.y);
      const w = Math.abs(world.x - this.marquee.start.x);
      const h = Math.abs(world.y - this.marquee.start.y);
      this.marquee.rect.clear();
      this.marquee.rect
        .rect(x, y, w, h)
        .fill({ color: 0x22d3ee, alpha: 0.08 })
        .stroke({ width: 1, color: 0x22d3ee, alpha: 0.8 });
    }
  }

  private onPointerUp(e: FederatedPointerEvent) {
    if (this.drag && e.pointerId === this.drag.pointerId) {
      const d = this.drag;
      this.drag = null;
      this.viewport.plugins.resume("drag");
      if (!d.moved) {
        // clique sem drag — seleção já tratada no down
        return;
      }
      const snap = this.events.snap ?? ((v: number) => v);
      const deltas: MoveDelta[] = [];
      for (const [nid, origin] of d.origins) {
        const v = this.nodes.get(nid);
        if (!v) continue;
        const to = { x: snap(v.container.x), y: snap(v.container.y) };
        v.container.position.set(to.x, to.y);
        deltas.push({ nodeId: nid, from: origin, to });
      }
      this.events.onMoveNodes?.(deltas);
      return;
    }
    if (this.draft && e.pointerId === this.draft.pointerId) {
      const d = this.draft;
      d.preview.destroy();
      this.draft = null;
      if (d.hoverTarget) {
        this.events.onCommitEdge?.({
          source: d.source,
          sourcePort: d.sourcePort.id,
          target: d.hoverTarget.nodeId,
          targetPort: d.hoverTarget.port.id,
          kind: "power",
        });
      }
      return;
    }
    if (this.marquee && e.pointerId === this.marquee.pointerId) {
      const m = this.marquee;
      this.marquee = null;
      this.viewport.plugins.resume("drag");
      const world = this.viewport.toWorld(e.global);
      const x = Math.min(m.start.x, world.x);
      const y = Math.min(m.start.y, world.y);
      const w = Math.abs(world.x - m.start.x);
      const h = Math.abs(world.y - m.start.y);
      m.rect.destroy();
      const picked: string[] = [];
      for (const [id, v] of this.nodes) {
        if (
          v.container.x >= x &&
          v.container.x <= x + w &&
          v.container.y >= y &&
          v.container.y <= y + h
        ) {
          picked.push(id);
        }
      }
      this.events.onSelectMany?.(
        m.additive ? Array.from(new Set([...this.selectedIds, ...picked])) : picked,
        m.additive,
      );
    }
  }

  private beginEdgeDraft(e: FederatedPointerEvent, nodeId: string, port: PortDef) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const preview = new Graphics();
    this.overlayLayer.addChild(preview);
    this.draft = {
      pointerId: e.pointerId,
      source: nodeId,
      sourcePort: port,
      preview,
      hoverTarget: null,
    };
  }

  private findNode(id: string): { container: Container; kind: string } | null {
    const v = this.nodes.get(id);
    if (!v) return null;
    return { container: v.container, kind: v.kind };
  }

  private portWorldFromView(
    view: { container: Container },
    port: PortDef,
  ): { x: number; y: number } {
    // Considera a rotação atual do container (Pixi armazena em rad)
    const deg = (view.container.rotation * 180) / Math.PI;
    const r = rotatePort(port, deg);
    return { x: view.container.x + r.x, y: view.container.y + r.y };
  }

  private findPortAt(
    x: number,
    y: number,
    exceptId: string,
  ): { nodeId: string; port: PortDef } | null {
    let best: { nodeId: string; port: PortDef; d2: number } | null = null;
    const tol = 14;
    for (const [id, v] of this.nodes) {
      if (id === exceptId) continue;
      const dx = x - v.container.x;
      const dy = y - v.container.y;
      // filtro rápido por bounding ampliado
      if (Math.abs(dx) > 40 || Math.abs(dy) > 40) continue;
      const deg = (v.container.rotation * 180) / Math.PI;
      for (const p of getPorts(v.kind as Parameters<typeof getPorts>[0])) {
        const r = rotatePort(p, deg);
        const px = v.container.x + r.x;
        const py = v.container.y + r.y;
        const d2 = (x - px) ** 2 + (y - py) ** 2;
        if (d2 <= tol * tol && (!best || d2 < best.d2)) {
          best = { nodeId: id, port: p, d2 };
        }
      }
    }
    return best ? { nodeId: best.nodeId, port: best.port } : null;
  }
}

function colorForEdge(k: EdgeKind): number {
  switch (k) {
    case "power":
      return 0x60a5fa;
    case "signal":
      return 0xa78bfa;
    case "ground":
      return 0x10b981;
    case "pipe":
      return 0xf59e0b;
    default:
      return 0x94a3b8;
  }
}
