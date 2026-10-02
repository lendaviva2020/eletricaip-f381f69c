/**
 * Block Registry — bibliotecas registram definições executáveis dinamicamente.
 * O editor e o compilador nunca hardcodam blocos.
 */
import type { ElementaryType, FbdValue, PortType } from "./datatypes";
import type { FbdDocument, FbdNodeModel } from "./model";

export interface PortDef {
  readonly name: string;
  readonly type: PortType;
  /** Entrada obrigatória: precisa de conexão ou parâmetro com o mesmo nome. */
  readonly required?: boolean;
  readonly defaultValue?: FbdValue;
  readonly description?: string;
}

export type BlockState = Record<string, FbdValue>;

export interface VariableIo {
  read(name: string): FbdValue;
  write(name: string, value: FbdValue): void;
}

export interface ExecContext {
  readonly inputs: Readonly<Record<string, FbdValue>>;
  readonly params: Readonly<Record<string, FbdValue>>;
  readonly state: BlockState;
  readonly dtMs: number;
  /** Tipo concreto resolvido para os pinos genéricos da instância. */
  readonly binding: ElementaryType | null;
  readonly io: VariableIo;
  fault(code: string, message: string): void;
}

export type PortTypeResolution =
  | { readonly ok: true; readonly types: Readonly<Record<string, ElementaryType>> }
  | { readonly ok: false; readonly message: string };

export type BlockCategory =
  | "Lógica"
  | "Memória"
  | "Borda"
  | "Temporizador"
  | "Contador"
  | "Comparação"
  | "Seleção"
  | "Matemática"
  | "Conversão"
  | "Variáveis";

export interface BlockDefinition {
  readonly type: string;
  readonly namespace: "IEC" | "SYSTEM";
  readonly standard: string | null;
  readonly version: string;
  readonly category: BlockCategory;
  readonly description: string;
  readonly inputs: readonly PortDef[];
  readonly outputs: readonly PortDef[];
  readonly stateful: boolean;
  initState?(): BlockState;
  /** Resolve tipos de pinos que dependem de parâmetros/variáveis do documento. */
  resolvePortTypes?(node: FbdNodeModel, doc: FbdDocument): PortTypeResolution;
  execute(ctx: ExecContext): Record<string, FbdValue>;
}

export class BlockRegistry {
  private readonly defs = new Map<string, BlockDefinition>();

  register(def: BlockDefinition): void {
    if (this.defs.has(def.type)) {
      throw new Error(`Bloco já registrado: ${def.type}`);
    }
    const names = [...def.inputs, ...def.outputs].map((p) => p.name);
    if (def.namespace !== "SYSTEM" && (names.includes("EN") || names.includes("ENO"))) {
      throw new Error(`Bloco ${def.type}: EN/ENO são implícitos e não podem ser declarados`);
    }
    if (new Set(names).size !== names.length) {
      throw new Error(`Bloco ${def.type} possui nomes de pinos duplicados`);
    }
    this.defs.set(def.type, def);
  }

  get(type: string): BlockDefinition | undefined {
    return this.defs.get(type);
  }

  has(type: string): boolean {
    return this.defs.has(type);
  }

  list(): readonly BlockDefinition[] {
    return [...this.defs.values()];
  }
}

/**
 * EN/ENO (IEC 61131-3 §6.6.1.2.3): todo bloco não-sistema ganha EN (BOOL, padrão
 * TRUE) e ENO (BOOL). Com EN = FALSE o bloco não executa, mantém as saídas e
 * ENO = FALSE; com EN = TRUE, ENO = TRUE salvo falha de execução no ciclo.
 */
export const EN_PORT: PortDef = {
  name: "EN",
  type: "BOOL",
  defaultValue: true,
  description: "Habilita a execução",
};
export const ENO_PORT: PortDef = {
  name: "ENO",
  type: "BOOL",
  description: "Execução concluída sem falha",
};

export function effectiveInputs(def: BlockDefinition): readonly PortDef[] {
  return def.namespace === "SYSTEM" ? def.inputs : [...def.inputs, EN_PORT];
}
export function effectiveOutputs(def: BlockDefinition): readonly PortDef[] {
  return def.namespace === "SYSTEM" ? def.outputs : [...def.outputs, ENO_PORT];
}
