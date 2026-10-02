/**
 * IEC Foundation — funções e blocos funcionais padrão IEC 61131-3 com semântica executável,
 * mais blocos de sistema (VAR_IN, VAR_OUT, CONST) que ligam o grafo às variáveis do POU.
 */
import {
  ELEMENTARY_TYPES,
  isElementaryType,
  isIntegerType,
  type ElementaryType,
  type FbdValue,
} from "./datatypes";
import { BlockRegistry, type BlockDefinition, type ExecContext, type PortDef } from "./registry";

const IEC = "IEC 61131-3";

function num(v: FbdValue | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") return Number(v) || 0;
  return 0;
}
function bool(v: FbdValue | undefined): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return false;
}

function fn(
  type: string,
  category: BlockDefinition["category"],
  description: string,
  inputs: readonly PortDef[],
  outputs: readonly PortDef[],
  execute: (ctx: ExecContext) => Record<string, FbdValue>,
): BlockDefinition {
  return {
    type,
    namespace: "IEC",
    standard: IEC,
    version: "1.0.0",
    category,
    description,
    inputs,
    outputs,
    stateful: false,
    execute,
  };
}

function fb(
  type: string,
  category: BlockDefinition["category"],
  description: string,
  inputs: readonly PortDef[],
  outputs: readonly PortDef[],
  initState: () => Record<string, FbdValue>,
  execute: (ctx: ExecContext) => Record<string, FbdValue>,
): BlockDefinition {
  return {
    type,
    namespace: "IEC",
    standard: IEC,
    version: "1.0.0",
    category,
    description,
    inputs,
    outputs,
    stateful: true,
    initState,
    execute,
  };
}

// ── Lógica bit a bit (ANY_BIT): BOOL é lógico, demais tipos são bitwise ──
function bitwise(
  op: "AND" | "OR" | "XOR",
  a: FbdValue | undefined,
  b: FbdValue | undefined,
  binding: ElementaryType | null,
): FbdValue {
  if (binding === "BOOL" || binding === null) {
    const x = bool(a);
    const y = bool(b);
    return op === "AND" ? x && y : op === "OR" ? x || y : x !== y;
  }
  const x = BigInt(Math.trunc(num(a)));
  const y = BigInt(Math.trunc(num(b)));
  const r = op === "AND" ? x & y : op === "OR" ? x | y : x ^ y;
  return Number(BigInt.asUintN(64, r));
}

const BIT2: readonly PortDef[] = [
  { name: "IN1", type: "ANY_BIT" },
  { name: "IN2", type: "ANY_BIT" },
];
const NUM2: readonly PortDef[] = [
  { name: "IN1", type: "ANY_NUM" },
  { name: "IN2", type: "ANY_NUM" },
];
const CMP2: readonly PortDef[] = [
  { name: "IN1", type: "ANY_ELEMENTARY" },
  { name: "IN2", type: "ANY_ELEMENTARY" },
];
const OUT_BOOL: readonly PortDef[] = [{ name: "OUT", type: "BOOL" }];

function compare(a: FbdValue | undefined, b: FbdValue | undefined): number {
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return Math.sign(num(a) - num(b));
}

function timeParam(ctx: ExecContext, port: string): number {
  return Math.max(0, num(ctx.inputs[port]));
}

const CONVERTIBLE: readonly ElementaryType[] = [
  "BOOL",
  "SINT",
  "INT",
  "DINT",
  "LINT",
  "USINT",
  "UINT",
  "UDINT",
  "ULINT",
  "REAL",
  "LREAL",
  "BYTE",
  "WORD",
  "DWORD",
  "LWORD",
  "TIME",
];

function conversion(from: ElementaryType, to: ElementaryType): BlockDefinition {
  return fn(
    `${from}_TO_${to}`,
    "Conversão",
    `Conversão explícita ${from} → ${to}`,
    [{ name: "IN", type: from }],
    [{ name: "OUT", type: to }],
    (ctx) => {
      const v = ctx.inputs.IN;
      if (to === "BOOL") return { OUT: num(v) !== 0 };
      // REAL → inteiro: arredonda ao inteiro mais próximo (IEC); demais truncam na coerção.
      if ((from === "REAL" || from === "LREAL") && (isIntegerType(to) || to === "TIME")) {
        return { OUT: Math.round(num(v)) };
      }
      return { OUT: num(v) };
    },
  );
}

