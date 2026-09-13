import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isSafeRedirect } from "@/lib/safe-redirect";

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: isSafeRedirect(s.redirect) ? s.redirect : "/dashboard",
  }),
  head: () => ({ meta: [{ title: "Autenticando - EletricAI" }] }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const router = useRouter();
  const { redirect } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function finishAuth() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (mounted) setError(error.message);
          return;
        }
      } else {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          if (mounted) setError("Sessão de autenticação não encontrada.");
          return;
        }
      }

      if (redirect.includes("?")) {
        window.location.assign(redirect);
        return;
      }
      router.navigate({ to: redirect as never });
    }

    void finishAuth();

    return () => {
      mounted = false;
    };
  }, [redirect, router]);

  return (
    <div className="min-h-screen grid place-items-center bg-background text-foreground p-6">
      <div className="text-center space-y-3">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-destructive">Falha na autenticação</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Finalizando login...</p>
          </>
        )}
      </div>
    </div>
  );
}
