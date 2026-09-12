import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

vi.mock("@/lib/security/rate-limiter.server", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
  },
}));

import { checkRateLimit } from "@/lib/security/rate-limiter.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { Route } from "@/routes/api/public/iot.ingest";

const postHandler =
  (Route as any).server?.handlers?.POST || (Route as any).options?.server?.handlers?.POST;

const apiKey = "ek_test_1234567890123456";
const validBody = { device_external_id: "dev-001", value: 42.5 };

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/public/iot/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

describe("IoT ingest rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows the request and forwards the Upstash remaining/limit data", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      remaining: 119,
      limit: 120,
      bypassed: false,
      source: "upstash",
    });
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: { ok: true, persisted: true }, error: null });

    const response = await postHandler({ request: makeRequest(validBody) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({ ok: true, persisted: true });

    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    const keyId = createHash("sha256").update(apiKey).digest("hex");
    expect(checkRateLimit).toHaveBeenCalledWith("iot", keyId);
  });

  it("returns 429 with Retry-After when the rate limiter blocks the api key", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 42,
      remaining: 0,
      limit: 120,
      bypassed: false,
      source: "upstash",
    });

    const response = await postHandler({ request: makeRequest(validBody) });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");

    const json = await response.json();
    expect(json).toMatchObject({
      ok: false,
      error: "rate_limited",
      code: "BURST_LIMIT_429",
    });

    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});
