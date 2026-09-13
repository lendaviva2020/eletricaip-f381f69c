import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_bom_items",
  title: "Listar lista de materiais",
  description: "Lista os itens da lista de materiais (BOM) de um projeto e o total em BRL.",
  inputSchema: { projectId: z.string().uuid().describe("ID do projeto.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    const { data, error } = await supabase
      .from("project_bom_items")
      .select("id, part_number, description, manufacturer, quantity, unit, unit_price_brl, source")
      .eq("project_id", projectId)
      .order("part_number", { ascending: true });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const items = data ?? [];
    const totalBRL = items.reduce(
      (sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unit_price_brl ?? 0),
      0,
    );
    const payload = { items, totalBRL: Math.round(totalBRL * 100) / 100 };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
