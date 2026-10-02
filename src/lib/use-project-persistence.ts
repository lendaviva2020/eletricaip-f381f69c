import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useProjectStore } from "@/lib/project-store";

import { useEditorStore } from "@/lib/editor/store";
import { useDiagramStore } from "@/lib/diagram/store";
import { usePlcStore } from "@/lib/plc/store";
import { loadProject, saveProject } from "@/lib/projects.functions";
import type { ProjectSnapshot } from "@/lib/projects.functions";
import type { DiagramDoc } from "@/lib/diagram/schema";
import type { PlcProject } from "@/lib/plc/types";
import type { IndustrialNode, IndustrialEdge } from "@/lib/project-store";
import { useAutosaveLog } from "@/lib/autosave-log";
import { toast } from "sonner";

interface LoadProjectResponse {
  snapshot: ProjectSnapshot;
  diagramId: string | null;
  version: number;
  project: {
    id: string;
    name: string;
    description: string | null;
    client: string | null;
  };
}

export type SaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DEBOUNCE_MS = 2000;

export function useProjectPersistence(projectId: string | null) {
  const load = useServerFn(loadProject);
  const save = useServerFn(saveProject);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);

  // Track mount lifecycle to prevent setState after unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load on mount / id change
  useEffect(() => {
    if (!projectId) {
      useAutosaveLog.getState().log({
        kind: "skip:no-project",
        projectId: null,
        message: "Sem projectId — autosave desativado",
      });
      return;
    }
    let cancelled = false;
    setLoading(true);
    useAutosaveLog.getState().log({
      kind: "load:start",
      projectId,
      message: "Carregando snapshot do servidor…",
    });
    load({ data: { projectId } })
      .then((res: LoadProjectResponse) => {
        if (cancelled) return;
        const snap = res.snapshot;

        useProjectStore
          .getState()
          .hydrateSnapshot(
            snap.project.nodes as IndustrialNode[],
            snap.project.edges as IndustrialEdge[],
            snap.project.tags,
          );
        useProjectStore.getState().setProjectId(projectId);

        // Sincronização explícita do diagrama: substituímos o objeto `doc`
        // garantindo que TODOS os subscribers (Konva/ReactFlow) recebam
        // referência nova e reidratem o canvas após qualquer reload.
        const ds = useDiagramStore.getState();
        if (snap.diagram) {
          ds.loadDoc(snap.diagram as DiagramDoc);
          // Force re-broadcast no próximo tick — alguns canvases assinam
          // após o mount; um segundo loadDoc com referência idêntica é noop,
          // então clonamos shallow para garantir nova identidade.
          queueMicrotask(() => {
            const cur = useDiagramStore.getState().doc;
            useDiagramStore.getState().loadDoc({ ...cur });
          });
        } else {
          ds.resetDoc();
        }

        // #WGL-07 · etapa 4 — slot `voltai` do snapshot ficou legado; ignorado
        // silenciosamente aqui para preservar compat de leitura de projetos antigos.

        useEditorStore.getState().hydrateSnapshot({
          editorTags: snap.editor.tags,
          rungs: snap.editor.rungs,
          fbdNodes: snap.editor.fbdNodes,
          fbdEdges: snap.editor.fbdEdges,
          fbdSim: snap.editor.fbdSim ?? null,
        });

        const scadaLayout = snap.project.scadaLayout;
        if (scadaLayout?.nodes?.length || scadaLayout?.edges?.length) {
          useProjectStore
            .getState()
            .hydrateScadaLayout(
              scadaLayout.nodes as IndustrialNode[],
              scadaLayout.edges as IndustrialEdge[],
            );
        }

        if (snap.plc) {
          usePlcStore.getState().setProject(snap.plc as PlcProject);
        }

        const diagramDoc = snap.diagram as DiagramDoc | undefined;
        useAutosaveLog.getState().log({
          kind: "load:success",
          projectId,
          message: "Snapshot carregado e canvas sincronizado",
          meta: {
            projectNodes: (snap.project.nodes ?? []).length,
            projectEdges: (snap.project.edges ?? []).length,
            diagramNodes: diagramDoc ? Object.keys(diagramDoc.nodes ?? {}).length : 0,
            diagramEdges: diagramDoc ? Object.keys(diagramDoc.edges ?? {}).length : 0,
            voltaiComponents: 0,
          },
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        useAutosaveLog.getState().log({
          kind: "load:error",
          projectId,
          message: `Falha ao carregar: ${message}`,
        });
        toast.error(`Falha ao carregar projeto: ${message}`);
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, load]);

  // Debounced auto-save when dirty
  useEffect(() => {
    if (!projectId) return;

    const schedule = (reason: string) => {
      if (timer.current) clearTimeout(timer.current);
      useAutosaveLog.getState().log({
        kind: "schedule",
        projectId,
        message: `Mudança detectada (${reason}) — autosave em ${AUTOSAVE_DEBOUNCE_MS}ms`,
      });
      timer.current = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
    };

    const flush = async () => {
      // Coalesce: if a save is in flight, mark pending and let it re-trigger after.
      if (savingRef.current) {
        pendingRef.current = true;
        return;
      }
      const ps = useProjectStore.getState();
      const es = useEditorStore.getState();

      const snapshot = buildProjectSnapshot();
      savingRef.current = true;
      if (mountedRef.current) setSaveState("saving");
      const diagramNodes = Object.keys(snapshot.diagram?.nodes ?? {}).length;
      const diagramEdges = Object.keys(snapshot.diagram?.edges ?? {}).length;
      useAutosaveLog.getState().log({
        kind: "save:start",
        projectId,
        message: "Salvando snapshot…",
        meta: {
          projectNodes: snapshot.project.nodes.length,
          projectEdges: snapshot.project.edges.length,
          diagramNodes,
          diagramEdges,
        },
      });
      const startedAt = performance.now();
      try {
        await save({ data: { projectId, snapshot } });
        ps.markSaved();
        es.markSaved();
        if (mountedRef.current) setSaveState("saved");
        useAutosaveLog.getState().log({
          kind: "save:success",
          projectId,
          message: `Salvo em ${Math.round(performance.now() - startedAt)}ms`,
          meta: { diagramNodes, diagramEdges },
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (mountedRef.current) setSaveState("error");
        useAutosaveLog.getState().log({
          kind: "save:error",
          projectId,
          message,
        });
        toast.error(`Falha ao salvar: ${message}`);
      } finally {
        savingRef.current = false;
        if (pendingRef.current) {
          pendingRef.current = false;
          schedule("retry-coalesced");
        }
      }
    };

    const unsub = useProjectStore.subscribe((s, prev) => {
      if (!s.dirty || s.dirty === prev.dirty) return;
      schedule("project-store");
    });
    // #WGL-07 · etapa 4 — `useVoltaiStore` foi removido; sem subscription equivalente.

    const unsub3 = useEditorStore.subscribe((s, prev) => {
      if (!s.dirty || s.dirty === prev.dirty) return;
      schedule("editor-store");
    });
    const unsub4 = useDiagramStore.subscribe((s, prev) => {
      // `doc.version` é literal (schema), não muda. Comparamos a identidade do doc:
      // toda dispatch/loadDoc/resetDoc substitui o objeto.
      if (s.doc === prev.doc) return;
      schedule("diagram-store");
    });
    const unsub5 = usePlcStore.subscribe((s, prev) => {
      if (s.project === prev.project) return;
      schedule("plc-store");
    });

    return () => {
      unsub();
      unsub3();
      unsub4();
      unsub5();
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      pendingRef.current = false;
    };
  }, [projectId, save]);

  return { loading, saveState };
}

export async function snapshotVersion(
  projectId: string,
  save: ReturnType<typeof useServerFn<typeof saveProject>>,
) {
  const snapshot = buildProjectSnapshot();
  return save({ data: { projectId, snapshot, createVersion: true } });
}

export function buildProjectSnapshot(): ProjectSnapshot {
  const ps = useProjectStore.getState();
  const es = useEditorStore.getState();
  const ds = useDiagramStore.getState();
  const pls = usePlcStore.getState();

  return {
    schemaVersion: 2,
    project: {
      nodes: ps.nodes,
      edges: ps.edges,
      tags: ps.tags,
      scadaLayout: {
        nodes: ps.nodes.filter(
          (n) => n.category === "inst" || n.category === "logic" || n.category === "mech",
        ),
        edges: ps.edges,
      },
    },
    // #WGL-07 · etapa 4 — slot legado; mantido no schema por retrocompat, vazio.
    voltai: { components: [], edges: [] },
    editor: {
      tags: es.editorTags,
      rungs: es.rungs,
      fbdNodes: es.fbdNodes,
      fbdEdges: es.fbdEdges,
      fbdSim: es.fbdSim,
    },
    diagram: ds.doc as DiagramDoc,
    plc: pls.project as PlcProject,
  };
}
