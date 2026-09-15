import { useEffect, useState, useCallback, useRef, memo } from "react";
import type { editor, languages, Position, IDisposable } from "monaco-editor";
import type { BeforeMount, OnMount, Monaco } from "@monaco-editor/react";
import { LazyKonvaCanvas as KonvaCanvas, LazyMonacoEditor as Editor } from "./lazy";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScriptSandbox, type SandboxResult } from "@/lib/simulation/script-sandbox";
import { BindTagDialog } from "@/components/scada/bind-tag-dialog";
import { pushNotification } from "@/lib/notification-service";
import { useAlarmStore } from "@/lib/alarm-store";
import {
  Play,
  Pause,
  Terminal,
  AlertTriangle,
  Code2,
  ChevronLeft,
  ChevronRight,
  Bell,
  CheckCircle2,
  RefreshCw,
  Tag as TagIcon,
  ShieldCheck,
} from "lucide-react";

const DEFAULT_SCRIPT = `// ==========================================
// SCRIPT DE ANIMAÇÃO HMI / SCADA (EletricAI)
// ==========================================
// Controla tags em tempo real através de JavaScript!

// 1. Inicialização de tags
if (typeof tags["TANQUE_NIVEL"] === "undefined") tags["TANQUE_NIVEL"] = 45;
if (typeof tags["TEMP_M01"] === "undefined") tags["TEMP_M01"] = 25.0;

// 2. Lógica de Aquecimento do Motor (SP_SPEED)
const speed = tags["SP_SPEED"] || 0;
if (tags["MOTOR_ON"] === true || tags["CMD_START"] === true) {
  // Aquece proporcionalmente à velocidade
  const targetTemp = 30 + (speed * 0.85);
  if (tags["TEMP_M01"] < targetTemp) {
    tags["TEMP_M01"] = Math.round((tags["TEMP_M01"] + 0.6) * 10) / 10;
  }
} else {
  // Resfria gradualmente até a temperatura ambiente
  if (tags["TEMP_M01"] > 25) {
    tags["TEMP_M01"] = Math.round((tags["TEMP_M01"] - 0.3) * 10) / 10;
  }
}

// 3. Controle de Fluxo do Tanque (Bomba/Válvula)
if (tags["PUMP_ON"] === true) {
  tags["TANQUE_NIVEL"] = Math.min(100, tags["TANQUE_NIVEL"] + 1.2);
}
if (tags["VALVE_OPEN"] === true) {
  tags["TANQUE_NIVEL"] = Math.max(0, tags["TANQUE_NIVEL"] - 1.6);
}

// 4. Gestão de Alarmes (ISA-18.2)
if (tags["TEMP_M01"] > 85) {
  tags["ALARM_ACTIVE"] = true;
  tags["ALARM_MSG"] = "TEMPERATURA DO MOTOR CRÍTICA (" + tags["TEMP_M01"] + "°C)";
} else if (tags["TANQUE_NIVEL"] > 95) {
  tags["ALARM_ACTIVE"] = true;
  tags["ALARM_MSG"] = "ALTO NÍVEL DO TANQUE (" + tags["TANQUE_NIVEL"] + "%)";
} else {
  // Reseta se as condições estiverem normalizadas
  tags["ALARM_ACTIVE"] = false;
}
`;

const LIVE_PREVIEW_MAX_KEYS = 20;

/** Formata o snapshot de tags do live preview como JSON legível. Trunca por
 * NÚMERO DE CHAVES (não por slice de caracteres) para nunca cortar no meio
 * de uma string/valor e deixar o preview com aparência de JSON quebrado. */
function formatLivePreview(tags: Record<string, unknown>): string {
  const entries = Object.entries(tags);
  const shown = entries.slice(0, LIVE_PREVIEW_MAX_KEYS);
  const omitted = entries.length - shown.length;
  const json = JSON.stringify(Object.fromEntries(shown), null, 2);
  return omitted > 0 ? `${json}\n… (+${omitted} campo${omitted === 1 ? "" : "s"})` : json;
}

