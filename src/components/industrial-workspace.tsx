import { Suspense, lazy, useCallback, useEffect } from "react";
import { ClientOnly, useRouter } from "@tanstack/react-router";
import { ModeTabs } from "@/components/mode-tabs";
import { BottomPanel } from "@/components/bottom-panel";
import { RightPanel } from "@/components/right-panel";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  PlusCircle,
} from "lucide-react";
import { CanvasAiChat } from "@/components/canvas-ai-chat";
import { useProjectPersistence } from "@/lib/use-project-persistence";
import { isBreakerComponent, type VoltaiComponentType } from "@/lib/palette/component-catalog";
import { LeftSidebarHost } from "@/components/editor/left-sidebar-host";
import { useEditorStore } from "@/lib/editor/store";
import { ErrorBoundary } from "@/components/error-boundary";
import { EditorAiConfigBanner } from "@/components/editor-ai-config-banner";
import { OnboardingTour } from "@/components/onboarding-tour";

const UnifilarCanvas = lazy(() =>
  import("@/components/canvases/webgl-canvas").then((m) => ({ default: m.WebglCanvas })),
);
const LadderCanvas = lazy(() =>
  import("@/components/canvases/ladder-canvas").then((m) => ({ default: m.LadderCanvas })),
);
const FbdCanvas = lazy(() =>
  import("@/components/canvases/fbd-canvas").then((m) => ({ default: m.FbdCanvas })),
);
const ScadaCanvas = lazy(() =>
  import("@/components/canvases/scada-canvas").then((m) => ({ default: m.ScadaCanvas })),
);
const TwinCanvas = lazy(() =>
  import("@/components/canvases/twin-canvas").then((m) => ({ default: m.TwinCanvas })),
);
const PlcCanvas = lazy(() =>
  import("@/components/canvases/plc-canvas").then((m) => ({ default: m.PlcCanvas })),
);
const SimCanvas = lazy(() =>
  import("@/components/canvases/sim-canvas").then((m) => ({ default: m.SimCanvas })),
);
const AlarmsCanvas = lazy(() =>
  import("@/components/canvases/alarms-canvas").then((m) => ({ default: m.AlarmsCanvas })),
);

