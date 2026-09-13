import { useState, useCallback, useRef, useEffect, memo } from "react";
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
  type Connection,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { toPng, toSvg } from "html-to-image";
import { Download, FileCode, Image, Trash2, Settings, Sparkles } from "lucide-react";
import { BottomStrip, FloatingLegend } from "./canvas-chrome";
import { useEditorStore } from "@/lib/editor/store";
import { toast } from "sonner";

interface Pin {
  id: string;
  label: string;
  type: "BOOL" | "INT" | "REAL";
}

interface FbdNodeData {
  label: string;
  type: string;
  inputs: Pin[];
  outputs: Pin[];
  params?: Record<string, string | number>;
  onParamChange?: (key: string, val: string | number) => void;
}

// Custom functional block node component
const FbdBlockNode = memo(function FbdBlockNode({ data }: { data: FbdNodeData }) {
  const [showConfig, setShowConfig] = useState(false);

  return (
    <div className="rounded border border-primary/40 bg-card/95 min-w-[160px] shadow-lg overflow-hidden glass-strong">
      {/* Block Header */}
      <div className="bg-primary/10 border-b border-primary/20 px-3 py-1.5 flex items-center justify-between">
        <span className="font-display text-[10px] font-bold text-primary tracking-wider uppercase">
          {data.type}
        </span>
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
      {showConfig && data.params && data.onParamChange && (
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
                onChange={(e) => data.onParamChange!(key, e.target.value)}
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

const defaultBlocks: Record<
  string,
  { inputs: Pin[]; outputs: Pin[]; params?: Record<string, string | number> }
> = {
  AND: {
    inputs: [
      { id: "in1", label: "IN1", type: "BOOL" },
      { id: "in2", label: "IN2", type: "BOOL" },
    ],
    outputs: [{ id: "out", label: "OUT", type: "BOOL" }],
  },
  OR: {
    inputs: [
      { id: "in1", label: "IN1", type: "BOOL" },
      { id: "in2", label: "IN2", type: "BOOL" },
    ],
    outputs: [{ id: "out", label: "OUT", type: "BOOL" }],
  },
  NOT: {
    inputs: [{ id: "in", label: "IN", type: "BOOL" }],
    outputs: [{ id: "out", label: "OUT", type: "BOOL" }],
  },
  XOR: {
    inputs: [
      { id: "in1", label: "IN1", type: "BOOL" },
      { id: "in2", label: "IN2", type: "BOOL" },
    ],
    outputs: [{ id: "out", label: "OUT", type: "BOOL" }],
  },
  SR: {
    inputs: [
      { id: "s", label: "S", type: "BOOL" },
      { id: "r1", label: "R1", type: "BOOL" },
    ],
    outputs: [{ id: "q1", label: "Q1", type: "BOOL" }],
  },
  RS: {
    inputs: [
      { id: "s1", label: "S1", type: "BOOL" },
      { id: "r", label: "R", type: "BOOL" },
    ],
    outputs: [{ id: "q1", label: "Q1", type: "BOOL" }],
  },
  TON: {
    inputs: [
      { id: "in", label: "IN", type: "BOOL" },
      { id: "pt", label: "PT", type: "INT" },
    ],
    outputs: [
      { id: "q", label: "Q", type: "BOOL" },
      { id: "et", label: "ET", type: "INT" },
    ],
    params: { PT: "T#5s" },
  },
  CTU: {
    inputs: [
      { id: "cu", label: "CU", type: "BOOL" },
      { id: "r", label: "R", type: "BOOL" },
      { id: "pv", label: "PV", type: "INT" },
    ],
    outputs: [
      { id: "q", label: "Q", type: "BOOL" },
      { id: "cv", label: "CV", type: "INT" },
    ],
    params: { PV: 10 },
  },
};

export function FbdCanvas() {
  const nodes = useEditorStore((s) => s.fbdNodes);
  const edges = useEditorStore((s) => s.fbdEdges);
  const setFbdAll = useEditorStore((s) => s.setFbdAll);

  const [stCode, setStCode] = useState("");
  const [showStPanel, setShowStPanel] = useState(false);

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
      const targetNode = nodes.find((n) => n.id === params.target);
      const sourcePin = sourceNode?.data?.outputs?.find((p: Pin) => p.id === params.sourceHandle);
      const targetPin = targetNode?.data?.inputs?.find((p: Pin) => p.id === params.targetHandle);

      if (sourcePin && targetPin && sourcePin.type !== targetPin.type) {
        toast.error(
          `Erro de Tipo: Não é possível conectar ${sourcePin.type} com ${targetPin.type}.`,
        );
        return;
      }

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
      if (!type || !defaultBlocks[type]) return;

      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;

      const position = {
        x: event.clientX - rect.left - 80,
        y: event.clientY - rect.top - 40,
      };

      const blockCount = nodes.filter((n) => n.data?.type === type).length + 1;
      const nodeId = `${type}_${blockCount}`;

      const onParamChange = (key: string, val: string | number) => {
        setFbdAll(
          (prevNodes) =>
            prevNodes.map((n) => {
              if (n.id === nodeId) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    params: {
                      ...n.data.params,
                      [key]: val,
                    },
                  },
                };
              }
              return n;
            }),
          (prevEdges) => prevEdges,
        );
      };

      const newNode: Node<FbdNodeData> = {
        id: nodeId,
        type: "fbdBlock",
        position,
        data: {
          label: nodeId,
          type,
          inputs: defaultBlocks[type].inputs,
          outputs: defaultBlocks[type].outputs,
          params: defaultBlocks[type].params ? { ...defaultBlocks[type].params } : undefined,
          onParamChange,
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
      </div>

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
          ["Engine", "NexusCompiler v2"],
        ]}
      />
    </div>
  );
}
