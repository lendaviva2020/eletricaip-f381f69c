// Lazy wrappers para bibliotecas pesadas (Monaco / Konva / Three.js).
// Cada uma é code-split em chunk próprio e só baixa quando o canvas/aba
// correspondente é montado — corta ~1.5MB do bundle inicial.
//
// IMPORTANTE: `React.lazy` sozinho NÃO impede o SSR de avaliar o módulo — o
// React resolve o lazy durante a renderização no servidor e Pixi/Three/Konva
// quebram (ou explodem em memória) no runtime Worker. Por isso todo wrapper
// abaixo é envolvido em `<ClientOnly>`, que é o gate de render real.
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { ErrorBoundary } from "@/components/error-boundary";

const CanvasFallback = ({ label }: { label: string }) => (
  <div className="w-full h-full grid place-items-center bg-background/40">
    <div className="text-xs text-muted-foreground animate-pulse">{label}</div>
  </div>
);

function ModuleErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="w-full h-full grid place-items-center bg-background/40 p-6">
      <div className="text-center max-w-sm">
        <p className="text-sm font-medium text-destructive">{title}</p>
        {message ? <p className="mt-2 text-xs text-muted-foreground break-all">{message}</p> : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors"
          >
            Tentar novamente
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────── Monaco ───────────────────────────
// O Monaco é auto-hospedado (ver src/lib/monaco/setup.ts). O gate abaixo
// garante inicialização só no cliente, com estados de carregamento/erro e
// possibilidade de nova tentativa sem derrubar o restante do Workspace.
const MonacoEditorLazy = lazy(() => import("@monaco-editor/react"));

type MonacoStatus = "initializing" | "ready" | "error";

function MonacoGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<MonacoStatus>("initializing");
  const [message, setMessage] = useState<string>("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("initializing");
    setMessage("");

    void (async () => {
      try {
        const { ensureMonaco } = await import("@/lib/monaco/setup");
        await ensureMonaco();
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setMessage(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    void (async () => {
      try {
        const { resetMonaco } = await import("@/lib/monaco/setup");
        resetMonaco();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      }
      setAttempt((n) => n + 1);
    })();
  }, []);

  if (status === "initializing") return <CanvasFallback label="Inicializando editor…" />;
  if (status === "error") {
    return (
      <ModuleErrorState
        title="Não foi possível inicializar o editor"
        message={message}
        onRetry={retry}
      />
    );
  }
  return <>{children}</>;
}

export function LazyMonacoEditor(props: ComponentProps<typeof MonacoEditorLazy>) {
  const fallback = <CanvasFallback label="Inicializando editor…" />;
  return (
    <ClientOnly fallback={fallback}>
      <ErrorBoundary fallback={<ModuleErrorState title="Não foi possível inicializar o editor" />}>
        <MonacoGate>
          <Suspense fallback={fallback}>
            <MonacoEditorLazy {...props} />
          </Suspense>
        </MonacoGate>
      </ErrorBoundary>
    </ClientOnly>
  );
}

// Konva (~300KB gzip) — KonvaCanvas é named export
const KonvaCanvasLazy = lazy(() =>
  import("./konva-canvas").then((m) => ({ default: m.KonvaCanvas })),
) as unknown as ComponentType<{ variant: "scada" | "twin" | "sim" }>;
export function LazyKonvaCanvas(props: { variant: "scada" | "twin" | "sim" }) {
  const fallback = <CanvasFallback label="Carregando canvas SCADA…" />;
  return (
    <ClientOnly fallback={fallback}>
      <ErrorBoundary fallback={<ModuleErrorState title="Falha ao carregar o canvas SCADA" />}>
        <Suspense fallback={fallback}>
          <KonvaCanvasLazy {...props} />
        </Suspense>
      </ErrorBoundary>
    </ClientOnly>
  );
}

// Three.js + R3F + drei (~500KB gzip)
const Twin3DViewerLazy = lazy(() =>
  import("./twin-3d-viewer").then((m) => ({ default: m.Twin3DViewer })),
);
export function LazyTwin3DViewer(props: ComponentProps<typeof Twin3DViewerLazy>) {
  const fallback = <CanvasFallback label="Inicializando visualização 3D…" />;
  return (
    <ClientOnly fallback={fallback}>
      <ErrorBoundary
        fallback={
          <ModuleErrorState title="Visualização 3D indisponível — simulação e telemetria seguem ativas" />
        }
      >
        <Suspense fallback={fallback}>
          <Twin3DViewerLazy {...props} />
        </Suspense>
      </ErrorBoundary>
    </ClientOnly>
  );
}
