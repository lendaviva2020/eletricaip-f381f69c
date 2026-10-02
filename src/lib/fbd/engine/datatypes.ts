/**
 * Sistema de tipos IEC 61131-3 do motor FBD.
 * Tipos elementares, genéricos (ANY_*), conversões implícitas seguras
 * (somente alargamento sem perda) e coerção com wrap de inteiros.
 */

export const ELEMENTARY_TYPES = [
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
  "STRING",
  "WSTRING",
  "TIME",
  "DATE",
  "TIME_OF_DAY",
  "DATE_AND_TIME",
] as const;
export type ElementaryType = (typeof ELEMENTARY_TYPES)[number];

export const GENERIC_TYPES = [
  "ANY",
  "ANY_ELEMENTARY",
  "ANY_MAGNITUDE",
  "ANY_NUM",
  "ANY_REAL",
  "ANY_INT",
  "ANY_BIT",
  "ANY_STRING",
  "ANY_DATE",
] as const;
export type GenericType = (typeof GENERIC_TYPES)[number];

export type PortType = ElementaryType | GenericType;
export type FbdValue = boolean | number | string;

const SIGNED_INT: readonly ElementaryType[] = ["SINT", "INT", "DINT", "LINT"];
const UNSIGNED_INT: readonly ElementaryType[] = ["USINT", "UINT", "UDINT", "ULINT"];
const REAL_TYPES: readonly ElementaryType[] = ["REAL", "LREAL"];
const BIT_TYPES: readonly ElementaryType[] = ["BOOL", "BYTE", "WORD", "DWORD", "LWORD"];
const STRING_TYPES: readonly ElementaryType[] = ["STRING", "WSTRING"];
const DATE_TYPES: readonly ElementaryType[] = ["DATE", "TIME_OF_DAY", "DATE_AND_TIME"];

const GENERIC_MEMBERS: Readonly<Record<GenericType, readonly ElementaryType[]>> = {
  ANY: ELEMENTARY_TYPES,
  ANY_ELEMENTARY: ELEMENTARY_TYPES,
  ANY_MAGNITUDE: [...SIGNED_INT, ...UNSIGNED_INT, ...REAL_TYPES, "TIME"],
  ANY_NUM: [...SIGNED_INT, ...UNSIGNED_INT, ...REAL_TYPES],
  ANY_REAL: REAL_TYPES,
  ANY_INT: [...SIGNED_INT, ...UNSIGNED_INT],
  ANY_BIT: BIT_TYPES,
  ANY_STRING: STRING_TYPES,
  ANY_DATE: DATE_TYPES,
};

/** Alargamentos implícitos sem perda de informação (IEC 61131-3 ed.3, tabela 11). */
const WIDENING: Readonly<Partial<Record<ElementaryType, readonly ElementaryType[]>>> = {
  SINT: ["INT", "DINT", "LINT", "REAL", "LREAL"],
  INT: ["DINT", "LINT", "REAL", "LREAL"],
  DINT: ["LINT", "LREAL"],
  USINT: ["UINT", "UDINT", "ULINT", "INT", "DINT", "LINT", "REAL", "LREAL"],
  UINT: ["UDINT", "ULINT", "DINT", "LINT", "REAL", "LREAL"],
  UDINT: ["ULINT", "LINT", "LREAL"],
  REAL: ["LREAL"],
  BYTE: ["WORD", "DWORD", "LWORD"],
  WORD: ["DWORD", "LWORD"],
  DWORD: ["LWORD"],
  STRING: [],
};

const INT_LAYOUT: Readonly<Partial<Record<ElementaryType, { bits: number; signed: boolean }>>> = {
  SINT: { bits: 8, signed: true },
  INT: { bits: 16, signed: true },
  DINT: { bits: 32, signed: true },
  LINT: { bits: 64, signed: true },
  USINT: { bits: 8, signed: false },
  UINT: { bits: 16, signed: false },
  UDINT: { bits: 32, signed: false },
  ULINT: { bits: 64, signed: false },
  BYTE: { bits: 8, signed: false },
  WORD: { bits: 16, signed: false },
  DWORD: { bits: 32, signed: false },
  LWORD: { bits: 64, signed: false },
};

