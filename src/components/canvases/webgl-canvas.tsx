// Canvas WebGL único, parametrizado por sheet. Lê o doc do useDiagramStore,
// sincroniza o scene graph Pixi de forma incremental e despacha comandos
// reversíveis para o store. Toolbar e context menu vivem em HTML overlay.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { listBom } from "@/lib/bom.functions";
import { Button } from "@/components/ui/button";
import { FileBox, FileText, Magnet, Maximize2, Redo2, RotateCw, Trash2, Undo2 } from "lucide-react";
import { DiagramStage, type EdgeDraftCommit, type MoveDelta } from "@/lib/diagram/render/stage";
import { cmd } from "@/lib/diagram/commands";
import { useDiagramStore, snapToGrid } from "@/lib/diagram/store";
import { exportDiagramDxf } from "@/lib/diagram/export-dxf";
import {
  buildMultifilarCommands,
  clearMultifilarCommands,
  summarizeConductors,
} from "@/lib/diagram/multifilar";
// jsPDF entra por import dinâmico no handler (browser-only, ~400KB).
import type { SheetKind, NodeKind } from "@/lib/diagram/schema";
import {
  type VoltaiComponentType,
  VOLTAI_COMPONENT_BY_TYPE,
} from "@/lib/palette/component-catalog";

function isVoltaiComponentType(value: string): value is VoltaiComponentType {
  return value in VOLTAI_COMPONENT_BY_TYPE;
}

function voltaiComponentToNodeKind(type: VoltaiComponentType): NodeKind {
  const map: Record<string, NodeKind> = {
    QF: "breaker",
    QS: "disconnector",
    DR: "rcd",
    FU: "fuse",
    KM: "contactor",
    KA: "relay",
    FR: "relay",
    M: "motor",
    SS: "softstarter",
    VFD: "vfd",
    TR: "transformer",
    PS: "psu",
    G: "ground",
    TCTERRA: "ground",
    UPS: "psu",
    PT: "pt100",
    TT: "pt100",
    LT: "level",
    FT: "flow",
    ES: "estop",
    ESTOP_RELAY: "estop",
    HL: "lamp",
    HZ: "lamp",
    PLC: "terminal",
    KT: "relay",
    CT: "terminal",
    BC: "terminal",
    TC: "terminal",
    TP: "terminal",
    MPCB: "breaker",
    MCB_AUX: "breaker",
    CR: "relay",
    PFC: "terminal",
    KWH: "terminal",
    IED: "terminal",
    SA: "terminal",
    R: "load",
    L: "load",
    SPD: "lightcurtain",
    TVSS: "lightcurtain",
    B: "terminal",
    SR: "relay",
    PTZ: "terminal",
    FL: "flow",
    PSW: "pressure",
    LS: "level",
    V: "load",
    SIN: "terminal",
  };
  return (map[type] ?? "terminal") as NodeKind;
}

function defaultNodeParams(kind: NodeKind): Record<string, unknown> {
  switch (kind) {
    case "breaker":
      return { kind, in_A: 63, curve: "C", poles: 1 };
    case "rcd":
      return { kind, in_A: 25, sensitivity_mA: 30, poles: 2 };
    case "contactor":
      return { kind, in_A: 32, coil_V: 24 };
    case "relay":
      return { kind, coil_V: 24, contacts: 2 };
    case "fuse":
      return { kind, in_A: 63 };
    case "disconnector":
      return { kind, in_A: 63 };
    case "transformer":
      return { kind, kVA: 100, primary_V: 13800, secondary_V: 380, vector: "Dyn11" };
    case "psu":
      return { kind, output_V: 24, output_A: 10 };
    case "vfd":
      return { kind, power_kW: 7.5, voltage_V: 380 };
    case "softstarter":
      return { kind, power_kW: 11 };
    case "busbar":
      return { kind, current_A: 630, voltage_V: 380 };
    case "ccm":
      return { kind, columns: 4, cells: 6 };
    case "motor":
      return { kind, power_kW: 7.5, voltage_V: 380, startMethod: "DOL" };
    case "load":
      return { kind, power_W: 1000, voltage_V: 220, fp: 0.92 };
    case "lamp":
      return { kind, power_W: 15, voltage_V: 220 };
    case "socket":
      return { kind, current_A: 10, voltage_V: 220 };
    case "pt100":
      return { kind, range_C: [-50, 200] };
    case "pressure":
      return { kind, range_bar: [0, 10] };
    case "flow":
      return { kind, range: [0, 100] };
    case "level":
      return { kind, range_pct: [0, 100] };
    case "encoder":
      return { kind, ppr: 1024 };
    case "estop":
      return { kind, category: "1" };
    case "lightcurtain":
      return { kind, resolution_mm: 14 };
    case "ground":
      return { kind };
    case "neutral":
      return { kind };
    case "terminal":
      return { kind };
    default:
      return { kind: "terminal" };
  }
}

