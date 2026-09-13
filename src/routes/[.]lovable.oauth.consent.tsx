// Tela de consentimento OAuth 2.1 (servidor MCP do app).
// O Supabase Auth redireciona o usuário para cá com `authorization_id`; após
// aprovar/negar, devolvemos o controle ao cliente MCP (ChatGPT, Claude, etc.).
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { BrandBolt } from "@/components/brand-bolt";
import { supabase } from "@/integrations/supabase/client";

interface OAuthClientInfo {
  name?: string;
  client_name?: string;
}

interface AuthorizationDetails {
  client?: OAuthClientInfo | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
  scope?: string | null;
}

interface OAuthResult {
  data: AuthorizationDetails | null;
  error: { message: string } | null;
}

/**
 * `supabase.auth.oauth` é beta e ainda não tipado no SDK — encapsulamos apenas
 * os três métodos usados aqui, sem `any`.
 */
interface OAuthApi {
  getAuthorizationDetails: (authorizationId: string) => Promise<OAuthResult>;
  approveAuthorization: (authorizationId: string) => Promise<OAuthResult>;
  denyAuthorization: (authorizationId: string) => Promise<OAuthResult>;
}

function oauthApi(): OAuthApi {
  const authWithOAuth = supabase.auth as unknown as { oauth?: OAuthApi };
  if (!authWithOAuth.oauth) {
    throw new Error("Este projeto Supabase não tem o servidor de autorização OAuth habilitado.");
  }
  return authWithOAuth.oauth;
}

function clientName(details: AuthorizationDetails | null): string {
  return details?.client?.name ?? details?.client?.client_name ?? "um aplicativo";
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Somente no navegador: a sessão do Supabase vive no localStorage.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Parâmetro authorization_id ausente.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { redirect: next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id");
    if (!authorizationId) throw new Error("Parâmetro authorization_id ausente.");
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  head: () => ({ meta: [{ title: "Autorizar aplicativo - EletricAI" }] }),
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <main className="min-h-screen grid place-items-center bg-background p-6">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold text-destructive">
          Não foi possível carregar a autorização
        </h1>
        <p className="text-sm text-muted-foreground break-all">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    </main>
  ),
});

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id: authorizationId } = Route.useSearch();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "deny");
    setError(null);
    try {
      const api = oauthApi();
      const { data, error: decisionError } = approve
        ? await api.approveAuthorization(authorizationId)
        : await api.denyAuthorization(authorizationId);
      if (decisionError) {
        setBusy(null);
        setError(decisionError.message);
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setBusy(null);
        setError("O servidor de autorização não retornou um endereço de retorno.");
        return;
      }
      window.location.href = target;
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const name = clientName(details);

  return (
    <main className="min-h-screen grid place-items-center bg-background text-foreground p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <BrandBolt className="h-8 w-8" />
          <div>
            <h1 className="text-lg font-semibold">Conectar {name}</h1>
            <p className="text-xs text-muted-foreground">EletricAI Industrial OS</p>
          </div>
        </div>

        <div className="flex gap-3 rounded-lg bg-muted/40 p-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {name} poderá ler e criar dados no EletricAI <strong>como você</strong>: projetos,
            diagramas, lista de materiais e alarmes do seu workspace. Nada fora das suas permissões
            atuais é liberado.
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive break-all">
            {error}
          </p>
        ) : null}

        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => decide(true)}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Autorizar
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => decide(false)}
            className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60 transition-colors"
          >
            Recusar
          </button>
        </div>
      </div>
    </main>
  );
}
