import type { TwinMapping } from "./digital-twin-store";

/**
 * Retorna os dados de demonstração do Digital Twin — SEM efeito colateral
 * nenhum (não grava na store, não empurra telemetria falsa). É o chamador
 * (digital-twin.tsx) que decide quando usar isso: só como fallback opt-in
 * quando o projeto não tem nenhum hotspot real salvo no banco, e sempre
 * marcando isDemoData=true para a UI deixar claro que aquilo não é real.
 */
export function getDigitalTwinDemoMappings(): TwinMapping[] {
  return [
    {
      equipmentId: "motor-01",
      equipmentLabel: "Motor Principal M-01 (demonstração)",
      hotspots: [
        {
          id: "hotspot-motor-temp",
          label: "Temp. Enrolamento",
          tag: "MOTOR_01_TEMP",
          type: "temperature",
          unit: "°C",
          position: { x: -1.5, y: 0.8, z: 0 },
          color: "#ef4444",
          alertThreshold: 85,
          criticalThreshold: 105,
          alarmActive: false,
        },
        {
          id: "hotspot-motor-current",
          label: "Corrente do Motor",
          tag: "MOTOR_01_CURRENT",
          type: "current",
          unit: "A",
          position: { x: -1.5, y: 0.4, z: 0 },
          color: "#f59e0b",
          alertThreshold: 18,
          criticalThreshold: 22,
          alarmActive: false,
        },
        {
          id: "hotspot-motor-vib",
          label: "Vibração",
          tag: "MOTOR_01_VIB",
          type: "pressure",
          unit: "mm/s",
          position: { x: -1.5, y: 0, z: 0 },
          color: "#8b5cf6",
          alertThreshold: 7,
          criticalThreshold: 12,
          alarmActive: false,
        },
      ],
    },
    {
      equipmentId: "tank-01",
      equipmentLabel: "Tanque de Nível LT-01 (demonstração)",
      hotspots: [
        {
          id: "hotspot-tank-level",
          label: "Nível do Tanque",
          tag: "LT_01_LEVEL",
          type: "level",
          unit: "%",
          position: { x: 1.5, y: 0.5, z: 0 },
          color: "#3b82f6",
          alertThreshold: 80,
          criticalThreshold: 95,
          alarmActive: false,
        },
        {
          id: "hotspot-tank-pressure",
          label: "Pressão de Fundo",
          tag: "LT_01_PRESSURE",
          type: "pressure",
          unit: "bar",
          position: { x: 1.5, y: 0, z: 0 },
          color: "#10b981",
          alertThreshold: 2.5,
          criticalThreshold: 3.5,
          alarmActive: false,
        },
      ],
    },
    {
      equipmentId: "pump-01",
      equipmentLabel: "Bomba Centrífuga P-01 (demonstração)",
      hotspots: [
        {
          id: "hotspot-pump-status",
          label: "Status da Bomba",
          tag: "PUMP_01_STATUS",
          type: "status",
          unit: "",
          position: { x: 0, y: 0.8, z: -1.2 },
          color: "#22c55e",
          alarmActive: false,
        },
        {
          id: "hotspot-pump-flow",
          label: "Vazão",
          tag: "PUMP_01_FLOW",
          type: "flow",
          unit: "m³/h",
          position: { x: 0, y: 0.4, z: -1.2 },
          color: "#06b6d4",
          alertThreshold: 40,
          criticalThreshold: 55,
          alarmActive: false,
        },
      ],
    },
  ];
}