export function IndustrialWorkspace({ projectId = null }: { projectId?: string | null }) {
  const router = useRouter();
  const mode = useEditorStore((s) => s.activeMode);
  const setMode = useEditorStore((s) => s.setActiveMode);
  const leftCollapsed = useEditorStore((s) => s.leftCollapsed);
  const rightCollapsed = useEditorStore((s) => s.rightCollapsed);
  const toggleLeftPanel = useEditorStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useEditorStore((s) => s.toggleRightPanel);
  const setDragValidation = useEditorStore((s) => s.setDragValidation);
  const setValidateComponent = useEditorStore((s) => s.setValidateComponent);

  const validateDraggedBreaker = useCallback(
    (componentType: VoltaiComponentType): boolean => {
      const isBreaker: boolean = isBreakerComponent(componentType);
      setDragValidation(
        isBreaker
          ? `${componentType} validado como disjuntor local.`
          : `${componentType} não é disjuntor; permitido como componente unifilar.`,
      );
      return isBreaker;
    },
    [setDragValidation],
  );

  useEffect(() => {
    setValidateComponent(validateDraggedBreaker);
    return () => setValidateComponent(null);
  }, [validateDraggedBreaker, setValidateComponent]);

  const { loading, saveState } = useProjectPersistence(projectId);

  if (!projectId) {
    return <WorkspaceEmptyState />;
  }

  if (loading) {
    return <WorkspaceLoading />;
  }

  return (
    <div className="flex-1 flex min-h-0 relative">
      {/* Painel Esquerdo */}
      {!leftCollapsed ? (
        <div className="hidden lg:flex relative shrink-0 z-10">
          <LeftSidebarHost mode={mode} />
          {/* Botão para recolher o painel esquerdo */}
          <button
            onClick={toggleLeftPanel}
            className="flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 h-10 w-3 bg-panel border border-border border-l-0 rounded-r items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-sm hover:h-14 hover:w-3.5 transition-all"
            title="Recolher painel esquerdo"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
        </div>
      ) : (
        /* Alça elegante para expandir o painel esquerdo */
        <button
          onClick={toggleLeftPanel}
          className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-30 h-12 w-4 bg-panel/85 backdrop-blur border border-border border-l-0 rounded-r items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-md hover:h-16 hover:w-5 transition-all"
          title="Expandir painel esquerdo"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Área Central (Canvas + Controles) */}
      <div className="flex-1 flex flex-col min-w-0">
        <ModeTabs />
        <ErrorBoundary fallback={null}>
          <EditorAiConfigBanner />
        </ErrorBoundary>
        <SaveBadge projectId={projectId} loading={loading} state={saveState} />
        <div className="flex-1 min-h-0 relative bg-background">
          {/* ErrorBoundary keyed por `mode`: isola crashes (ex.: React #185)
              ao canvas ativo e cria um boundary fresco ao trocar de aba. */}
          <ErrorBoundary key={mode}>
            {/* ClientOnly é obrigatório: sem ele o SSR resolve os React.lazy abaixo
                e avalia Pixi/Three/Konva no servidor (Worker), o que derruba a
                renderização inteira da rota. */}
            <ClientOnly fallback={<CanvasFallback />}>
              <Suspense fallback={<CanvasFallback />}>
                {mode === "unifilar" && <UnifilarCanvas projectId={projectId} />}
                {mode === "ladder" && <LadderCanvas />}
                {mode === "fbd" && <FbdCanvas />}
                {mode === "scada" && <ScadaCanvas />}
                {mode === "twin" && <TwinCanvas />}
                {mode === "plc" && <PlcCanvas />}
                {mode === "sim" && <SimCanvas />}
                {mode === "alarms" && <AlarmsCanvas />}
              </Suspense>
            </ClientOnly>
          </ErrorBoundary>

          <ErrorBoundary fallback={null}>
            <CanvasAiChat />
          </ErrorBoundary>
        </div>
        <ErrorBoundary fallback={null}>
          <BottomPanel />
        </ErrorBoundary>
      </div>

      {/* Painel Direito */}
      {!rightCollapsed ? (
        <div className="hidden lg:flex relative shrink-0 z-10">
          {/* Botão para recolher o painel direito */}
          <button
            onClick={toggleRightPanel}
            className="flex absolute -left-3 top-1/2 -translate-y-1/2 z-20 h-10 w-3 bg-panel border border-border border-r-0 rounded-l items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-sm hover:h-14 hover:w-3.5 transition-all"
            title="Recolher painel direito"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
          <RightPanel />
        </div>
      ) : (
        /* Alça elegante para expandir o painel direito */
        <button
          onClick={toggleRightPanel}
          className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-30 h-12 w-4 bg-panel/85 backdrop-blur border border-border border-r-0 rounded-l items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-md hover:h-16 hover:w-5 transition-all"
          title="Expandir painel direito"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}

      <OnboardingTour />
    </div>
  );
}

function CanvasFallback() {
  return (
    <div className="h-full w-full grid place-items-center text-[11px] text-muted-foreground">
      Carregando canvas...
    </div>
  );
}

function WorkspaceLoading() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Carregando projeto...</p>
      </div>
    </div>
  );
}

function WorkspaceEmptyState() {
  const router = useRouter();
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="max-w-md text-center space-y-5 px-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
          <FolderOpen className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Nenhum projeto aberto</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Abra um projeto existente ou crie um novo para começar a trabalhar no workspace
            industrial.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.navigate({ to: "/projects" })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <FolderOpen className="h-4 w-4" />
            Abrir projeto
          </button>
          <button
            onClick={() => router.navigate({ to: "/onboarding" })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            Novo projeto
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveBadge({
  projectId,
  loading,
  state,
}: {
  projectId: string | null;
  loading: boolean;
  state: "idle" | "saving" | "saved" | "error";
}) {
  if (!projectId) return null;
  return (
    <div className="h-6 px-3 flex items-center gap-1.5 text-[10px] text-muted-foreground border-b border-border bg-panel/40">
      {loading ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Carregando projeto...
        </>
      ) : state === "saving" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
        </>
      ) : state === "saved" ? (
        <>
          <CheckCircle2 className="h-3 w-3 text-success" /> Salvo
        </>
      ) : state === "error" ? (
        <>
          <AlertCircle className="h-3 w-3 text-destructive" /> Erro ao salvar
        </>
      ) : (
        <>Auto-save ativo (2s)</>
      )}
    </div>
  );
}
