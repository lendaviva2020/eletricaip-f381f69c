import { useState, useCallback, useRef, useEffect, memo, createContext, useContext } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  getRectOfNodes,
  getTransformForBounds,
  Handle,
  Position,
  useNodeId,
  type Connection,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { toPng, toSvg } from "html-to-image";
import { Cpu, Download, FileCode, Image, Trash2, Settings, Sparkles } from "lucide-react";
import { BottomStrip, FloatingLegend } from "./canvas-chrome";
import { useEditorStore } from "@/lib/editor/store";
import { toast } from "sonner";
import { editorSpecFor, getFbdRegistry } from "@/lib/fbd/editor-bridge";
import { useFbdEngine } from "@/hooks/use-fbd-engine";
import { FbdEnginePanel } from "@/components/fbd/fbd-engine-panel";
import type { FbdValue } from "@/lib/fbd/engine";

/** Valores ao vivo da simulação por bloco → pino (inclui ENO). */
const FbdLiveContext = createContext<Readonly<Record<string, Readonly<Record<string, FbdValue>>>>>(
  {},
);

function liveText(v: FbdValue | undefined): string {
  if (v === undefined) return "";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return v;
}

interface Pin {
  id: string;
  label: string;
  type: string;
}

interface FbdNodeData {
  label: string;
  type: string;
  inputs: Pin[];
  outputs: Pin[];
  params?: Record<string, string | number>;
}

