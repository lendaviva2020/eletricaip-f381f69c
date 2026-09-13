// Flush em lote da telemetria do Digital Twin para tag_samples (#TWIN-02).
//
// Fila com lote, retentativas com espera crescente (1s → 2s → 4s) e limite
// máximo de tentativas. Uma falha de gravação NUNCA interrompe o Digital Twin:
// o erro vira métrica observável (`telemetryHealth`) e as amostras mais
// recentes são preservadas até o limite da fila.
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useDigitalTwinStore } from "@/lib/digital-twin-store";
import { useCurrentProject } from "@/lib/current-project";
import { flushTwinTelemetry } from "@/lib/digital-twin.functions";

interface PendingSample {
  tag_name: string;
  value: number;
  quality: string;
  ts: number;
}

const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 200;
const HARD_CAP = 500;
const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000];

export function useTwinTelemetryPersistence(opts?: { intervalMs?: number }) {
  const flush = useServerFn(flushTwinTelemetry);
  const pendingRef = useRef<PendingSample[]>([]);
  const lastSeenRef = useRef<number>(0);
  const inFlightRef = useRef(false);
  const retryCountRef = useRef(0);
  const nextAttemptAtRef = useRef(0);

  useEffect(() => {
    // Captura novas amostras observando lastRealtimeUpdate.
    const unsub = useDigitalTwinStore.subscribe((state) => {
      // #TWIN-04: Não persistir telemetria enquanto modo What-If estiver ativo.
      if (state.whatIfEnabled) return;
      const update = state.lastRealtimeUpdate;
      if (update == null || update < lastSeenRef.current) return;
      const since = lastSeenRef.current;
      lastSeenRef.current = update;

      for (const buf of Object.values(state.telemetryBuffers)) {
        for (const s of buf.samples) {
          if (s.ts >= since) {
            pendingRef.current.push({
              tag_name: buf.tag,
              value: typeof s.value === "number" ? s.value : Number(s.value) || 0,
              quality: "GOOD",
              ts: s.ts,
            });
          }
        }
      }

      if (pendingRef.current.length > HARD_CAP) {
        pendingRef.current = pendingRef.current.slice(-HARD_CAP);
      }
      useDigitalTwinStore
        .getState()
        .patchTelemetryHealth({ queuedSamples: pendingRef.current.length });
    });
    return unsub;
  }, []);

  useEffect(() => {
    const interval = opts?.intervalMs ?? FLUSH_INTERVAL_MS;
    let cancelled = false;

    async function doFlush() {
      if (inFlightRef.current || pendingRef.current.length === 0) return;
      if (useDigitalTwinStore.getState().whatIfEnabled) return;
      if (Date.now() < nextAttemptAtRef.current) return;

      const health = useDigitalTwinStore.getState().patchTelemetryHealth;
      const projectId = useCurrentProject.getState().project?.id;

      if (!projectId) {
        // Sem projeto ativo: descarta o excedente para não acumular indefinidamente.
        if (pendingRef.current.length > HARD_CAP) {
          pendingRef.current = pendingRef.current.slice(-MAX_BATCH);
        }
        health({ queuedSamples: pendingRef.current.length });
        return;
      }

      const batch = pendingRef.current.splice(0, MAX_BATCH);
      inFlightRef.current = true;
      try {
        await flush({
          data: {
            projectId,
            samples: batch.map((s) => ({
              tag_name: s.tag_name,
              value: s.value,
              quality: s.quality,
            })),
          },
        });
        retryCountRef.current = 0;
        nextAttemptAtRef.current = 0;
        const prev = useDigitalTwinStore.getState().telemetryHealth;
        health({
          flushedSamples: prev.flushedSamples + batch.length,
          queuedSamples: pendingRef.current.length,
          lastFlush: Date.now(),
          lastError: null,
          retryCount: 0,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        retryCountRef.current += 1;

        if (retryCountRef.current <= MAX_RETRIES) {
          const wait = BACKOFF_MS[Math.min(retryCountRef.current - 1, BACKOFF_MS.length - 1)];
          nextAttemptAtRef.current = Date.now() + wait;
          // Reenfileira o lote no início respeitando o teto da fila.
          const room = HARD_CAP - pendingRef.current.length;
          if (room > 0) pendingRef.current.unshift(...batch.slice(-room));
          health({
            queuedSamples: pendingRef.current.length,
            lastError: message,
            retryCount: retryCountRef.current,
          });
        } else {
          // Limite atingido: para de tentar este lote, registra a perda de forma
          // explícita (nunca em silêncio) e mantém a aplicação funcionando.
          const prev = useDigitalTwinStore.getState().telemetryHealth;
          retryCountRef.current = 0;
          nextAttemptAtRef.current = Date.now() + BACKOFF_MS[BACKOFF_MS.length - 1];
          health({
            failedSamples: prev.failedSamples + batch.length,
            queuedSamples: pendingRef.current.length,
            lastError: `${message} — ${batch.length} amostras descartadas após ${MAX_RETRIES} tentativas`,
            retryCount: 0,
          });
          console.warn(
            `[twin telemetry] flush falhou após ${MAX_RETRIES} tentativas: ${message} (${batch.length} amostras)`,
          );
        }
      } finally {
        inFlightRef.current = false;
      }
    }

    const timer = setInterval(() => {
      if (!cancelled) void doFlush();
    }, interval);

    return () => {
      cancelled = true;
      clearInterval(timer);
      // Flush final best-effort — erros já são tratados dentro de doFlush.
      void doFlush();
    };
  }, [flush, opts?.intervalMs]);
}
