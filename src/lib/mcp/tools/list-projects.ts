import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_projects",
  title: "Listar projetos",
  description: "Lista os projetos de engenharia acessíveis ao usuário autenticado.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Máximo de projetos."),
    search: z.string().trim().min(1).max(120).optional().describe("Filtra pelo nome do projeto."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, search }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("projects")
      .select("id, name, description, status, client_id, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (search) query = query.ilike("name", `%${search}%`);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { projects: data ?? [] },
    };
  },
});