export function isElementaryType(v: string): v is ElementaryType {
  return (ELEMENTARY_TYPES as readonly string[]).includes(v);
}
export function isGenericType(v: string): v is GenericType {
  return (GENERIC_TYPES as readonly string[]).includes(v);
}
export function isIntegerType(t: ElementaryType): boolean {
  return SIGNED_INT.includes(t) || UNSIGNED_INT.includes(t);
}
export function isRealType(t: ElementaryType): boolean {
  return REAL_TYPES.includes(t);
}
export function isStringType(t: ElementaryType): boolean {
  return STRING_TYPES.includes(t);
}

/** `t` satisfaz o tipo do pino (concreto ou genérico)? */
export function matchesType(t: ElementaryType, port: PortType): boolean {
  return isGenericType(port) ? GENERIC_MEMBERS[port].includes(t) : t === port;
}

export function widenings(t: ElementaryType): readonly ElementaryType[] {
  return WIDENING[t] ?? [];
}

export function canImplicitlyConvert(from: ElementaryType, to: ElementaryType): boolean {
  return from === to || widenings(from).includes(to);
}

export function defaultValue(t: ElementaryType): FbdValue {
  if (t === "BOOL") return false;
  if (isStringType(t)) return "";
  return 0;
}

/** Converte literal IEC de tempo (T#1h2m3s4ms / TIME#500ms) para milissegundos. */
export function parseTimeLiteral(input: string): number | null {
  const trimmed = input.trim().replace(/_/g, "");
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const m = /^(?:T|TIME)#(-)?(.+)$/i.exec(trimmed);
  if (!m) return null;
  const body = m[2] ?? "";
  const re = /(\d+(?:\.\d+)?)(ms|d|h|m|s)/gi;
  const factors: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000, ms: 1 };
  let total = 0;
  let consumed = 0;
  for (const part of body.matchAll(re)) {
    const unit = (part[2] ?? "").toLowerCase();
    const factor = factors[unit];
    if (factor === undefined) return null;
    total += Number(part[1]) * factor;
    consumed += part[0].length;
  }
  if (consumed === 0 || consumed !== body.length) return null;
  return m[1] ? -total : total;
}

function wrapInteger(n: number, layout: { bits: number; signed: boolean }): number {
  // Inteiros de 64 bits são limitados à faixa segura do Number (2^53).
  if (layout.bits >= 53) return n;
  const mod = 2 ** layout.bits;
  let r = ((n % mod) + mod) % mod;
  if (layout.signed && r >= mod / 2) r -= mod;
  return r;
}

function toNumber(v: FbdValue, t: ElementaryType): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (t === "TIME") return parseTimeLiteral(v) ?? Number.NaN;
  return Number(v);
}

/** Coage um valor para o tipo destino com a semântica de armazenamento do tipo. */
export function coerceValue(v: FbdValue, t: ElementaryType): FbdValue {
  if (t === "BOOL") {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    const s = v.trim().toUpperCase();
    return s === "TRUE" || s === "1";
  }
  if (isStringType(t)) return typeof v === "string" ? v : String(v);
  const n = toNumber(v, t);
  if (!Number.isFinite(n)) return 0;
  if (t === "REAL") return Math.fround(n);
  if (t === "LREAL") return n;
  const layout = INT_LAYOUT[t];
  if (layout) return wrapInteger(Math.trunc(n), layout);
  // TIME / DATE / TOD / DT: milissegundos inteiros
  return Math.trunc(n);
}

/** Verifica se um valor de parâmetro pode ser interpretado no tipo (sem coerção silenciosa de lixo). */
export function isValidLiteral(v: FbdValue, t: ElementaryType): boolean {
  if (typeof v !== "string") return true;
  if (t === "BOOL") return /^(TRUE|FALSE|0|1)$/i.test(v.trim());
  if (isStringType(t)) return true;
  if (t === "TIME") return parseTimeLiteral(v) !== null;
  return v.trim() !== "" && Number.isFinite(Number(v));
}
