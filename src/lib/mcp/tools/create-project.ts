import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_project",
  title: "Criar projeto",
  description: "Cria um novo projeto de engenharia no tenant do usuário autenticado.",
  inputSchema: {
    name: z.string().trim().min(1).max(120).describe("Nome do projeto."),
    description: z.string().trim().max(2000).optional().describe("Descrição do projeto."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ name, description }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const userId = ctx.getUserId();
    if (!userId) {
      return { content: [{ type: "text", text: "Token sem identificação de usuário." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    // O tenant vem sempre do perfil do usuário autenticado, nunca da entrada.
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) return { content: [{ type: "text", text: profileErr.message }], isError: true };
    if (!profile?.tenant_id) {
      return {
        content: [{ type: "text", text: "Usuário sem workspace configurado." }],
        isError: true,
      };
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name,
        description: description ?? null,
        tenant_id: profile.tenant_id,
        created_by: userId,
      })
      .select("id, name, description, status, created_at")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { project: data },
    };
  },
});
