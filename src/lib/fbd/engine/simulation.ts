/**
 * Basic Simulation — relógio de passo fixo sobre o runtime real.
 * O passo de tempo é sempre `cycleTimeMs`, independente do jitter do agendador:
 * a mesma sequência de entradas produz sempre os mesmos resultados.
 */
import type { FbdRuntime, ScanReport } from "./runtime";

export type SimulationStatus = "stopped" | "running" | "paused";

export interface SimulationEvent {
  readonly scan: number;
  readonly elapsedMs: number;
  readonly kind: "start" | "pause" | "stop" | "reset" | "fault";
  readonly message: string;
}

/** Agendador injetável: retorna função de cancelamento. */
export type Scheduler = (tick: () => void, intervalMs: number) => () => void;

export const intervalScheduler: Scheduler = (tick, intervalMs) => {
  const handle = globalThis.setInterval(tick, intervalMs);
  return () => globalThis.clearInterval(handle);
};

const MAX_EVENTS = 500;

export class FbdSimulation {
  private statusValue: SimulationStatus = "stopped";
  private cancel: (() => void) | null = null;
  private readonly log: SimulationEvent[] = [];
  private readonly listeners = new Set<(r: ScanReport) => void>();

  constructor(
    private readonly runtime: FbdRuntime,
    private readonly cycleTimeMs: number,
    private readonly scheduler: Scheduler = intervalScheduler,
  ) {
    if (!(cycleTimeMs > 0)) throw new Error("cycleTimeMs deve ser positivo");
  }

  get status(): SimulationStatus {
    return this.statusValue;
  }
  get events(): readonly SimulationEvent[] {
    return this.log;
  }

  subscribe(fn: (r: ScanReport) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private record(kind: SimulationEvent["kind"], message: string): void {
    this.log.push({ scan: this.runtime.scans, elapsedMs: this.runtime.elapsedMs, kind, message });
    if (this.log.length > MAX_EVENTS) this.log.shift();
  }

  /** Executa exatamente um ciclo (válido parado ou pausado). */
  step(): ScanReport {
    const report = this.runtime.scan(this.cycleTimeMs);
    for (const f of report.faults) this.record("fault", `${f.instanceName}: ${f.code} — ${f.message}`);
    for (const l of this.listeners) l(report);
    return report;
  }

  runCycles(n: number): ScanReport | null {
    let last: ScanReport | null = null;
    for (let i = 0; i < n; i++) last = this.step();
    return last;
  }

  /** Avança o tempo simulado em `ms` (arredondado para ciclos inteiros). */
  advance(ms: number): ScanReport | null {
    return this.runCycles(Math.round(ms / this.cycleTimeMs));
  }

  start(): void {
    if (this.statusValue === "running") return;
    this.statusValue = "running";
    this.record("start", "Simulação iniciada");
    this.cancel = this.scheduler(() => this.step(), this.cycleTimeMs);
  }

  pause(): void {
    if (this.statusValue !== "running") return;
    this.cancel?.();
    this.cancel = null;
    this.statusValue = "paused";
    this.record("pause", "Simulação pausada");
  }

  stop(): void {
    this.cancel?.();
    this.cancel = null;
    this.statusValue = "stopped";
    this.record("stop", "Simulação parada");
  }

  reset(): void {
    this.stop();
    this.runtime.reset();
    this.record("reset", "Runtime reinicializado");
  }
}
