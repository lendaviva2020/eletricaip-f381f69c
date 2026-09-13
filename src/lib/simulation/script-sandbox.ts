// Host wrapper around scada-worker.ts, sobre o WorkerManager central.
// - Timeout por chamada (padrão 250ms) → aborta scripts em loop infinito.
// - Reinício automático do worker após timeout/erro (feito pelo WorkerManager).
// - Single-flight: nunca enfileira mais de uma chamada, para manter a cadência do tick.

import { WorkerManager } from "@/lib/workers/worker-manager";

export interface SandboxResult {
  ok: boolean;
  tags: Record<string, unknown>;
  logs: string[];
  error: string | null;
  durationMs: number;
}

interface SandboxRequest {
  reqId: number;
  script: string;
  tags: Record<string, unknown>;
}

interface SandboxResponse {
  reqId: number;
  ok: boolean;
  tags?: Record<string, unknown>;
  logs?: string[];
  error?: string;
}

let seq = 0;

export class ScriptSandbox {
  private manager: WorkerManager<SandboxRequest, SandboxResponse>;

  constructor(private timeoutMs = 250) {
    // Nome único por instância: o dedupe global do WorkerManager não deve
    // matar o sandbox de outro canvas montado ao mesmo tempo.
    this.manager = new WorkerManager<SandboxRequest, SandboxResponse>({
      name: `scada-sandbox-${++seq}`,
      requestTimeoutMs: timeoutMs,
      factory: () => new Worker(new URL("./scada-worker.ts", import.meta.url), { type: "module" }),
    });
  }

  get state() {
    return this.manager.state;
  }

  get lastError() {
    return this.manager.lastError;
  }

  /** Retorna o resultado; se já houver execução em voo, descarta a chamada (null). */
  async run(script: string, tags: Record<string, unknown>): Promise<SandboxResult | null> {
    if (this.manager.isBusy) return null;
    const started = performance.now();
    try {
      const res = await this.manager.request({ script, tags }, this.timeoutMs);
      return {
        ok: res.ok,
        tags: res.tags ?? {},
        logs: res.logs ?? [],
        error: res.ok ? null : (res.error ?? "Erro desconhecido"),
        durationMs: performance.now() - started,
      };
    } catch (err) {
      return {
        ok: false,
        tags: {},
        logs: [],
        error: err instanceof Error ? err.message : String(err),
        durationMs: performance.now() - started,
      };
    }
  }

  dispose() {
    this.manager.terminate();
  }
}