function getTagNames(): string[] {
  const projectTags = Object.keys(useProjectStore.getState().tags);
  const editorTags = Object.values(useEditorStore.getState().editorTags).map((t) => t.name);
  return [...new Set([...projectTags, ...editorTags])].sort();
}

// Componentes isolados e memoizados: o loop de execução roda a cada 100ms
// e atualiza scanDuration/scriptLogs a cada tick. Sem isolar essas partes,
// cada tick reconciliaria a árvore inteira do ScadaCanvas (incluindo o
// KonvaCanvas). Memoizados, só re-renderizam quando suas props mudam de
// verdade.
const AlarmBanner = memo(function AlarmBanner({
  message,
  onAcknowledge,
}: {
  message: string;
  onAcknowledge: () => void;
}) {
  return (
    <div className="absolute top-16 left-4 right-4 z-30 p-3 rounded-lg border border-destructive bg-destructive/15 backdrop-blur flex items-center justify-between shadow-lg animate-pulse pointer-events-auto">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-destructive shrink-0" />
        <span className="font-mono text-[11px] font-bold text-destructive">
          ALARME ATIVO: {message}
        </span>
      </div>
      <Button
        size="sm"
        variant="destructive"
        onClick={onAcknowledge}
        className="h-6 px-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
      >
        Reconhecer
      </Button>
    </div>
  );
});

const SelectedTagBadge = memo(function SelectedTagBadge({
  label,
  tagValue,
  onBind,
}: {
  label: string;
  tagValue: string;
  onBind: () => void;
}) {
  return (
    <div className="absolute top-16 right-4 z-30 flex items-center gap-2 rounded-md border border-border bg-card/90 backdrop-blur px-2 py-1.5 shadow-lg">
      <TagIcon className="h-3 w-3 text-primary" />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-mono text-[11px] text-foreground">{tagValue || "—"}</span>
      <Button
        size="sm"
        variant="outline"
        onClick={onBind}
        className="h-6 px-2 text-[10px] cursor-pointer"
      >
        Vincular
      </Button>
    </div>
  );
});

interface ScriptConsoleProps {
  logs: string[];
  error: string | null;
  running: boolean;
  livePreview: boolean;
  lastLiveResult: string | null;
  scanDuration: number;
}

/** Console de execução do sandbox: mostra TODOS os logs mantidos em estado
 * (até 50 — cap aplicado em applyResult para não crescer sem limite num
 * loop de 100ms), o snapshot de tags do live preview, e o erro/estado
 * atual. Nada aqui contorna o sandbox — só exibe o que ele já retorna. */
const ScriptConsole = memo(function ScriptConsole({
  logs,
  error,
  running,
  livePreview,
  lastLiveResult,
  scanDuration,
}: ScriptConsoleProps) {
  return (
    <div className="h-32 bg-card/45 backdrop-blur p-2 font-mono text-[10px] overflow-auto flex flex-col gap-1.5 scrollbar-thin">
      <div className="flex items-center gap-1.5 text-muted-foreground border-b border-border pb-1 mb-1">
        <Terminal className="h-3.5 w-3.5" />
        <span>LOGS E ERROS DE SCRIPT</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[9px] text-primary/80">
          <ShieldCheck className="h-3 w-3" /> Worker sandbox
        </span>
        {running && <span className="text-[9px] text-muted-foreground">{scanDuration}ms/scan</span>}
        {livePreview && !running && (
          <span className="text-[9px] text-primary/70">Live Preview</span>
        )}
      </div>
      {logs.length > 0 && (
        <div className="border-b border-border/40 pb-1 mb-1 max-h-16 overflow-auto">
          {logs.map((l, i) => (
            <div key={i} className="text-foreground/70 leading-tight">
              › {l}
            </div>
          ))}
        </div>
      )}
      {error ? (
        <div className="text-destructive flex items-start gap-1">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Erro: {error}</span>
        </div>
      ) : running ? (
        <div className="text-success flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 animate-pulse" />
          <span>Script em execução... Ticks a 100ms</span>
        </div>
      ) : livePreview && lastLiveResult ? (
        <pre className="text-foreground/80 whitespace-pre-wrap leading-relaxed">
          {lastLiveResult}
        </pre>
      ) : livePreview && !error ? (
        <div className="text-success flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Preview: sintaxe OK</span>
        </div>
      ) : (
        <div className="text-muted-foreground">
          Aguardando execução... Clique em "Executar" ou ative "Live".
        </div>
      )}
    </div>
  );
});