interface Props {
  sheet?: SheetKind;
  projectId?: string | null;
}

export function WebglCanvas({ sheet, projectId }: Props) {
  const listBomFn = useServerFn(listBom);
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<DiagramStage | null>(null);

  const activeSheet = useDiagramStore((s) => s.activeSheet);
  const setActiveSheet = useDiagramStore((s) => s.setActiveSheet);
  const effectiveSheet = sheet ?? activeSheet;
  const doc = useDiagramStore((s) => s.doc);
  const selectedNodeIds = useDiagramStore((s) => s.selectedNodeIds);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const dispatch = useDiagramStore((s) => s.dispatch);
  const moveSelectedTo = useDiagramStore((s) => s.moveSelectedTo);
  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);
  const deleteSelected = useDiagramStore((s) => s.deleteSelected);
  const rotateNode = useDiagramStore((s) => s.rotateNode);
  const snapEnabled = useDiagramStore((s) => s.snapEnabled);
  const toggleSnap = useDiagramStore((s) => s.toggleSnap);
  const contextMenu = useDiagramStore((s) => s.contextMenu);
  const openContextMenu = useDiagramStore((s) => s.openContextMenu);
  const closeContextMenu = useDiagramStore((s) => s.closeContextMenu);

  const snapFnRef = useRef((v: number) => v);
  useEffect(() => {
    snapFnRef.current = snapEnabled ? (v: number) => snapToGrid(v) : (v: number) => v;
  }, [snapEnabled]);

  // mount / unmount stage
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const stage = new DiagramStage();
    stageRef.current = stage;
    stage
      .init(host, {
        snap: (v) => snapFnRef.current(v),
        onSelectNode: (id) => setSelection(id ? [id] : []),
        onSelectMany: (ids) => setSelection(ids),
        onMoveNodes: (deltas: MoveDelta[]) => {
          const map: Record<
            string,
            { from: { x: number; y: number }; to: { x: number; y: number } }
          > = {};
          for (const d of deltas) map[d.nodeId] = { from: d.from, to: d.to };
          moveSelectedTo(map);
        },
        onCommitEdge: (e: EdgeDraftCommit) => {
          dispatch(
            cmd.addEdge({
              sheet: effectiveSheet,
              source: e.source,
              sourcePort: e.sourcePort,
              target: e.target,
              targetPort: e.targetPort,
              kind: e.kind,
            }),
          );
        },
        onContextMenu: ({ nodeId, clientX, clientY }) => {
          const hostRect = host.getBoundingClientRect();
          openContextMenu({
            nodeId,
            x: clientX - hostRect.left,
            y: clientY - hostRect.top,
          });
        },
      })
      .then(() => {
        if (disposed) return;
        stage.fitView();
        stage.sync(
          useDiagramStore.getState().doc,
          effectiveSheet,
          useDiagramStore.getState().selectedNodeIds,
        );
      });
    return () => {
      disposed = true;
      stage.destroy();
      stageRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync em qualquer mudança relevante
  useEffect(() => {
    stageRef.current?.sync(doc, effectiveSheet, selectedNodeIds);
  }, [doc, effectiveSheet, selectedNodeIds]);

  // atalhos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        (document.activeElement as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (
        (meta && e.key.toLowerCase() === "z" && e.shiftKey) ||
        (meta && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeIds.length === 0) return;
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key.toLowerCase() === "r" && selectedNodeIds.length > 0) {
        e.preventDefault();
        for (const id of selectedNodeIds) rotateNode(id, e.shiftKey ? -90 : 90);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, deleteSelected, rotateNode, selectedNodeIds]);

  // fechar context menu ao clicar fora
  useEffect(() => {
    if (!contextMenu) return;
    const onDocDown = () => closeContextMenu();
    window.addEventListener("pointerdown", onDocDown);
    return () => window.removeEventListener("pointerdown", onDocDown);
  }, [contextMenu, closeContextMenu]);

  const handleExportDxf = useCallback(() => {
    try {
      const safe = (doc.metadata.title || "diagrama").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
      const counts = exportDiagramDxf(doc, effectiveSheet, `${safe}_${effectiveSheet}.dxf`);
      toast.success(`DXF gerado · ${counts.nodes} símbolos, ${counts.edges} ligações.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [doc, effectiveSheet]);

  const handleGenerateMultifilar = useCallback(() => {
    const commands = [...clearMultifilarCommands(doc), ...buildMultifilarCommands(doc)];
    if (commands.length === 0) {
      toast.error("Nada para converter — adicione componentes no unifilar primeiro.");
      return;
    }
    dispatch({ type: "Batch", commands });
    setActiveSheet("multifilar");
    toast.success("Diagrama multifilar gerado a partir do unifilar.");
  }, [doc, dispatch, setActiveSheet]);

  const handleExportPdf = useCallback(async () => {
    try {
      const { buildProjectPdf } = await import("@/lib/pdf-export");
      const safe = (doc.metadata.title || "diagrama").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
      let bom: Parameters<typeof buildProjectPdf>[0]["bom"] = [];
      let totalBRL = 0;
      if (projectId) {
        const result = await listBomFn({ data: { projectId } });
        bom = result.items;
        totalBRL = result.totalBRL;
      }
      const conductors = summarizeConductors(doc);
      const pdf = buildProjectPdf({
        project: { name: doc.metadata.title || "Diagrama sem título" },
        bom,
        totalBRL,
        conductors: conductors.rows.length > 0 ? conductors : undefined,
        norm: (doc.metadata.norms ?? []).join(" · ") || undefined,
      });
      pdf.save(`${safe}_memorial.pdf`);
      const condMsg =
        conductors.rows.length > 0
          ? ` · ${conductors.totalCircuits} circuitos / ${conductors.totalConductors} condutores`
          : "";
      toast.success(
        projectId
          ? `PDF gerado · ${bom.length} itens de BOM · R$ ${totalBRL.toFixed(2)}${condMsg}.`
          : `PDF gerado (diagrama ainda não salvo — memorial sem BOM)${condMsg}.`,
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [doc, projectId, listBomFn]);

  const hasSelection = selectedNodeIds.length > 0;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const rawType = e.dataTransfer.getData("application/voltai-component");
      if (!rawType || !isVoltaiComponentType(rawType)) return;

      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      const stage = stageRef.current;
      const world = stage?.screenToWorld(clientX, clientY) ?? {
        x: clientX + 2000 - rect.width / 2,
        y: clientY + 2000 - rect.height / 2,
      };
      const position = { x: snapToGrid(world.x), y: snapToGrid(world.y) };
      const kind = voltaiComponentToNodeKind(rawType);

      dispatch(
        cmd.addNode({
          sheet: effectiveSheet,
          position,
          params: defaultNodeParams(kind) as Parameters<typeof cmd.addNode>[0]["params"],
          label: rawType,
        }),
      );
    },
    [effectiveSheet, dispatch],
  );

  return (
    <div
      className="relative h-full w-full bg-[#0b0f17]"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div ref={hostRef} className="absolute inset-0" />

      {/* Toolbar */}
      <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-md border border-border/40 bg-background/80 p-1 backdrop-blur">
        <Button size="icon" variant="ghost" onClick={undo} title="Desfazer (⌘Z)">
          <Undo2 className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={redo} title="Refazer (⌘⇧Z)">
          <Redo2 className="size-4" />
        </Button>
        <Button
          size="icon"
          variant={snapEnabled ? "default" : "ghost"}
          onClick={toggleSnap}
          title={`Snap-to-grid: ${snapEnabled ? "ON" : "OFF"}`}
        >
          <Magnet className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={!hasSelection}
          onClick={() => selectedNodeIds.forEach((id) => rotateNode(id, 90))}
          title="Rotacionar 90° (R)"
        >
          <RotateCw className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={!hasSelection}
          onClick={deleteSelected}
          title="Excluir seleção (Del)"
        >
          <Trash2 className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => stageRef.current?.fitView()}
          title="Ajustar à tela"
        >
          <Maximize2 className="size-4" />
        </Button>
        <div className="mx-1 w-px bg-border/40" />
        {effectiveSheet === "unifilar" && (
          <Button size="sm" variant="outline" onClick={handleGenerateMultifilar}>
            Gerar Multifilar
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={handleExportDxf} title="Exportar DXF">
          <FileBox className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={handleExportPdf} title="Exportar PDF">
          <FileText className="size-4" />
        </Button>
      </div>

      {/* Legenda inferior */}
      <div className="absolute bottom-3 left-3 z-10 rounded-md border border-border/40 bg-background/70 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur">
        <span className="font-mono">Shift+arrastar</span> seleciona área ·{" "}
        <span className="font-mono">Arrastar porta</span> cria ligação ·{" "}
        <span className="font-mono">R</span> rotaciona · <span className="font-mono">Del</span>{" "}
        apaga
      </div>

      <ContextMenu onClose={closeContextMenu} hostRef={hostRef} />
    </div>
  );
}

function ContextMenu({
  onClose,
  hostRef,
}: {
  onClose: () => void;
  hostRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ctx = useDiagramStore((s) => s.contextMenu);
  const deleteSelected = useDiagramStore((s) => s.deleteSelected);
  const rotateNode = useDiagramStore((s) => s.rotateNode);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const selectedIds = useDiagramStore((s) => s.selectedNodeIds);

  const items = useMemo(() => {
    if (!ctx) return [];
    const onNode = ctx.nodeId != null;
    return [
      onNode && {
        label: "Rotacionar 90°",
        run: () => {
          const id = ctx.nodeId!;
          if (!selectedIds.includes(id)) setSelection([id]);
          rotateNode(id, 90);
        },
      },
      onNode && {
        label: "Excluir",
        destructive: true,
        run: () => {
          const id = ctx.nodeId!;
          if (!selectedIds.includes(id)) setSelection([id]);
          // Defer um tick para garantir que a seleção propagou antes do delete em batch
          queueMicrotask(() => deleteSelected());
        },
      },
      !onNode && {
        label: "Limpar seleção",
        run: () => setSelection([]),
      },
    ].filter(Boolean) as Array<{ label: string; run: () => void; destructive?: boolean }>;
  }, [ctx, selectedIds, deleteSelected, rotateNode, setSelection]);

  if (!ctx) return null;
  void hostRef;
  return (
    <div
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      style={{ left: ctx.x, top: ctx.y }}
      className="absolute z-30 min-w-[180px] rounded-md border border-border/60 bg-popover/95 p-1 text-sm shadow-lg backdrop-blur"
    >
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          className={`block w-full rounded px-2 py-1.5 text-left hover:bg-accent ${
            it.destructive ? "text-destructive" : "text-foreground"
          }`}
          onClick={() => {
            it.run();
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// Hook usado por callers externos (não usado aqui mas exportado por consistência)
export function useDiagramSelection() {
  const [, setTick] = useState(0);
  useEffect(
    () =>
      useDiagramStore.subscribe(
        (s) => s.selectedNodeIds,
        () => setTick((t) => t + 1),
      ),
    [],
  );
  return useDiagramStore.getState().selectedNodeIds;
}
