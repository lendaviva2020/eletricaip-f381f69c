/**
 * Runtime determinístico: executa o IR na ordem planejada pelo compilador.
 * Estado por instância, forçamento de saídas e falhas de execução reportadas por scan.
 */
import { coerceValue, defaultValue, type FbdValue } from "./datatypes";
import type { IrInstruction, IrProgram } from "./compiler";
import type { BlockRegistry, BlockState } from "./registry";

export interface RuntimeFault {
  readonly nodeId: string;
  readonly instanceName: string;
  readonly code: string;
  readonly message: string;
}

export interface ScanReport {
  readonly scan: number;
  readonly elapsedMs: number;
  readonly faults: readonly RuntimeFault[];
}

export class FbdRuntime {
  private slots: FbdValue[] = [];
  private readonly states = new Map<string, BlockState>();
  private readonly forces = new Map<number, FbdValue>();
  private readonly variables = new Map<string, FbdValue>();
  private readonly byNode = new Map<string, IrInstruction>();
  private scanCount = 0;
  private elapsed = 0;

  constructor(
    private readonly ir: IrProgram,
    private readonly registry: BlockRegistry,
  ) {
    for (const ins of ir.instructions) {
      if (!registry.has(ins.blockType))
        throw new Error(`Bloco não registrado no runtime: ${ins.blockType}`);
      this.byNode.set(ins.nodeId, ins);
    }
    this.reset();
  }

  /** Reinicialização a frio: slots, estados e variáveis voltam aos valores iniciais. */
  reset(): void {
    this.slots = this.ir.slotTypes.map(defaultValue);
    this.states.clear();
    for (const ins of this.ir.instructions) {
      const def = this.registry.get(ins.blockType);
      if (def?.stateful && def.initState) this.states.set(ins.nodeId, def.initState());
    }
    this.variables.clear();
    for (const v of this.ir.variables) {
      this.variables.set(
        v.name,
        coerceValue(v.initialValue ?? defaultValue(v.dataType), v.dataType),
      );
    }
    this.scanCount = 0;
    this.elapsed = 0;
  }

  get scans(): number {
    return this.scanCount;
  }
  get elapsedMs(): number {
    return this.elapsed;
  }

  setVariable(name: string, value: FbdValue): void {
    const v = this.ir.variables.find((x) => x.name === name);
    if (!v) throw new Error(`Variável não declarada: ${name}`);
    this.variables.set(name, coerceValue(value, v.dataType));
  }

  getVariable(name: string): FbdValue {
    const value = this.variables.get(name);
    if (value === undefined) throw new Error(`Variável não declarada: ${name}`);
    return value;
  }

  snapshotVariables(): Record<string, FbdValue> {
    return Object.fromEntries(this.variables);
  }

  private slotOf(
    nodeId: string,
    port: string,
  ): { slot: number; type: IrInstruction["outputs"][string]["type"] } {
    const out = this.byNode.get(nodeId)?.outputs[port];
    if (!out) throw new Error(`Saída inexistente: ${nodeId}.${port}`);
    return out;
  }

  read(nodeId: string, port: string): FbdValue {
    return this.slots[this.slotOf(nodeId, port).slot] ?? false;
  }

  force(nodeId: string, port: string, value: FbdValue): void {
    const { slot, type } = this.slotOf(nodeId, port);
    this.forces.set(slot, coerceValue(value, type));
  }
  unforce(nodeId: string, port: string): void {
    this.forces.delete(this.slotOf(nodeId, port).slot);
  }
  isForced(nodeId: string, port: string): boolean {
    return this.forces.has(this.slotOf(nodeId, port).slot);
  }
  clearForces(): void {
    this.forces.clear();
  }

  getState(nodeId: string): Readonly<BlockState> | undefined {
    return this.states.get(nodeId);
  }

  /** Executa um ciclo de varredura completo com passo de tempo `dtMs`. */
  scan(dtMs: number): ScanReport {
    if (!(dtMs >= 0) || !Number.isFinite(dtMs)) throw new Error(`dtMs inválido: ${dtMs}`);
    const faults: RuntimeFault[] = [];
    const io = {
      read: (name: string): FbdValue => this.getVariable(name),
      write: (name: string, value: FbdValue): void => this.setVariable(name, value),
    };
    for (const ins of this.ir.instructions) {
      const def = this.registry.get(ins.blockType);
      if (!def) continue;
      const inputs: Record<string, FbdValue> = {};
      for (const [port, op] of Object.entries(ins.inputs)) {
        if (op.kind === "const") inputs[port] = op.value;
        else {
          const raw = this.slots[op.slot] ?? false;
          inputs[port] = op.convertTo ? coerceValue(raw, op.convertTo) : raw;
        }
      }
      const state = this.states.get(ins.nodeId) ?? {};
      const result = def.execute({
        inputs,
        params: ins.params,
        state,
        dtMs,
        binding: ins.binding,
        io,
        fault: (code, message) =>
          faults.push({ nodeId: ins.nodeId, instanceName: ins.instanceName, code, message }),
      });
      for (const [port, out] of Object.entries(ins.outputs)) {
        const forced = this.forces.get(out.slot);
        this.slots[out.slot] =
          forced !== undefined
            ? forced
            : coerceValue(result[port] ?? defaultValue(out.type), out.type);
      }
    }
    this.scanCount += 1;
    this.elapsed += dtMs;
    return { scan: this.scanCount, elapsedMs: this.elapsed, faults };
  }
}