export function ScadaCanvas() {
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [running, setRunning] = useState(false);
  const [livePreview, setLivePreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLiveResult, setLastLiveResult] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(true);
  const [bindOpen, setBindOpen] = useState(false);
  const [scriptLogs, setScriptLogs] = useState<string[]>([]);
  const [scanDuration, setScanDuration] = useState(0);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const completionDisposableRef = useRef<IDisposable | null>(null);
  const sandboxRef = useRef<ScriptSandbox | null>(null);
  const lastAlarmRef = useRef<string | null>(null);

  // Guarda contra setState após unmount: o tick do sandbox é assíncrono
  // (Worker), então uma resposta pode chegar depois que o componente já
  // desmontou (troca rápida de aba, por exemplo) — sem isso, cada setState
  // tardio segura uma referência a closures antigas até o GC alcançar,
  // além do warning de "setState on unmounted component".
  const isMountedRef = useRef(true);

  if (!sandboxRef.current) sandboxRef.current = new ScriptSandbox(250);
  // Dispose sandbox + Monaco resources on unmount to prevent memory leaks.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      sandboxRef.current?.dispose();
      completionDisposableRef.current?.dispose();
      completionDisposableRef.current = null;
      editorRef.current?.dispose?.();
      editorRef.current = null;
      monacoRef.current = null;
    };
  }, []);

  const selectedId = useProjectStore((s) => s.selectedId);
  const selectedNode = useProjectStore((s) => s.nodes.find((n) => n.id === s.selectedId));
  const updateNodeParam = useProjectStore((s) => s.updateNodeParam);

  const tags = useProjectStore((s) => s.tags);
  const applyTick = useProjectStore((s) => s.applyTick);
  const pushLog = useProjectStore((s) => s.pushLog);

  const addAlarm = useAlarmStore((s) => s.addAlarm);
  const clearAlarm = useAlarmStore((s) => s.clearAlarm);

  const isAlarmActive = tags["ALARM_ACTIVE"] === true;
  const alarmMsg = String(tags["ALARM_MSG"] || "Alta Temperatura no Motor Principal!");

  // Register Monaco autocomplete provider
  const handleEditorBeforeMount = useCallback<BeforeMount>((monaco) => {
    monacoRef.current = monaco;
    // Re-register defensively: dispose previous provider before adding new one
    // to avoid duplicate completions when the editor is toggled on/off.
    completionDisposableRef.current?.dispose();
    completionDisposableRef.current = monaco.languages.registerCompletionItemProvider(
      "javascript",
      {
        triggerCharacters: ['"', "'", ".", "["],
        provideCompletionItems: (
          model: editor.ITextModel,
          position: Position,
        ): languages.ProviderResult<languages.CompletionList> => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const tagNames = getTagNames();
          const suggestions: languages.CompletionItem[] = tagNames.map((name) => ({
            label: name,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: name,
            range,
            detail: "Tag do projeto",
          }));

          // Add common SCADA tag helpers
          suggestions.push(
            {
              label: "tags",
              kind: monaco.languages.CompletionItemKind.Module,
              insertText: "tags",
              range,
              detail: "Objeto de tags do projeto",
            },
            {
              label: "console.log",
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: "console.log($1)",
              range,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: "Log no console",
            },
            {
              label: "Math.round",
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: "Math.round($1)",
              range,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: "Arredondar número",
            },
            {
              label: "Math.min",
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: "Math.min($1, $2)",
              range,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            },
            {
              label: "Math.max",
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: "Math.max($1, $2)",
              range,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            },
          );

          // If typing inside tags["...", suggest tag names
          const textBefore = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });
          const match = textBefore.match(/tags\s*\[\s*['"]?([^'"\]]*)$/);
          if (match) {
            const filter = (match[1] || "").toLowerCase();
            return {
              suggestions: tagNames
                .filter((n) => n.toLowerCase().includes(filter))
                .map((name) => ({
                  label: name,
                  kind: monaco.languages.CompletionItemKind.Variable,
                  insertText: name,
                  range,
                  detail: "Tag do projeto",
                })),
            };
          }

          return { suggestions };
        },
      },
    );
  }, []);

  const handleEditorMount = useCallback<OnMount>((ed) => {
    editorRef.current = ed;
  }, []);

  // Apply a sandbox tick result to project + editor stores
  const applyResult = useCallback(
    (result: SandboxResult) => {
      if (!isMountedRef.current) return;
      setScanDuration(Math.round(result.durationMs * 10) / 10);
      if (result.logs.length) {
        setScriptLogs((prev) => [...result.logs, ...prev].slice(0, 50));
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      const nextTags = result.tags as Record<string, string | number | boolean>;
      applyTick({ tags: nextTags });

      // Fire alarm log/notification on rising edge
      const wasAlarmActive = tags["ALARM_ACTIVE"] === true;
      const isNowActive = nextTags["ALARM_ACTIVE"] === true;
      const msg = String(nextTags["ALARM_MSG"] ?? "Alarme SCADA");
      if (isNowActive && (!wasAlarmActive || lastAlarmRef.current !== msg)) {
        lastAlarmRef.current = msg;
        pushLog({
          t: new Date().toLocaleTimeString(),
          tag: "ALARME SCADA",
          msg,
          lvl: "err",
          channel: "Alarmes",
        });
        void pushNotification("alarm", "Alarme SCADA", msg, { source: "scada-script" });
        addAlarm({
          id: `scada-${Date.now()}`,
          tagName: "ALARME SCADA",
          priority: "high",
          message: msg,
          triggeredAt: Date.now(),
          acknowledgedAt: null,
          isActive: true,
          state: "unacknowledged",
          category: "process",
        });
      }
      if (!isNowActive && wasAlarmActive) {
        lastAlarmRef.current = null;
        clearAlarm("ALARME SCADA");
      }

      // Mirror to editor tags (Watch table cross-module)
      const editorState = useEditorStore.getState();
      Object.entries(nextTags).forEach(([name, value]) => {
        const typedValue = value as string | number | boolean;
        const existing = Object.values(editorState.editorTags).find((t) => t.name === name);
        if (existing) {
          editorState.setTagValue(existing.id, typedValue);
        } else {
          const type =
            typeof typedValue === "boolean"
              ? "BOOL"
              : typeof typedValue === "number"
                ? "REAL"
                : "STRING";
          editorState.upsertTag({
            id: `tag-${name}`,
            name,
            type,
            value: typedValue,
            forced: false,
          });
        }
      });
    },
    [applyTick, pushLog, tags, addAlarm, clearAlarm],
  );

  // Live preview: debounced execute on script change
  useEffect(() => {
    if (!livePreview || running) return;
    const timer = setTimeout(async () => {
      const result = await sandboxRef.current?.run(script, tags as Record<string, unknown>);
      if (!result || !isMountedRef.current) return;
      if (result.ok) {
        setError(null);
        setLastLiveResult(formatLivePreview(result.tags));
      } else {
        setError(result.error);
        setLastLiveResult(null);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [script, tags, livePreview, running]);

  // Sandboxed execution loop @ 100ms
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(async () => {
      const result = await sandboxRef.current?.run(
        script,
        useProjectStore.getState().tags as Record<string, unknown>,
      );
      if (result && isMountedRef.current) applyResult(result);
    }, 100);
    return () => clearInterval(interval);
  }, [running, script, applyResult]);

  const acknowledgeAlarm = () => {
    applyTick({ tags: { ...tags, ALARM_ACTIVE: false } });
    pushLog({
      t: new Date().toLocaleTimeString(),
      tag: "ALARME SCADA",
      msg: "Alarme reconhecido pelo operador.",
      lvl: "ok",
      channel: "Alarmes",
    });
  };

  return (
    <div className="flex h-full w-full overflow-hidden select-none">
      {/* AREA DO CANVAS */}
      <div className="flex-1 min-w-0 relative flex flex-col">
        {isAlarmActive && <AlarmBanner message={alarmMsg} onAcknowledge={acknowledgeAlarm} />}

        {selectedNode && "tag" in selectedNode.params && (
          <SelectedTagBadge
            label={selectedNode.label}
            tagValue={String(selectedNode.params.tag ?? "")}
            onBind={() => setBindOpen(true)}
          />
        )}

        <div className="flex-1 min-h-0 relative">
          <KonvaCanvas variant="scada" />
        </div>
      </div>

      <BindTagDialog
        open={bindOpen}
        onOpenChange={setBindOpen}
        currentTag={selectedNode ? String(selectedNode.params.tag ?? "") : ""}
        title={selectedNode ? `Vincular tag · ${selectedNode.label}` : "Vincular tag"}
        onConfirm={(tagName) => {
          if (selectedNode) updateNodeParam(selectedNode.id, "tag", tagName);
        }}
      />

      {/* SCRIPTER SIDEBAR */}
      <div
        className={`shrink-0 border-l border-border bg-background/80 backdrop-blur flex flex-col transition-all duration-300 relative ${
          editorOpen ? "w-[400px]" : "w-0 overflow-hidden border-l-0"
        }`}
      >
        <button
          onClick={() => setEditorOpen((o) => !o)}
          className={`absolute top-1/2 -translate-y-1/2 z-30 h-12 w-4 bg-panel/85 backdrop-blur border border-border rounded-l flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-md hover:h-16 hover:w-5 transition-all ${
            editorOpen ? "-left-4" : "-left-4 border-r-0"
          }`}
          title={editorOpen ? "Ocultar Editor Script" : "Mostrar Editor Script"}
        >
          {editorOpen ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>

        {editorOpen && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-card/20 px-3 py-2">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Scripting de Animação
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <RefreshCw
                    className={`h-3 w-3 ${livePreview ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <Switch
                    id="live-preview"
                    checked={livePreview}
                    onCheckedChange={setLivePreview}
                    className="h-4 w-7"
                  />
                  <Label
                    htmlFor="live-preview"
                    className="text-[10px] text-muted-foreground cursor-pointer"
                  >
                    Live
                  </Label>
                </div>
                <Button
                  size="sm"
                  variant={running ? "destructive" : "default"}
                  onClick={() => setRunning((r) => !r)}
                  className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
                >
                  {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  {running ? "Pausar" : "Executar"}
                </Button>
              </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 min-h-0 border-b border-border">
              <Editor
                height="100%"
                language="javascript"
                theme="vs-dark"
                value={script}
                onChange={(v) => setScript(v || "")}
                beforeMount={handleEditorBeforeMount}
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                  lineNumbers: "on",
                  scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
                }}
              />
            </div>

            {/* Console and Errors footer */}
            <ScriptConsole
              logs={scriptLogs}
              error={error}
              running={running}
              livePreview={livePreview}
              lastLiveResult={lastLiveResult}
              scanDuration={scanDuration}
            />
          </>
        )}
      </div>
    </div>
  );
}
