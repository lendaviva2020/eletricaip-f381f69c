import type { PlcRack, ModuleCategory } from "./types";

export interface RackIssue {
  level: "error" | "warning";
  message: string;
}

/** Chamada ANTES de adicionar um módulo — impede estados inválidos em vez
 * de só detectar depois. */
export function canAddModule(
  rack: PlcRack,
  category: ModuleCategory,
): { allowed: boolean; reason?: string } {
  if (category === "cpu") {
    const hasCpu = rack.modules.some((m) => m.category === "cpu");
    if (hasCpu) {
      return { allowed: false, reason: "Só é permitida uma CPU por rack." };
    }
  }
  return { allowed: true };
}

/** Validação do estado atual do rack — usada para exibir avisos na UI e
 * cobrir casos que passaram por fora de canAddModule (ex: projeto
 * importado). */
export function validateRack(rack: PlcRack): RackIssue[] {
  const issues: RackIssue[] = [];
  if (rack.modules.length === 0) return issues;

  const cpus = rack.modules.filter((m) => m.category === "cpu");

  if (cpus.length === 0) {
    issues.push({ level: "error", message: "Rack sem CPU configurada." });
  } else if (cpus.length > 1) {
    issues.push({
      level: "error",
      message: `Rack com ${cpus.length} CPUs — apenas uma é suportada.`,
    });
  } else if (rack.modules[0]?.category !== "cpu") {
    issues.push({
      level: "warning",
      message: "A CPU deveria ocupar o primeiro slot do rack.",
    });
  }

  const hasPower = rack.modules.some((m) => m.category === "power");
  if (rack.modules.length > 0 && !hasPower) {
    issues.push({
      level: "warning",
      message: "Rack sem módulo de fonte de alimentação (PS).",
    });
  }

  return issues;
}
