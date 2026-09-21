// Persistência de telemetria + upload de modelos 3D do Digital Twin
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SampleSchema = z.object({
  tag_name: z.string().min(1).max(120),
  value: z.number().finite(),
  quality: z.string().max(16).optional(),
});

const InputSchema = z.object({
  projectId: z.string().uuid(),
  samples: z.array(SampleSchema).min(1).max(500),
});

export const flushTwinTelemetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, tenant_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projErr) throw new Error(projErr.message);
    if (!project) throw new Error("project_not_found_or_forbidden");

    // Particionamento mensal é operação administrativa: `EXECUTE` está revogado
    // para `authenticated` por design (migrations 20260515131608 / 20260515151638).
    // Executa com a identidade de serviço no servidor — nunca com a do usuário —
    // e não bloqueia a gravação das amostras caso falhe (a partição do mês
    // corrente já existe na maioria das chamadas).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: partErr } = await supabaseAdmin.rpc("create_monthly_tag_samples_partition");
      if (partErr) {
        console.warn("[twin telemetry] partition ensure skipped:", partErr.message);
      }
    } catch (err) {
      console.warn(
        "[twin telemetry] partition ensure unavailable:",
        err instanceof Error ? err.message : String(err),
      );
    }

    const payload = data.samples.map((s) => ({
      tag_name: s.tag_name,
      value: s.value,
      quality: s.quality ?? "GOOD",
    }));

    const { error } = await supabase.rpc("batch_insert_tag_samples", {
      p_project_id: data.projectId,
      p_samples: payload,
    });
    if (error) throw new Error(error.message);

    return { inserted: payload.length, userId };
  });

// =====================================================================
// #TWIN-03 — Upload de modelos 3D (GLB/GLTF) em bucket privado
// Path convention: "<tenant_id>/<project_id>/<timestamp>-<filename>"
// =====================================================================

const BUCKET = "twin-models";
const MAX_BYTES = 75 * 1024 * 1024; // 75 MB
const FILENAME_RE = /^[A-Za-z0-9._-]{1,120}\.(glb|gltf)$/i;

const UploadUrlInput = z.object({
  projectId: z.string().uuid(),
  filename: z.string().regex(FILENAME_RE, "invalid_filename"),
  sizeBytes: z.number().int().positive().max(MAX_BYTES),
});

export const createTwinModelUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UploadUrlInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, tenant_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projErr) throw new Error(projErr.message);
    if (!project?.tenant_id) throw new Error("project_not_found_or_forbidden");

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile || profile.tenant_id !== project.tenant_id) {
      throw new Error("forbidden");
    }
    const tenantId = project.tenant_id;

    const safe = data.filename.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `${tenantId}/${data.projectId}/${Date.now()}-${safe}`;

    const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "sign_upload_failed");

    return { path, token: signed.token, signedUrl: signed.signedUrl, bucket: BUCKET };
  });

const SignedReadInput = z.object({
  path: z.string().min(1).max(512),
  expiresIn: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24)
    .optional(),
});

export const getTwinModelSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SignedReadInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) throw new Error("no_tenant");
    if (!data.path.startsWith(`${tenantId}/`)) throw new Error("forbidden");

    const { data: signed, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(data.path, data.expiresIn ?? 3600);
    if (error || !signed) throw new Error(error?.message ?? "sign_read_failed");

    return { signedUrl: signed.signedUrl, path: data.path };
  });

/**
 * `twin_hotspots` e a coluna `projects.twin_model_path` são novas demais
 * para estarem no types.ts gerado (supabase gen types). Isolado aqui, num
 * único ponto, para ser fácil de remover assim que os tipos forem
 * regenerados — ver comentário completo na origem deste padrão em
 * src/lib/mcp/supabase.ts.
 */

function untyped(supabase: unknown): any {
  return supabase;
}

async function requireProjectMembership(
  supabase: ReturnType<typeof untyped>,
  userId: string,
  projectId: string,
): Promise<string> {
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, tenant_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projErr) throw new Error(projErr.message);
  if (!project?.tenant_id) throw new Error("project_not_found_or_forbidden");

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.tenant_id !== project.tenant_id) {
    throw new Error("forbidden");
  }
  return project.tenant_id as string;
}

const ListHotspotsInput = z.object({ projectId: z.string().uuid() });

export const listTwinHotspots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListHotspotsInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireProjectMembership(untyped(supabase), userId, data.projectId);

    const { data: rows, error } = await untyped(supabase)
      .from("twin_hotspots")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    return { rows: rows ?? [] };
  });

const HotspotTypeEnum = z.enum([
  "temperature",
  "current",
  "voltage",
  "level",
  "pressure",
  "status",
  "flow",
]);

const UpsertHotspotInput = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  equipmentId: z.string().min(1).max(80),
  equipmentLabel: z.string().min(1).max(160),
  label: z.string().min(1).max(160),
  tag: z.string().min(1).max(120),
  type: HotspotTypeEnum,
  unit: z.string().max(24).optional(),
  position: z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#3b82f6"),
  alertThreshold: z.number().finite().optional(),
  criticalThreshold: z.number().finite().optional(),
});

export const upsertTwinHotspot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpsertHotspotInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireProjectMembership(untyped(supabase), userId, data.projectId);

    const row = {
      project_id: data.projectId,
      equipment_id: data.equipmentId,
      equipment_label: data.equipmentLabel,
      label: data.label,
      tag: data.tag,
      type: data.type,
      unit: data.unit ?? null,
      position_x: data.position.x,
      position_y: data.position.y,
      position_z: data.position.z,
      color: data.color,
      alert_threshold: data.alertThreshold ?? null,
      critical_threshold: data.criticalThreshold ?? null,
    };

    const query = data.id
      ? untyped(supabase).from("twin_hotspots").update(row).eq("id", data.id).select().single()
      : untyped(supabase).from("twin_hotspots").insert(row).select().single();

    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);

    return { row: saved };
  });

const DeleteHotspotInput = z.object({ id: z.string().uuid() });

export const deleteTwinHotspot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DeleteHotspotInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Sem checagem manual de tenant aqui de propósito: a policy RLS
    // "Engineers+ manage twin hotspots" já exige
    // projects.tenant_id = get_user_tenant_id() no próprio DELETE — uma
    // segunda checagem aqui seria redundante e RLS é a fonte de verdade.
    const { error } = await untyped(supabase).from("twin_hotspots").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ConfirmUploadInput = z.object({
  projectId: z.string().uuid(),
  path: z.string().min(1).max(512),
});

export const confirmTwinModelUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ConfirmUploadInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireProjectMembership(untyped(supabase), userId, data.projectId);
    if (!data.path.startsWith(`${tenantId}/${data.projectId}/`)) throw new Error("forbidden");

    const { error } = await untyped(supabase)
      .from("projects")
      .update({ twin_model_path: data.path })
      .eq("id", data.projectId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

const GetProjectModelInput = z.object({ projectId: z.string().uuid() });

export const getProjectTwinModel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GetProjectModelInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireProjectMembership(untyped(supabase), userId, data.projectId);

    const { data: project, error } = await untyped(supabase)
      .from("projects")
      .select("twin_model_path")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return { path: (project?.twin_model_path as string | null) ?? null };
  });
