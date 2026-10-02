/**
 * Domain Model do FBD — fonte da verdade. O editor visual apenas o representa.
 * Validação de runtime via Zod para qualquer dado externo (persistência, IA, import).
 */
import { z } from "zod";
import { ELEMENTARY_TYPES, type ElementaryType, type FbdValue } from "./datatypes";

export interface FbdPortRef {
  readonly nodeId: string;
  readonly port: string;
}

export interface FbdNodeModel {
  readonly id: string;
  readonly instanceName: string;
  readonly blockType: string;
  readonly networkId: string;
  readonly params: Readonly<Record<string, FbdValue>>;
  readonly position: { readonly x: number; readonly y: number };
}

export interface FbdConnectionModel {
  readonly id: string;
  readonly source: FbdPortRef;
  readonly target: FbdPortRef;
}

export type FbdVariableDirection = "input" | "output" | "local";

export interface FbdVariable {
  readonly name: string;
  readonly dataType: ElementaryType;
  readonly direction: FbdVariableDirection;
  readonly initialValue?: FbdValue;
  readonly retain?: boolean;
  readonly address?: string;
  readonly comment?: string;
}

export interface FbdNetwork {
  readonly id: string;
  readonly name: string;
  readonly executionOrder: number;
  readonly enabled: boolean;
}

export interface FbdDocument {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly cycleTimeMs: number;
  readonly networks: readonly FbdNetwork[];
  readonly nodes: readonly FbdNodeModel[];
  readonly connections: readonly FbdConnectionModel[];
  readonly variables: readonly FbdVariable[];
}

const valueSchema = z.union([z.boolean(), z.number().finite(), z.string()]);
const portRefSchema = z.object({ nodeId: z.string().min(1), port: z.string().min(1) });
const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Identificador IEC inválido");

export const fbdDocumentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  version: z.number().int().nonnegative(),
  cycleTimeMs: z.number().positive().max(60_000),
  networks: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().max(200),
        executionOrder: z.number().int(),
        enabled: z.boolean(),
      }),
    )
    .min(1),
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      instanceName: identifier,
      blockType: z.string().min(1),
      networkId: z.string().min(1),
      params: z.record(valueSchema),
      position: z.object({ x: z.number().finite(), y: z.number().finite() }),
    }),
  ),
  connections: z.array(
    z.object({ id: z.string().min(1), source: portRefSchema, target: portRefSchema }),
  ),
  variables: z.array(
    z.object({
      name: identifier,
      dataType: z.enum(ELEMENTARY_TYPES),
      direction: z.enum(["input", "output", "local"]),
      initialValue: valueSchema.optional(),
      retain: z.boolean().optional(),
      address: z.string().optional(),
      comment: z.string().optional(),
    }),
  ),
});

export type ParseResult =
  | { readonly ok: true; readonly document: FbdDocument }
  | { readonly ok: false; readonly issues: readonly string[] };

/** Valida dados externos (JSON) antes de entregá-los ao compilador. */
export function parseFbdDocument(input: unknown): ParseResult {
  const r = fbdDocumentSchema.safeParse(input);
  if (r.success) return { ok: true, document: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`),
  };
}
