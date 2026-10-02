/**
 * Liga o editor FBD ao motor IEC real: compila o diagrama (AST + IR), mantém o
 * runtime/simulação e expõe valores ao vivo. O estado é salvo no projeto
 * (pausa, passo, reinício) para reabrir e continuar a simulação.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore, type FbdSimSnapshot } from "@/lib/editor/store";
import { editorToFbdDocument, getFbdRegistry, type SimInputBinding } from "@/lib/fbd/editor-bridge";
import {
  compileFbd,
  FbdRuntime,
  FbdSimulation,
  type CompileResult,
  type FbdValue,
  type RuntimeFault,
  type SimulationStatus,
} from "@/lib/fbd/engine";

export const FBD_CYCLE_MS = 100;

export interface FbdLiveState {
  readonly scans: number;
  readonly elapsedMs: number;
  readonly faults: readonly RuntimeFault[];
  readonly outputs: Readonly<Record<string, Readonly<Record<string, FbdValue>>>>;
  readonly inputs: Readonly<Record<string, boolean>>;
}

export interface FbdEngineApi {
  readonly result: CompileResult;
  readonly inputBindings: readonly SimInputBinding[];
  readonly live: FbdLiveState | null;
  readonly status: SimulationStatus;
  start(): void;
  pause(): void;
  step(): void;
  reset(): void;
  setInput(variable: string, value: boolean): void;
}

function readLive(rt: FbdRuntime, faults: readonly RuntimeFault[]): FbdLiveState {
  const snap = rt.exportSnapshot();
  const inputs: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(snap.variables)) if (typeof v === "boolean") inputs[k] = v;
  return { scans: snap.scans, elapsedMs: snap.elapsedMs, faults, outputs: snap.outputs, inputs };
}

export function useFbdEngine(): FbdEngineApi {
  const nodes = useEditorStore((s) => s.fbdNodes);
  const edges = useEditorStore((s) => s.fbdEdges);
  const setFbdSim = useEditorStore((s) => s.setFbdSim);

  // Recompila só quando o modelo muda (seleção/arraste sem mudança de ordem não conta).
  const bridge = useMemo(
    () => editorToFbdDocument(nodes, edges, { name: "FBD do projeto", cycleTimeMs: FBD_CYCLE_MS }),
    [nodes, edges],
  );
  const signature = useMemo(() => JSON.stringify(bridge.doc), [bridge]);
  const result = useMemo(
    () => compileFbd(bridge.doc, getFbdRegistry()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assinatura cobre o documento
    [signature],
  );

  const runtimeRef = useRef<FbdRuntime | null>(null);
  const simRef = useRef<FbdSimulation | null>(null);
  const restoredRef = useRef<FbdSimSnapshot | null>(null);
  const [live, setLive] = useState<FbdLiveState | null>(null);
  const [status, setStatus] = useState<SimulationStatus>("stopped");

  const persist = useCallback(() => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const snap = rt.exportSnapshot();
    const inputs: Record<string, boolean> = {};
    for (const v of result.ir?.variables ?? []) {
      const value = snap.variables[v.name];
      if (v.direction === "input" && typeof value === "boolean") inputs[v.name] = value;
    }
    const saved: FbdSimSnapshot = { ...snap, inputs };
    restoredRef.current = saved;
    setFbdSim(saved);
  }, [result, setFbdSim]);

  useEffect(() => {
    const ir = result.ir;
    if (!result.ok || !ir) {
      simRef.current?.stop();
      runtimeRef.current = null;
      simRef.current = null;
      setLive(null);
      setStatus("stopped");
      return;
    }
    const registry = getFbdRegistry();
    const previous = runtimeRef.current;
    const wasRunning = simRef.current?.status === "running";
    simRef.current?.stop();

    const rt = new FbdRuntime(ir, registry);
    // Continuidade: estado do runtime anterior (edição ao vivo) ou o salvo no projeto.
    const saved = useEditorStore.getState().fbdSim;
    const prevSnap = previous?.exportSnapshot() ?? saved;
    if (prevSnap) {
      rt.restoreSnapshot(prevSnap);
      const inputs = previous ? previous.snapshotVariables() : (saved?.inputs ?? {});
      for (const v of ir.variables) {
        const value = inputs[v.name];
        if (v.direction === "input" && value !== undefined) rt.setVariable(v.name, value);
      }
    }
    restoredRef.current = saved;

    const sim = new FbdSimulation(rt, ir.cycleTimeMs);
    const unsub = sim.subscribe((report) => setLive(readLive(rt, report.faults)));
    runtimeRef.current = rt;
    simRef.current = sim;
    setLive(readLive(rt, []));
    if (wasRunning) sim.start();
    setStatus(sim.status);
    return () => {
      unsub();
    };
  }, [result]);

  // Projeto reaberto: aplica o snapshot carregado do banco ao runtime atual.
  const loadedSim = useEditorStore((s) => s.fbdSim);
  useEffect(() => {
    const rt = runtimeRef.current;
    if (!rt || !loadedSim || loadedSim === restoredRef.current) return;
    restoredRef.current = loadedSim;
    rt.restoreSnapshot(loadedSim);
    for (const v of result.ir?.variables ?? []) {
      const value = loadedSim.inputs[v.name];
      if (v.direction === "input" && value !== undefined) rt.setVariable(v.name, value);
    }
    setLive(readLive(rt, []));
  }, [loadedSim, result]);

  useEffect(
    () => () => {
      simRef.current?.stop();
    },
    [],
  );

  const start = useCallback(() => {
    simRef.current?.start();
    setStatus(simRef.current?.status ?? "stopped");
  }, []);
  const pause = useCallback(() => {
    simRef.current?.pause();
    setStatus(simRef.current?.status ?? "stopped");
    persist();
  }, [persist]);
  const step = useCallback(() => {
    simRef.current?.step();
    persist();
  }, [persist]);
  const reset = useCallback(() => {
    const sim = simRef.current;
    const rt = runtimeRef.current;
    if (!sim || !rt) return;
    sim.reset();
    setStatus(sim.status);
    setLive(readLive(rt, []));
    persist();
  }, [persist]);
  const setInput = useCallback((variable: string, value: boolean) => {
    const rt = runtimeRef.current;
    if (!rt) return;
    rt.setVariable(variable, value);
    setLive(readLive(rt, []));
  }, []);

  return {
    result,
    inputBindings: bridge.inputs,
    live,
    status,
    start,
    pause,
    step,
    reset,
    setInput,
  };
}
