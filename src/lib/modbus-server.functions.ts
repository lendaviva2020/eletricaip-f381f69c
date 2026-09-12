import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import dns from "node:dns";
import net from "net";

interface AuthCtx {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: Record<string, unknown>;
}

export type ModbusConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ModbusGatewayConfig {
  host: string;
  port: number;
  unitId: number;
  timeoutMs?: number;
}

export interface ModbusRegisterValue {
  address: number;
  value: number;
  type: "coil" | "discrete_input" | "holding_register" | "input_register";
  timestamp: string;
}

interface ModbusSession {
  config: ModbusGatewayConfig;
  status: ModbusConnectionStatus;
  values: Map<string, ModbusRegisterValue>;
  error?: string;
  connectedAt?: string;
  socket?: net.Socket;
  _simInterval?: ReturnType<typeof setInterval>;
}

const sessions = new Map<string, ModbusSession>();

function getSession(userId: string): ModbusSession | undefined {
  return sessions.get(userId);
}

function ensureSession(userId: string, config: ModbusGatewayConfig): ModbusSession {
  let s = sessions.get(userId);
  if (!s) {
    s = { config, status: "disconnected", values: new Map() };
    sessions.set(userId, s);
  }
  s.config = config;
  return s;
}

// SSRF guard: block loopback, link-local (cloud metadata), multicast, broadcast,
// IPv6 loopback/link-local, and anything that isn't a plain DNS hostname or
// RFC1918 private IPv4. OT/SCADA networks should always live on RFC1918 ranges.
export function isHostAllowed(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".localhost")) return false;
  if (h === "simulation" || h.includes("simulation")) return true;
  // IPv6 literal — block all (loopback, link-local, ULA shouldn't be exposed)
  if (h.includes(":")) return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const parts = ipv4.slice(1, 5).map((p) => Number(p));
    if (parts.some((p) => p < 0 || p > 255)) return false;
    const [a, b] = parts;
    if (a === 127) return false; // loopback
    if (a === 0) return false; // "this" network
    if (a === 169 && b === 254) return false; // link-local / cloud metadata
    if (a >= 224) return false; // multicast / reserved / broadcast
    const isPrivate = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    return isPrivate;
  }
  // Hostname — allow only simple DNS labels; reject anything with credentials/paths.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(h)) {
    return false;
  }
  // Block well-known cloud metadata hostnames
  const blocked = ["metadata.google.internal", "metadata.goog", "metadata", "instance-data"];
  if (blocked.includes(h)) return false;
  return true;
}

export async function resolveToAllowedIPv4(host: string): Promise<string> {
  const h = host.trim().toLowerCase();

  // Hosts de simulação e literais IPv4 já foram completamente validados por
  // isHostAllowed (branch de range privado) — não há DNS para resolver.
  if (h === "simulation" || h.includes("simulation")) return host;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return host;

  let addresses: string[];
  try {
    addresses = await dns.promises.resolve4(h);
  } catch {
    throw new Error(`Não foi possível resolver o host "${host}".`);
  }

  if (addresses.length === 0) {
    throw new Error(`Host "${host}" não resolveu para nenhum endereço IPv4.`);
  }

  const disallowed = addresses.find((ip) => !isHostAllowed(ip));
  if (disallowed) {
    throw new Error(
      `Host "${host}" resolve para um endereço não permitido (${disallowed}). Conexão bloqueada por política de segurança.`,
    );
  }

  return addresses[0];
}

const ConnectSchema = z.object({
  host: z.string().min(1).max(253).default("192.168.1.100").refine(isHostAllowed, {
    message:
      "Host não permitido. Use um IP RFC1918 privado (10.x, 172.16-31.x, 192.168.x) ou nome DNS válido do gateway OT.",
  }),
  port: z.number().int().min(1).max(65535).default(502),
  unitId: z.number().int().min(1).max(247).default(1),
  timeoutMs: z.number().min(1000).max(30000).default(5000),
});

