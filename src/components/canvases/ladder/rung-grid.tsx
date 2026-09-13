import { useEffect, useMemo, useRef, useState } from "react";
import type { LadderRung, LadderCell } from "@/lib/ladder/types";
import {
  newRung,
  emptyCell,
  rungCols,
  resizeRungCols,
  RUNG_COLS_MIN,
  RUNG_COLS_MAX,
} from "@/lib/ladder/types";
import { compileProgram } from "@/lib/ladder/compiler";
import { importLadderProgram } from "@/lib/ladder/importer";
import {
  scanRungs,
  resetRuntimeState,
  LadderScanTimeoutError,
  type ScanResult,
} from "@/lib/ladder/runtime";
import { validateRungs } from "@/lib/ladder/validator";
import { groupIssuesByRung } from "@/lib/ladder/validator-ui";
import { useEditorStore } from "@/lib/editor/store";
import { LadderCellView } from "./ladder-cell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Plus,
  Play,
  Square,
  Code2,
  Rows3,
  X,
  Download,
  Upload,
  History,
  Pause,
  Trash2,
  Minus,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";

interface HistoryEntry {
  ts: number;
  scan: number;
  rungId: string;
  poweredOut: boolean;
  perCell: boolean[][];
  diagnostics?: ScanResult["diagnostics"];
  tagDelta: { name: string; from: unknown; to: unknown }[];
}

const MAX_HISTORY = 200;

