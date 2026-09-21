import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { getDigitalTwinDemoMappings } from "@/lib/seed-digital-twin";
import {
  ArrowLeft,
  Box,
  Upload,
  Bell,
  Activity,
  FlaskConical,
  Wifi,
  WifiOff,
  Search,
  X,
  AlertTriangle,
  Radio,
  EyeOff,
  PanelRightOpen,
  PanelRightClose,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
} from "lucide-react";
import { LazyTwin3DViewer as Twin3DViewer } from "@/components/canvases/lazy";
import {
  useDigitalTwinStore,
  type HotspotConfig,
  type TwinAlarm,
  type TwinMapping,
} from "@/lib/digital-twin-store";
import { useTwinTelemetryPersistence } from "@/hooks/use-twin-telemetry-persistence";
import { useCurrentProject } from "@/lib/current-project";
import {
  createTwinModelUploadUrl,
  getTwinModelSignedUrl,
  confirmTwinModelUpload,
  getProjectTwinModel,
  listTwinHotspots,
  upsertTwinHotspot,
  deleteTwinHotspot,
} from "@/lib/digital-twin.functions";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WhatIfPanel } from "@/components/digital-twin/what-if-panel";
import { TelemetryHealthPanel } from "@/components/digital-twin/telemetry-health-panel";
import { useEditorStore } from "@/lib/editor/store";
import { useProjectStore } from "@/lib/project-store";

export const Route = createFileRoute("/digital-twin")({
  head: () => ({
    meta: [
      { title: "Digital Twin · EletricAI" },
      { name: "description", content: "Gêmeo Digital 3D interativo da planta industrial." },
    ],
  }),
  component: DigitalTwinPage,
});

/** Nomes de tag reais do projeto (editor + engine de simulação), para o
 * autocomplete do diálogo de hotspot — nunca texto livre sem sugestão. */
function getProjectTagNames(): string[] {
  const editorTags = Object.values(useEditorStore.getState().editorTags ?? {}).map((t) => t.id);
  const engineTags = Object.keys(useProjectStore.getState().tags ?? {});
  return Array.from(new Set([...editorTags, ...engineTags])).sort();
}

interface TwinHotspotRow {
  id: string;
  equipment_id: string;
  equipment_label: string;
  label: string;
  tag: string;
  type: HotspotConfig["type"];
  unit: string | null;
  position_x: number;
  position_y: number;
  position_z: number;
  color: string;
  alert_threshold: number | null;
  critical_threshold: number | null;
}

function rowsToMappings(rows: TwinHotspotRow[]): TwinMapping[] {
  const byEquipment = new Map<string, TwinMapping>();
  for (const r of rows) {
    let mapping = byEquipment.get(r.equipment_id);
    if (!mapping) {
      mapping = { equipmentId: r.equipment_id, equipmentLabel: r.equipment_label, hotspots: [] };
      byEquipment.set(r.equipment_id, mapping);
    }
    mapping.hotspots.push({
      id: r.id,
      label: r.label,
      tag: r.tag,
      type: r.type,
      unit: r.unit ?? "",
      position: { x: r.position_x, y: r.position_y, z: r.position_z },
      color: r.color,
      alertThreshold: r.alert_threshold ?? undefined,
      criticalThreshold: r.critical_threshold ?? undefined,
      alarmActive: false,
    });
  }
  return Array.from(byEquipment.values());
}

