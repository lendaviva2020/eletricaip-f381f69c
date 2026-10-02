// Painel do motor IEC: diagnósticos do compilador, simulação (entradas, EN/ENO,
// saídas ao vivo) e visualização do AST e do IR gerados.
import { AlertCircle, CheckCircle2, Pause, Play, RotateCcw, StepForward, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FbdEngineApi } from "@/hooks/use-fbd-engine";
import type { FbdValue } from "@/lib/fbd/engine";

function fmt(v: FbdValue | undefined): string {
  if (v === undefined) return "—";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  return v;
}

function CtrlButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="h-7 px-2 rounded border border-border bg-card/60 hover:bg-accent text-[10px] font-semibold inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

export function FbdEnginePanel({ engine, onClose }: { engine: FbdEngineApi; onClose: () => void }) {
  const { result, live, status, inputBindings } = engine;
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  const runnable = result.ok && live !== null;
  const instructions = (result.ir?.instructions ?? []).filter((i) => i.blockType !== "VAR_IN");

  return (
    <div className="absolute right-6 top-16 bottom-14 z-20 w-[380px] rounded-lg border border-primary/30 flex flex-col shadow-2xl overflow-hidden glass-strong bg-background/95">
      <div className="h-10 shrink-0 flex items-center justify-between px-3 border-b border-border bg-card/40">
        <span className="text-[10px] font-display font-bold tracking-wider text-primary">
          MOTOR IEC 61131-3
        </span>
        <div className="flex items-center gap-1.5">
          {result.ok ? (
            <Badge className="text-[9px]">Compilado</Badge>
          ) : (
            <Badge variant="destructive" className="text-[9px]">
              {errors.length} erro(s)
            </Badge>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel do motor"
            className="h-6 w-6 rounded grid place-items-center text-muted-foreground hover:bg-accent"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="shrink-0 px-3 py-2 border-b border-border flex items-center gap-1.5">
        {status === "running" ? (
          <CtrlButton onClick={engine.pause} label="Pausar">
            <Pause className="h-3 w-3" /> Pausar
          </CtrlButton>
        ) : (
          <CtrlButton onClick={engine.start} label="Iniciar" disabled={!runnable}>
            <Play className="h-3 w-3" /> Iniciar
          </CtrlButton>
        )}
        <CtrlButton
          onClick={engine.step}
          label="Um ciclo"
          disabled={!runnable || status === "running"}
        >
          <StepForward className="h-3 w-3" /> Ciclo
        </CtrlButton>
        <CtrlButton onClick={engine.reset} label="Reiniciar" disabled={!runnable}>
          <RotateCcw className="h-3 w-3" />
        </CtrlButton>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {live ? `ciclo ${live.scans} · ${(live.elapsedMs / 1000).toFixed(1)}s` : "—"}
        </span>
      </div>

      <Tabs defaultValue="sim" className="flex-1 min-h-0 flex flex-col">
        <TabsList className="mx-3 mt-2 grid grid-cols-4 h-8">
          <TabsTrigger value="sim" className="text-[10px]">
            Simulação
          </TabsTrigger>
          <TabsTrigger value="diag" className="text-[10px]">
            Diagnóstico
          </TabsTrigger>
          <TabsTrigger value="ast" className="text-[10px]">
            AST
          </TabsTrigger>
          <TabsTrigger value="ir" className="text-[10px]">
            IR
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sim" className="flex-1 min-h-0 overflow-auto px-3 pb-3 space-y-3">
          {!runnable ? (
            <p className="text-[11px] text-muted-foreground">
              {instructions.length === 0 && result.ok
                ? "Arraste blocos para o canvas para simular."
                : "Corrija os erros de compilação para simular."}
            </p>
          ) : (
            <>
              {inputBindings.length > 0 && (
                <section className="space-y-1.5">
                  <h4 className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                    Entradas
                  </h4>
                  {inputBindings.map((b) => (
                    <label
                      key={b.variable}
                      className="flex items-center justify-between rounded border border-border bg-card/60 px-2 py-1"
                    >
                      <span className="font-mono text-[10px]">
                        {b.nodeId}.{b.port}
                      </span>
                      <Switch
                        checked={live.inputs[b.variable] === true}
                        onCheckedChange={(v) => engine.setInput(b.variable, v)}
                        aria-label={`Entrada ${b.nodeId}.${b.port}`}
                      />
                    </label>
                  ))}
                </section>
              )}
              <section className="space-y-1.5">
                <h4 className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  Blocos (ordem de execução)
                </h4>
                {instructions.map((ins) => {
                  const outs = live.outputs[ins.nodeId] ?? {};
                  const eno = outs.ENO;
                  return (
                    <div
                      key={ins.nodeId}
                      className="rounded border border-border bg-card/60 px-2 py-1.5 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-primary">
                          #{ins.index} {ins.instanceName} : {ins.blockType}
                        </span>
                        <span
                          className={`font-mono text-[9px] px-1.5 rounded ${
                            eno === true
                              ? "bg-success/20 text-success"
                              : "bg-destructive/20 text-destructive"
                          }`}
                        >
                          ENO {fmt(eno)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
                        {Object.entries(outs)
                          .filter(([port]) => port !== "ENO")
                          .map(([port, v]) => (
                            <span key={port}>
                              {port} = <span className="text-foreground">{fmt(v)}</span>
                            </span>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </section>
              {live.faults.length > 0 && (
                <section className="space-y-1">
                  {live.faults.map((f) => (
                    <div
                      key={`${f.nodeId}-${f.code}`}
                      className="text-[10px] text-destructive font-mono"
                    >
                      {f.instanceName}: {f.code} — {f.message}
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="diag" className="flex-1 min-h-0 overflow-auto px-3 pb-3 space-y-1.5">
          {result.diagnostics.length === 0 ? (
            <div className="flex items-center gap-2 text-[11px] text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Sem diagnósticos
            </div>
          ) : (
            result.diagnostics.map((d, i) => (
              <div
                key={`${d.code}-${i}`}
                className="rounded border border-border bg-card/60 px-2 py-1.5 text-[10px] space-y-0.5"
              >
                <div className="flex items-center gap-1.5 text-destructive font-mono">
                  <AlertCircle className="h-3 w-3" /> {d.code}
                </div>
                <div>{d.message}</div>
                {d.suggestion && <div className="text-muted-foreground">{d.suggestion}</div>}
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="ast" className="flex-1 min-h-0 overflow-auto px-3 pb-3">
          <pre className="text-[9px] font-mono text-muted-foreground whitespace-pre">
            {result.ast ? JSON.stringify(result.ast, null, 2) : "AST indisponível (há erros)."}
          </pre>
        </TabsContent>
        <TabsContent value="ir" className="flex-1 min-h-0 overflow-auto px-3 pb-3">
          <pre className="text-[9px] font-mono text-muted-foreground whitespace-pre">
            {result.ir ? JSON.stringify(result.ir, null, 2) : "IR indisponível (há erros)."}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