export function iecDefinitions(): BlockDefinition[] {
  const defs: BlockDefinition[] = [
    fn("AND", "Lógica", "E lógico / bit a bit", BIT2, [{ name: "OUT", type: "ANY_BIT" }], (c) => ({
      OUT: bitwise("AND", c.inputs.IN1, c.inputs.IN2, c.binding),
    })),
    fn("OR", "Lógica", "OU lógico / bit a bit", BIT2, [{ name: "OUT", type: "ANY_BIT" }], (c) => ({
      OUT: bitwise("OR", c.inputs.IN1, c.inputs.IN2, c.binding),
    })),
    fn("XOR", "Lógica", "OU exclusivo", BIT2, [{ name: "OUT", type: "ANY_BIT" }], (c) => ({
      OUT: bitwise("XOR", c.inputs.IN1, c.inputs.IN2, c.binding),
    })),
    fn(
      "NOT",
      "Lógica",
      "Negação lógica / complemento",
      [{ name: "IN", type: "ANY_BIT" }],
      [{ name: "OUT", type: "ANY_BIT" }],
      (c) => {
        if (c.binding === "BOOL" || c.binding === null) return { OUT: !bool(c.inputs.IN) };
        return { OUT: Number(BigInt.asUintN(64, ~BigInt(Math.trunc(num(c.inputs.IN))))) };
      },
    ),

    fb(
      "SR",
      "Memória",
      "Biestável com Set dominante: Q1 := S1 OR (NOT R AND Q1)",
      [
        { name: "S1", type: "BOOL" },
        { name: "R", type: "BOOL" },
      ],
      [{ name: "Q1", type: "BOOL" }],
      () => ({ q: false }),
      (c) => {
        c.state.q = bool(c.inputs.S1) || (!bool(c.inputs.R) && bool(c.state.q));
        return { Q1: c.state.q };
      },
    ),
    fb(
      "RS",
      "Memória",
      "Biestável com Reset dominante: Q1 := NOT R1 AND (S OR Q1)",
      [
        { name: "S", type: "BOOL" },
        { name: "R1", type: "BOOL" },
      ],
      [{ name: "Q1", type: "BOOL" }],
      () => ({ q: false }),
      (c) => {
        c.state.q = !bool(c.inputs.R1) && (bool(c.inputs.S) || bool(c.state.q));
        return { Q1: c.state.q };
      },
    ),

    fb(
      "R_TRIG",
      "Borda",
      "Detecção de borda de subida",
      [{ name: "CLK", type: "BOOL" }],
      [{ name: "Q", type: "BOOL" }],
      () => ({ m: false }),
      (c) => {
        const clk = bool(c.inputs.CLK);
        const q = clk && !bool(c.state.m);
        c.state.m = clk;
        return { Q: q };
      },
    ),
    fb(
      "F_TRIG",
      "Borda",
      "Detecção de borda de descida",
      [{ name: "CLK", type: "BOOL" }],
      [{ name: "Q", type: "BOOL" }],
      () => ({ m: false }),
      (c) => {
        const clk = bool(c.inputs.CLK);
        const q = !clk && bool(c.state.m);
        c.state.m = clk;
        return { Q: q };
      },
    ),

    fb(
      "TON",
      "Temporizador",
      "Temporizador com atraso na ligação",
      [
        { name: "IN", type: "BOOL" },
        { name: "PT", type: "TIME", required: true },
      ],
      [
        { name: "Q", type: "BOOL" },
        { name: "ET", type: "TIME" },
      ],
      () => ({ et: 0 }),
      (c) => {
        const pt = timeParam(c, "PT");
        const et = bool(c.inputs.IN) ? Math.min(num(c.state.et) + c.dtMs, pt) : 0;
        c.state.et = et;
        return { Q: bool(c.inputs.IN) && et >= pt, ET: et };
      },
    ),
    fb(
      "TOF",
      "Temporizador",
      "Temporizador com atraso no desligamento",
      [
        { name: "IN", type: "BOOL" },
        { name: "PT", type: "TIME", required: true },
      ],
      [
        { name: "Q", type: "BOOL" },
        { name: "ET", type: "TIME" },
      ],
      () => ({ et: 0, q: false, timing: false, prev: false }),
      (c) => {
        const pt = timeParam(c, "PT");
        const inp = bool(c.inputs.IN);
        if (inp) {
          c.state.q = true;
          c.state.et = 0;
          c.state.timing = false;
        } else {
          if (bool(c.state.prev)) {
            c.state.timing = true;
            c.state.et = 0;
          }
          if (bool(c.state.timing)) {
            c.state.et = Math.min(num(c.state.et) + c.dtMs, pt);
            if (num(c.state.et) >= pt) {
              c.state.q = false;
              c.state.timing = false;
            }
          }
        }
        c.state.prev = inp;
        return { Q: bool(c.state.q), ET: num(c.state.et) };
      },
    ),
    fb(
      "TP",
      "Temporizador",
      "Gerador de pulso de duração PT",
      [
        { name: "IN", type: "BOOL" },
        { name: "PT", type: "TIME", required: true },
      ],
      [
        { name: "Q", type: "BOOL" },
        { name: "ET", type: "TIME" },
      ],
      () => ({ et: 0, running: false, prev: false }),
      (c) => {
        const pt = timeParam(c, "PT");
        const inp = bool(c.inputs.IN);
        if (!bool(c.state.running) && inp && !bool(c.state.prev) && num(c.state.et) === 0)
          c.state.running = true;
        if (bool(c.state.running)) {
          c.state.et = Math.min(num(c.state.et) + c.dtMs, pt);
          if (num(c.state.et) >= pt) c.state.running = false;
        }
        const q = bool(c.state.running);
        if (!q && !inp) c.state.et = 0;
        c.state.prev = inp;
        return { Q: q, ET: num(c.state.et) };
      },
    ),

    fb(
      "CTU",
      "Contador",
      "Contador crescente",
      [
        { name: "CU", type: "BOOL" },
        { name: "R", type: "BOOL" },
        { name: "PV", type: "INT", required: true },
      ],
      [
        { name: "Q", type: "BOOL" },
        { name: "CV", type: "INT" },
      ],
      () => ({ cv: 0, prev: false }),
      (c) => {
        const cu = bool(c.inputs.CU);
        if (bool(c.inputs.R)) c.state.cv = 0;
        else if (cu && !bool(c.state.prev) && num(c.state.cv) < 32767)
          c.state.cv = num(c.state.cv) + 1;
        c.state.prev = cu;
        return { Q: num(c.state.cv) >= num(c.inputs.PV), CV: num(c.state.cv) };
      },
    ),
    fb(
      "CTD",
      "Contador",
      "Contador decrescente",
      [
        { name: "CD", type: "BOOL" },
        { name: "LD", type: "BOOL" },
        { name: "PV", type: "INT", required: true },
      ],
      [
        { name: "Q", type: "BOOL" },
        { name: "CV", type: "INT" },
      ],
      () => ({ cv: 0, prev: false }),
      (c) => {
        const cd = bool(c.inputs.CD);
        if (bool(c.inputs.LD)) c.state.cv = num(c.inputs.PV);
        else if (cd && !bool(c.state.prev) && num(c.state.cv) > -32768)
          c.state.cv = num(c.state.cv) - 1;
        c.state.prev = cd;
        return { Q: num(c.state.cv) <= 0, CV: num(c.state.cv) };
      },
    ),
    fb(
      "CTUD",
      "Contador",
      "Contador crescente/decrescente",
      [
        { name: "CU", type: "BOOL" },
        { name: "CD", type: "BOOL" },
        { name: "R", type: "BOOL" },
        { name: "LD", type: "BOOL" },
        { name: "PV", type: "INT", required: true },
      ],
      [
        { name: "QU", type: "BOOL" },
        { name: "QD", type: "BOOL" },
        { name: "CV", type: "INT" },
      ],
      () => ({ cv: 0, prevU: false, prevD: false }),
      (c) => {
        const cu = bool(c.inputs.CU);
        const cd = bool(c.inputs.CD);
        if (bool(c.inputs.R)) c.state.cv = 0;
        else if (bool(c.inputs.LD)) c.state.cv = num(c.inputs.PV);
        else {
          const up = cu && !bool(c.state.prevU);
          const down = cd && !bool(c.state.prevD);
          if (up && !down && num(c.state.cv) < 32767) c.state.cv = num(c.state.cv) + 1;
          else if (down && !up && num(c.state.cv) > -32768) c.state.cv = num(c.state.cv) - 1;
        }
        c.state.prevU = cu;
        c.state.prevD = cd;
        return {
          QU: num(c.state.cv) >= num(c.inputs.PV),
          QD: num(c.state.cv) <= 0,
          CV: num(c.state.cv),
        };
      },
    ),

    fn("EQ", "Comparação", "Igual", CMP2, OUT_BOOL, (c) => ({
      OUT: compare(c.inputs.IN1, c.inputs.IN2) === 0,
    })),
    fn("NE", "Comparação", "Diferente", CMP2, OUT_BOOL, (c) => ({
      OUT: compare(c.inputs.IN1, c.inputs.IN2) !== 0,
    })),
    fn("GT", "Comparação", "Maior que", CMP2, OUT_BOOL, (c) => ({
      OUT: compare(c.inputs.IN1, c.inputs.IN2) > 0,
    })),
    fn("GE", "Comparação", "Maior ou igual", CMP2, OUT_BOOL, (c) => ({
      OUT: compare(c.inputs.IN1, c.inputs.IN2) >= 0,
    })),
    fn("LT", "Comparação", "Menor que", CMP2, OUT_BOOL, (c) => ({
      OUT: compare(c.inputs.IN1, c.inputs.IN2) < 0,
    })),
    fn("LE", "Comparação", "Menor ou igual", CMP2, OUT_BOOL, (c) => ({
      OUT: compare(c.inputs.IN1, c.inputs.IN2) <= 0,
    })),

    fn(
      "SEL",
      "Seleção",
      "OUT := IN0 se G=FALSE, IN1 se G=TRUE",
      [
        { name: "G", type: "BOOL" },
        { name: "IN0", type: "ANY" },
        { name: "IN1", type: "ANY" },
      ],
      [{ name: "OUT", type: "ANY" }],
      (c) => ({ OUT: bool(c.inputs.G) ? (c.inputs.IN1 ?? 0) : (c.inputs.IN0 ?? 0) }),
    ),
    fn(
      "MOVE",
      "Seleção",
      "Cópia de valor",
      [{ name: "IN", type: "ANY" }],
      [{ name: "OUT", type: "ANY" }],
      (c) => ({ OUT: c.inputs.IN ?? 0 }),
    ),
    fn("MAX", "Seleção", "Máximo", NUM2, [{ name: "OUT", type: "ANY_NUM" }], (c) => ({
      OUT: Math.max(num(c.inputs.IN1), num(c.inputs.IN2)),
    })),
    fn("MIN", "Seleção", "Mínimo", NUM2, [{ name: "OUT", type: "ANY_NUM" }], (c) => ({
      OUT: Math.min(num(c.inputs.IN1), num(c.inputs.IN2)),
    })),
    fn(
      "LIMIT",
      "Seleção",
      "Limita IN entre MN e MX",
      [
        { name: "MN", type: "ANY_NUM" },
        { name: "IN", type: "ANY_NUM" },
        { name: "MX", type: "ANY_NUM" },
      ],
      [{ name: "OUT", type: "ANY_NUM" }],
      (c) => ({ OUT: Math.min(Math.max(num(c.inputs.IN), num(c.inputs.MN)), num(c.inputs.MX)) }),
    ),

    fn("ADD", "Matemática", "Adição", NUM2, [{ name: "OUT", type: "ANY_NUM" }], (c) => ({
      OUT: num(c.inputs.IN1) + num(c.inputs.IN2),
    })),
    fn("SUB", "Matemática", "Subtração", NUM2, [{ name: "OUT", type: "ANY_NUM" }], (c) => ({
      OUT: num(c.inputs.IN1) - num(c.inputs.IN2),
    })),
    fn("MUL", "Matemática", "Multiplicação", NUM2, [{ name: "OUT", type: "ANY_NUM" }], (c) => ({
      OUT: num(c.inputs.IN1) * num(c.inputs.IN2),
    })),
    fn(
      "DIV",
      "Matemática",
      "Divisão (inteiros truncam em direção a zero)",
      NUM2,
      [{ name: "OUT", type: "ANY_NUM" }],
      (c) => {
        const b = num(c.inputs.IN2);
        if (b === 0) {
          c.fault("DIV_BY_ZERO", "Divisão por zero");
          return { OUT: 0 };
        }
        const r = num(c.inputs.IN1) / b;
        return { OUT: c.binding !== null && isIntegerType(c.binding) ? Math.trunc(r) : r };
      },
    ),
    fn(
      "MOD",
      "Matemática",
      "Resto da divisão inteira",
      [
        { name: "IN1", type: "ANY_INT" },
        { name: "IN2", type: "ANY_INT" },
      ],
      [{ name: "OUT", type: "ANY_INT" }],
      (c) => {
        const b = num(c.inputs.IN2);
        if (b === 0) {
          c.fault("DIV_BY_ZERO", "MOD por zero");
          return { OUT: 0 };
        }
        return { OUT: num(c.inputs.IN1) % b };
      },
    ),
    fn(
      "ABS",
      "Matemática",
      "Valor absoluto",
      [{ name: "IN", type: "ANY_NUM" }],
      [{ name: "OUT", type: "ANY_NUM" }],
      (c) => ({ OUT: Math.abs(num(c.inputs.IN)) }),
    ),
    fn(
      "SQRT",
      "Matemática",
      "Raiz quadrada",
      [{ name: "IN", type: "ANY_REAL" }],
      [{ name: "OUT", type: "ANY_REAL" }],
      (c) => {
        const v = num(c.inputs.IN);
        if (v < 0) {
          c.fault("DOMAIN_ERROR", "SQRT de número negativo");
          return { OUT: 0 };
        }
        return { OUT: Math.sqrt(v) };
      },
    ),
  ];

  for (const from of CONVERTIBLE) {
    for (const to of CONVERTIBLE) {
      if (from !== to) defs.push(conversion(from, to));
    }
  }
  return defs;
}

