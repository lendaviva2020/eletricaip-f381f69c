// Gerenciador central de Web Workers.
//
// Responsabilidades: criar, iniciar, monitorar estado, tratar erro, reiniciar,
// destruir, evitar workers duplicados para o mesmo módulo, aplicar timeout de
// inicialização/requisição e permitir fallback controlado quando `Worker` não
// existir no ambiente (SSR, navegadores sem suporte).
//
// Estratégia única de criação: worker de módulo empacotado pelo bundler
// (`new Worker(new URL("./x.ts", import.meta.url), { type: "module" })`).
// Nunca criamos Blob URLs manualmente nem usamos `importScripts`.

export type WorkerState =
  | "idle"
  | "initializing"
  | "ready"
  | "running"
  | "error"
  | "terminated";

export interface WorkerRequestEnvelope {
  reqId: number;
}

export interface WorkerManagerOptions {
  /** Nome lógico — usado para deduplicar instâncias e em mensagens de erro. */
  name: string;
  /** Fábrica do worker. Deve usar `new Worker(new URL(...), { type: "module" })`. */
  factory: () => Worker;
  /** Timeout por requisição (também cobre a inicialização da primeira). */
  requestTimeoutMs?: number;
}

export class WorkerUnavailableError extends Error {
  constructor(name: string) {
    super(`Worker indisponível neste ambiente (${name})`);
    this.name = "WorkerUnavailableError";
  }
}

export class WorkerTimeoutError extends Error {
  constructor(name: string, ms: number) {
    super(`Timeout (${ms}ms) — worker ${name} abortado`);
    this.name = "WorkerTimeoutError";
  }
}

interface Pending<TRes> {
  reqId: number;
  resolve: (res: TRes) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Terminable {
  terminate(): void;
}

/** Instâncias vivas por nome — impede workers duplicados para o mesmo módulo. */
const registry = new Map<string, Terminable>();

export class WorkerManager<
  TReq extends WorkerRequestEnvelope,
  TRes extends WorkerRequestEnvelope,
> {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending: Pending<TRes> | null = null;
  private currentState: WorkerState = "idle";
  private currentError: string | null = null;
  private readonly timeoutMs: number;

  constructor(private readonly options: WorkerManagerOptions) {
    this.timeoutMs = options.requestTimeoutMs ?? 5000;
    const existing = registry.get(options.name);
    if (existing) existing.terminate();
    registry.set(options.name, this);
  }

  get state(): WorkerState {
    return this.currentState;
  }

  get lastError(): string | null {
    return this.currentError;
  }

  get isBusy(): boolean {
    return this.pending !== null;
  }

  get isSupported(): boolean {
    return typeof Worker !== "undefined";
  }

  /** Cria o worker se necessário. Lança `WorkerUnavailableError` sem suporte. */
  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    if (!this.isSupported) {
      this.currentState = "error";
      this.currentError = `Worker indisponível (${this.options.name})`;
      throw new WorkerUnavailableError(this.options.name);
    }

    this.currentState = "initializing";
    this.currentError = null;

    const worker = this.options.factory();
    worker.onmessage = (ev: MessageEvent) => {
      const data = ev.data as TRes | undefined;
      const current = this.pending;
      if (!current || !data || data.reqId !== current.reqId) return;
      clearTimeout(current.timer);
      this.pending = null;
      this.currentState = "ready";
      current.resolve(data);
    };
    worker.onerror = (ev: ErrorEvent) => {
      const message = ev.message || `Falha no worker ${this.options.name}`;
      this.currentError = message;
      this.currentState = "error";
      const current = this.pending;
      this.pending = null;
      // Worker corrompido: recicla para permitir reinício na próxima chamada.
      this.disposeWorker();
      if (current) {
        clearTimeout(current.timer);
        current.reject(new Error(message));
      }
    };

    this.worker = worker;
    this.currentState = "ready";
    return worker;
  }

  /**
   * Envia uma requisição e aguarda a resposta correspondente.
   * Single-flight: rejeita se já houver requisição em voo (consulte `isBusy`).
   */
  request(payload: Omit<TReq, "reqId">, timeoutMs?: number): Promise<TRes> {
    if (this.pending) {
      return Promise.reject(new Error(`Worker ${this.options.name} ocupado`));
    }

    let worker: Worker;
    try {
      worker = this.ensureWorker();
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }

    const reqId = this.nextId++;
    const limit = timeoutMs ?? this.timeoutMs;

    return new Promise<TRes>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.reqId !== reqId) return;
        this.pending = null;
        this.currentError = `Timeout (${limit}ms)`;
        this.currentState = "error";
        // Reinício controlado: o próximo `request` cria um worker novo.
        this.disposeWorker();
        reject(new WorkerTimeoutError(this.options.name, limit));
      }, limit);

      this.pending = { reqId, resolve, reject, timer };
      this.currentState = "running";
      try {
        worker.postMessage({ ...payload, reqId } as TReq);
      } catch (err) {
        clearTimeout(timer);
        this.pending = null;
        this.currentState = "error";
        this.currentError = err instanceof Error ? err.message : String(err);
        this.disposeWorker();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** Destrói o worker atual mantendo o manager reutilizável. */
  restart(): void {
    this.disposeWorker();
    this.currentState = "idle";
    this.currentError = null;
  }

  /** Encerra definitivamente e libera o registro global. */
  terminate(): void {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error(`Worker ${this.options.name} encerrado`));
      this.pending = null;
    }
    this.disposeWorker();
    this.currentState = "terminated";
    if (registry.get(this.options.name) === this) {
      registry.delete(this.options.name);
    }
  }

  private disposeWorker(): void {
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    try {
      worker.terminate();
    } catch {
      // terminate pode lançar se o worker já morreu — estado já foi limpo.
    }
  }
}
