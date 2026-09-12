// Diagram domain — Zod-first schemas. Shared between client, server (IA) and DB.
// Tudo que toca o store deve passar por DiagramDocSchema.parse().
import { z } from "zod";

export const DIAGRAM_DOC_VERSION = 1 as const;

export const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
export type Position = z.infer<typeof PositionSchema>;

export const NodeKindSchema = z.enum([
  // proteção / manobra
  "breaker",
  "rcd",
  "contactor",
  "relay",
  "fuse",
  "disconnector",
  // fonte / conversão
  "transformer",
  "psu",
  "vfd",
  "softstarter",
  "busbar",
  "ccm",
  // cargas
  "motor",
  "load",
  "lamp",
  "socket",
  // instrumentação
  "pt100",
  "pressure",
  "flow",
  "level",
  "encoder",
  // segurança
  "estop",
  "lightcurtain",
  // referência
  "ground",
  "neutral",
  "terminal",
]);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const EdgeKindSchema = z.enum(["power", "signal", "pipe", "ground"]);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const SheetKindSchema = z.enum(["unifilar", "multifilar", "ladder"]);
export type SheetKind = z.infer<typeof SheetKindSchema>;

// Params por kind — discriminated union, extensível.
// Mantemos campos comuns + bag tipada por kind.
const ParamsBase = {
  tag: z.string().max(64).optional(),
  notes: z.string().max(500).optional(),
};

export const NodeParamsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("breaker"),
    ...ParamsBase,
    in_A: z.number().positive(),
    curve: z.enum(["B", "C", "D"]).default("C"),
    poles: z.number().int().min(1).max(4).default(1),
    icc_kA: z.number().positive().optional(),
  }),
  z.object({
    kind: z.literal("rcd"),
    ...ParamsBase,
    in_A: z.number().positive(),
    sensitivity_mA: z.number().positive().default(30),
    poles: z.number().int().min(2).max(4).default(2),
  }),
  z.object({
    kind: z.literal("contactor"),
    ...ParamsBase,
    in_A: z.number().positive(),
    coil_V: z.number().positive().default(24),
  }),
  z.object({
    kind: z.literal("relay"),
    ...ParamsBase,
    coil_V: z.number().positive().default(24),
    contacts: z.number().int().min(1).default(2),
  }),
  z.object({ kind: z.literal("fuse"), ...ParamsBase, in_A: z.number().positive() }),
  z.object({ kind: z.literal("disconnector"), ...ParamsBase, in_A: z.number().positive() }),
  z.object({
    kind: z.literal("transformer"),
    ...ParamsBase,
    kVA: z.number().positive(),
    primary_V: z.number().positive(),
    secondary_V: z.number().positive(),
    vector: z.string().default("Dyn11"),
  }),
  z.object({
    kind: z.literal("psu"),
    ...ParamsBase,
    output_V: z.number().positive().default(24),
    output_A: z.number().positive().default(10),
  }),
  z.object({
    kind: z.literal("vfd"),
    ...ParamsBase,
    power_kW: z.number().positive(),
    voltage_V: z.number().positive().default(380),
  }),
  z.object({ kind: z.literal("softstarter"), ...ParamsBase, power_kW: z.number().positive() }),
  z.object({
    kind: z.literal("busbar"),
    ...ParamsBase,
    current_A: z.number().positive().default(63),
    voltage_V: z.number().positive().default(380),
  }),
  z.object({
    kind: z.literal("ccm"),
    ...ParamsBase,
    columns: z.number().int().positive().default(1),
    cells: z.number().int().positive().default(4),
  }),
  z.object({
    kind: z.literal("motor"),
    ...ParamsBase,
    power_kW: z.number().positive(),
    voltage_V: z.number().positive().default(380),
    fla_A: z.number().positive().optional(),
    startMethod: z.enum(["DOL", "SOFT", "VFD"]).default("DOL"),
  }),
  z.object({
    kind: z.literal("load"),
    ...ParamsBase,
    power_W: z.number().positive(),
    voltage_V: z.number().positive().default(220),
    fp: z.number().min(0).max(1).default(0.92),
  }),
  z.object({
    kind: z.literal("lamp"),
    ...ParamsBase,
    power_W: z.number().positive().default(15),
    voltage_V: z.number().positive().default(220),
  }),
  z.object({
    kind: z.literal("socket"),
    ...ParamsBase,
    current_A: z.number().positive().default(10),
    voltage_V: z.number().positive().default(220),
  }),
  z.object({
    kind: z.literal("pt100"),
    ...ParamsBase,
    range_C: z.tuple([z.number(), z.number()]).default([-50, 200]),
  }),
  z.object({
    kind: z.literal("pressure"),
    ...ParamsBase,
    range_bar: z.tuple([z.number(), z.number()]).default([0, 10]),
  }),
  z.object({
    kind: z.literal("flow"),
    ...ParamsBase,
    range: z.tuple([z.number(), z.number()]).default([0, 100]),
  }),
  z.object({
    kind: z.literal("level"),
    ...ParamsBase,
    range_pct: z.tuple([z.number(), z.number()]).default([0, 100]),
  }),
  z.object({
    kind: z.literal("encoder"),
    ...ParamsBase,
    ppr: z.number().int().positive().default(1024),
  }),
  z.object({
    kind: z.literal("estop"),
    ...ParamsBase,
    category: z.enum(["0", "1", "2"]).default("1"),
  }),
  z.object({
    kind: z.literal("lightcurtain"),
    ...ParamsBase,
    resolution_mm: z.number().positive().default(14),
  }),
  z.object({ kind: z.literal("ground"), ...ParamsBase }),
  z.object({ kind: z.literal("neutral"), ...ParamsBase }),
  z.object({ kind: z.literal("terminal"), ...ParamsBase }),
]);
export type NodeParams = z.infer<typeof NodeParamsSchema>;

