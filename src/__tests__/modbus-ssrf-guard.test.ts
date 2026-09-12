import { describe, it, expect, vi, beforeEach } from "vitest";

const resolve4Mock = vi.fn<(host: string) => Promise<string[]>>();

vi.mock("node:dns", () => ({
  default: {
    promises: {
      resolve4: (host: string) => resolve4Mock(host),
    },
  },
}));

import { isHostAllowed, resolveToAllowedIPv4 } from "@/lib/modbus-server.functions";

describe("isHostAllowed — política de range privado (RFC1918)", () => {
  it.each([
    ["10.0.0.5", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["192.168.1.100", true],
  ])("permite IPv4 privado %s", (host, expected) => {
    expect(isHostAllowed(host)).toBe(expected);
  });

  it.each([
    ["127.0.0.1", "loopback"],
    ["169.254.169.254", "link-local / metadata da nuvem (AWS/GCP/Azure)"],
    ["8.8.8.8", "IP público"],
    ["224.0.0.1", "multicast"],
    ["0.0.0.0", "rede 'esta'"],
    ["172.32.0.1", "fora do range 172.16/12 (limite superior)"],
    ["::1", "literal IPv6 (bloqueado por completo)"],
    ["localhost", "hostname localhost"],
    ["evil.localhost", "subdomínio de localhost"],
    ["metadata.google.internal", "hostname de metadata do GCP"],
    ["", "string vazia"],
  ])("bloqueia %s (%s)", (host) => {
    expect(isHostAllowed(host)).toBe(false);
  });

  it("permite hosts de simulação incondicionalmente", () => {
    expect(isHostAllowed("simulation")).toBe(true);
    expect(isHostAllowed("plant-simulation-01")).toBe(true);
  });

  it("permite hostnames DNS bem formados (validação de string apenas)", () => {
    expect(isHostAllowed("gateway.planta.local")).toBe(true);
  });
});

describe("resolveToAllowedIPv4 — fecha o gap de DNS rebinding", () => {
  beforeEach(() => {
    resolve4Mock.mockReset();
  });

  it("não resolve DNS para literais IPv4 (retorna o próprio host)", async () => {
    const result = await resolveToAllowedIPv4("192.168.1.50");
    expect(result).toBe("192.168.1.50");
    expect(resolve4Mock).not.toHaveBeenCalled();
  });

  it("não resolve DNS para hosts de simulação", async () => {
    const result = await resolveToAllowedIPv4("simulation");
    expect(result).toBe("simulation");
    expect(resolve4Mock).not.toHaveBeenCalled();
  });

  it("resolve e permite hostname que aponta para IP privado", async () => {
    resolve4Mock.mockResolvedValue(["10.0.0.20"]);
    const result = await resolveToAllowedIPv4("gateway.planta.local");
    expect(result).toBe("10.0.0.20");
  });

  it("BLOQUEIA hostname que resolve para IP de metadata da nuvem (ataque de DNS rebinding)", async () => {
    resolve4Mock.mockResolvedValue(["169.254.169.254"]);
    await expect(resolveToAllowedIPv4("gateway.atacante.com")).rejects.toThrow(
      /não permitido/i,
    );
  });

  it("BLOQUEIA hostname que resolve para loopback", async () => {
    resolve4Mock.mockResolvedValue(["127.0.0.1"]);
    await expect(resolveToAllowedIPv4("gateway.atacante.com")).rejects.toThrow(
      /não permitido/i,
    );
  });

  it("BLOQUEIA se qualquer um dos IPs resolvidos (round-robin/rebinding) for público", async () => {
    resolve4Mock.mockResolvedValue(["10.0.0.5", "8.8.8.8"]);
    await expect(resolveToAllowedIPv4("gateway.instavel.com")).rejects.toThrow(
      /não permitido/i,
    );
  });

  it("propaga erro claro quando a resolução de DNS falha", async () => {
    resolve4Mock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(resolveToAllowedIPv4("host-inexistente.com")).rejects.toThrow(
      /não foi possível resolver/i,
    );
  });

  it("bloqueia quando a resolução não retorna nenhum endereço", async () => {
    resolve4Mock.mockResolvedValue([]);
    await expect(resolveToAllowedIPv4("host-sem-a-record.com")).rejects.toThrow(
      /não resolveu/i,
    );
  });
});
