import type { RuntimeSnapshot } from "@/lib/fbd/engine";
// Editor store — manages active mode, tags, ladder rungs, FBD nodes/edges, UI state
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type { WorkspaceMode, ConsoleTab } from "@/lib/workspace-data";
import type { LadderRung } from "@/lib/ladder/types";
import type { Node, Edge } from "reactflow";
import type { VoltaiComponentType } from "@/lib/palette/component-catalog";

export type EditorTagType = "BOOL" | "INT" | "REAL" | "STRING";

export interface EditorTag {
  id: string;
  name: string; // ex: %I0.0, K1_CMD, LT_01
  type: EditorTagType;
  value: boolean | number | string;
  forced: boolean;
}

export type FbdNode = Node<any>;
export type FbdEdge = Edge;

/** Estado salvo da simulação FBD (para reabrir o projeto e continuar). */
export type FbdSimSnapshot = RuntimeSnapshot & { readonly inputs: Record<string, boolean> };

export interface EditorSnapshot {
  fbdSim?: FbdSimSnapshot | null;
  editorTags?: Record<string, EditorTag>;
  rungs?: LadderRung[];
  fbdNodes?: FbdNode[];
  fbdEdges?: FbdEdge[];
}

interface EditorState {
  // === Workspace mode ===
  activeMode: WorkspaceMode;

  // === Selection (single source of truth) ===
  selectedNodeId: string | null;

  // === Editor tags ===
  editorTags: Record<string, EditorTag>;

  // === Ladder ===
  rungs: LadderRung[];

  // === FBD ===
  fbdNodes: FbdNode[];
  fbdEdges: FbdEdge[];
  fbdSim: FbdSimSnapshot | null;
  setFbdSim: (snap: FbdSimSnapshot | null) => void;

  // === Persistence / collab ===
  dirty: boolean;

  // === UI Layout State ===
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  consoleTab: ConsoleTab;
  consoleOpen: boolean;

  // === Drag validation (elimina prop drilling) ===
  dragValidation: string;
  validateComponent: ((componentType: VoltaiComponentType) => boolean) | null;

  // === Actions ===
  setActiveMode: (mode: WorkspaceMode) => void;
  setSelectedNode: (id: string | null) => void;

  upsertTag: (tag: EditorTag) => void;
  removeTag: (id: string) => void;
  setTagValue: (id: string, value: EditorTag["value"]) => void;
  forceTagValue: (id: string, value: EditorTag["value"]) => void;
  releaseTag: (id: string) => void;

  setRungs: (rungs: LadderRung[] | ((prev: LadderRung[]) => LadderRung[])) => void;
  setFbdAll: (
    nodes: FbdNode[] | ((prev: FbdNode[]) => FbdNode[]),
    edges: FbdEdge[] | ((prev: FbdEdge[]) => FbdEdge[]),
  ) => void;

  // Snapshot helpers (used by use-collab + PLC bridge)
  hydrateSnapshot: (snapshot: EditorSnapshot) => void;
  markSaved: () => void;

  // === UI Layout Actions ===
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setConsoleTab: (tab: ConsoleTab) => void;
  setConsoleOpen: (open: boolean) => void;

  // === Drag validation actions ===
  setDragValidation: (msg: string) => void;
  setValidateComponent: (fn: ((componentType: VoltaiComponentType) => boolean) | null) => void;
}

export const useEditorStore = create<EditorState>()(
  subscribeWithSelector((set) => ({
    activeMode: "unifilar",
    selectedNodeId: null,
    editorTags: {},
    rungs: [],
    fbdNodes: [],
    fbdEdges: [],
    fbdSim: null,
    setFbdSim: (snap) => set({ fbdSim: snap, dirty: true }),
    dirty: false,
    leftCollapsed: false,
    rightCollapsed: false,
    consoleTab: "Logs",
    consoleOpen: true,
    dragValidation: "Arraste componentes IEC 60617 para o canvas.",
    validateComponent: null,

    setActiveMode: (mode) => set({ activeMode: mode, selectedNodeId: null }),
    setSelectedNode: (id) => set({ selectedNodeId: id }),

    upsertTag: (tag) =>
      set((s) => ({ editorTags: { ...s.editorTags, [tag.id]: tag }, dirty: true })),
    removeTag: (id) =>
      set((s) => {
        const next = { ...s.editorTags };
        delete next[id];
        return { editorTags: next, dirty: true };
      }),
    setTagValue: (id, value) =>
      set((s) => {
        const tag = s.editorTags[id];
        if (!tag || tag.forced) return s;
        return { editorTags: { ...s.editorTags, [id]: { ...tag, value } } };
      }),
    forceTagValue: (id, value) =>
      set((s) => {
        const tag = s.editorTags[id];
        if (!tag) return s;
        return {
          editorTags: { ...s.editorTags, [id]: { ...tag, value, forced: true } },
          dirty: true,
        };
      }),
    releaseTag: (id) =>
      set((s) => {
        const tag = s.editorTags[id];
        if (!tag) return s;
        return {
          editorTags: { ...s.editorTags, [id]: { ...tag, forced: false } },
          dirty: true,
        };
      }),

    setRungs: (rungs) =>
      set((s) => ({ rungs: typeof rungs === "function" ? rungs(s.rungs) : rungs, dirty: true })),
    setFbdAll: (nodes, edges) =>
      set((s) => ({
        fbdNodes: typeof nodes === "function" ? nodes(s.fbdNodes) : nodes,
        fbdEdges: typeof edges === "function" ? edges(s.fbdEdges) : edges,
        dirty: true,
      })),

    hydrateSnapshot: (snapshot) =>
      set({
        editorTags: snapshot.editorTags ?? {},
        rungs: snapshot.rungs ?? [],
        fbdNodes: snapshot.fbdNodes ?? [],
        fbdEdges: snapshot.fbdEdges ?? [],
        fbdSim: snapshot.fbdSim ?? null,
        selectedNodeId: null,
        dirty: false,
      }),
    markSaved: () => set({ dirty: false }),

    toggleLeftPanel: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
    toggleRightPanel: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
    setConsoleTab: (tab) => set({ consoleTab: tab }),
    setConsoleOpen: (open) => set({ consoleOpen: open }),

    setDragValidation: (msg) => set({ dragValidation: msg }),
    setValidateComponent: (fn) => set({ validateComponent: fn }),
  })),
);

// ── Stable composite selectors (use with useShallow for multi-field reads) ──
export const editorUiSelector = (s: EditorState) => ({
  leftCollapsed: s.leftCollapsed,
  rightCollapsed: s.rightCollapsed,
  consoleTab: s.consoleTab,
  consoleOpen: s.consoleOpen,
});

export function useEditorUi() {
  return useEditorStore(useShallow(editorUiSelector));
}

export function useEditorMode() {
  return useEditorStore(
    useShallow((s: EditorState) => ({
      activeMode: s.activeMode,
      setActiveMode: s.setActiveMode,
    })),
  );
}
