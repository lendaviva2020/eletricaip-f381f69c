import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_project",
  title: "Detalhar projeto",
  description: "Retorna os dados de um projeto e a lista de diagramas vinculados a ele.",
  inputSchema: { projectId: z.string().uuid().describe("ID do projeto.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    const { data: project, error } = await supabase
      .from("projects")
      .select("id, name, description, status, client_id, created_at, updated_at")
      .eq("id", projectId)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!project) {
      return {
        content: [{ type: "text", text: "Projeto não encontrado ou sem permissão." }],
        isError: true,
      };
    }

    const { data: diagrams, error: diagErr } = await supabase
      .from("diagrams")
      .select("id, name, kind, updated_at")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false });
    if (diagErr) return { content: [{ type: "text", text: diagErr.message }], isError: true };

    const payload = { project, diagrams: diagrams ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