function DigitalTwinPage() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hotspotDialogOpen, setHotspotDialogOpen] = useState(false);
  const [editingHotspot, setEditingHotspot] = useState<{
    equipmentId: string;
    equipmentLabel: string;
    hotspot?: HotspotConfig;
  } | null>(null);

  useTwinTelemetryPersistence();

  const project = useCurrentProject((s) => s.project);
  const setModelUrl = useDigitalTwinStore((s) => s.setModelUrl);
  const setMappings = useDigitalTwinStore((s) => s.setMappings);
  const setHotspotsLoading = useDigitalTwinStore((s) => s.setHotspotsLoading);
  const requestUploadUrl = useServerFn(createTwinModelUploadUrl);
  const requestSignedUrl = useServerFn(getTwinModelSignedUrl);
  const confirmUpload = useServerFn(confirmTwinModelUpload);
  const loadProjectModel = useServerFn(getProjectTwinModel);
  const listHotspots = useServerFn(listTwinHotspots);
  const upsertHotspot = useServerFn(upsertTwinHotspot);
  const removeHotspot = useServerFn(deleteTwinHotspot);

  // Carrega os hotspots REAIS do projeto ativo do banco. Chamado ao abrir a
  // página e depois de qualquer criação/edição/remoção bem-sucedida — nunca
  // inventa equipamento, e nunca marca isDemoData quando os dados são reais.
  const reloadHotspots = useCallback(
    async (projectId: string) => {
      setHotspotsLoading(true);
      try {
        const { rows } = await listHotspots({ data: { projectId } });
        setMappings(rowsToMappings(rows as TwinHotspotRow[]), { isDemo: false });
      } catch (err) {
        toast.error(`Falha ao carregar equipamento do projeto: ${(err as Error).message}`);
        setHotspotsLoading(false);
      }
    },
    [listHotspots, setMappings, setHotspotsLoading],
  );

  useEffect(() => {
    if (project?.id) reloadHotspots(project.id);
  }, [project?.id, reloadHotspots]);

  // Carrega o modelo 3D persistido do projeto (path salvo no banco), gerando
  // uma signed URL fresca a cada visita — o path em si não expira.
  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { path } = await loadProjectModel({ data: { projectId: project.id } });
        if (!path || cancelled) return;
        const { signedUrl } = await requestSignedUrl({ data: { path, expiresIn: 3600 } });
        if (!cancelled) setModelUrl(signedUrl);
      } catch {
        // Sem modelo salvo ainda, ou signed URL falhou — segue sem modelo.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project?.id, loadProjectModel, requestSignedUrl, setModelUrl]);

  // Telemetria em tempo real de verdade: assina INSERTs em tag_samples do
  // projeto ativo. Sem fallback simulado — se não houver leitura recente
  // pra uma tag, o sensor mostra "Aguardando dados", nunca um valor
  // inventado.
  useEffect(() => {
    if (!project?.id) return;
    const setRealtimeConnected = useDigitalTwinStore.getState().setRealtimeConnected;
    const pushTelemetry = useDigitalTwinStore.getState().pushTelemetry;

    const channel = supabase.channel(`twin-telemetry-${project.id}`);
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "tag_samples",
        filter: `project_id=eq.${project.id}`,
      },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const row = payload.new as { tag_name?: string; value?: number };
        if (typeof row.tag_name === "string" && typeof row.value === "number") {
          pushTelemetry(row.tag_name, row.value);
        }
      },
    );
    channel.subscribe((status) => {
      setRealtimeConnected(status === "SUBSCRIBED");
    });

    return () => {
      supabase.removeChannel(channel);
      setRealtimeConnected(false);
    };
  }, [project?.id]);

  const handleImportClick = () => {
    if (!project?.id) {
      toast.error("Selecione um projeto antes de importar um modelo 3D.");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !project?.id) return;
    if (!/\.(glb|gltf)$/i.test(file.name)) {
      toast.error("Apenas arquivos .glb ou .gltf são suportados.");
      return;
    }
    if (file.size > 75 * 1024 * 1024) {
      toast.error("Modelo excede o limite de 75 MB.");
      return;
    }
    setUploading(true);
    try {
      const { signedUrl, path } = await requestUploadUrl({
        data: { projectId: project.id, filename: file.name, sizeBytes: file.size },
      });
      const upload = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "model/gltf-binary" },
        body: file,
      });
      if (!upload.ok) throw new Error(`upload_failed_${upload.status}`);
      await confirmUpload({ data: { projectId: project.id, path } });
      const read = await requestSignedUrl({ data: { path, expiresIn: 3600 } });
      setModelUrl(read.signedUrl);
      toast.success("Modelo 3D importado e salvo no projeto.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha no upload";
      toast.error(`Erro ao importar modelo: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleLoadDemo = () => {
    setMappings(getDigitalTwinDemoMappings(), { isDemo: true });
    toast.info("Mostrando dados de demonstração — nada disto é salvo no banco.");
  };

  const handleClearDemo = () => {
    setMappings([], { isDemo: false });
  };

  const openCreateHotspot = (equipmentId?: string, equipmentLabel?: string) => {
    setEditingHotspot({ equipmentId: equipmentId ?? "", equipmentLabel: equipmentLabel ?? "" });
    setHotspotDialogOpen(true);
  };

  const openEditHotspot = (equipmentId: string, equipmentLabel: string, hotspot: HotspotConfig) => {
    setEditingHotspot({ equipmentId, equipmentLabel, hotspot });
    setHotspotDialogOpen(true);
  };

  const isDemoData = useDigitalTwinStore((s) => s.isDemoData);
  const hotspotsLoading = useDigitalTwinStore((s) => s.hotspotsLoading);

  const handleDeleteHotspot = async (
    equipmentId: string,
    hotspotId: string,
    hotspotLabel: string,
  ) => {
    if (!window.confirm(`Remover o sensor "${hotspotLabel}"?`)) return;
    if (isDemoData) {
      useDigitalTwinStore.getState().removeHotspot(equipmentId, hotspotId);
      toast.success("Removido da demonstração.");
      return;
    }
    try {
      await removeHotspot({ data: { id: hotspotId } });
      toast.success("Hotspot removido.");
      if (project?.id) reloadHotspots(project.id);
    } catch (err) {
      toast.error(`Falha ao remover: ${(err as Error).message}`);
    }
  };

  const mappings = useDigitalTwinStore((s) => s.mappings);
  const alarms = useDigitalTwinStore((s) => s.alarms);
  const viewMode = useDigitalTwinStore((s) => s.viewMode);
  const showFlowLines = useDigitalTwinStore((s) => s.showFlowLines);
  const selectedHotspotId = useDigitalTwinStore((s) => s.selectedHotspotId);
  const selectedEquipmentId = useDigitalTwinStore((s) => s.selectedEquipmentId);
  const realtimeConnected = useDigitalTwinStore((s) => s.realtimeConnected);
  const telemetryBuffers = useDigitalTwinStore((s) => s.telemetryBuffers);
  const selectHotspot = useDigitalTwinStore((s) => s.selectHotspot);
  const selectEquipment = useDigitalTwinStore((s) => s.selectEquipment);
  const setViewMode = useDigitalTwinStore((s) => s.setViewMode);
  const toggleFlowLines = useDigitalTwinStore((s) => s.toggleFlowLines);
  const acknowledgeAlarm = useDigitalTwinStore((s) => s.acknowledgeAlarm);
  const clearAlarm = useDigitalTwinStore((s) => s.clearAlarm);
  const whatIfEnabled = useDigitalTwinStore((s) => s.whatIfEnabled);

  const unackedAlarms = alarms.filter((a) => !a.acknowledged);

  const selectedHotspot = mappings
    .flatMap((m) => m.hotspots)
    .find((h) => h.id === selectedHotspotId);

  const filteredMappings = useMemo(
    () =>
      mappings
        .map((m) => ({
          ...m,
          hotspots: m.hotspots.filter(
            (h) =>
              h.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
              h.tag.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
        }))
        .filter((m) => m.hotspots.length > 0 || searchQuery === ""),
    [mappings, searchQuery],
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0 bg-card/50">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="h-7 w-7 rounded flex items-center justify-center hover:bg-accent text-muted-foreground"
          >
            {sidebarOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/settings" })}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Configurações
          </button>
          <div className="w-px h-5 bg-border" />
          <span className="text-sm font-semibold flex items-center gap-2">
            <Box className="h-4 w-4 text-primary" /> Digital Twin
          </span>
          <Badge
            variant={realtimeConnected ? "default" : "secondary"}
            className="gap-1 text-[10px]"
            title={
              realtimeConnected
                ? "Conectado — recebendo leituras reais em tempo real"
                : "Sem conexão em tempo real no momento"
            }
          >
            {realtimeConnected ? (
              <Wifi className="h-3 w-3 text-success" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {realtimeConnected ? "Live" : "Offline"}
          </Badge>
          {isDemoData && (
            <Badge
              variant="outline"
              className="gap-1 text-[10px] border-warning text-warning"
              title="Estes dados são só uma demonstração — não estão salvos no banco"
            >
              <Sparkles className="h-3 w-3" /> Demonstração
            </Badge>
          )}
          {whatIfEnabled && (
            <Badge variant="outline" className="gap-1 text-[10px] border-warning text-warning">
              <FlaskConical className="h-3 w-3" /> E-se?
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["normal", "alarms-only", "walkthrough"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`h-7 px-2 text-[10px] font-mono transition-colors ${
                  viewMode === mode
                    ? "bg-primary/15 text-primary"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "normal" ? "Normal" : mode === "alarms-only" ? "Alarmes" : "Walk"}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-border" />
          <button
            type="button"
            onClick={toggleFlowLines}
            className={`h-7 w-7 rounded flex items-center justify-center ${
              showFlowLines ? "text-primary" : "text-muted-foreground"
            } hover:bg-accent`}
            title="Linhas de fluxo"
          >
            {showFlowLines ? <Radio className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            className="hidden"
            onChange={handleFilePicked}
          />
          <button
            type="button"
            onClick={handleImportClick}
            disabled={uploading}
            className="h-7 px-2 rounded border border-border hover:bg-accent text-[10px] font-mono text-muted-foreground flex items-center gap-1 disabled:opacity-50"
            title={project?.id ? "Importar modelo GLB/GLTF" : "Selecione um projeto"}
          >
            <Upload className="h-3 w-3" /> {uploading ? "Enviando..." : "Importar"}
          </button>
          <button
            type="button"
            onClick={() => setWhatIfOpen((o) => !o)}
            className={`h-7 px-2 rounded border border-border hover:bg-accent text-[10px] font-mono flex items-center gap-1 ${
              whatIfOpen || whatIfEnabled
                ? "text-warning border-warning/50"
                : "text-muted-foreground"
            }`}
            title="Modo E-se? (simulação hipotética)"
          >
            <FlaskConical className="h-3 w-3" /> E-se?
          </button>
          <button
            type="button"
            onClick={() => setTelemetryOpen((o) => !o)}
            className={`h-7 px-2 rounded border border-border hover:bg-accent text-[10px] font-mono flex items-center gap-1 ${
              telemetryOpen ? "text-primary border-primary/50" : "text-muted-foreground"
            }`}
            title="Saúde da telemetria"
          >
            <Activity className="h-3 w-3" /> Telemetria
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {sidebarOpen && (
          <aside className="w-64 shrink-0 border-r border-border flex flex-col bg-card/30">
            <div className="p-3 border-b border-border space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar tag..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              {mappings.length > 0 && !isDemoData && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-[10px] gap-1"
                  onClick={() => openCreateHotspot()}
                  disabled={!project?.id}
                >
                  <Plus className="h-3 w-3" /> Novo hotspot
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-auto scrollbar-thin p-3 space-y-3">
              {hotspotsLoading ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  Carregando equipamento do projeto...
                </div>
              ) : filteredMappings.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <Box className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <div>
                    <p className="text-xs text-muted-foreground">Nenhum equipamento real ainda</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Importe um modelo 3D e adicione hotspots vinculados às suas tags
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 px-2">
                    <Button
                      size="sm"
                      className="h-7 text-[10px] gap-1"
                      onClick={() => openCreateHotspot()}
                      disabled={!project?.id}
                    >
                      <Plus className="h-3 w-3" /> Adicionar hotspot
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px] gap-1 text-muted-foreground"
                      onClick={handleLoadDemo}
                    >
                      <Sparkles className="h-3 w-3" /> Ver exemplo de demonstração
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {isDemoData && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-7 text-[10px] gap-1 border-warning/50 text-warning"
                      onClick={handleClearDemo}
                    >
                      <X className="h-3 w-3" /> Sair da demonstração
                    </Button>
                  )}
                  {filteredMappings.map((mapping) => (
                    <div key={mapping.equipmentId}>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            selectEquipment(
                              selectedEquipmentId === mapping.equipmentId
                                ? null
                                : mapping.equipmentId,
                            );
                            selectHotspot(null);
                          }}
                          className={`flex-1 text-left px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                            selectedEquipmentId === mapping.equipmentId
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-accent text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Box className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{mapping.equipmentLabel}</span>
                            <Badge variant="secondary" className="ml-auto text-[9px] h-4">
                              {mapping.hotspots.length}
                            </Badge>
                          </div>
                        </button>
                        {!isDemoData && (
                          <button
                            type="button"
                            title="Novo sensor neste equipamento"
                            onClick={() =>
                              openCreateHotspot(mapping.equipmentId, mapping.equipmentLabel)
                            }
                            className="h-6 w-6 shrink-0 rounded flex items-center justify-center hover:bg-accent text-muted-foreground"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {(selectedEquipmentId === mapping.equipmentId || searchQuery) && (
                        <div className="mt-1 ml-4 space-y-0.5">
                          {mapping.hotspots.map((h) => (
                            <div key={h.id} className="group flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  selectHotspot(selectedHotspotId === h.id ? null : h.id);
                                  setDetailsOpen(true);
                                }}
                                className={`flex-1 text-left px-3 py-1.5 rounded text-[11px] flex items-center gap-2 transition-colors ${
                                  selectedHotspotId === h.id
                                    ? "bg-primary/10 text-primary"
                                    : "hover:bg-accent/60 text-muted-foreground"
                                }`}
                              >
                                <span
                                  className="h-1.5 w-1.5 rounded-full shrink-0"
                                  style={{ background: h.color }}
                                />
                                <span className="truncate">{h.label}</span>
                                <span className="text-[9px] text-muted-foreground/60 ml-auto">
                                  {h.tag}
                                </span>
                              </button>
                              <button
                                type="button"
                                title="Editar"
                                onClick={() =>
                                  openEditHotspot(mapping.equipmentId, mapping.equipmentLabel, h)
                                }
                                className="h-6 w-6 shrink-0 rounded hidden group-hover:flex items-center justify-center hover:bg-accent text-muted-foreground"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                title="Remover"
                                onClick={() =>
                                  handleDeleteHotspot(mapping.equipmentId, h.id, h.label)
                                }
                                className="h-6 w-6 shrink-0 rounded hidden group-hover:flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </aside>
        )}

        <div className="flex-1 relative">
          <Twin3DViewer
            selectedHotspotId={selectedHotspotId}
            onHotspotClick={(id) => {
              selectHotspot(id);
              setDetailsOpen(true);
            }}
            viewMode={viewMode}
            showFlowLines={showFlowLines}
          />

          {unackedAlarms.length > 0 && (
            <div className="absolute top-3 right-3 z-20 max-w-xs space-y-1">
              {unackedAlarms.slice(0, 5).map((alarm) => (
                <AlarmBanner
                  key={alarm.id}
                  alarm={alarm}
                  onAcknowledge={() => acknowledgeAlarm(alarm.id)}
                  onClear={() => clearAlarm(alarm.id)}
                />
              ))}
            </div>
          )}
        </div>

        {detailsOpen && selectedHotspot && (
          <aside className="w-80 shrink-0 border-l border-border flex flex-col bg-card/30">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <span className="text-xs font-semibold">Detalhes do sensor</span>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto scrollbar-thin p-3 space-y-4">
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ background: selectedHotspot.color }}
                />
                <div>
                  <p className="text-sm font-medium">{selectedHotspot.label}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selectedHotspot.tag}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-muted/30 p-2">
                  <p className="text-[9px] text-muted-foreground uppercase">Tipo</p>
                  <p className="text-xs font-mono mt-0.5">{selectedHotspot.type}</p>
                </div>
                <div className="rounded-md bg-muted/30 p-2">
                  <p className="text-[9px] text-muted-foreground uppercase">Unidade</p>
                  <p className="text-xs font-mono mt-0.5">{selectedHotspot.unit || "—"}</p>
                </div>
              </div>

              {selectedHotspot.alertThreshold != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Limites de alarme</p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-warning">Alerta</span>
                      <span className="font-mono">
                        {selectedHotspot.alertThreshold} {selectedHotspot.unit}
                      </span>
                    </div>
                    {selectedHotspot.criticalThreshold != null && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-destructive">Crítico</span>
                        <span className="font-mono">
                          {selectedHotspot.criticalThreshold} {selectedHotspot.unit}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Activity className="h-3 w-3" /> Últimas leituras
                </p>
                <div className="h-24 bg-card/50 border border-border rounded-md p-2">
                  <TelemetrySparkline
                    buffer={telemetryBuffers[selectedHotspot.tag]}
                    color={selectedHotspot.color}
                  />
                </div>
              </div>
            </div>
          </aside>
        )}

        {whatIfOpen && <WhatIfPanel onClose={() => setWhatIfOpen(false)} />}
        {telemetryOpen && <TelemetryHealthPanel onClose={() => setTelemetryOpen(false)} />}
      </div>

      <HotspotEditorDialog
        open={hotspotDialogOpen}
        onOpenChange={setHotspotDialogOpen}
        editing={editingHotspot}
        projectId={project?.id ?? null}
        isDemoData={isDemoData}
        existingEquipmentIds={mappings.map((m) => m.equipmentId)}
        onSaved={() => {
          if (project?.id && !isDemoData) reloadHotspots(project.id);
        }}
      />
    </div>
  );
}

function AlarmBanner({
  alarm,
  onAcknowledge,
  onClear,
}: {
  alarm: TwinAlarm;
  onAcknowledge: () => void;
  onClear: () => void;
}) {
  return (
    <Card
      className={`border-l-2 ${
        alarm.severity === "critical" ? "border-l-destructive" : "border-l-warning"
      } animate-in slide-in-from-right`}
    >
      <CardContent className="p-2.5 flex items-start gap-2">
        <AlertTriangle
          className={`h-4 w-4 mt-0.5 shrink-0 ${
            alarm.severity === "critical" ? "text-destructive" : "text-warning"
          }`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium truncate">{alarm.label}</p>
          <p className="text-[9px] text-muted-foreground font-mono">
            {alarm.value} {alarm.tag}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            onClick={onAcknowledge}
            className="h-6 px-1.5 rounded text-[9px] bg-primary/10 text-primary hover:bg-primary/20"
          >
            OK
          </button>
          <button
            type="button"
            onClick={onClear}
            className="h-6 px-1.5 rounded text-[9px] hover:bg-accent text-muted-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function HotspotEditorDialog({
  open,
  onOpenChange,
  editing,
  projectId,
  isDemoData,
  existingEquipmentIds,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: { equipmentId: string; equipmentLabel: string; hotspot?: HotspotConfig } | null;
  projectId: string | null;
  isDemoData: boolean;
  existingEquipmentIds: string[];
  onSaved: () => void;
}) {
  const upsertHotspot = useServerFn(upsertTwinHotspot);
  const [equipmentId, setEquipmentId] = useState("");
  const [equipmentLabel, setEquipmentLabel] = useState("");
  const [label, setLabel] = useState("");
  const [tag, setTag] = useState("");
  const [type, setType] = useState<HotspotConfig["type"]>("temperature");
  const [unit, setUnit] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [posX, setPosX] = useState("0");
  const [posY, setPosY] = useState("0");
  const [posZ, setPosZ] = useState("0");
  const [alertThreshold, setAlertThreshold] = useState("");
  const [criticalThreshold, setCriticalThreshold] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEquipmentId(editing?.equipmentId ?? "");
    setEquipmentLabel(editing?.equipmentLabel ?? "");
    setLabel(editing?.hotspot?.label ?? "");
    setTag(editing?.hotspot?.tag ?? "");
    setType(editing?.hotspot?.type ?? "temperature");
    setUnit(editing?.hotspot?.unit ?? "");
    setColor(editing?.hotspot?.color ?? "#3b82f6");
    setPosX(String(editing?.hotspot?.position.x ?? 0));
    setPosY(String(editing?.hotspot?.position.y ?? 0));
    setPosZ(String(editing?.hotspot?.position.z ?? 0));
    setAlertThreshold(editing?.hotspot?.alertThreshold?.toString() ?? "");
    setCriticalThreshold(editing?.hotspot?.criticalThreshold?.toString() ?? "");
  }, [open, editing]);

  const tagNames = useMemo(() => (open ? getProjectTagNames() : []), [open]);
  const isEditingExisting = Boolean(editing?.hotspot);

  const handleSave = async () => {
    if (!equipmentId.trim() || !equipmentLabel.trim() || !label.trim() || !tag.trim()) {
      toast.error("Preencha equipamento, rótulo do sensor e tag.");
      return;
    }
    const parsedPos = { x: Number(posX) || 0, y: Number(posY) || 0, z: Number(posZ) || 0 };
    const parsedAlert = alertThreshold.trim() ? Number(alertThreshold) : undefined;
    const parsedCritical = criticalThreshold.trim() ? Number(criticalThreshold) : undefined;

    setSaving(true);
    try {
      if (isDemoData) {
        const store = useDigitalTwinStore.getState();
        const hotspotId = editing?.hotspot?.id ?? `demo_${Date.now().toString(36)}`;
        const newHotspot: HotspotConfig = {
          id: hotspotId,
          label: label.trim(),
          tag: tag.trim(),
          type,
          unit: unit.trim(),
          position: parsedPos,
          color,
          alertThreshold: parsedAlert,
          criticalThreshold: parsedCritical,
          alarmActive: false,
        };
        const existingMapping = store.mappings.find((m) => m.equipmentId === equipmentId.trim());
        if (isEditingExisting) {
          store.updateHotspot(equipmentId.trim(), newHotspot);
        } else if (existingMapping) {
          store.addHotspot(equipmentId.trim(), newHotspot);
        } else {
          store.addMapping({
            equipmentId: equipmentId.trim(),
            equipmentLabel: equipmentLabel.trim(),
            hotspots: [newHotspot],
          });
        }
        toast.success("Hotspot de demonstração atualizado (não persistido no banco).");
        onOpenChange(false);
        onSaved();
        return;
      }

      if (!projectId) {
        toast.error("Selecione um projeto primeiro.");
        return;
      }

      await upsertHotspot({
        data: {
          id: editing?.hotspot?.id,
          projectId,
          equipmentId: equipmentId.trim(),
          equipmentLabel: equipmentLabel.trim(),
          label: label.trim(),
          tag: tag.trim(),
          type,
          unit: unit.trim() || undefined,
          position: parsedPos,
          color,
          alertThreshold: parsedAlert,
          criticalThreshold: parsedCritical,
        },
      });
      toast.success(isEditingExisting ? "Hotspot atualizado." : "Hotspot criado.");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(`Falha ao salvar: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const hotspotTypes: HotspotConfig["type"][] = [
    "temperature",
    "current",
    "voltage",
    "level",
    "pressure",
    "status",
    "flow",
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditingExisting ? "Editar hotspot" : "Novo hotspot"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[70vh] overflow-auto scrollbar-thin pr-1">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Equipamento (ID interno)</Label>
              <Input
                value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value)}
                placeholder="motor-01"
                className="h-8 text-xs font-mono"
                disabled={isEditingExisting}
                list="twin-equipment-id-list"
              />
              <datalist id="twin-equipment-id-list">
                {existingEquipmentIds.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nome do equipamento</Label>
              <Input
                value={equipmentLabel}
                onChange={(e) => setEquipmentLabel(e.target.value)}
                placeholder="Motor Principal M-01"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Rótulo do sensor</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Temp. Enrolamento"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Tag vinculada</Label>
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="MOTOR_01_TEMP"
              className="h-8 text-xs font-mono"
              list="twin-hotspot-tag-list"
            />
            <datalist id="twin-hotspot-tag-list">
              {tagNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {tagNames.length === 0 && (
              <p className="text-[10px] text-muted-foreground">
                Nenhuma tag encontrada no projeto ainda — você pode digitar o nome mesmo assim e
                vincular depois.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as HotspotConfig["type"])}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hotspotTypes.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unidade</Label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="°C"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Posição no modelo 3D (x, y, z)</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input
                value={posX}
                onChange={(e) => setPosX(e.target.value)}
                className="h-8 text-xs"
                inputMode="decimal"
              />
              <Input
                value={posY}
                onChange={(e) => setPosY(e.target.value)}
                className="h-8 text-xs"
                inputMode="decimal"
              />
              <Input
                value={posZ}
                onChange={(e) => setPosZ(e.target.value)}
                className="h-8 text-xs"
                inputMode="decimal"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Coordenadas relativas ao centro do modelo importado. Ajuste por tentativa —
              posicionamento por clique direto no modelo é um próximo passo.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Limite de alerta</Label>
              <Input
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
                className="h-8 text-xs"
                placeholder="opcional"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Limite crítico</Label>
              <Input
                value={criticalThreshold}
                onChange={(e) => setCriticalThreshold(e.target.value)}
                className="h-8 text-xs"
                placeholder="opcional"
                inputMode="decimal"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Cor</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-10 rounded border border-border cursor-pointer bg-transparent"
              />
              <span className="text-[10px] font-mono text-muted-foreground">{color}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TelemetrySparkline({
  buffer,
  color,
}: {
  buffer?: { tag: string; samples: { ts: number; value: number }[] };
  color: string;
}) {
  if (!buffer || buffer.samples.length < 2) {
    return (
      <div className="h-full flex items-center justify-center text-[9px] text-muted-foreground">
        Aguardando dados...
      </div>
    );
  }
  const values = buffer.samples.map((s) => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 260;
  const h = 72;
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 8) - 4;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  return (
    <svg className="w-full h-full" viewBox={`0 0 ${w} ${h}`}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