export function RungGrid() {
  const rungs = useEditorStore((s) => s.rungs);
  const setRungs = useEditorStore((s) => s.setRungs);

  useEffect(() => {
    if (rungs.length === 0) {
      setRungs([newRung(0)]);
    }
  }, [rungs, setRungs]);

  const [running, setRunning] = useState(false);
  const [showIL, setShowIL] = useState(false);
  const [compileFormat, setCompileFormat] = useState<"IL" | "ST">("ST");
  const [showHistory, setShowHistory] = useState(false);
  const [historyPaused, setHistoryPaused] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [scanState, setScanState] = useState<Record<string, ScanResult>>({});
  const intervalRef = useRef<number | null>(null);
  const scanCountRef = useRef(0);
  const prevTagsRef = useRef<Record<string, unknown>>({});
  const selected = useEditorStore((s) => s.selectedNodeId);
  const select = useEditorStore((s) => s.setSelectedNode);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    const tick = () => {
      let results: ScanResult[];
      try {
        results = scanRungs(rungs);
      } catch (err) {
        if (err instanceof LadderScanTimeoutError) {
          console.warn("[RungGrid] scan abortado:", err.message);
          setRunning(false);
          return;
        }
        throw err;
      }
      scanCountRef.current += 1;
      setScanState(Object.fromEntries(results.map((r) => [r.rungId, r])));
      setRungs((rs) =>
        rs.map((r) => {
          const found = results.find((x) => x.rungId === r.id);
          return found ? { ...r, poweredOut: found.poweredOut } : r;
        }),
      );

      // Capture tag deltas
      const currentTags = useEditorStore.getState().editorTags;
      const flatNow: Record<string, unknown> = {};
      Object.values(currentTags).forEach((t) => (flatNow[t.name] = t.value));
      const deltas: { name: string; from: unknown; to: unknown }[] = [];
      Object.entries(flatNow).forEach(([name, to]) => {
        const from = prevTagsRef.current[name];
        if (from !== to) deltas.push({ name, from, to });
      });
      prevTagsRef.current = flatNow;

      if (!historyPaused) {
        const ts = Date.now();
        const scan = scanCountRef.current;
        setHistory((h) => {
          const entries: HistoryEntry[] = results.map((r) => ({
            ts,
            scan,
            rungId: r.rungId,
            poweredOut: r.poweredOut,
            perCell: r.perCell,
            diagnostics: r.diagnostics,
            tagDelta: deltas,
          }));
          return [...entries, ...h].slice(0, MAX_HISTORY);
        });
      }
    };
    tick();
    intervalRef.current = window.setInterval(tick, 100);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, rungs.length, historyPaused]);

  const updateCell = (rungId: string, row: number, col: number, next: LadderCell) => {
    setRungs((rs) =>
      rs.map((r) =>
        r.id === rungId
          ? {
              ...r,
              cells: r.cells.map((rw, i) =>
                i === row ? rw.map((c, j) => (j === col ? next : c)) : rw,
              ),
            }
          : r,
      ),
    );
  };

  const addBranch = (rungId: string) => {
    setRungs((rs) =>
      rs.map((r) =>
        r.id === rungId
          ? { ...r, cells: [...r.cells, Array.from({ length: rungCols(r) }, emptyCell)] }
          : r,
      ),
    );
  };

  const changeCols = (rungId: string, delta: number) => {
    setRungs((rs) =>
      rs.map((r) => {
        if (r.id !== rungId) return r;
        const next = rungCols(r) + delta;
        if (next < RUNG_COLS_MIN || next > RUNG_COLS_MAX) return r;
        return resizeRungCols(r, next);
      }),
    );
  };

  const removeRung = (rungId: string) => {
    setRungs((rs) => rs.filter((r) => r.id !== rungId));
  };

  const issuesByRung = useMemo(() => groupIssuesByRung(validateRungs(rungs)), [rungs]);

  const compiledCode = useMemo(() => compileProgram(rungs, compileFormat), [rungs, compileFormat]);

  const downloadCode = () => {
    const blob = new Blob([compiledCode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ext = compileFormat.toLowerCase();
    a.download = `ladder-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const openImportPicker = () => fileInputRef.current?.click();
  const [importPreview, setImportPreview] = useState<{
    fileName: string;
    rungs: LadderRung[];
    warnings: string[];
  } | null>(null);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reimportar mesmo arquivo
    if (!file) return;
    try {
      const text = await file.text();
      const ext = file.name.split(".").pop()?.toLowerCase();
      const fmt = ext === "il" ? "IL" : ext === "st" ? "ST" : undefined;
      const { rungs: parsed, warnings } = importLadderProgram(text, fmt);
      if (parsed.length === 0) {
        toast.error("Nenhum rung reconhecido no arquivo.");
        return;
      }
      setImportPreview({ fileName: file.name, rungs: parsed, warnings });
    } catch (err) {
      toast.error(`Falha ao importar: ${(err as Error).message}`);
    }
  };

  const confirmImport = (mode: "replace" | "append") => {
    if (!importPreview) return;
    const { rungs: parsed, warnings, fileName } = importPreview;
    if (mode === "replace") {
      setRungs(parsed);
    } else {
      setRungs((rs) => [...rs, ...parsed]);
    }
    if (warnings.length > 0) {
      toast.warning(`${parsed.length} rung(s) importado(s), ${warnings.length} aviso(s).`, {
        description: warnings.slice(0, 3).join(" · "),
      });
    } else {
      toast.success(`${parsed.length} rung(s) importado(s) de ${fileName}.`);
    }
    setImportPreview(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-card/40 px-4 py-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRungs((r) => [...r, newRung(r.length)])}
        >
          <Plus className="mr-1 h-3 w-3" /> Rung
        </Button>
        <Button
          size="sm"
          variant={running ? "destructive" : "default"}
          onClick={() => {
            if (running) {
              setRunning(false);
            } else {
              resetRuntimeState();
              scanCountRef.current = 0;
              prevTagsRef.current = {};
              setRunning(true);
            }
          }}
        >
          {running ? <Square className="mr-1 h-3 w-3" /> : <Play className="mr-1 h-3 w-3" />}
          {running ? "Parar scan" : "Simular"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowIL((v) => !v)}>
          <Code2 className="mr-1 h-3 w-3" /> {showIL ? "Ocultar Código" : "Compilar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
          <History className="mr-1 h-3 w-3" /> {showHistory ? "Ocultar histórico" : "Histórico"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={openImportPicker}
          title="Importar programa IL/ST"
        >
          <Upload className="mr-1 h-3 w-3" /> Importar
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".st,.il,.txt,text/plain"
          className="hidden"
          onChange={handleImportFile}
        />
        <div className="ml-auto text-[10px] font-mono text-muted-foreground">
          {rungs.length} rungs · scan 100ms · {running ? `RUN #${scanCountRef.current}` : "STOP"}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto industrial-grid scan-overlay p-6">
          <div className="mx-auto max-w-5xl space-y-3">
            {rungs.map((rung, idx) => {
              const result = scanState[rung.id];
              const cellState = result?.perCell ?? [];
              const diag = result?.diagnostics ?? {};
              const isSel = selected === rung.id;
              return (
                <div
                  key={rung.id}
                  onClick={() => select(rung.id)}
                  className={`rounded-md border bg-card/60 backdrop-blur transition-colors ${
                    isSel ? "border-primary shadow-glow" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        R{String(idx + 1).padStart(3, "0")}
                      </span>
                      <span className="text-xs font-medium">{rung.label}</span>
                      {rung.poweredOut && (
                        <span className="rounded bg-success/20 px-1.5 py-0.5 font-mono text-[10px] text-success">
                          ENERGIZADO
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <div
                        className="flex items-center gap-0.5 rounded border border-border bg-muted/40 px-1"
                        onClick={(e) => e.stopPropagation()}
                        title="Colunas do rung"
                      >
                        <button
                          onClick={() => changeCols(rung.id, -1)}
                          disabled={rungCols(rung) <= RUNG_COLS_MIN}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                          aria-label={`Reduzir colunas do rung ${idx + 1}`}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="min-w-4 text-center font-mono text-[10px] text-muted-foreground">
                          {rungCols(rung)}
                        </span>
                        <button
                          onClick={() => changeCols(rung.id, +1)}
                          disabled={rungCols(rung) >= RUNG_COLS_MAX}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                          aria-label={`Aumentar colunas do rung ${idx + 1}`}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addBranch(rung.id);
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Adicionar branch (OR)"
                      >
                        <Rows3 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRung(rung.id);
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                        title={`Remover rung ${idx + 1}`}
                        aria-label={`Remover rung ${idx + 1}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-stretch gap-0 px-3 py-3">
                    <div className="w-1.5 self-stretch rounded-full bg-energized energized" />
                    <div className="flex-1 px-2">
                      {rung.cells.map((row, ri) => (
                        <div key={ri} className="flex items-center gap-1 py-1">
                          {row.map((cell, ci) => {
                            const d = ri === 0 ? diag[`${ri}:${ci}`] : undefined;
                            return (
                              <div key={ci} className="flex flex-col items-center">
                                <div className="flex items-center">
                                  <span className="h-px w-2 bg-foreground/40" />
                                  <LadderCellView
                                    cell={cell}
                                    isOutputCol={ci === row.length - 1}
                                    energized={Boolean(cellState[ri]?.[ci])}
                                    onChange={(n) => updateCell(rung.id, ri, ci, n)}
                                  />
                                  <span className="h-px w-2 bg-foreground/40" />
                                </div>
                                {d && (
                                  <span className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                                    {d.kind === "TON"
                                      ? `${Math.round(d.value)}/${d.preset}ms`
                                      : `${d.value}/${d.preset}`}
                                    {d.done ? " ✓" : ""}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    <div className="w-1.5 self-stretch rounded-full bg-energized energized" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showIL && (
          <aside className="w-80 shrink-0 border-l border-border bg-background/80 backdrop-blur flex flex-col">
            <div className="flex flex-col border-b border-border bg-card/20 p-2 gap-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Compilador IEC 61131-3
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={downloadCode}
                  className="h-6 px-2 text-[10px] gap-1"
                >
                  <Download className="h-3 w-3" /> .{compileFormat.toLowerCase()}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-1 bg-muted/40 p-1 rounded-md border border-border/50">
                <button
                  onClick={() => setCompileFormat("ST")}
                  className={`py-1 text-[10px] font-mono font-bold rounded-sm transition-all cursor-pointer ${
                    compileFormat === "ST"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Structured Text (ST)
                </button>
                <button
                  onClick={() => setCompileFormat("IL")}
                  className={`py-1 text-[10px] font-mono font-bold rounded-sm transition-all cursor-pointer ${
                    compileFormat === "IL"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Instruction List (IL)
                </button>
              </div>
            </div>

            <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono leading-relaxed text-foreground select-text whitespace-pre scrollbar-thin">
              {compiledCode}
            </pre>
          </aside>
        )}

        {showHistory && (
          <aside className="w-96 shrink-0 border-l border-border bg-background/80 backdrop-blur flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="text-[11px] font-mono uppercase text-muted-foreground">
                Histórico de scan ({history.length})
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={historyPaused ? "default" : "ghost"}
                  onClick={() => setHistoryPaused((v) => !v)}
                  className="h-6 px-2"
                >
                  {historyPaused ? (
                    <Play className="mr-1 h-3 w-3" />
                  ) : (
                    <Pause className="mr-1 h-3 w-3" />
                  )}
                  {historyPaused ? "Retomar" : "Pausar"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setHistory([])}
                  className="h-6 px-2"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1">
              {history.length === 0 && (
                <div className="p-4 text-center text-[11px] text-muted-foreground">
                  Inicie a simulação para registrar ciclos.
                </div>
              )}
              {history.map((h, i) => {
                const rIdx = rungs.findIndex((r) => r.id === h.rungId);
                return (
                  <div
                    key={`${h.scan}-${h.rungId}-${i}`}
                    className="rounded border border-border bg-card/60 px-2 py-1.5 text-[10px] font-mono"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        #{h.scan} · R{String(rIdx + 1).padStart(3, "0")}
                      </span>
                      <span className={h.poweredOut ? "text-success" : "text-muted-foreground"}>
                        {h.poweredOut ? "ON" : "off"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-0.5">
                      {h.perCell.map((row, ri) =>
                        row.map((on, ci) => (
                          <span
                            key={`${ri}-${ci}`}
                            className={`inline-block h-2 w-2 rounded-sm ${
                              on ? "bg-success" : "bg-muted"
                            }`}
                            title={`r${ri}c${ci}=${on ? "1" : "0"}`}
                          />
                        )),
                      )}
                    </div>
                    {h.tagDelta.length > 0 && i % rungs.length === 0 && (
                      <div className="mt-1 space-y-0.5 text-[9px]">
                        {h.tagDelta.slice(0, 4).map((d, di) => (
                          <div key={di} className="text-warning">
                            {d.name}: {String(d.from)} → {String(d.to)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        )}
      </div>

      {importPreview && (
        <ImportPreviewDialog
          preview={importPreview}
          onCancel={() => setImportPreview(null)}
          onConfirm={confirmImport}
        />
      )}
    </div>
  );
}

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const KIND_GLYPH_PREVIEW: Record<string, string> = {
  EMPTY: "───",
  XIC: "─┤ ├─",
  XIO: "─┤/├─",
  OTE: "─( )─",
  OTL: "─(S)─",
  OTU: "─(R)─",
  TON: "[TON]",
  TOF: "[TOF]",
  TP: "[TP]",
  CTU: "[CTU]",
};

function ImportPreviewDialog({
  preview,
  onCancel,
  onConfirm,
}: {
  preview: { fileName: string; rungs: LadderRung[]; warnings: string[] };
  onCancel: () => void;
  onConfirm: (mode: "replace" | "append") => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview da importação</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{preview.fileName}</span> · {preview.rungs.length}{" "}
            rung(s) reconhecido(s)
            {preview.warnings.length > 0 && ` · ${preview.warnings.length} aviso(s)`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-auto rounded-md border border-border bg-muted/20 p-3">
          <div className="space-y-3">
            {preview.rungs.map((r, idx) => (
              <div key={r.id} className="rounded border border-border/60 bg-card p-2">
                <div className="mb-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                    #{idx + 1}
                  </span>
                  <span>{r.label}</span>
                </div>
                <div className="space-y-1 font-mono text-[11px] leading-tight">
                  {r.cells.map((row, ri) => (
                    <div key={ri} className="flex items-center gap-1">
                      <span className="text-muted-foreground">│</span>
                      {row.map((c, ci) => (
                        <span
                          key={ci}
                          className={`inline-flex min-w-[3.5rem] items-center justify-center rounded px-1 ${
                            c.kind === "EMPTY"
                              ? "text-muted-foreground/40"
                              : "bg-primary/5 text-foreground"
                          }`}
                          title={c.operand ?? c.kind}
                        >
                          <span>{KIND_GLYPH_PREVIEW[c.kind] ?? c.kind}</span>
                          {c.operand && (
                            <span className="ml-1 text-[9px] text-primary">{c.operand}</span>
                          )}
                        </span>
                      ))}
                      <span className="text-muted-foreground">│</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {preview.warnings.length > 0 && (
            <div className="mt-3 rounded border border-warning/40 bg-warning/5 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-warning">
                Avisos
              </div>
              <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                {preview.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onConfirm("append")}>
              Anexar ao final
            </Button>
            <Button size="sm" onClick={() => onConfirm("replace")}>
              Substituir tudo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
