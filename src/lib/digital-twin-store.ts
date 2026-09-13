import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface HotspotConfig {
  id: string;
  label: string;
  tag: string;
  type: "temperature" | "current" | "voltage" | "level" | "pressure" | "status" | "flow";
  unit: string;
  position: { x: number; y: number; z: number };
  color: string;
  alertThreshold?: number;
  criticalThreshold?: number;
  alarmActive: boolean;
}

export interface TwinMapping {
  equipmentId: string;
  equipmentLabel: string;
  hotspots: HotspotConfig[];
}

export interface TwinAlarm {
  id: string;
  hotspotId: string;
  tag: string;
  label: string;
  value: number;
  threshold: number;
  severity: "alert" | "critical";
  timestamp: number;
  acknowledged: boolean;
  acknowledgedAt: number | null;
}

export type TwinViewMode = "normal" | "alarms-only" | "walkthrough";

export interface MotorNameplate {
  equipmentId: string;
  potenciaKw: number;
  tensaoV: number;
  correnteNominalA: number;
  rpm: number;
  eficiencia: number;
  fatorPotencia: number;
  fatorServico: number;
}

interface TwinTelemetrySample {
  ts: number;
  value: number;
}

interface TwinTelemetryBuffer {
  tag: string;
  samples: TwinTelemetrySample[];
}

export type WhatIfValue = number | boolean | string;

export interface WhatIfScenario {
  id: string;
  name: string;
  overrides: Record<string, WhatIfValue>;
  savedAt: number;
}

/**
 * Estado do renderizador 3D, separado do estado do gêmeo digital: uma falha de
 * WebGL degrada apenas a visualização — simulação e telemetria continuam.
 */
export type TwinRenderState = "loading" | "ready" | "degraded" | "error" | "recovering";

/** Métricas da fila de telemetria (#TWIN-02). */
export interface TelemetryHealth {
  queuedSamples: number;
  flushedSamples: number;
  failedSamples: number;
  lastFlush: number | null;
  lastError: string | null;
  retryCount: number;
}

export const INITIAL_TELEMETRY_HEALTH: TelemetryHealth = {
  queuedSamples: 0,
  flushedSamples: 0,
  failedSamples: 0,
  lastFlush: null,
  lastError: null,
  retryCount: 0,
};

interface DigitalTwinState {
  mappings: TwinMapping[];
  alarms: TwinAlarm[];
  viewMode: TwinViewMode;
  selectedHotspotId: string | null;
  selectedEquipmentId: string | null;
  showFlowLines: boolean;
  telemetryBuffers: Record<string, TwinTelemetryBuffer>;
  realtimeConnected: boolean;
  lastRealtimeUpdate: number | null;
  modelUrl: string | null;
  nameplates: Record<string, MotorNameplate>;
  renderState: TwinRenderState;
  telemetryHealth: TelemetryHealth;

  // #TWIN-04 "E-se?" — overrides locais que substituem o valor real apenas
  // na visualização. Persistência de telemetria é pausada quando ativo.
  whatIfEnabled: boolean;
  whatIfOverrides: Record<string, WhatIfValue>;
  whatIfScenarios: WhatIfScenario[];

  addMapping: (mapping: TwinMapping) => void;
  removeMapping: (equipmentId: string) => void;
  addHotspot: (equipmentId: string, hotspot: HotspotConfig) => void;
  removeHotspot: (equipmentId: string, hotspotId: string) => void;
  updateHotspot: (equipmentId: string, hotspot: Partial<HotspotConfig> & { id: string }) => void;
  selectHotspot: (id: string | null) => void;
  selectEquipment: (id: string | null) => void;
  setViewMode: (mode: TwinViewMode) => void;
  toggleFlowLines: () => void;

  pushTelemetry: (tag: string, value: number) => void;
  acknowledgeAlarm: (alarmId: string) => void;
  clearAlarm: (alarmId: string) => void;
  addAlarm: (alarm: TwinAlarm) => void;
  setRealtimeConnected: (connected: boolean) => void;
  setModelUrl: (url: string | null) => void;
  upsertNameplate: (nameplate: MotorNameplate) => void;
  setRenderState: (state: TwinRenderState) => void;
  patchTelemetryHealth: (patch: Partial<TelemetryHealth>) => void;

  // #TWIN-04
  setWhatIfEnabled: (enabled: boolean) => void;
  setWhatIfOverride: (tag: string, value: WhatIfValue) => void;
  clearWhatIfOverride: (tag: string) => void;
  resetWhatIf: () => void;
  saveWhatIfScenario: (name: string) => void;
  loadWhatIfScenario: (id: string) => void;
  deleteWhatIfScenario: (id: string) => void;
}

const MAX_SAMPLES = 60; // 60 samples per buffer