export const connectModbus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConnectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as unknown as AuthCtx;

    // Authz: only owner/admin/engineer of any tenant the user belongs to may open OT sockets.
    const { data: memberships } = await supabase
      .from("tenant_memberships")
      .select("role")
      .eq("user_id", userId);
    const allowed = (memberships ?? []).some((m) =>
      ["owner", "admin", "engineer"].includes(String(m.role)),
    );
    if (!allowed) {
      return {
        ok: false as const,
        error: { code: "FORBIDDEN", message: "Permissão insuficiente para abrir conexão Modbus." },
      };
    }

    const session = ensureSession(userId, data);
    session.status = "connecting";

    await supabase.from("runtime_logs").insert({
      user_id: userId,
      tag: "MB",
      message: `Conectando a ${data.host}:${data.port} (Unit ID ${data.unitId})`,
      level: "info",
      channel: "Modbus",
    });

    try {
      if (data.host === "192.168.1.100" || data.host.includes("simulation")) {
        await startSimulatedModbus(session, userId, supabase);
      } else {
        await connectRealModbus(session, userId, supabase);
      }
      session.status = "connected";
      session.connectedAt = new Date().toISOString();
      return { ok: true as const, status: session.status, host: data.host, port: data.port };
    } catch (e: any) {
      session.status = "error";
      // Keep detailed error server-side only; return generic code to client to
      // prevent using errors as a port/host oracle.
      console.error("[modbus] connect failed", {
        userId,
        host: data.host,
        port: data.port,
        err: e?.message,
      });
      session.error = "CONNECTION_FAILED";
      return {
        ok: false as const,
        error: { code: "CONNECTION_FAILED", message: "Falha ao conectar ao gateway Modbus." },
      };
    }
  });

export const disconnectModbus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as unknown as AuthCtx;
    const session = sessions.get(userId);
    if (session) {
      const interval = session._simInterval;
      if (interval) clearInterval(interval);
      if (session.socket) {
        session.socket.destroy();
        session.socket = undefined;
      }
      session.status = "disconnected";
      session.error = undefined;
      session.connectedAt = undefined;
      session.values.clear();
    }
    return { ok: true as const };
  });

export const getModbusStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as unknown as AuthCtx;
    const session = getSession(userId);
    if (!session) {
      return {
        ok: true as const,
        status: "disconnected" as const,
        host: "192.168.1.100",
        port: 502,
        values: [] as ModbusRegisterValue[],
      };
    }
    return {
      ok: true as const,
      status: session.status,
      host: session.config.host,
      port: session.config.port,
      unitId: session.config.unitId,
      connectedAt: session.connectedAt,
      error: session.error,
      values: Array.from(session.values.values()),
    };
  });

const ReadRegistersSchema = z.object({
  address: z.number().int().min(0).max(65535),
  count: z.number().int().min(1).max(125).default(10),
  type: z
    .enum(["holding_register", "input_register", "coil", "discrete_input"])
    .default("holding_register"),
});

export const readModbusRegisters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReadRegistersSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as unknown as AuthCtx;
    const session = getSession(userId);
    if (!session || session.status !== "connected") {
      return {
        ok: false as const,
        error: { code: "NOT_CONNECTED", message: "Modbus desconectado." },
      };
    }

    const results: ModbusRegisterValue[] = [];
    const now = new Date().toISOString();
    for (let i = 0; i < data.count; i++) {
      const addr = data.address + i;
      const key = `${data.type}:${addr}`;
      const cached = session.values.get(key);
      if (cached) {
        results.push(cached);
      } else {
        const val: ModbusRegisterValue = {
          address: addr,
          value: 0,
          type: data.type,
          timestamp: now,
        };
        session.values.set(key, val);
        results.push(val);
      }
    }
    return { ok: true as const, registers: results };
  });

