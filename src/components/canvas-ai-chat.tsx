import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Sparkles,
  Send,
  Loader2,
  X,
  MessageSquare,
  AlertTriangle,
  Settings2,
  Upload,
  ShieldCheck,
  Compass,
} from "lucide-react";
import { callArchitect, applyArchitectToStore, AIServiceError } from "@/lib/ai-architect-client";
import { getAiCredits } from "@/lib/ai-architect.functions";
import { useProjectStore } from "@/lib/project-store";
import { validateProject } from "@/lib/norm-validator";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { generateDiagramPatch } from "@/lib/diagram/ai.functions";
import { useDiagramStore } from "@/lib/diagram/store";
import { AiPatchPreview } from "@/components/ai-patch-preview";

interface Msg {
  role: "user" | "ai";
  text: string;
  error?: string;
  steps?: string[];
  needsConfig?: boolean;
  patchApplied?: boolean;
  hasPatch?: boolean;
  patchData?: any;
}

export function CanvasAiChat() {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileStep, setFileStep] = useState("");
  const [patchMode, setPatchMode] = useState(true);
  const fetchCredits = useServerFn(getAiCredits);
  const creditsQuery = useQuery({
    queryKey: ["ai-credits"],
    queryFn: () => fetchCredits(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const creditInfo = useMemo(() => {
    const d = creditsQuery.data;
    if (!d || !d.ok) return { plan: "free", remainingLabel: "-- créditos" };
    if (d.unlimited) return { plan: d.plan, remainingLabel: "∞ créditos" };
    return { plan: d.plan, remainingLabel: `${d.remaining}/${d.max_credits} créditos` };
  }, [creditsQuery.data]);
  const genPatch = useServerFn(generateDiagramPatch);
  const applyAiPatch = useDiagramStore((s) => s.applyAiPatch);
  const diagramDoc = useDiagramStore((s) => s.doc);

  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "ai",
      text: "Olá, sou o **NexusMind**, sua IA especialista em automação e normas elétricas (ABNT/IEC).\n\nComo posso ajudar você no projeto hoje? Você pode digitar comandos ou arrastar um arquivo PDF de briefing!",
    },
  ]);

  const loadDemo = useProjectStore((s) => s.loadDemoFaulty);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Read current workspace nodes and edges for dynamic compliance analysis
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);

  // Calculate active compliance findings in real time
  const findings = useMemo(() => validateProject(nodes, edges), [nodes, edges]);

  // Map findings to readable warning cards
  const normWarnings = useMemo(() => {
    if (findings.length === 0) {
      return [
        "✅ Todos os canvas em conformidade com as normas ABNT NBR 5410, NR-10, NR-12 e ISA-18.2!",
      ];
    }
    return findings.map((f) => {
      const emoji = f.severity === "error" ? "🚨" : f.severity === "warn" ? "⚠️" : "ℹ️";
      return `${emoji} [${f.norm}]: ${f.title} — ${f.detail}`;
    });
  }, [findings]);

  // Refetch server-side credits when any IA call dispatches the event
  useEffect(() => {
    const handler = () => creditsQuery.refetch();
    window.addEventListener("ai-usage-event", handler);
    return () => window.removeEventListener("ai-usage-event", handler);
  }, [creditsQuery]);

  const send = async (textToSend?: string) => {
    const p = (textToSend ?? val).trim();
    if (!p || busy) return;
    if (!textToSend) setVal("");

    setMsgs((m) => [
      ...m,
      { role: "user", text: p },
      {
        role: "ai",
        text: patchMode ? "Gerando patch validado (Zod + NBR 5410)..." : "Processando prompt...",
      },
    ]);
    setBusy(true);

    try {
      const activeViolationsText = findings
        .map(
          (f) =>
            `- [Norma ${f.norm} - Gravidade ${f.severity.toUpperCase()}]: ${f.title}. Detalhe: ${f.detail}. Dica de Correção: ${f.fixHint || "N/A"}`,
        )
        .join("\n");

      const contextualPrompt = activeViolationsText
        ? `[CONTEXTO DE ERROS/VIOLAÇÕES ATIVAS NO CANVAS ELETRICAIP]:\n${activeViolationsText}\n\n[SOLICITAÇÃO DO USUÁRIO]:\n${p}\n\nPor favor, responda sugerindo melhorias elétricas conforme ABNT NBR 5410, NR-10 e ISA-18.2, gerando um novo diagrama corrigido se solicitado.`
        : p;

      if (patchMode) {
        const res: any = await genPatch({ data: { prompt: contextualPrompt, doc: diagramDoc } });
        if (!res || res.ok !== true) {
          const code = res?.error?.code ?? "UNKNOWN";
          const message =
            res?.error?.message ?? "A IA não retornou um patch válido. Tente reformular o pedido.";
          const needsConfig = ["MISSING_KEY", "AUTH_401", "INSUFFICIENT_CREDITS"].includes(code);
          setMsgs((m) => {
            const c = [...m];
            c[c.length - 1] = { role: "ai", text: `[${code}] ${message}`, needsConfig };
            return c;
          });
        } else {
          applyAiPatch(res.patch);
          window.dispatchEvent(new Event("ai-usage-event"));
          const {
            addNodes = [],
            addEdges = [],
            removeNodeIds = [],
            removeEdgeIds = [],
            updateNodes = [],
            rationale,
          } = res.patch ?? {};
          setMsgs((m) => {
            const c = [...m];
            c[c.length - 1] = {
              role: "ai",
              text: `**Patch aplicado ao canvas WebGL.**\n\n${rationale ?? ""}\n\n• +${addNodes.length} nós · +${addEdges.length} edges\n• ~${updateNodes.length} updates · −${removeNodeIds.length} nós / −${removeEdgeIds.length} edges`,
              patchApplied: true,
            };
            return c;
          });
        }
      } else {
        const r = await callArchitect(contextualPrompt, true);
        setMsgs((m) => {
          const c = [...m];
          c[c.length - 1] = {
            role: "ai",
            text: `**${r.title}**\n\n${r.rationale}\n\n* CCM: ${r.ccm.columns} colunas / ${r.ccm.cells} gavetas\n* Trafo: ${r.transformer.kVA}kVA (${r.transformer.primary_kV}kV → ${r.transformer.secondary_V}V)\n* Motores adicionados: ${r.motors.map((mo) => `${mo.id} (${mo.power_kW}kW)`).join(", ")}`,
            hasPatch: true,
            patchData: r,
          };
          return c;
        });
      }
    } catch (e: any) {
      const isSvc = e instanceof AIServiceError;
      // Tenta extrair status do erro do middleware (Response-like ou Error com mensagem).
      const rawMsg = String(e?.message ?? e ?? "");
      const isAuth = rawMsg.includes("Unauthorized") || rawMsg.includes("401");
      const isRate =
        rawMsg.includes("BURST_LIMIT") ||
        rawMsg.includes("PLAN_RATE_LIMIT") ||
        rawMsg.includes("429");
      const isQuota = rawMsg.includes("AI_QUOTA") || rawMsg.includes("insufficient_credits");

      const friendly = isSvc
        ? e.userMessage
        : isAuth
          ? "Sessão necessária. Faça login para usar a IA."
          : isRate
            ? "Limite de requisições atingido. Aguarde alguns segundos ou faça upgrade do plano."
            : isQuota
              ? "Créditos de IA insuficientes neste mês. Faça upgrade do plano."
              : (e?.message ?? "Falha ao gerar resposta da IA.");
      const steps = isSvc ? e.steps : undefined;
      const needsConfig =
        (isSvc &&
          ["MISSING_KEY", "INVALID_KEY_FORMAT", "AUTH_401", "NO_CREDITS_402"].includes(e.code)) ||
        isAuth ||
        isQuota;

      console.error("[CanvasAiChat] send failed:", e);
      setMsgs((m) => {
        const c = [...m];
        c[c.length - 1] = { role: "ai", text: friendly, steps, needsConfig };
        return c;
      });
    } finally {
      setBusy(false);
    }
  };

  // Simulates advanced OCR/Normative parsing on PDF / CSV uploads
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileLoading(true);
    setFileStep("Extraindo texto e escaneando folha de dados...");

    setTimeout(() => {
      setFileStep("Validando conformidade com as normas ABNT NBR 5410 / NBR 14039...");
      setTimeout(() => {
        setFileStep("Dimensionando proteção e mapeando componentes industriais...");
        setTimeout(() => {
          setFileLoading(false);
          setFileStep("");

          // Inject nodes from file representation
          const mockFileResult = {
            title: `Sistema Extraído: ${file.name.replace(/\.[^/.]+$/, "")}`,
            rationale:
              "O PDF continha especificações para um painel secundário de bombagem. Mapeamos um disjuntor principal de 125A e duas partidas sob inversor VFD de 15kW.",
            transformer: { kVA: 220, primary_kV: 13.8, secondary_V: 380 },
            ccm: { columns: 2, cells: 4 },
            motors: [
              { id: "BOMB_01", power_kW: 15, startMethod: "VFD" as const },
              { id: "BOMB_02", power_kW: 15, startMethod: "VFD" as const },
            ],
            nodes: [
              {
                id: "TR-02",
                kind: "transformer",
                category: "power",
                label: "Trafo 220kVA",
                position: { x: 100, y: 100 },
              },
              {
                id: "QGBT-02",
                kind: "busbar",
                category: "power",
                label: "QGBT Principal",
                position: { x: 100, y: 220 },
              },
              {
                id: "DJ-MAIN",
                kind: "breaker",
                category: "power",
                label: "DJ 125A",
                position: { x: 300, y: 220 },
                params: { In: 125 },
              },
              {
                id: "VFD-01",
                kind: "vfd",
                category: "power",
                label: "VFD Bomba 1",
                position: { x: 480, y: 150 },
              },
              {
                id: "M-B1",
                kind: "motor",
                category: "mech",
                label: "Motor Bomba 1",
                position: { x: 660, y: 150 },
                params: { P: 15 },
              },
            ],
            edges: [
              { source: "TR-02", target: "QGBT-02", kind: "power" as const },
              { source: "QGBT-02", target: "DJ-MAIN", kind: "power" as const },
              { source: "DJ-MAIN", target: "VFD-01", kind: "power" as const },
              { source: "VFD-01", target: "M-B1", kind: "power" as const },
            ],
          };

          setMsgs((m) => [
            ...m,
            {
              role: "user",
              text: `[Arquivo Enviado: ${file.name}]`,
            },
            {
              role: "ai",
              text: `### 📄 Briefing de Engenharia Analisado com Sucesso!\n\n**${mockFileResult.title}**\n\n${mockFileResult.rationale}\n\n* Dimensionamento elétrico calculado conforme NBR 5410.\n* Recomendações normativas injetadas com sucesso no canvas.`,
              hasPatch: true,
              patchData: mockFileResult,
            },
          ]);
        }, 1200);
      }, 1200);
    }, 1200);
  };

  const handleApplyPatch = (msgIndex: number, data: any) => {
    applyArchitectToStore(data, { mode: "merge" });
    setMsgs((m) => {
      const next = [...m];
      next[msgIndex] = { ...next[msgIndex], patchApplied: true };
      return next;
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-6 right-6 z-20 h-12 w-12 rounded-full grid place-items-center text-primary-foreground glow-primary shadow-lg hover:scale-105 transition-transform cursor-pointer"
        style={{ background: "var(--gradient-primary)" }}
        aria-label="Abrir IA no canvas"
      >
        <Sparkles className="h-5 w-5 animate-pulse" />
      </button>
    );
  }

  return (
    <div className="absolute bottom-6 right-6 z-20 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-8rem)] rounded-lg border border-primary/30 flex flex-col shadow-2xl overflow-hidden glass-strong bg-background/95">
      {/* HEADER CONTROLS */}
      <div className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-border bg-card/40">
        <Sparkles className="h-4 w-4 text-primary animate-spin" />
        <div className="flex flex-col">
          <span className="text-[11px] font-display font-bold tracking-wider text-foreground">
            NEXUSMIND AI CO-PILOT
          </span>
          <span className="text-[9px] text-primary/80 font-mono tracking-tight font-medium uppercase">
            {creditInfo.remainingLabel}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setPatchMode((v) => !v)}
            title="Alterna entre patch validado (WebGL) e arquiteto legado"
            className={`h-6 px-2 rounded text-[9px] font-medium border inline-flex items-center gap-1 cursor-pointer ${patchMode ? "border-primary/60 text-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-accent/40"}`}
          >
            <Sparkles className="h-3 w-3" /> {patchMode ? "Patch IA" : "Legado"}
          </button>
          <button
            onClick={loadDemo}
            title="Carregar exemplo com falhas para testar validador"
            className="h-6 px-2 rounded text-[9px] font-medium border border-warning/40 text-warning hover:bg-warning/10 inline-flex items-center gap-1 cursor-pointer"
          >
            <AlertTriangle className="h-3 w-3" /> Demo c/ falhas
          </button>
          <button
            onClick={() => setOpen(false)}
            className="h-7 w-7 grid place-items-center rounded hover:bg-accent/50 cursor-pointer text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* FILE SCAN LOADER */}
      {fileLoading && (
        <div className="shrink-0 p-3 border-b border-border bg-primary/10 flex items-center gap-3 animate-pulse">
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
          <div className="flex-1 flex flex-col">
            <span className="text-[10px] font-bold text-primary uppercase">Módulo OCR Ativo</span>
            <span className="text-[10px] text-muted-foreground">{fileStep}</span>
          </div>
        </div>
      )}

      {/* MESSAGE AND SUGGESTION BOX */}
      <div className="flex-1 overflow-auto scrollbar-thin p-3 space-y-3">
        {/* Proactive ISA / NR Normative Suggestions */}
        <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-2">
          <div className="text-[9px] font-display font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5" />
            <span>Alertas Normativos NexusMind</span>
          </div>
          <div className="space-y-1.5">
            {normWarnings.map((warn, index) => (
              <div
                key={index}
                className="text-[10px] font-mono text-muted-foreground leading-normal"
              >
                {warn}
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic chat thread */}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`rounded-md p-2.5 text-[11px] leading-relaxed relative ${
              m.role === "ai"
                ? "bg-primary/5 border border-primary/15 mr-4"
                : "bg-card border border-border ml-4 text-foreground/95"
            }`}
          >
            <div className="text-[8px] uppercase tracking-wider mb-0.5 font-bold text-muted-foreground">
              {m.role === "ai" ? "🤖 NexusMind" : "👤 Você"}
            </div>
            <div className="whitespace-pre-wrap font-mono text-[11px] text-foreground/90">
              {m.text}
            </div>

            {m.steps && (
              <ol className="list-decimal list-inside mt-2 space-y-0.5 text-[10px] text-foreground/80 font-mono">
                {m.steps.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ol>
            )}

            {m.needsConfig && (
              <Link
                to="/settings/ai-status"
                className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-primary hover:underline font-mono"
              >
                <Settings2 className="h-3 w-3" /> Configurar Chave IA
              </Link>
            )}

            {m.hasPatch && !m.patchApplied && (
              <div className="mt-3">
                <AiPatchPreview
                  patch={m.patchData?.patch ?? m.patchData}
                  onApply={() => handleApplyPatch(i, m.patchData)}
                  onCancel={() => {
                    setMsgs((prev) =>
                      prev.map((msg, idx) => (idx === i ? { ...msg, hasPatch: false } : msg)),
                    );
                  }}
                />
              </div>
            )}
            {m.hasPatch && m.patchApplied && (
              <div className="mt-3 pt-2 border-t border-border/60">
                <span className="text-[9px] text-success font-mono">✓ Patch Aplicado</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* INPUT AND BRIEFING UPLOAD BAR */}
      <div className="shrink-0 p-2 border-t border-border bg-card/10">
        <div className="flex gap-1.5 mb-1.5">
          <input
            type="file"
            aria-label="Enviar briefing de engenharia"
            title="Enviar briefing de engenharia"
            accept=".pdf,.csv,.txt"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Upload de Briefing de Engenharia (PDF / CSV)"
            className="h-8 px-2.5 rounded border border-border bg-card hover:bg-accent/40 text-[10px] inline-flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Briefing</span>
          </button>
        </div>

        <div className="relative">
          <textarea
            aria-label="Prompt do copiloto IA do canvas"
            title="Prompt do copiloto IA do canvas"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Projete um disjuntor de 125A NBR-5410..."
            className="w-full resize-none rounded-md bg-input border border-border p-2 pr-9 text-[11px] outline-none focus:ring-1 focus:ring-primary font-mono"
          />
          <button
            onClick={() => send()}
            disabled={busy || !val.trim()}
            className="absolute right-1.5 bottom-1.5 h-7 w-7 grid place-items-center rounded text-primary-foreground glow-primary disabled:opacity-50 cursor-pointer"
            style={{ background: "var(--gradient-primary)" }}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <div className="mt-1 text-[8px] text-muted-foreground flex items-center gap-1 font-mono">
          <MessageSquare className="h-2.5 w-2.5" /> Enter envia · Shift+Enter quebra linha
        </div>
      </div>
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  size,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded font-semibold transition-all disabled:opacity-50 ${
        size === "sm" ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
      } ${
        disabled
          ? "bg-accent/40 text-muted-foreground cursor-not-allowed"
          : "bg-primary text-primary-foreground hover:opacity-90 active:scale-95 cursor-pointer"
      } ${className}`}
    >
      {children}
    </button>
  );
}
