import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { useProjectStore } from "@/lib/project-store";
import {
  connectOpcua,
  disconnectOpcua,
  getOpcuaStatus,
  writeOpcuaTag,
} from "@/lib/opcua-server.functions";
import {
  connectModbus,
  disconnectModbus,
  getModbusStatus,
  writeModbusRegister,
} from "@/lib/modbus-server.functions";
import type { OpcuaTagValue } from "@/lib/opcua-server.functions";
import type { ModbusRegisterValue } from "@/lib/modbus-server.functions";

const POLL_INTERVAL = 2000;

export function useOpcuaBridge() {
  const queryClient = useQueryClient();
  const pushLog = useProjectStore((s) => s.pushLog);
  const applyTick = useProjectStore((s) => s.applyTick);
  const lastOpcuaError = useRef<string | undefined>(undefined);
  const lastModbusError = useRef<string | undefined>(undefined);

  const opcuaStatus = useQuery({
    queryKey: ["opcua", "status"],
    queryFn: () => getOpcuaStatus(),
    refetchInterval: POLL_INTERVAL,
  });

  const modbusStatus = useQuery({
    queryKey: ["modbus", "status"],
    queryFn: () => getModbusStatus(),
    refetchInterval: POLL_INTERVAL,
  });

  // Feed OPC-UA / Modbus tag data into the Zustand store on every poll.
  useEffect(() => {
    const opcua = opcuaStatus.data;
    const modbus = modbusStatus.data;
    if (!opcua?.ok && !modbus?.ok) return;

    const tags: Record<string, number | boolean | string> = {};

    for (const t of opcua?.tags ?? []) {
      const key = t.nodeId.replace(/[^a-zA-Z0-9_.-]/g, "_");
      tags[key] = t.value;
    }
    for (const r of modbus?.values ?? []) {
      const key = `MB_${r.type}_${r.address}`;
      tags[key] = r.value;
    }

    if (Object.keys(tags).length > 0) {
      applyTick({ ts: Date.now(), cycleMs: POLL_INTERVAL, tags });
    }

    // Log connection errors once per transition.
    if (opcua?.status === "error" && opcua.error && opcua.error !== lastOpcuaError.current) {
      lastOpcuaError.current = opcua.error;
      pushLog({
        t: new Date().toLocaleTimeString(),
        tag: "OPCUA",
        msg: opcua.error,
        lvl: "err",
        channel: "OPC-UA",
      });
    }
    if (opcua?.status !== "error") lastOpcuaError.current = undefined;

    if (modbus?.status === "error" && modbus.error && modbus.error !== lastModbusError.current) {
      lastModbusError.current = modbus.error;
      pushLog({
        t: new Date().toLocaleTimeString(),
        tag: "MB",
        msg: modbus.error,
        lvl: "err",
        channel: "Modbus",
      });
    }
    if (modbus?.status !== "error") lastModbusError.current = undefined;
  }, [opcuaStatus.data, modbusStatus.data, applyTick, pushLog]);

  const opcuaConnect = useMutation({
    mutationFn: (config: { endpoint: string; securityMode?: "None" | "Sign" | "SignAndEncrypt" }) =>
      connectOpcua({ data: config }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["opcua", "status"] }),
  });

  const opcuaDisconnect = useMutation({
    mutationFn: () => disconnectOpcua({}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["opcua", "status"] }),
  });

  const opcuaWrite = useMutation({
    mutationFn: (params: { nodeId: string; value: number | boolean | string }) =>
      writeOpcuaTag({ data: params }),
  });

  const modbusConnect = useMutation({
    mutationFn: (config: { host: string; port: number; unitId: number }) =>
      connectModbus({ data: config }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["modbus", "status"] }),
  });

  const modbusDisconnect = useMutation({
    mutationFn: () => disconnectModbus({}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["modbus", "status"] }),
  });

  const modbusWrite = useMutation({
    mutationFn: (params: { address: number; value: number; type?: "coil" | "holding_register" }) =>
      writeModbusRegister({ data: params }),
  });

  return {
    opcua: {
      status: opcuaStatus.data?.status ?? "disconnected",
      endpoint: opcuaStatus.data?.endpoint ?? "opc.tcp://localhost:4840",
      connectedAt: opcuaStatus.data?.connectedAt,
      error: opcuaStatus.data?.error,
      tags: (opcuaStatus.data?.tags ?? []) as OpcuaTagValue[],
      connect: opcuaConnect.mutate,
      disconnect: opcuaDisconnect.mutate,
      write: opcuaWrite.mutate,
      isConnecting: opcuaConnect.isPending,
    },
    modbus: {
      status: modbusStatus.data?.status ?? "disconnected",
      host: modbusStatus.data?.host ?? "192.168.1.100",
      port: modbusStatus.data?.port ?? 502,
      connectedAt: modbusStatus.data?.connectedAt,
      error: modbusStatus.data?.error,
      values: (modbusStatus.data?.values ?? []) as ModbusRegisterValue[],
      connect: modbusConnect.mutate,
      disconnect: modbusDisconnect.mutate,
      write: modbusWrite.mutate,
      isConnecting: modbusConnect.isPending,
    },
  };
}
