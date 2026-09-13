import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_alarms",
  title: "Listar alarmes",
  description: "Lista o histórico de alarmes de um projeto, do mais recente para o mais antigo.",
  inputSchema: {
    projectId: z.string().uuid().describe("ID do projeto."),
    limit: z.number().int().min(1).max(200).default(50).describe("Máximo de alarmes."),
    state: z
      .enum(["active", "acknowledged", "cleared"])
      .optional()
      .describe("Filtra por estado do alarme."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId, limit, state }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("alarm_history")
      .select("id, tag_name, description, severity, state, category, value, setpoint, triggered_at")
      .eq("project_id", projectId)
      .order("triggered_at", { ascending: false })
      .limit(limit);
    if (state) query = query.eq("state", state);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { alarms: data ?? [] },
    };
  },
});