const WriteRegisterSchema = z.object({
  address: z.number().int().min(0).max(65535),
  value: z.number().int().min(0).max(65535),
  type: z.enum(["coil", "holding_register"]).default("holding_register"),
});

export const writeModbusRegister = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => WriteRegisterSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as unknown as AuthCtx;
    const session = getSession(userId);
    if (!session || session.status !== "connected") {
      return {
        ok: false as const,
        error: { code: "NOT_CONNECTED", message: "Modbus desconectado." },
      };
    }

    const key = `${data.type}:${data.address}`;
    session.values.set(key, {
      address: data.address,
      value: data.value,
      type: data.type,
      timestamp: new Date().toISOString(),
    });

    return { ok: true as const };
  });

// ── Simulated Modbus session ──
function startSimulatedModbus(session: ModbusSession, userId: string, supabase: any) {
  const registers = [
    { address: 0, label: "Motor_01_Speed", initial: 1450 },
    { address: 1, label: "Motor_01_Current", initial: 142 },
    { address: 2, label: "Motor_01_Temp", initial: 65 },
    { address: 3, label: "Tank_01_Level", initial: 500 },
    { address: 4, label: "Tank_01_Pressure", initial: 25 },
    { address: 5, label: "Valve_01_Pos", initial: 50 },
    { address: 6, label: "Conveyor_01_Speed", initial: 1200 },
    { address: 10, label: "Prod_Count", initial: 0 },
    { address: 20, label: "Status_Word", initial: 0x8001 },
  ];

  let tick = 0;
  const interval = setInterval(() => {
    tick++;
    const now = new Date().toISOString();
    for (const r of registers) {
      let val = r.initial;
      if (r.label !== "Status_Word" && r.label !== "Prod_Count") {
        val = Math.round(r.initial + Math.sin((tick + r.address) / 15) * (r.initial * 0.15));
      }
      if (r.label === "Prod_Count" && tick % 10 === 0) {
        val = tick * 5;
      }
      const key = `holding_register:${r.address}`;
      session.values.set(key, {
        address: r.address,
        value: val,
        type: "holding_register",
        timestamp: now,
      });
    }
    if (tick % 60 === 0) {
      const key = "coil:0";
      const existing = session.values.get(key);
      session.values.set(key, {
        address: 0,
        value: existing ? (existing.value === 1 ? 0 : 1) : 1,
        type: "coil",
        timestamp: now,
      });
    }
  }, 250);

  session._simInterval = interval;
}

async function connectRealModbus(session: ModbusSession, userId: string, supabase: any) {
  const { host, port, timeoutMs } = session.config;
  const resolvedHost = await resolveToAllowedIPv4(host);
  return new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Modbus TCP: timeout conectando a ${host}:${port}`));
    }, timeoutMs ?? 5000);

    socket.connect(port, resolvedHost, () => {
      clearTimeout(timer);
      session.socket = socket;
      resolve();
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Modbus TCP: ${err.message}`));
    });

    socket.on("close", () => {
      if (session.status === "connected") {
        session.status = "error";
        session.error = "Conexão Modbus TCP perdida";
      }
    });
  });
}

export const testModbusHost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ host: z.string().min(1), port: z.number().int().min(1).max(65535) }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!isHostAllowed(data.host)) {
      throw new Error("Host não permitido. Redes loopback e restritas são bloqueadas.");
    }
    // Simulated test: return success for simulation hosts or RFC1918 addresses
    if (data.host === "192.168.1.100" || data.host.includes("simulation")) {
      return { ok: true as const, simulated: true };
    }
    // Real connection test
    const resolvedHost = await resolveToAllowedIPv4(data.host);
    return new Promise<{ ok: boolean; simulated?: boolean }>((resolve, reject) => {
      const socket = new net.Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("Timeout ao testar conexão Modbus."));
      }, 5000);
      socket.connect(data.port, resolvedHost, () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ ok: true as const });
      });
      socket.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Falha na conexão: ${err.message}`));
      });
    });
  });