export const DiagramNodeSchema = z.object({
  id: z.string().min(1).max(40),
  sheet: SheetKindSchema,
  position: PositionSchema,
  rotation: z.number().default(0),
  label: z.string().max(80).default(""),
  params: NodeParamsSchema,
  // metadados livres só para UI (JSON-serializável)
  ui: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type DiagramNode = z.infer<typeof DiagramNodeSchema>;

export const DiagramEdgeSchema = z.object({
  id: z.string().min(1).max(40),
  sheet: SheetKindSchema,
  source: z.string().min(1),
  target: z.string().min(1),
  sourcePort: z.string().max(16).optional(),
  targetPort: z.string().max(16).optional(),
  kind: EdgeKindSchema,
  // configuração de condutores do circuito (modo multifilar)
  circuitConfig: z
    .enum(["F", "F+N", "F+N+PE", "3F", "3F+N", "3F+N+PE", "N", "PE"])
    .optional(),
  // cabo (para regras NBR)
  cable: z
    .object({
      section_mm2: z.number().positive().optional(),
      length_m: z.number().positive().optional(),
      insulation: z.enum(["PVC", "EPR", "XLPE"]).default("PVC"),
      installation: z.string().max(16).optional(), // método A1, B1 etc
    })
    .optional(),
  // pontos de roteamento orto (cache de layout, não-canônico)
  waypoints: z.array(PositionSchema).optional(),
});
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>;
export type CircuitConfig = NonNullable<DiagramEdge["circuitConfig"]>;

export const DiagramMetadataSchema = z.object({
  title: z.string().max(120).default("Sem título"),
  author: z.string().max(120).optional(),
  client: z.string().max(120).optional(),
  norms: z.array(z.string().max(32)).default(["NBR 5410"]),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type DiagramMetadata = z.infer<typeof DiagramMetadataSchema>;

export const DiagramDocSchema = z.object({
  version: z.literal(DIAGRAM_DOC_VERSION),
  id: z.string().min(1),
  metadata: DiagramMetadataSchema,
  sheets: z.array(SheetKindSchema).min(1).default(["unifilar"]),
  // mapa id->nó para O(1); array serializa via z.record
  nodes: z.record(z.string(), DiagramNodeSchema),
  edges: z.record(z.string(), DiagramEdgeSchema),
});
export type DiagramDoc = z.infer<typeof DiagramDocSchema>;

// ============ Patch da IA ============
// A IA devolve um *patch* (não o doc inteiro): novas listas + remoções.
export const AiDiagramPatchSchema = z.object({
  rationale: z.string().max(2000),
  addNodes: z.array(DiagramNodeSchema).max(100).default([]),
  addEdges: z.array(DiagramEdgeSchema).max(200).default([]),
  removeNodeIds: z.array(z.string().min(1).max(40)).max(200).default([]),
  removeEdgeIds: z.array(z.string().min(1).max(40)).max(400).default([]),
  updateNodes: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        position: PositionSchema.optional(),
        label: z.string().max(80).optional(),
        params: NodeParamsSchema.optional(),
      }),
    )
    .max(200)
    .default([]),
});
export type AiDiagramPatch = z.infer<typeof AiDiagramPatchSchema>;
