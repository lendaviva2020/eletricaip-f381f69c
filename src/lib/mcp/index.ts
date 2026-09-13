import { auth, defineMcp } from "@lovable.dev/mcp-js";

import listProjectsTool from "./tools/list-projects";
import getProjectTool from "./tools/get-project";
import listBomItemsTool from "./tools/list-bom-items";
import listAlarmsTool from "./tools/list-alarms";
import createProjectTool from "./tools/create-project";

// O issuer OAuth precisa ser o host Supabase direto. O ref do projeto é o único
// valor que sobrevive ao publish sem reescrita, e o Vite o inlina no build.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "eletricai",
  title: "EletricAi",
  version: "0.1.0",
  instructions:
    "Ferramentas do EletricAi Industrial OS. Use `list_projects` para localizar projetos, " +
    "`get_project` para detalhes e diagramas, `list_bom_items` para a lista de materiais, " +
    "`list_alarms` para o histórico de alarmes e `create_project` para criar um projeto. " +
    "Todas as chamadas agem como o usuário autenticado, respeitando as regras de acesso do workspace.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProjectsTool, getProjectTool, listBomItemsTool, listAlarmsTool, createProjectTool],
});
