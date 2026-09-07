import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getTenantSetting,
  setTenantSetting,
  type JsonValue,
} from "@/lib/tenant-settings.functions";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tenant-scoped settings hook. Reads a JSON value for a given key from
 * `tenant_settings`, with a localStorage fallback when the user has no
 * session yet (SSR / signed-out preview). Writes are best-effort to
 * Supabase plus a local mirror so the UI stays in sync.
 */
export function useTenantSetting<T extends object>(key: string, defaults: T) {
  const qc = useQueryClient();
  const getFn = useServerFn(getTenantSetting);
  const setFn = useServerFn(setTenantSetting);
  const cacheKey = useMemo(() => ["tenant-setting", key] as const, [key]);
  const localKey = `eletricai.tsetting.${key}`;

  const readLocal = (): T => {
    if (typeof window === "undefined") return defaults;
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? ({ ...defaults, ...(JSON.parse(raw) as object) } as T) : defaults;
    } catch {
      return defaults;
    }
  };

  const writeLocal = (v: T) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(localKey, JSON.stringify(v));
    } catch {
      /* ignore quota */
    }
  };

  const query = useQuery({
    queryKey: cacheKey,
    queryFn: async (): Promise<T> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return readLocal();
      try {
        const row = await getFn({ data: { key } });
        if (!row) return readLocal();
        const merged = { ...defaults, ...(row.value as object) } as T;
        writeLocal(merged);
        return merged;
      } catch {
        return readLocal();
      }
    },
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (next: T) => {
      writeLocal(next);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return next;
      try {
        await setFn({ data: { key, value: next as unknown as JsonValue } });
      } catch {
        /* fall back to local-only */
      }
      return next;
    },
    onSuccess: (next) => {
      qc.setQueryData(cacheKey, next);
    },
  });

  const value = query.data ?? readLocal();

  const update = useCallback(
    (patch: Partial<T> | ((prev: T) => T)) => {
      const prev = (qc.getQueryData<T>(cacheKey) ?? value) as T;
      const next =
        typeof patch === "function"
          ? (patch as (prev: T) => T)(prev)
          : ({ ...prev, ...patch } as T);
      qc.setQueryData(cacheKey, next);
      mutation.mutate(next);
      return next;
    },
    [qc, cacheKey, value, mutation],
  );

  return { value, update, isLoading: query.isLoading, isSaving: mutation.isPending };
}
