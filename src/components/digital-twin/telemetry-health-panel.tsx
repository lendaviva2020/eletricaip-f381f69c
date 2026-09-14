// #TWIN-02 — Painel de saúde da telemetria do Digital Twin.
// Lê `telemetryHealth` do store Zustand: cada flush/retentativa atualiza as
// métricas e o componente re-renderiza em tempo real.
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Layers, X } from "lucide-react";
import { useDigitalTwinStore } from "@/lib/digital-twin-store";
import { Badge } from "@/components/ui/badge";

function formatTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("pt-BR");
}

function relative(ts: number | null, now: number): string {
  if (!ts) return "nunca";
  const secs = Math.max(0, Math.round((now - ts) / 1000));
  if (secs < 60) return `há ${secs}s`;
  const mins = Math.floor(secs / 60);
  return `há ${mins}min`;
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "destructive";
}) {
  const color =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card/60 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`font-mono text-lg leading-tight ${color}`}>{value}</div>
    </div>
  );
}

export function TelemetryHealthPanel({ onClose }: { onClose?: () => void }) {
  const health = useDigitalTwinStore((s) => s.telemetryHealth);
  const realtimeConnected = useDigitalTwinStore((s) => s.realtimeConnected);
  const whatIfEnabled = useDigitalTwinStore((s) => s.whatIfEnabled);

  // Relógio local só para o texto "há Xs" da última gravação.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hasError = health.lastError !== null;

  return (
    <aside className="w-72 shrink-0 border-l border-border bg-card/40 flex flex-col">
      <div className="h-10 px-3 flex items-center justify-between border-b border-border">
        <span className="text-xs font-semibold flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" /> Telemetria
        </span>
        <div className="flex items-center gap-1.5">
          <Badge variant={realtimeConnected ? "default" : "secondary"} className="text-[9px]">
            {realtimeConnected ? "Live" : "Offline"}
          </Badge>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-accent"
              title="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Metric
            label="Na fila"
            value={health.queuedSamples}
            tone={health.queuedSamples > 200 ? "warning" : "default"}
          />
          <Metric label="Gravadas" value={health.flushedSamples} />
          <Metric
            label="Falhas"
            value={health.failedSamples}
            tone={health.failedSamples > 0 ? "destructive" : "default"}
          />
          <Metric
            label="Retentativas"
            value={health.retryCount}
            tone={health.retryCount > 0 ? "warning" : "default"}
          />
        </div>

        <div className="rounded-md border border-border bg-card/60 px-3 py-2 space-y-1">
          <div className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            Última gravação
          </div>
          <div className="font-mono text-xs flex items-center gap-2">
            <Layers className="h-3 w-3 text-muted-foreground" />
            {formatTime(health.lastFlush)}
            <span className="text-muted-foreground">({relative(health.lastFlush, now)})</span>
          </div>
        </div>

        {whatIfEnabled && (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
            Modo E-se? ativo — a gravação de telemetria está pausada.
          </div>
        )}

        <div
          className={`rounded-md border px-3 py-2 space-y-1 ${
            hasError ? "border-destructive/50 bg-destructive/10" : "border-border bg-card/60"
          }`}
        >
          <div className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            Último erro
          </div>
          {hasError ? (
            <div className="flex items-start gap-2 text-[11px] text-destructive break-words">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="font-mono">{health.lastError}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[11px] text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Nenhum erro registrado
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
