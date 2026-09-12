import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createHash } from "node:crypto";
import { checkRateLimit } from "@/lib/security/rate-limiter.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Body = z.object({
  device_external_id: z.string().min(1).max(128),
  value: z.number().finite(),
  quality: z.string().max(16).optional(),
  message_id: z.string().max(128).optional(),
  ttl_ms: z.number().int().min(100).max(60_000).optional(),
});

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
}

export const Route = createFileRoute("/api/public/iot/ingest")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") || "";
        const apiKey = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        if (!apiKey || apiKey.length < 16) {
          return new Response(JSON.stringify({ ok: false, error: "missing_api_key" }), {
            status: 401,
            headers: cors(),
          });
        }
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: "bad_input", detail: (e as Error).message }),
            {
              status: 400,
              headers: cors(),
            },
          );
        }
        const { data, error } = await supabaseAdmin.rpc("ingest_iot_reading", {
          p_api_key: apiKey,
          p_device_external_id: body.device_external_id,
          p_value: body.value,
          p_quality: body.quality ?? "GOOD",
          p_message_id: body.message_id ?? undefined,
          p_ttl_ms: body.ttl_ms ?? 5000,
        });
        if (error) {
          // Log full error server-side; never leak DB internals to caller.
          console.error("[iot.ingest] rpc error:", error.message);
          const msg = error.message || "";
          const isAuthErr = /unauthorized|invalid_api_key/.test(msg);
          const isPlanErr = /plan_required/.test(msg);
          const status = isAuthErr ? 401 : isPlanErr ? 402 : 400;
          const safeCode = isAuthErr
            ? "unauthorized"
            : isPlanErr
              ? "plan_required"
              : "ingest_error";
          return new Response(JSON.stringify({ ok: false, error: safeCode }), {
            status,
            headers: cors(),
          });
        }
        return new Response(JSON.stringify(data ?? { ok: true }), { status: 200, headers: cors() });
      },
    },
  },
});
