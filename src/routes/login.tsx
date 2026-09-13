import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { BrandBolt } from "@/components/brand-bolt";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isSafeRedirect } from "@/lib/safe-redirect";

export const DEFAULT_REDIRECT = "/dashboard";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: isSafeRedirect(s.redirect) ? s.redirect : DEFAULT_REDIRECT,
  }),
  head: () => ({ meta: [{ title: "Entrar - EletricAI" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { useCurrentProject } = await import("@/lib/current-project");
      const currentProject = useCurrentProject.getState();
      currentProject.hydrateFromStorage();

      if (
        !currentProject.project &&
        redirect !== "/onboarding" &&
        !redirect.startsWith("/invite/")
      ) {
        router.navigate({ to: "/onboarding" });
        return;
      }

      // Destinos com query string (ex.: consentimento OAuth do MCP) precisam
      // de navegação completa para preservar os parâmetros.
      if (redirect.includes("?")) {
        window.location.assign(redirect);
        return;
      }
      router.navigate({ to: redirect as never });
    })();
  }, [redirect, router, user]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
  };

  const handleGoogle = async () => {
    setError("");
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("redirect", redirect || DEFAULT_REDIRECT);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    if (error) setError(error.message);
  };

  return (
    <AuthShell title="Entrar no EletricAI" subtitle="Bem-vindo de volta, engenheiro.">
      <button
        onClick={handleGoogle}
        className="h-11 w-full rounded-md border border-border bg-card hover:bg-accent transition flex items-center justify-center gap-2 text-sm font-medium"
      >
        <GoogleIcon /> Continuar com Google
      </button>
      <Divider />
      <form onSubmit={handleEmail} className="space-y-3">
        <Input label="Email" type="email" value={email} onChange={setEmail} required />
        <Input label="Senha" type="password" value={password} onChange={setPassword} required />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          disabled={loading}
          type="submit"
          className="h-11 w-full rounded-md text-sm font-semibold text-primary-foreground glow-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: "var(--gradient-primary)" }}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
        </button>
      </form>
      <div className="mt-4 text-center">
        <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">
          Esqueci minha senha
        </Link>
      </div>
      <p className="text-xs text-center text-muted-foreground mt-6">
        Não tem conta?{" "}
        <Link to="/signup" className="text-primary hover:underline">
          Criar conta
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex relative items-center justify-center p-12 border-r border-border overflow-hidden">
        <div className="absolute inset-0 industrial-grid opacity-30" />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[420px] w-[420px] rounded-full opacity-30 blur-3xl"
          style={{ background: "var(--gradient-primary)" }}
        />
        <div className="relative max-w-md">
          <Link to="/" className="flex items-center gap-2 mb-8">
            <div
              className="h-9 w-9 rounded-md flex items-center justify-center"
              style={{ background: "var(--gradient-primary)" }}
            >
              <BrandBolt className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="font-semibold">EletricAI</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Industrial OS
              </div>
            </div>
          </Link>
          <h2 className="text-3xl font-semibold tracking-tight">
            O sistema operacional da engenharia industrial.
          </h2>
          <p className="mt-4 text-sm text-muted-foreground">
            Unifique unifilar, Ladder, FBD, SCADA, PLC e Digital Twin com IA copiloto nativa.
          </p>
          <ul className="mt-8 space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-primary">•</span> Runtime determinístico em tempo real
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span> IA contextual + manutenção preditiva
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span> Conformidade NBR 5410 / IEC 61131
            </li>
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <div
              className="h-8 w-8 rounded-md flex items-center justify-center"
              style={{ background: "var(--gradient-primary)" }}
            >
              <BrandBolt className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">EletricAI</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-8">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Input({
  label,
  type,
  value,
  onChange,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (show ? "text" : "password") : type;
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="relative mt-1">
        <input
          type={inputType}
          aria-label={label}
          title={label}
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className={`h-11 w-full rounded-md bg-input/60 border border-border px-3 ${isPassword ? "pr-10" : ""} text-sm outline-none focus:ring-2 focus:ring-ring focus:bg-input`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </label>
  );
}

export function Divider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">ou</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