export function systemDefinitions(): BlockDefinition[] {
  return [
    {
      type: "VAR_IN",
      namespace: "SYSTEM",
      standard: null,
      version: "1.0.0",
      category: "Variáveis",
      description: "Lê uma variável declarada do POU",
      inputs: [],
      outputs: [{ name: "OUT", type: "ANY" }],
      stateful: false,
      resolvePortTypes(node, doc) {
        const name = node.params.name;
        const v = doc.variables.find((x) => x.name === name);
        return v
          ? { ok: true, types: { OUT: v.dataType } }
          : { ok: false, message: `Variável '${String(name)}' não declarada` };
      },
      execute: (c) => ({ OUT: c.io.read(String(c.params.name)) }),
    },
    {
      type: "VAR_OUT",
      namespace: "SYSTEM",
      standard: null,
      version: "1.0.0",
      category: "Variáveis",
      description: "Escreve em uma variável declarada do POU",
      inputs: [{ name: "IN", type: "ANY", required: true }],
      outputs: [],
      stateful: false,
      resolvePortTypes(node, doc) {
        const name = node.params.name;
        const v = doc.variables.find((x) => x.name === name);
        if (!v) return { ok: false, message: `Variável '${String(name)}' não declarada` };
        if (v.direction === "input")
          return { ok: false, message: `Variável de entrada '${v.name}' não pode ser escrita` };
        return { ok: true, types: { IN: v.dataType } };
      },
      execute: (c) => {
        c.io.write(String(c.params.name), c.inputs.IN ?? 0);
        return {};
      },
    },
    {
      type: "CONST",
      namespace: "SYSTEM",
      standard: null,
      version: "1.0.0",
      category: "Variáveis",
      description: "Constante tipada",
      inputs: [],
      outputs: [{ name: "OUT", type: "ANY" }],
      stateful: false,
      resolvePortTypes(node) {
        const dt = node.params.dataType;
        if (typeof dt !== "string" || !isElementaryType(dt)) {
          return { ok: false, message: `dataType inválido (use: ${ELEMENTARY_TYPES.join(", ")})` };
        }
        if (node.params.value === undefined)
          return { ok: false, message: "Parâmetro 'value' ausente" };
        return { ok: true, types: { OUT: dt } };
      },
      execute: (c) => ({ OUT: c.params.value ?? 0 }),
    },
  ];
}

export function createDefaultRegistry(): BlockRegistry {
  const reg = new BlockRegistry();
  for (const d of [...systemDefinitions(), ...iecDefinitions()]) reg.register(d);
  return reg;
}
