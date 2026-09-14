import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { seedDigitalTwinDemo } from "@/lib/seed-digital-twin";
import {
  ArrowLeft,
  Box,
  Upload,
  Bell,
  Activity,
  TrendingUp,
  FlaskConical,
  Wifi,
  WifiOff,
  Search,
  X,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Radio,
  Eye,
  EyeOff,
  Layers,
  Menu,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import { LazyTwin3DViewer as Twin3DViewer } from "@/components/canvases/lazy";
import { useDigitalTwinStore, type HotspotConfig, type TwinAlarm } from "@/lib/digital-twin-store";
import { useTwinTelemetryPersistence } from "@/hooks/use-twin-telemetry-persistence";
import { useCurrentProject } from "@/lib/current-project";
import { createTwinModelUploadUrl, getTwinModelSignedUrl } from "@/lib/digital-twin.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhatIfPanel } from "@/components/digital-twin/what-if-panel";
import { TelemetryHealthPanel } from "@/components/digital-twin/telemetry-health-panel";

export const Route = createFileRoute("/digital-twin")({
  head: () => ({
    meta: [
      { title: "Digital Twin · EletricAI" },
      { name: "description", content: "Gêmeo Digital 3D interativo da planta industrial." },
    ],
  }),
  component: DigitalTwinPage,
});

function DigitalTwinPage() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seeded = useRef(false);

  useTwinTelemetryPersistence();

  const project = useCurrentProject((s) => s.project);
  const setModelUrl = useDigitalTwinStore((s) => s.setModelUrl);
  const requestUploadUrl = useServerFn(createTwinModelUploadUrl);
  const requestSignedUrl = useServerFn(getTwinModelSignedUrl);

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
      const read = await requestSignedUrl({ data: { path, expiresIn: 3600 } });
      setModelUrl(read.signedUrl);
      toast.success("Modelo 3D importado com sucesso.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha no upload";
      toast.error(`Erro ao importar modelo: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!seeded.current) {
      seedDigitalTwinDemo();
      seeded.current = true;
    }
  }, []);

  useEffect(() => {
    const pushTelemetry = useDigitalTwinStore.getState().pushTelemetry;
    const setRealtimeConnected = useDigitalTwinStore.getState().setRealtimeConnected;
    setRealtimeConnected(true);

    const interval = setInterval(() => {
      const now = Date.now();
      pushTelemetry("MOTOR_01_TEMP", 65 + Math.sin(now / 5000) * 8 + Math.random() * 2);
      pushTelemetry("MOTOR_01_CURRENT", 14.2 + Math.sin(now / 3000) * 1.5 + Math.random() * 0.3);
      pushTelemetry("MOTOR_01_VIB", 4.5 + Math.sin(now / 2000) * 1.5 + Math.random() * 0.5);
      pushTelemetry("LT_01_LEVEL", 62 + Math.sin(now / 8000) * 8 + Math.random() * 1);
      pushTelemetry("LT_01_PRESSURE", 1.8 + Math.sin(now / 6000) * 0.3 + Math.random() * 0.05);
      pushTelemetry("PUMP_01_FLOW", 28 + Math.sin(now / 4000) * 5 + Math.random() * 1);
    }, 2000);

    return () => {
      clearInterval(interval);
      setRealtimeConnected(false);
    };
  }, []);

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

  const selectedEquipment = mappings.find((m) => m.equipmentId === selectedEquipmentId);

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
          >
            {realtimeConnected ? (
              <Wifi className="h-3 w-3 text-success" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {realtimeConnected ? "Live" : "Offline"}
          </Badge>
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
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar tag..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto scrollbar-thin p-3 space-y-3">
              {filteredMappings.length === 0 ? (
                <div className="text-center py-8">
                  <Box className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">Nenhum equipamento mapeado</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    Importe um modelo 3D e adicione hotspots
                  </p>
                </div>
              ) : (
                filteredMappings.map((mapping) => (
                  <div key={mapping.equipmentId}>
                    <button
                      type="button"
                      onClick={() => {
                        selectEquipment(
                          selectedEquipmentId === mapping.equipmentId ? null : mapping.equipmentId,
                        );
                        selectHotspot(null);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors ${
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
                    {(selectedEquipmentId === mapping.equipmentId || searchQuery) && (
                      <div className="mt-1 ml-4 space-y-0.5">
                        {mapping.hotspots.map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => {
                              selectHotspot(selectedHotspotId === h.id ? null : h.id);
                              setDetailsOpen(true);
                            }}
                            className={`w-full text-left px-3 py-1.5 rounded text-[11px] flex items-center gap-2 transition-colors ${
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
                        ))}
                      </div>
                    )}
                  </div>
                ))
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
                  <p className="text-xs font-mono mt-0.5">{selectedHotspot.unit}</p>
                </div>
              </div>

              {selectedHotspot.alertThreshold && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Limites de alarme</p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-warning">Alerta</span>
                      <span className="font-mono">
                        {selectedHotspot.alertThreshold} {selectedHotspot.unit}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-destructive">Crítico</span>
                      <span className="font-mono">
                        {selectedHotspot.criticalThreshold} {selectedHotspot.unit}
                      </span>
                    </div>
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

              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 text-xs h-8">
                  Ver no Unifilar
                </Button>
                <Button size="sm" variant="outline" className="flex-1 text-xs h-8">
                  Ver no SCADA
                </Button>
              </div>
            </div>
          </aside>
        )}

        {whatIfOpen && <WhatIfPanel onClose={() => setWhatIfOpen(false)} />}
        {telemetryOpen && <TelemetryHealthPanel onClose={() => setTelemetryOpen(false)} />}
      </div>
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