// Custom functional block node component
const FbdBlockNode = memo(function FbdBlockNode({ data }: { data: FbdNodeData }) {
  const [showConfig, setShowConfig] = useState(false);
  const nodeId = useNodeId();
  const live = useContext(FbdLiveContext)[nodeId ?? ""];
  const setFbdAll = useEditorStore((s) => s.setFbdAll);
  const eno = live?.ENO;
  const onParamChange = (key: string, val: string) => {
    if (!nodeId) return;
    setFbdAll(
      (prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, params: { ...n.data.params, [key]: val } } }
            : n,
        ),
      (prevEdges) => prevEdges,
    );
  };

  return (
    <div className="rounded border border-primary/40 bg-card/95 min-w-[160px] shadow-lg overflow-hidden glass-strong">
      {/* Block Header */}
      <div className="bg-primary/10 border-b border-primary/20 px-3 py-1.5 flex items-center justify-between">
        <span className="font-display text-[10px] font-bold text-primary tracking-wider uppercase">
          {data.type}
        </span>
        {eno !== undefined && (
          <span
            title={`ENO = ${eno === true ? "TRUE" : "FALSE"}`}
            className={`ml-auto mr-1 font-mono text-[8px] px-1 rounded ${
              eno === true ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
            }`}
          >
            ENO
          </span>
        )}
        {data.params && Object.keys(data.params).length > 0 && (
          <button
            title="Configurar parâmetros"
            onClick={() => setShowConfig(!showConfig)}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Settings className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Block Body */}
      <div className="p-3 flex justify-between relative gap-6">
        {/* Left: Input Pins */}
        <div className="flex flex-col gap-2.5 items-start">
          {data.inputs.map((pin, i) => (
            <div
              key={pin.id}
              className="relative flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground"
            >
              <Handle
                type="target"
                position={Position.Left}
                id={pin.id}
                style={{
                  top: i * 20 + 20,
                  left: -16,
                  background: pin.type === "BOOL" ? "oklch(0.78 0.17 200)" : "oklch(0.86 0.20 90)",
                  width: 7,
                  height: 7,
                  border: "none",
                }}
              />
              <span>{pin.label}</span>
              <span className="text-[8px] opacity-50">({pin.type})</span>
            </div>
          ))}
        </div>

        {/* Right: Output Pins */}
        <div className="flex flex-col gap-2.5 items-end">
          {data.outputs.map((pin, i) => (
            <div
              key={pin.id}
              className="relative flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground"
            >
              {live && live[pin.label] !== undefined && (
                <span className="text-[9px] text-primary">{liveText(live[pin.label])}</span>
              )}
              <span>{pin.label}</span>
              <span className="text-[8px] opacity-50">({pin.type})</span>
              <Handle
                type="source"
                position={Position.Right}
                id={pin.id}
                style={{
                  top: i * 20 + 20,
                  right: -16,
                  background: pin.type === "BOOL" ? "oklch(0.78 0.17 200)" : "oklch(0.86 0.20 90)",
                  width: 7,
                  height: 7,
                  border: "none",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Parameter settings editor */}
      {showConfig && data.params && (
        <div className="border-t border-border p-2 bg-background/50 flex flex-col gap-1.5">
          {Object.entries(data.params).map(([key, val]) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-[9px] uppercase font-semibold text-muted-foreground">
                {key}
              </label>
              <input
                type="text"
                aria-label={`Parametro ${key} do bloco ${data.label}`}
                title={`Parametro ${key} do bloco ${data.label}`}
                value={val}
                onChange={(e) => onParamChange(key, e.target.value)}
                className="h-6 px-1.5 text-[10px] bg-input border border-border rounded font-mono"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

const nodeTypes = {
  fbdBlock: FbdBlockNode,
};

export function FbdCanvas() {
  const nodes = useEditorStore((s) => s.fbdNodes);
  const edges = useEditorStore((s) => s.fbdEdges);
  const setFbdAll = useEditorStore((s) => s.setFbdAll);

  const [stCode, setStCode] = useState("");
  const [showStPanel, setShowStPanel] = useState(false);
  const [showEngine, setShowEngine] = useState(true);
  const engine = useFbdEngine();

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Auto compile to Structured Text (ST)
  useEffect(() => {
    let code = "VAR\n";
    nodes.forEach((n) => {
      code += `  ${n.id} : ${n.data?.type || "AND"};\n`;
    });
    code += "END_VAR\n\n";

    nodes.forEach((n) => {
      const inputsCall: string[] = [];
      const inputs = n.data?.inputs || [];
      inputs.forEach((pin: Pin) => {
        // Find if this input is connected to another block's output
        const incomingEdge = edges.find((e) => e.target === n.id && e.targetHandle === pin.id);
        if (incomingEdge) {
          inputsCall.push(
            `${pin.label} := ${incomingEdge.source}.${incomingEdge.sourceHandle?.toUpperCase()}`,
          );
        } else if (n.data?.params?.[pin.label.toUpperCase()]) {
          inputsCall.push(`${pin.label} := ${n.data.params[pin.label.toUpperCase()]}`);
        } else {
          inputsCall.push(`${pin.label} := FALSE`);
        }
      });
      code += `${n.id}(${inputsCall.join(", ")});\n`;
    });

    setStCode(code);
  }, [nodes, edges]);

  const onNodesChange = useCallback(
    (changes: any) => {
      setFbdAll(
        (prevNodes) => applyNodeChanges(changes, prevNodes),
        (prevEdges) => prevEdges,
      );
    },
    [setFbdAll],
  );

  const onEdgesChange = useCallback(
    (changes: any) => {
      setFbdAll(
        (prevNodes) => prevNodes,
        (prevEdges) => applyEdgeChanges(changes, prevEdges),
      );
    },
    [setFbdAll],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      // Validate type safety (verify handles exist and have compatible types)
      const sourceNode = nodes.find((n) => n.id === params.source);
      const sourcePin = sourceNode?.data?.outputs?.find((p: Pin) => p.id === params.sourceHandle);

      // Compatibilidade de tipos é decidida pelo compilador (diagnóstico TYPE_MISMATCH).
      setFbdAll(
        (prevNodes) => prevNodes,
        (prevEdges) =>
          addEdge(
            {
              ...params,
              style: {
                stroke: sourcePin?.type === "BOOL" ? "oklch(0.78 0.17 200)" : "oklch(0.86 0.20 90)",
                strokeWidth: 2,
              },
            },
            prevEdges,
          ),
      );
    },
    [nodes, setFbdAll],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/fbd-block");
      const def = type ? getFbdRegistry().get(type) : undefined;
      if (!def || def.namespace === "SYSTEM") return;

      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;

      const position = {
        x: event.clientX - rect.left - 80,
        y: event.clientY - rect.top - 40,
      };

      const used = new Set(nodes.map((n) => n.id));
      let seq = 1;
      while (used.has(`${type}_${seq}`)) seq += 1;
      const nodeId = `${type}_${seq}`;
      const spec = editorSpecFor(def);

      const newNode: Node<FbdNodeData> = {
        id: nodeId,
        type: "fbdBlock",
        position,
        data: {
          label: nodeId,
          type: spec.type,
          inputs: spec.inputs,
          outputs: spec.outputs,
          params: spec.params ? { ...spec.params } : undefined,
        },
      };

      setFbdAll(
        (prevNodes) => prevNodes.concat(newNode),
        (prevEdges) => prevEdges,
      );
    },
    [nodes, setFbdAll],
  );

  const exportST = () => {
    const blob = new Blob([stCode], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "NexusMind_Compiled_FBD.txt";
    link.click();
  };

  const deleteSelected = () => {
    setFbdAll(
      (prevNodes) => prevNodes.filter((n) => !n.selected),
      (prevEdges) => prevEdges.filter((e) => !e.selected),
    );
  };

  const handleExportImage = useCallback(
    async (format: "png" | "svg") => {
      if (nodes.length === 0) {
        toast.error("Nada para exportar — adicione blocos ao diagrama primeiro.");
        return;
      }
      const bounds = getRectOfNodes(nodes);
      const padding = 60;
      const width = bounds.width + padding * 2;
      const height = bounds.height + padding * 2;
      const transform = getTransformForBounds(bounds, width, height, 0.5, 2, padding);
      const viewportEl = document.querySelector(".react-flow__viewport") as HTMLElement | null;
      if (!viewportEl) {
        toast.error("Não foi possível localizar o canvas para exportar.");
        return;
      }
      try {
        const fn = format === "png" ? toPng : toSvg;
        const dataUrl = await fn(viewportEl, {
          backgroundColor: "#0a0a0a",
          width,
          height,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate(${transform[0]}px, ${transform[1]}px) scale(${transform[2]})`,
          },
        });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `fbd_diagrama.${format}`;
        a.click();
        toast.success(`Exportado como ${format.toUpperCase()}.`);
      } catch (err) {
        toast.error(`Falha ao exportar: ${(err as Error).message}`);
      }
    },
    [nodes],
  );

  return (
    <div className="relative h-full w-full bg-[--canvas-bg]" ref={wrapperRef}>
      <FloatingLegend
        title="FBD · Diagrama de Blocos Funcionais"
        items={["IEC 61131-3", `${nodes.length} blocos`, `${edges.length} conexões`]}
      />

      {/* CANVAS CONTROLS */}
      <div className="absolute top-16 left-6 z-10 flex gap-2">
        <button
          onClick={() => setShowStPanel(!showStPanel)}
          className="h-8 px-3 rounded bg-primary/10 border border-primary/20 hover:bg-primary/20 text-[10px] font-bold uppercase tracking-wider text-primary inline-flex items-center gap-1.5 cursor-pointer"
        >
          <FileCode className="h-3.5 w-3.5" />
          <span>{showStPanel ? "Ocultar ST" : "Compilar ST"}</span>
        </button>

        <button
          onClick={() => setShowEngine(!showEngine)}
          className="h-8 px-3 rounded bg-primary/10 border border-primary/20 hover:bg-primary/20 text-[10px] font-bold uppercase tracking-wider text-primary inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Cpu className="h-3.5 w-3.5" />
          <span>{showEngine ? "Ocultar motor" : "Motor IEC"}</span>
        </button>

        <button
          onClick={() => handleExportImage("png")}
          title="Exportar PNG"
          className="h-8 px-3 rounded border border-border bg-card/60 hover:bg-accent text-[10px] uppercase font-bold tracking-wider inline-flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <Image className="h-3.5 w-3.5" />
          <span>PNG</span>
        </button>

        <button
          onClick={() => handleExportImage("svg")}
          title="Exportar SVG"
          className="h-8 px-3 rounded border border-border bg-card/60 hover:bg-accent text-[10px] uppercase font-bold tracking-wider inline-flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <Image className="h-3.5 w-3.5" />
          <span>SVG</span>
        </button>

        <button
          onClick={deleteSelected}
          className="h-8 px-3 rounded border border-border bg-card/60 hover:bg-accent text-[10px] uppercase font-bold tracking-wider inline-flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Apagar</span>
        </button>
      </div>

      {/* REACT FLOW SURFACE */}
      <div className="h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
        <FbdLiveContext.Provider value={engine.live?.outputs ?? {}}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            snapToGrid
            snapGrid={[20, 20]}
            fitView
            onlyRenderVisibleElements={true}
          >
            <Background color="var(--color-border)" gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeColor={() => "var(--color-primary)"}
              maskColor="rgba(0,0,0,0.4)"
              style={{ background: "var(--color-card)" }}
            />
          </ReactFlow>
        </FbdLiveContext.Provider>
      </div>

      {showEngine && !showStPanel && (
        <FbdEnginePanel engine={engine} onClose={() => setShowEngine(false)} />
      )}

      {/* FLOATING STRUCTURED TEXT CODE PANEL */}
      {showStPanel && (
        <div className="absolute right-6 top-16 z-20 w-[300px] h-[360px] rounded-lg border border-primary/30 flex flex-col shadow-2xl overflow-hidden glass-strong bg-background/95">
          <div className="h-10 shrink-0 flex items-center justify-between px-3 border-b border-border bg-card/40">
            <span className="text-[10px] font-display font-bold tracking-wider text-primary flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 animate-spin" />
              COMPILADOR ST NEXUSMIND
            </span>
            <button
              onClick={exportST}
              title="Exportar Código (.txt)"
              className="h-7 w-7 grid place-items-center rounded hover:bg-accent/50 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 p-3 overflow-auto">
            <pre className="text-[10px] font-mono text-muted-foreground leading-normal whitespace-pre-wrap">
              {stCode}
            </pre>
          </div>
        </div>
      )}

      <BottomStrip
        items={[
          ["Norma", "IEC 61131-3"],
          ["Target", "Structured Text"],
          [
            "Motor",
            engine.result.ok
              ? `IR ${engine.result.ir?.instructions.length ?? 0} instr.`
              : "com erros",
          ],
        ]}
      />
    </div>
  );
}