export const useDigitalTwinStore = create<DigitalTwinState>()(
  persist(
    (set) => ({
      mappings: [],
      alarms: [],
      viewMode: "normal",
      selectedHotspotId: null,
      selectedEquipmentId: null,
      showFlowLines: true,
      telemetryBuffers: {},
      realtimeConnected: false,
      lastRealtimeUpdate: null,
      modelUrl: null,
      nameplates: {},
      whatIfEnabled: false,
      whatIfOverrides: {},
      whatIfScenarios: [],

      addMapping: (mapping) => set((s) => ({ mappings: [...s.mappings, mapping] })),

      removeMapping: (equipmentId) =>
        set((s) => ({
          mappings: s.mappings.filter((m) => m.equipmentId !== equipmentId),
        })),

      addHotspot: (equipmentId, hotspot) =>
        set((s) => ({
          mappings: s.mappings.map((m) =>
            m.equipmentId === equipmentId ? { ...m, hotspots: [...m.hotspots, hotspot] } : m,
          ),
        })),

      removeHotspot: (equipmentId, hotspotId) =>
        set((s) => ({
          mappings: s.mappings.map((m) =>
            m.equipmentId === equipmentId
              ? { ...m, hotspots: m.hotspots.filter((h) => h.id !== hotspotId) }
              : m,
          ),
        })),

      updateHotspot: (equipmentId, partial) =>
        set((s) => ({
          mappings: s.mappings.map((m) =>
            m.equipmentId === equipmentId
              ? {
                  ...m,
                  hotspots: m.hotspots.map((h) => (h.id === partial.id ? { ...h, ...partial } : h)),
                }
              : m,
          ),
        })),

      selectHotspot: (id) => set({ selectedHotspotId: id }),
      selectEquipment: (id) => set({ selectedEquipmentId: id }),
      setViewMode: (mode) => set({ viewMode: mode }),
      toggleFlowLines: () => set((s) => ({ showFlowLines: !s.showFlowLines })),

      pushTelemetry: (tag, value) =>
        set((s) => {
          const existing = s.telemetryBuffers[tag];
          const sample: TwinTelemetrySample = { ts: Date.now(), value };
          const samples = existing ? [...existing.samples, sample].slice(-MAX_SAMPLES) : [sample];
          return {
            telemetryBuffers: { ...s.telemetryBuffers, [tag]: { tag, samples } },
            lastRealtimeUpdate: Date.now(),
          };
        }),

      acknowledgeAlarm: (alarmId) =>
        set((s) => ({
          alarms: s.alarms.map((a) =>
            a.id === alarmId ? { ...a, acknowledged: true, acknowledgedAt: Date.now() } : a,
          ),
        })),

      clearAlarm: (alarmId) =>
        set((s) => ({
          alarms: s.alarms.filter((a) => a.id !== alarmId),
        })),

      addAlarm: (alarm) =>
        set((s) => {
          const exists = s.alarms.some((a) => a.hotspotId === alarm.hotspotId && !a.acknowledged);
          if (exists) return s;
          return { alarms: [...s.alarms, alarm].slice(-50) };
        }),

      setRealtimeConnected: (connected) => set({ realtimeConnected: connected }),

      setModelUrl: (url) => set({ modelUrl: url }),

      upsertNameplate: (nameplate) =>
        set((s) => ({
          nameplates: { ...s.nameplates, [nameplate.equipmentId]: nameplate },
        })),

      setWhatIfEnabled: (enabled) =>
        set((s) => ({
          whatIfEnabled: enabled,
          whatIfOverrides: enabled ? s.whatIfOverrides : {},
        })),

      setWhatIfOverride: (tag, value) =>
        set((s) => ({
          whatIfEnabled: true,
          whatIfOverrides: { ...s.whatIfOverrides, [tag]: value },
        })),

      clearWhatIfOverride: (tag) =>
        set((s) => {
          const next = { ...s.whatIfOverrides };
          delete next[tag];
          return { whatIfOverrides: next };
        }),

      resetWhatIf: () => set({ whatIfEnabled: false, whatIfOverrides: {} }),

      saveWhatIfScenario: (name) =>
        set((s) => ({
          whatIfScenarios: [
            ...s.whatIfScenarios.filter((sc) => sc.name !== name),
            {
              id: `wi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
              name,
              overrides: { ...s.whatIfOverrides },
              savedAt: Date.now(),
            },
          ].slice(-20),
        })),

      loadWhatIfScenario: (id) =>
        set((s) => {
          const sc = s.whatIfScenarios.find((x) => x.id === id);
          if (!sc) return s;
          return { whatIfEnabled: true, whatIfOverrides: { ...sc.overrides } };
        }),

      deleteWhatIfScenario: (id) =>
        set((s) => ({ whatIfScenarios: s.whatIfScenarios.filter((x) => x.id !== id) })),
    }),
    {
      name: "eletricai-digital-twin",

      partialize: (state) => ({
        mappings: state.mappings,
        alarms: state.alarms,
        showFlowLines: state.showFlowLines,
        viewMode: state.viewMode,
        selectedEquipmentId: state.selectedEquipmentId,
        telemetryBuffers: state.telemetryBuffers,
        modelUrl: state.modelUrl,
        nameplates: state.nameplates,
        whatIfScenarios: state.whatIfScenarios,
      }),
    },
  ),
);

/**
 * Retorna o valor "efetivo" de uma tag: override do modo What-If quando
 * ativo, senão o último valor real do buffer de telemetria.
 */
export function getEffectiveTagValue(tag: string): WhatIfValue | null {
  const s = useDigitalTwinStore.getState();
  if (s.whatIfEnabled && tag in s.whatIfOverrides) return s.whatIfOverrides[tag];
  const buf = s.telemetryBuffers[tag];
  if (!buf || buf.samples.length === 0) return null;
  return buf.samples[buf.samples.length - 1].value;
}
