import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { LazyMonacoEditor as Editor } from "./lazy";
import {
  Cpu,
  MemoryStick,
  Network,
  Activity,
  Plus,
  Trash2,
  GripVertical,
  Code2,
  Table2,
  Settings2,
  LayoutGrid,
  ChevronRight,
  Play,
  Pause,
  HardDrive,
  Zap,
  Terminal,
  Save,
  Download,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { usePlcStore } from "@/lib/plc/store";
import {
  HARDWARE_CATALOG,
  ADDRESS_TYPES,
  type PlcVariable,
  type PlcProgramBlock,
  type ProgramLang,
  type PlcModule,
} from "@/lib/plc/types";
import { canAddModule, validateRack } from "@/lib/plc/rack-validation";
import { useEditorStore, type EditorTag, type FbdNode, type FbdEdge } from "@/lib/editor/store";
import { compileProgram } from "@/lib/ladder/compiler";
import { compileFbdToSt } from "@/lib/fbd/compiler";
import { downloadPlcOpenXml } from "@/lib/plc/plcopen-export";
import type { LadderRung } from "@/lib/ladder/types";
import type { LucideIcon } from "lucide-react";
import { FloatingLegend } from "./canvas-chrome";

const LANG_LABELS: Record<ProgramLang, string> = { ladder: "LAD", fbd: "FBD", st: "ST" };

export function PlcCanvas() {
  const {
    project,
    activeTab,
    activeBlockId,
    setActiveTab,
    setActiveBlock,
    setProject,
    addModule,
    removeModule,
    addVariable,
    updateVariable,
    removeVariable,
    addBlock,
    updateBlock,
    removeBlock,
  } = usePlcStore();

  const activeBlock = project.programBlocks.find((b) => b.id === activeBlockId);

  const varCounter = useMemo(() => {
    let c = project.variables.length + 1;
    return () => `var-${c++}-${Date.now()}`;
  }, [project.variables.length]);

  const totalDI = project.rack.modules
    .filter((m) => m.category === "di")
    .reduce((s, m) => s + m.channels, 0);
  const totalDO = project.rack.modules
    .filter((m) => m.category === "do")
    .reduce((s, m) => s + m.channels, 0);
  const totalAI = project.rack.modules
    .filter((m) => m.category === "ai")
    .reduce((s, m) => s + m.channels, 0);

  const [editingVar, setEditingVar] = useState<string | null>(null);
  const [editVarData, setEditVarData] = useState<Partial<PlcVariable>>({});

  const startEditVar = (v: PlcVariable) => {
    setEditingVar(v.id);
    setEditVarData({ ...v });
  };

  const saveEditVar = () => {
    if (editingVar) updateVariable(editingVar, editVarData);
    setEditingVar(null);
  };

  const [stCode, setStCode] = useState("");
  useEffect(() => {
    if (activeBlock) setStCode(activeBlock.code);
  }, [activeBlock]);

  const handleStChange = (val: string | undefined) => {
    const code = val ?? "";
    setStCode(code);
    if (activeBlock) updateBlock(activeBlock.id, { code });
  };

  // Build editor tags from PLC variables for block-scoped editing
  const buildBlockEditorTags = useCallback(
    (block?: PlcProgramBlock): Record<string, EditorTag> => {
      // Start with global PLC variables
      const tags: Record<string, EditorTag> = {};
      for (const v of project.variables) {
        tags[v.id] = {
          id: v.id,
          name: v.name || v.address || v.id,
          type:
            v.type === "BOOL"
              ? "BOOL"
              : v.type === "REAL"
                ? "REAL"
                : v.type === "STRING"
                  ? "STRING"
                  : "INT",
          value: v.initialValue ?? (v.type === "BOOL" ? false : 0),
          forced: false,
        };
      }
      // Block-local tags from ladder definition (if any)
      if (block?.ladder?.rungs) {
        for (const rung of block.ladder.rungs as LadderRung[]) {
          for (const row of rung?.cells ?? []) {
            for (const cell of row ?? []) {
              if (cell?.operand && cell.operand !== "&nbsp;" && !tags[cell.operand]) {
                tags[cell.operand] = {
                  id: cell.operand,
                  name: cell.operand,
                  type: "BOOL",
                  value: false,
                  forced: false,
                };
              }
            }
          }
        }
      }
      return tags;
    },
    [project.variables],
  );

  // #PLC-01 — Bridge PLC ↔ Editor: persist outgoing block snapshot, hydrate incoming
  const hydrateEditor = useEditorStore((s) => s.hydrateSnapshot);
  const setActiveMode = useEditorStore((s) => s.setActiveMode);
  const prevBlockIdRef = useRef<string | null>(null);

  useEffect(() => {
    const editorState = useEditorStore.getState();
    const prevId = prevBlockIdRef.current;

    // Save outgoing block state
    if (prevId && prevId !== activeBlockId) {
      const prev = project.programBlocks.find((b) => b.id === prevId);
      if (prev?.language === "ladder") {
        updateBlock(prevId, { ladder: { rungs: editorState.rungs } });
      } else if (prev?.language === "fbd") {
        updateBlock(prevId, {
          fbd: {
            nodes: editorState.fbdNodes,
            edges: editorState.fbdEdges,
          },
        });
      }
    }

    // Hydrate incoming block state
    if (activeBlock) {
      const blockTags = buildBlockEditorTags(activeBlock);
      if (activeBlock.language === "ladder") {
        hydrateEditor({
          rungs: (activeBlock.ladder?.rungs ?? []) as LadderRung[],
          editorTags: blockTags,
        });
      } else if (activeBlock.language === "fbd") {
        hydrateEditor({
          fbdNodes: (activeBlock.fbd?.nodes as FbdNode[]) ?? [],
          fbdEdges: (activeBlock.fbd?.edges as FbdEdge[]) ?? [],
          editorTags: blockTags,
        });
      }
    }

    prevBlockIdRef.current = activeBlockId;
    prevBlockIdRef.current = activeBlockId;
    // activeBlock omitted intentionally — it's derived from programBlocks which
    // we mutate inside this effect. Including it would cause re-hydration loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBlockId, project.programBlocks, updateBlock, hydrateEditor, buildBlockEditorTags]);

  // #PLC-02 — Compile current block (Ladder/FBD → ST), persist into block.code
  const handleCompile = () => {
    if (!activeBlock) return;
    const editorState = useEditorStore.getState();

    if (activeBlock.language === "ladder") {
      const code = compileProgram(editorState.rungs, "ST");
      updateBlock(activeBlock.id, {
        code,
        ladder: { rungs: editorState.rungs },
      });
      setStCode(code);
      toast.success(`${activeBlock.name}: ${editorState.rungs.length} rungs compilados → ST`);
    } else if (activeBlock.language === "fbd") {
      const code = compileFbdToSt(
        editorState.fbdNodes as unknown as Parameters<typeof compileFbdToSt>[0],
        editorState.fbdEdges as unknown as Parameters<typeof compileFbdToSt>[1],
      );
      updateBlock(activeBlock.id, {
        code,
        fbd: {
          nodes: editorState.fbdNodes,
          edges: editorState.fbdEdges,
        },
      });
      setStCode(code);
      toast.success(
        `${activeBlock.name}: ${editorState.fbdNodes.length} blocos FBD compilados → ST`,
      );
    } else if (activeBlock.language === "st") {
      toast.info("Bloco já é Structured Text — nada a compilar");
    }
  };

  const handleAutoAddress = () => {
    let diOffset = 0;
    let doOffset = 0;
    let aiOffset = 0;
    let mOffset = 0;

    for (const v of [...project.variables].sort((a, b) => a.name.localeCompare(b.name))) {
      if (v.address && v.address !== "") continue; // skip already-addressed
      let addr = "";
      if (v.type === "BOOL") {
        if (diOffset < totalDI) {
          addr = `%I${Math.floor(diOffset / 8)}.${diOffset % 8}`;
          diOffset++;
        } else if (doOffset < totalDO) {
          addr = `%Q${Math.floor(doOffset / 8)}.${doOffset % 8}`;
          doOffset++;
        } else {
          addr = `%M${Math.floor(mOffset / 8)}.${mOffset % 8}`;
          mOffset++;
        }
      } else if (v.type === "INT" || v.type === "DINT" || v.type === "REAL") {
        if (aiOffset < totalAI) {
          addr = `%IW${aiOffset}`;
          aiOffset++;
        } else {
          addr = `%MW${mOffset}`;
          mOffset++;
        }
      } else {
        addr = `%MW${mOffset}`;
        mOffset++;
      }
      updateVariable(v.id, { address: addr });
    }
    toast.success(`Endereços automáticos gerados para ${project.variables.length} variáveis`);
  };

  const openInCanvas = () => {
    if (!activeBlock) return;
    if (activeBlock.language === "ladder") setActiveMode("ladder");
    else if (activeBlock.language === "fbd") setActiveMode("fbd");
    else toast.info("Bloco ST é editado aqui mesmo");
  };

  const [diagCount, setDiagCount] = useState(0);
  const diagMsgs = useMemo(() => {
    const lines: string[] = [];
    if (project.rack.modules.length === 0) lines.push("⚠ Nenhum módulo de hardware configurado.");
    if (project.programBlocks.length === 0) lines.push("⚠ Nenhum bloco de programa criado.");
    lines.push(`✓ ${project.variables.length} variáveis globais`);
    lines.push(`✓ ${project.rack.modules.length} módulos de hardware`);
    if (activeBlock)
      lines.push(
        `✓ Bloco ${activeBlock.name} (${activeBlock.type}${activeBlock.number}) · ${LANG_LABELS[activeBlock.language]}`,
      );
    return lines;
  }, [project, activeBlock]);

  return (
    <div className="relative h-full w-full flex flex-col bg-[--canvas-bg]">
      <FloatingLegend
        title="PLC Editor"
        items={[
          `${project.vendor.toUpperCase()} · ${project.rack.modules.length} módulos`,
          `${totalDI} DI · ${totalDO} DO · ${totalAI} AI`,
          `${project.programBlocks.length} blocos`,
        ]}
      />

      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-3 pt-12 border-b border-border bg-card/20">
        {[
          { id: "dashboard" as const, icon: Activity, label: "Dashboard" },
          { id: "hardware" as const, icon: Settings2, label: "Hardware" },
          { id: "variables" as const, icon: Table2, label: "Variáveis" },
          { id: "blocks" as const, icon: Code2, label: "Blocos" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono uppercase tracking-wider cursor-pointer border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/20"
            }`}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => downloadPlcOpenXml(project)}
          title="Exportar projeto PLCopen XML (.plcproj)"
          className="ml-auto mb-1 flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-card/60 text-[10px] font-mono uppercase tracking-wider hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Download className="h-3 w-3" /> .plcproj
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {activeTab === "dashboard" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <StatCard
                icon={Cpu}
                label="CPU"
                value={project.rack.modules.find((m) => m.category === "cpu")?.label || "Nenhuma"}
                sub={`Ciclo: ${project.cycleTimeMs}ms`}
              />
              <StatCard
                icon={MemoryStick}
                label="Hardware"
                value={`${project.rack.modules.length} módulos`}
                sub={`${totalDI} DI · ${totalDO} DO · ${totalAI} AI`}
              />
              <StatCard
                icon={Network}
                label="Programa"
                value={`${project.programBlocks.length} blocos`}
                sub={`${project.variables.length} variáveis`}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-md border border-border glass p-4">
                <div className="text-[11px] font-mono font-bold text-muted-foreground uppercase mb-3 flex items-center gap-2">
                  <Terminal className="h-3.5 w-3.5 text-primary" /> Diagnóstico
                </div>
                <ul className="space-y-1.5">
                  {diagMsgs.map((msg, i) => (
                    <li
                      key={i}
                      className={`text-[11px] font-mono ${msg.startsWith("✓") ? "text-success" : msg.startsWith("⚠") ? "text-warning" : "text-muted-foreground"}`}
                    >
                      {msg}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md border border-border glass p-4">
                <div className="text-[11px] font-mono font-bold text-muted-foreground uppercase mb-3 flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-primary" /> Tags Ativas
                </div>
                <table className="w-full text-[10px] font-mono">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left pb-1">Nome</th>
                      <th className="text-left pb-1">Addr</th>
                      <th className="text-right pb-1">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {project.variables.slice(0, 8).map((v) => (
                      <tr key={v.id}>
                        <td className="py-1 text-foreground">{v.name}</td>
                        <td className="text-muted-foreground">{v.address}</td>
                        <td className="text-right text-primary">{v.initialValue ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "hardware" && (
          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
            {/* Module catalog */}
            <div className="rounded-md border border-border glass p-3">
              <div className="text-[10px] font-mono font-bold uppercase text-muted-foreground mb-2">
                Catálogo
              </div>
              <div className="space-y-1">
                {HARDWARE_CATALOG.map((def) => (
                  <button
                    key={def.key}
                    onClick={() => addModule(def.key, def.label, def.category, def.channels)}
                    className="w-full text-left px-2 py-1.5 rounded text-[10px] font-mono hover:bg-accent/30 cursor-pointer flex items-center gap-2 transition-colors"
                  >
                    <Plus className="h-3 w-3 text-primary shrink-0" />
                    <span className="text-foreground">{def.label}</span>
                    <span className="text-muted-foreground ml-auto">{def.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Rack view */}
            <div className="rounded-md border border-border glass p-4">
              <div className="text-[10px] font-mono font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                <LayoutGrid className="h-3.5 w-3.5 text-primary" /> {project.rack.label}
              </div>
              {project.rack.modules.length === 0 ? (
                <div className="text-[11px] text-muted-foreground py-8 text-center font-mono">
                  Nenhum módulo. Adicione módulos da lista ao lado.
                </div>
              ) : (
                <div className="space-y-1">
                  {project.rack.modules.map((m, i) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 px-3 py-2 rounded border border-border/60 bg-card/30 text-[11px] font-mono"
                    >
                      <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="w-6 text-muted-foreground text-[10px]">S{i + 1}</span>
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          m.category === "cpu"
                            ? "bg-primary"
                            : m.category === "di" || m.category === "ai"
                              ? "bg-[#3fb6d6]"
                              : m.category === "do" || m.category === "ao"
                                ? "bg-[#5fd699]"
                                : "bg-[#f3c44b]"
                        }`}
                      />
                      <span className="text-foreground flex-1">{m.label}</span>
                      {m.channels > 0 && (
                        <span className="text-muted-foreground">{m.channels} canais</span>
                      )}
                      <button
                        onClick={() => removeModule(m.id)}
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "variables" && (
          <div className="rounded-md border border-border glass overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                <Table2 className="h-3.5 w-3.5 text-primary" /> Variáveis Globais (
                {project.variables.length})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAutoAddress}
                  title="Gerar endereços automáticos baseados nos módulos de hardware"
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer font-mono"
                >
                  <RefreshCw className="h-3 w-3" /> Auto Endereçar
                </button>
                <button
                  onClick={() => {
                    const id = varCounter();
                    addVariable({
                      id,
                      name: "",
                      address: "",
                      type: "BOOL",
                      comment: "",
                      retentive: false,
                    });
                    startEditVar({
                      id,
                      name: "",
                      address: "",
                      type: "BOOL",
                      comment: "",
                      retentive: false,
                      initialValue: false,
                    });
                  }}
                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 cursor-pointer font-mono"
                >
                  <Plus className="h-3 w-3" /> Nova Variável
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead className="bg-card/40 text-muted-foreground text-[10px]">
                  <tr>
                    <th className="text-left px-3 py-2">Nome</th>
                    <th className="text-left px-3 py-2">Endereço</th>
                    <th className="text-left px-3 py-2">Tipo</th>
                    <th className="text-left px-3 py-2">Valor Inicial</th>
                    <th className="text-left px-3 py-2">Retentivo</th>
                    <th className="text-left px-3 py-2">Comentário</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {project.variables.map((v) =>
                    editingVar === v.id ? (
                      <tr key={v.id} className="bg-primary/5">
                        <td className="px-3 py-1">
                          <input
                            className="w-24 h-7 px-1.5 rounded border border-border bg-input text-[11px] font-mono outline-none focus:border-primary"
                            value={editVarData.name ?? ""}
                            onChange={(e) =>
                              setEditVarData((p) => ({ ...p, name: e.target.value }))
                            }
                          />
                        </td>
                        <td className="px-3 py-1">
                          <input
                            className="w-20 h-7 px-1.5 rounded border border-border bg-input text-[11px] font-mono outline-none focus:border-primary"
                            value={editVarData.address ?? ""}
                            onChange={(e) =>
                              setEditVarData((p) => ({ ...p, address: e.target.value }))
                            }
                          />
                        </td>
                        <td className="px-3 py-1">
                          <select
                            className="h-7 px-1 rounded border border-border bg-input text-[11px] font-mono outline-none focus:border-primary cursor-pointer"
                            value={editVarData.type ?? "BOOL"}
                            onChange={(e) =>
                              setEditVarData((p) => ({
                                ...p,
                                type: e.target.value as PlcVariable["type"],
                              }))
                            }
                          >
                            {ADDRESS_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-1">
                          <input
                            className="w-16 h-7 px-1.5 rounded border border-border bg-input text-[11px] font-mono outline-none focus:border-primary"
                            value={String(editVarData.initialValue ?? "")}
                            onChange={(e) =>
                              setEditVarData((p) => ({ ...p, initialValue: e.target.value }))
                            }
                          />
                        </td>
                        <td className="px-3 py-1">
                          <input
                            type="checkbox"
                            className="cursor-pointer accent-primary"
                            checked={editVarData.retentive ?? false}
                            onChange={(e) =>
                              setEditVarData((p) => ({ ...p, retentive: e.target.checked }))
                            }
                          />
                        </td>
                        <td className="px-3 py-1">
                          <input
                            className="w-32 h-7 px-1.5 rounded border border-border bg-input text-[11px] font-mono outline-none focus:border-primary"
                            value={editVarData.comment ?? ""}
                            onChange={(e) =>
                              setEditVarData((p) => ({ ...p, comment: e.target.value }))
                            }
                          />
                        </td>
                        <td className="px-3 py-1">
                          <div className="flex gap-1">
                            <button
                              onClick={saveEditVar}
                              className="text-success hover:text-success/80 cursor-pointer"
                            >
                              <Save className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => setEditingVar(null)}
                              className="text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={v.id}
                        className="hover:bg-accent/10 cursor-pointer"
                        onClick={() => startEditVar(v)}
                      >
                        <td className="px-3 py-1.5 text-foreground">
                          {v.name || <span className="text-muted-foreground italic">sem nome</span>}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{v.address}</td>
                        <td className="px-3 py-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-card/60 text-[10px]">
                            {v.type}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-primary">{v.initialValue ?? "-"}</td>
                        <td className="px-3 py-1.5">
                          {v.retentive ? <span className="text-success">R</span> : "-"}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground text-[10px]">
                          {v.comment}
                        </td>
                        <td className="px-3 py-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeVariable(v.id);
                            }}
                            className="text-muted-foreground hover:text-destructive cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "blocks" && (
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 h-full">
            {/* Block list */}
            <div className="rounded-md border border-border glass p-3 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground">
                  Blocos
                </span>
                <button
                  onClick={() => {
                    const n = project.programBlocks.length + 1;
                    addBlock({
                      id: `pb-${Date.now()}`,
                      name: `Prog${n}`,
                      type: "FC",
                      number: n,
                      language: "st",
                      code: `// ${`Prog${n}`}\n`,
                      comment: "",
                    });
                  }}
                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 cursor-pointer font-mono"
                >
                  <Plus className="h-3 w-3" /> Novo
                </button>
              </div>
              <div className="space-y-0.5">
                {project.programBlocks.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setActiveBlock(b.id);
                      setStCode(b.code);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded text-[10px] font-mono flex items-center gap-2 cursor-pointer transition-colors ${
                      activeBlockId === b.id
                        ? "bg-primary/15 text-primary"
                        : "hover:bg-accent/20 text-foreground"
                    }`}
                  >
                    <ChevronRight
                      className={`h-3 w-3 shrink-0 ${activeBlockId === b.id ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <span
                      className={`px-1 rounded text-[9px] font-bold ${
                        b.type === "OB"
                          ? "bg-[#3fb6d6]/20 text-[#3fb6d6]"
                          : b.type === "FC"
                            ? "bg-[#5fd699]/20 text-[#5fd699]"
                            : b.type === "FB"
                              ? "bg-[#f3c44b]/20 text-[#f3c44b]"
                              : "bg-[#9bb6ff]/20 text-[#9bb6ff]"
                      }`}
                    >
                      {b.type}
                      {b.number}
                    </span>
                    <span className="flex-1 truncate">{b.name}</span>
                    <span className="text-muted-foreground">{LANG_LABELS[b.language]}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBlock(b.id);
                        if (activeBlockId === b.id) setActiveBlock(null);
                      }}
                      className="text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </button>
                ))}
              </div>
            </div>

            {/* Editor */}
            <div className="rounded-md border border-border glass flex flex-col overflow-hidden">
              {activeBlock ? (
                <>
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <Code2 className="h-3.5 w-3.5 text-primary" />
                      <span className="text-foreground font-bold">{activeBlock.name}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          activeBlock.type === "OB"
                            ? "bg-[#3fb6d6]/20 text-[#3fb6d6]"
                            : activeBlock.type === "FC"
                              ? "bg-[#5fd699]/20 text-[#5fd699]"
                              : "bg-[#f3c44b]/20 text-[#f3c44b]"
                        }`}
                      >
                        {activeBlock.type}
                        {activeBlock.number}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={activeBlock.language}
                        onChange={(e) =>
                          updateBlock(activeBlock.id, { language: e.target.value as ProgramLang })
                        }
                        className="h-7 px-2 rounded border border-border bg-input text-[10px] font-mono outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="ladder">Ladder</option>
                        <option value="fbd">FBD</option>
                        <option value="st">ST</option>
                      </select>
                      {activeBlock.language !== "st" && (
                        <button
                          onClick={openInCanvas}
                          title={`Abrir no canvas ${LANG_LABELS[activeBlock.language]}`}
                          className="flex items-center gap-1 h-7 px-2 rounded border border-border bg-card/60 text-[10px] font-mono hover:bg-accent cursor-pointer text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3 w-3" /> Abrir Canvas
                        </button>
                      )}
                      <button
                        onClick={handleCompile}
                        className="flex items-center gap-1 h-7 px-2 rounded border border-primary/30 bg-primary/10 text-[10px] font-mono hover:bg-primary/20 cursor-pointer text-primary"
                      >
                        <Play className="h-3 w-3" /> Compilar
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    {activeBlock.language === "st" ? (
                      <Editor
                        height="100%"
                        language="pascal"
                        theme="vs-dark"
                        value={stCode}
                        onChange={handleStChange}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 12,
                          fontFamily: "JetBrains Mono, monospace",
                          lineNumbers: "on",
                          scrollBeyondLastLine: false,
                          wordWrap: "on",
                          automaticLayout: true,
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-[11px] font-mono">
                        <div className="text-center space-y-2">
                          <LayoutGrid className="h-8 w-8 mx-auto opacity-30" />
                          <p>
                            Editor {LANG_LABELS[activeBlock.language]} será aberto no canvas
                            principal
                          </p>
                          <p className="text-[10px] text-muted-foreground/60">
                            Alternar para linguagem ST para editar Structured Text
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-[11px] font-mono">
                  <div className="text-center space-y-2">
                    <Code2 className="h-8 w-8 mx-auto opacity-30" />
                    <p>Selecione um bloco de programa para editar</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-md border border-border glass p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 text-lg font-mono text-primary text-glow truncate">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}
