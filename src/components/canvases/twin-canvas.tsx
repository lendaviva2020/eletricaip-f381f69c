import { useState, useEffect, useRef, useMemo } from "react";
import {
  RotateCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Sliders,
  TrendingUp,
  Activity,
  FlaskConical,
  Play,
  RotateCcw as ResetIcon,
  X,
  Box,
  Monitor,
} from "lucide-react";
import { BottomStrip, FloatingLegend } from "./canvas-chrome";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import { LazyTwin3DViewer as Twin3DViewer } from "./lazy";
import { useDigitalTwinStore } from "@/lib/digital-twin-store";

interface TelemetryHistory {
  t: number;
  val: number;
}

export function TwinCanvas() {
  const [angle, setAngle] = useState(35);
  const [zoom, setZoom] = useState(1.1);
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
  const [sensorHistory, setSensorHistory] = useState<Record<string, TelemetryHistory[]>>({});

  // Mappings reais vêm da store compartilhada com a página /digital-twin —
  // o cliente configura os hotspots lá; aqui só consome o que já existe.
  // Não semeamos mais demo automaticamente (ver seed-digital-twin.ts).
  const twinMappings = useDigitalTwinStore((s) => s.mappings);

  // ===== "What-If" Simulation Mode =====
  const [view3d, setView3d] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [whatIfActive, setWhatIfActive] = useState(false);
  const [loadDelta, setLoadDelta] = useState(10); // % delta on load (drives speed↓, current↑)
  const [voltageDelta, setVoltageDelta] = useState(0); // % delta on supply voltage
  const [ambientDelta, setAmbientDelta] = useState(0); // °C above 25°C nominal
  const [horizonH, setHorizonH] = useState(8); // hours of projected wear

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const projectTags = useProjectStore((s) => s.tags);
  const editorTags = useEditorStore((s) => s.editorTags);
  const isLive = useProjectStore((s) => s.runtime.connected);

  // Poll values for drawing and buffering
  const getActiveTag = (name: string): number => {
    let result = 0;
    // Extract from project store
    Object.entries(projectTags).forEach(([key, val]) => {
      if (key.toUpperCase().includes(name.toUpperCase())) result = Number(val);
    });
    // Extract from editor store
    Object.values(editorTags).forEach((tag) => {
      if (tag.name.toUpperCase() === name.toUpperCase()) result = Number(tag.value);
    });
    return result;
  };

  const speedVal = getActiveTag("SPEED") || (isLive ? 1420 + Math.sin(Date.now() / 600) * 30 : 0);
  const currentVal =
    getActiveTag("CURRENT") || (speedVal > 0 ? 14.5 + Math.abs(Math.sin(Date.now() / 900)) * 2 : 0);
  const levelVal =
    getActiveTag("NIVEL") ||
    getActiveTag("LEVEL") ||
    (isLive ? 62 + Math.sin(Date.now() / 3000) * 10 : 50);
  // ===== "What-If" physical model =====
  // Simplified induction-motor + thermal model: keeping torque ∝ load, the
  // pump-curve gives speed drop ≈ slip_nom * (load/100), and current rises
  // ≈ load% above no-load current. Voltage sag depresses torque ∝ V².
  // Temperature ≈ I² * R rise above ambient.
  const whatIf = useMemo(() => {
    const loadFactor = 1 + loadDelta / 100;
    const vFactor = 1 + voltageDelta / 100;
    // Speed: nominal 1450 rpm, slip ~3% at full load, scales with load and 1/V²
    const slipNom = 0.03;
    const predictedSpeed = 1500 * (1 - (slipNom * loadFactor) / (vFactor * vFactor));
    // Current rises ~linear with load, inverse with voltage
    const predictedCurrent = Math.max(0, (currentVal || 14.5) * loadFactor) / vFactor;
    // Winding temp = 25°C ambient + ambientDelta + I²·k over horizon
    const predictedTemp =
      25 + ambientDelta + Math.pow(predictedCurrent, 2) * 0.18 + Math.min(15, horizonH * 0.6);
    // Efficiency drops ~quadratic with load far from optimum (~80% load)
    const predictedEff = Math.max(
      60,
      94.2 -
        Math.pow(Math.abs(loadFactor - 0.8) * 100, 1.3) * 0.06 -
        Math.max(0, predictedTemp - 70) * 0.2,
    );
    // Bearing life (L10) consumed per scenario hour, exponential with load
    const lifeConsumedPctPerH = 0.012 * Math.pow(loadFactor, 3.33);
    const lifeConsumedH = lifeConsumedPctPerH * horizonH;
    // Failure risk score
    const failureRisk =
      predictedTemp > 95 || predictedCurrent > 22
        ? "CRÍTICO"
        : predictedTemp > 80 || predictedCurrent > 19
          ? "ALTO"
          : predictedTemp > 65
            ? "MÉDIO"
            : "BAIXO";
    return {
      speed: predictedSpeed,
      current: predictedCurrent,
      temperature: predictedTemp,
      efficiency: predictedEff,
      lifeConsumedH,
      failureRisk,
    };
  }, [loadDelta, voltageDelta, ambientDelta, horizonH, currentVal]);

  // Real-time baseline metrics for comparison
  const baseline = useMemo(() => {
    const eff = speedVal > 0 ? 94.2 - currentVal / 10 : 0;
    const temp = 25 + Math.pow(currentVal, 2) * 0.18;
    return { speed: speedVal, current: currentVal, temperature: temp, efficiency: eff };
  }, [speedVal, currentVal]);

  // Update telemetry history buffers
  useEffect(() => {
    const interval = setInterval(() => {
      setSensorHistory((prev) => {
        const next = { ...prev };
        const nowSec = Date.now();

        // 1. Buffer Speed
        const speedHist = [...(next["SPEED"] ?? [])];
        speedHist.push({ t: nowSec, val: speedVal });
        if (speedHist.length > 30) speedHist.shift();
        next["SPEED"] = speedHist;

        // 2. Buffer Current
        const currHist = [...(next["CURRENT"] ?? [])];
        currHist.push({ t: nowSec, val: currentVal });
        if (currHist.length > 30) currHist.shift();
        next["CURRENT"] = currHist;

        // 3. Buffer Level
        const lvlHist = [...(next["LEVEL"] ?? [])];
        lvlHist.push({ t: nowSec, val: levelVal });
        if (lvlHist.length > 30) lvlHist.shift();
        next["LEVEL"] = lvlHist;

        return next;
      });
    }, 300);

    return () => clearInterval(interval);
  }, [speedVal, currentVal, levelVal]);

  // Render 3D Orthographic projection of Pumping Twin station
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrame: number;

    const draw = () => {
      // Clear with dark grid look
      ctx.fillStyle = "oklch(0.12 0.015 250)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      // Center and Zoom
      ctx.translate(canvas.width / 2, canvas.height / 2 + 30);
      ctx.scale(zoom, zoom);

      // Calculations for 3D Isometric projection
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const project = (x: number, y: number, z: number) => {
        // Orthographic projection matrix
        const isoX = (x - y) * cos;
        const isoY = (x + y) * sin - z;
        return { x: isoX, y: isoY };
      };

      // 1. Draw Ground base grid
      ctx.strokeStyle = "rgba(0, 240, 255, 0.08)";
      ctx.lineWidth = 1;
      for (let i = -160; i <= 160; i += 40) {
        // lines along X
        ctx.beginPath();
        const p1 = project(-160, i, 0);
        const p2 = project(160, i, 0);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // lines along Y
        ctx.beginPath();
        const p3 = project(i, -160, 0);
        const p4 = project(i, 160, 0);
        ctx.moveTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.stroke();
      }

      // 2. Draw 3D Piping structure
      ctx.strokeStyle = "rgba(100, 116, 139, 0.4)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      // Pipe from Motor pump to Tank
      const pipeStart = project(-80, 0, 20);
      const pipeMid = project(-80, 80, 20);
      const pipeEnd = project(60, 80, 20);
      ctx.moveTo(pipeStart.x, pipeStart.y);
      ctx.lineTo(pipeMid.x, pipeMid.y);
      ctx.lineTo(pipeEnd.x, pipeEnd.y);
      ctx.stroke();

      // Animated particle fluid flow inside pipe
      if (speedVal > 0) {
        ctx.strokeStyle = "rgba(0, 160, 255, 0.8)";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 15]);
        ctx.lineDashOffset = -Math.floor(Date.now() / 20) % 23;
        ctx.beginPath();
        ctx.moveTo(pipeStart.x, pipeStart.y);
        ctx.lineTo(pipeMid.x, pipeMid.y);
        ctx.lineTo(pipeEnd.x, pipeEnd.y);
        ctx.stroke();
        ctx.setLineDash([]); // Reset
      }

      // 3. Render 3D Motor Cylinder (Pump Station)
      ctx.save();
      const mPos = project(-80, 0, 0);
      // Motor Body Cylinder
      const mGrad = ctx.createLinearGradient(mPos.x - 25, mPos.y - 40, mPos.x + 25, mPos.y);
      mGrad.addColorStop(0, "oklch(0.55 0.16 240)"); // Ciano Slate
      mGrad.addColorStop(0.5, "oklch(0.25 0.05 240)");
      mGrad.addColorStop(1, "oklch(0.15 0.02 240)");

      ctx.fillStyle = mGrad;
      ctx.beginPath();
      // Draw a solid 3D box cylinder
      ctx.moveTo(mPos.x - 20, mPos.y - 10);
      ctx.lineTo(mPos.x - 20, mPos.y - 45);
      ctx.lineTo(mPos.x + 20, mPos.y - 45);
      ctx.lineTo(mPos.x + 20, mPos.y - 10);
      ctx.closePath();
      ctx.fill();

      // Spinning shaft Fan blades
      if (speedVal > 0) {
        ctx.save();
        ctx.translate(mPos.x, mPos.y - 45);
        ctx.rotate((Date.now() / 150) * (speedVal / 1450));
        ctx.strokeStyle = "oklch(0.78 0.17 200)";
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -12);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();

      // 4. Render 3D Glass Fluid Tank
      ctx.save();
      const tPos = project(80, 60, 0);
      // Tank Base Ellipse
      ctx.fillStyle = "rgba(30, 41, 59, 0.6)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 2;

      // Draw vertical glass columns
      ctx.beginPath();
      ctx.moveTo(tPos.x - 30, tPos.y);
      ctx.lineTo(tPos.x - 30, tPos.y - 80);
      ctx.lineTo(tPos.x + 30, tPos.y - 80);
      ctx.lineTo(tPos.x + 30, tPos.y);
      ctx.closePath();
      ctx.stroke();

      // Render simulated moving fluid inside
      const fluidHeight = 80 * (levelVal / 100);
      if (fluidHeight > 0) {
        const fGrad = ctx.createLinearGradient(
          tPos.x - 30,
          tPos.y - fluidHeight,
          tPos.x + 30,
          tPos.y,
        );
        fGrad.addColorStop(0, "rgba(0, 140, 255, 0.7)"); // Electric Blue fluid
        fGrad.addColorStop(1, "rgba(0, 50, 150, 0.9)");

        ctx.fillStyle = fGrad;
        ctx.beginPath();
        ctx.moveTo(tPos.x - 29, tPos.y - 1);
        ctx.lineTo(tPos.x - 29, tPos.y - fluidHeight);
        ctx.lineTo(tPos.x + 29, tPos.y - fluidHeight);
        ctx.lineTo(tPos.x + 29, tPos.y - 1);
        ctx.closePath();
        ctx.fill();

        // Ripples animation
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tPos.x - 29, tPos.y - fluidHeight + Math.sin(Date.now() / 250) * 1.5);
        ctx.bezierCurveTo(
          tPos.x - 15,
          tPos.y - fluidHeight - 2 + Math.sin(Date.now() / 250) * 1.5,
          tPos.x + 15,
          tPos.y - fluidHeight + 2 + Math.sin(Date.now() / 250) * 1.5,
          tPos.x + 29,
          tPos.y - fluidHeight + Math.sin(Date.now() / 250) * 1.5,
        );
        ctx.stroke();
      }
      ctx.restore();

      ctx.restore();

      animFrame = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animFrame);
  }, [angle, zoom, speedVal, levelVal]);

  return (
    <div className="relative h-full w-full bg-[--canvas-bg] overflow-hidden">
      <FloatingLegend
        title="Gêmeo Digital 3D · Inteligência Industrial"
        items={[
          "Análise Preditiva Ativa",
          `Eficiência: ${speedVal > 0 ? (94.2 - currentVal / 10).toFixed(1) : "0.0"}%`,
          `Risco de Falha: ${currentVal > 18 ? "ALTO" : "BAIXO"}`,
        ]}
      />

      {/* VIEWPORT CONTROLS */}
      <div className="absolute top-16 left-6 z-10 flex gap-1.5">
        {/* 2D / 3D toggle */}
        <button
          onClick={() => setView3d((v) => !v)}
          title={view3d ? "Visão 2D Isométrica" : "Visão 3D (Three.js)"}
          className={`h-8 rounded border flex items-center gap-1.5 px-2 cursor-pointer text-[10px] font-mono transition-colors ${
            view3d
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-card/75 text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {view3d ? <Box className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
          {view3d ? "3D" : "2D"}
        </button>
        <div className="w-px h-6 bg-border mx-0.5 align-middle self-center" />
        <button
          onClick={() => setAngle((a) => a - 10)}
          title="Girar p/ Esquerda"
          className="h-8 w-8 rounded bg-card/75 border border-border flex items-center justify-center cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={() => setAngle((a) => a + 10)}
          title="Girar p/ Direita"
          className="h-8 w-8 rounded bg-card/75 border border-border flex items-center justify-center cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          <RotateCw className="h-4 w-4" />
        </button>
        <div className="w-px h-6 bg-border mx-1.5 align-middle self-center" />
        <button
          onClick={() => setZoom((z) => Math.min(1.8, z + 0.1))}
          title="Aumentar Zoom"
          className="h-8 w-8 rounded bg-card/75 border border-border flex items-center justify-center cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
          title="Diminuir Zoom"
          className="h-8 w-8 rounded bg-card/75 border border-border flex items-center justify-center cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <div className="w-px h-6 bg-border mx-1.5 align-middle self-center" />
        <button
          onClick={() => setWhatIfOpen((o) => !o)}
          title='Cenário "E se?"'
          className={`h-8 px-2.5 rounded border flex items-center gap-1.5 cursor-pointer text-[11px] font-mono transition-colors ${
            whatIfOpen || whatIfActive
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-card/75 text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <FlaskConical className="h-3.5 w-3.5" />E se?
          {whatIfActive && <span className="h-1.5 w-1.5 rounded-full bg-primary energized" />}
        </button>
      </div>

      {/* WHAT-IF SCENARIO PANEL */}
      {whatIfOpen && (
        <WhatIfPanel
          loadDelta={loadDelta}
          setLoadDelta={setLoadDelta}
          voltageDelta={voltageDelta}
          setVoltageDelta={setVoltageDelta}
          ambientDelta={ambientDelta}
          setAmbientDelta={setAmbientDelta}
          horizonH={horizonH}
          setHorizonH={setHorizonH}
          whatIf={whatIf}
          baseline={baseline}
          active={whatIfActive}
          onRun={() => setWhatIfActive(true)}
          onReset={() => {
            setLoadDelta(0);
            setVoltageDelta(0);
            setAmbientDelta(0);
            setHorizonH(8);
            setWhatIfActive(false);
          }}
          onClose={() => setWhatIfOpen(false)}
        />
      )}

      {/* THE DRAWING CANVAS — 3D or 2D */}
      {view3d ? (
        <Twin3DViewer />
      ) : (
        <>
          <div className="absolute inset-0 grid place-items-center opacity-10 pointer-events-none">
            <div className="w-[80%] h-[80%] border border-primary/20 rounded-full animate-ping" />
          </div>
          <canvas
            ref={canvasRef}
            width={800}
            height={500}
            className="w-full h-full block cursor-grab active:cursor-grabbing"
          />
        </>
      )}

      {/* FLOATING TELEMETRY SENSOR OVERLAYS */}
      <div className="absolute inset-0 pointer-events-none select-none">
        {/* Sensor 1: Motor Speed */}
        <div
          className="absolute pointer-events-auto"
          style={{
            left: `calc(50% - 130px * ${zoom})`,
            top: `calc(50% - 80px * ${zoom})`,
          }}
        >
          <SensorBadge
            label="M01.SPEED"
            val={`${speedVal.toFixed(0)} RPM`}
            unit="rpm"
            color="oklch(0.78 0.17 200)"
            onClick={() => setSelectedSensor(selectedSensor === "SPEED" ? null : "SPEED")}
          />
        </div>

        {/* Sensor 2: Motor Current */}
        <div
          className="absolute pointer-events-auto"
          style={{
            left: `calc(50% - 120px * ${zoom})`,
            top: `calc(50% - 20px * ${zoom})`,
          }}
        >
          <SensorBadge
            label="M01.CURRENT"
            val={`${currentVal.toFixed(1)} A`}
            unit="A"
            color="oklch(0.66 0.22 25)"
            onClick={() => setSelectedSensor(selectedSensor === "CURRENT" ? null : "CURRENT")}
          />
        </div>

        {/* Sensor 3: Tank Fluid Level */}
        <div
          className="absolute pointer-events-auto"
          style={{
            left: `calc(50% + 75px * ${zoom})`,
            top: `calc(50% - 100px * ${zoom})`,
          }}
        >
          <SensorBadge
            label="LT_01.LEVEL"
            val={`${levelVal.toFixed(0)}%`}
            unit="%"
            color="oklch(0.72 0.16 250)"
            onClick={() => setSelectedSensor(selectedSensor === "LEVEL" ? null : "LEVEL")}
          />
        </div>

        {/* Predictive Maintenance Marker */}
        <div
          className="absolute pointer-events-auto group"
          style={{
            left: `calc(50% + 20px * ${zoom})`,
            top: `calc(50% + 40px * ${zoom})`,
          }}
        >
          <div className="relative">
            <Activity className="h-5 w-5 text-warning animate-pulse" />
            <div className="absolute left-6 top-0 hidden group-hover:block w-32 p-2 bg-background/95 border border-border rounded text-[9px] font-mono shadow-xl">
              <span className="text-warning font-bold">ALERTA PREDITIVO:</span>
              <br />
              Vibração anômala detectada no eixo principal.
              <br />
              Confiança: 88%
            </div>
          </div>
        </div>
      </div>

      {/* POPUP HISTORY TREND SPARKLINE */}
      {selectedSensor && (
        <div className="absolute right-6 top-16 z-20 w-[240px] rounded-lg border border-primary/20 bg-background/95 p-3 flex flex-col gap-2 shadow-2xl glass-strong">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              Histórico de Telemetria
            </span>
            <button
              onClick={() => setSelectedSensor(null)}
              className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Fechar
            </button>
          </div>

          <div className="h-20 bg-card/40 border border-border/80 rounded relative flex items-end p-1.5 overflow-hidden">
            {/* Draw inline SVG sparkline */}
            {sensorHistory[selectedSensor] && sensorHistory[selectedSensor].length > 1 ? (
              <svg className="w-full h-full">
                <path
                  d={buildSvgPath(
                    sensorHistory[selectedSensor].map((h) => h.val),
                    220,
                    65,
                  )}
                  fill="none"
                  stroke="oklch(0.78 0.17 200)"
                  strokeWidth="1.5"
                />
              </svg>
            ) : (
              <span className="absolute inset-0 grid place-items-center text-[9px] text-muted-foreground font-mono">
                Aguardando ticks...
              </span>
            )}
          </div>
          <span className="text-[9px] font-mono text-muted-foreground">
            Amostragem: última 30 varreduras (100ms)
          </span>
        </div>
      )}

      <BottomStrip
        items={[
          ["Taxa de Refresh", "30 FPS"],
          ["Trigonometria", `${angle}° viewport`],
          ["Twin Engine", "WebGL Canvas Core v3"],
        ]}
      />
    </div>
  );
}

function SensorBadge({
  label,
  val,
  color,
  onClick,
}: {
  label: string;
  val: string;
  unit: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="rounded bg-background/90 border border-border/80 px-2 py-1 flex items-center gap-2 shadow-lg cursor-pointer hover:border-primary transition-colors select-none"
    >
      <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: color }} />
      <div className="flex flex-col">
        <span className="text-[8px] font-mono text-muted-foreground">{label}</span>
        <span className="text-[10px] font-mono font-bold tracking-tight text-foreground">
          {val}
        </span>
      </div>
    </div>
  );
}

// Generate simple SVG path from array of numbers for Sparkline
function buildSvgPath(values: number[], width: number, height: number): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((val, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 8) - 4;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

// ============= "What-If" Scenario Panel =============
interface WhatIfMetrics {
  speed: number;
  current: number;
  temperature: number;
  efficiency: number;
  lifeConsumedH: number;
  failureRisk: string;
}
interface BaselineMetrics {
  speed: number;
  current: number;
  temperature: number;
  efficiency: number;
}

function WhatIfPanel(props: {
  loadDelta: number;
  setLoadDelta: (n: number) => void;
  voltageDelta: number;
  setVoltageDelta: (n: number) => void;
  ambientDelta: number;
  setAmbientDelta: (n: number) => void;
  horizonH: number;
  setHorizonH: (n: number) => void;
  whatIf: WhatIfMetrics;
  baseline: BaselineMetrics;
  active: boolean;
  onRun: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { whatIf, baseline, active } = props;
  return (
    <div className="absolute left-6 top-28 z-30 w-[320px] rounded-lg border border-primary/30 bg-background/95 shadow-2xl glass-strong flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono font-bold text-primary uppercase flex items-center gap-1.5">
          <FlaskConical className="h-3.5 w-3.5" />
          Cenário · E se?
        </span>
        <button
          onClick={props.onClose}
          className="text-muted-foreground hover:text-foreground cursor-pointer"
          title="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug font-mono">
        Ajuste parâmetros operacionais e veja o impacto previsto sem afetar o processo real. O
        modelo combina equações de máquina, curva de bomba e termodinâmica do enrolamento.
      </p>

      <ScenarioSlider
        label="Carga mecânica"
        unit="%"
        value={props.loadDelta}
        min={-30}
        max={50}
        step={5}
        onChange={props.setLoadDelta}
        hint="Δ sobre a carga nominal do eixo"
      />
      <ScenarioSlider
        label="Tensão de alimentação"
        unit="%"
        value={props.voltageDelta}
        min={-15}
        max={10}
        step={1}
        onChange={props.setVoltageDelta}
        hint="Δ sobre 380 V nominal"
      />
      <ScenarioSlider
        label="Temperatura ambiente"
        unit="°C"
        value={props.ambientDelta}
        min={-10}
        max={25}
        step={1}
        onChange={props.setAmbientDelta}
        hint="Δ sobre 25 °C nominal"
      />
      <ScenarioSlider
        label="Horizonte"
        unit="h"
        value={props.horizonH}
        min={1}
        max={72}
        step={1}
        onChange={props.setHorizonH}
        hint="Janela de projeção"
      />

      {/* COMPARISON TABLE: REAL vs WHAT-IF */}
      <div className="rounded border border-border/80 bg-card/40 overflow-hidden">
        <div className="grid grid-cols-[1fr_70px_70px_60px] text-[9px] font-mono uppercase text-muted-foreground bg-card/60 px-2 py-1 border-b border-border/60">
          <span>Métrica</span>
          <span className="text-right">Atual</span>
          <span className="text-right">Cenário</span>
          <span className="text-right">Δ</span>
        </div>
        <CompareRow label="Velocidade" unit="rpm" real={baseline.speed} sim={whatIf.speed} />
        <CompareRow
          label="Corrente"
          unit="A"
          real={baseline.current}
          sim={whatIf.current}
          decimals={1}
        />
        <CompareRow
          label="Temp. enrol."
          unit="°C"
          real={baseline.temperature}
          sim={whatIf.temperature}
          decimals={1}
        />
        <CompareRow
          label="Eficiência"
          unit="%"
          real={baseline.efficiency}
          sim={whatIf.efficiency}
          decimals={1}
          inverse
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
        <div className="rounded border border-border/80 bg-card/40 px-2 py-1.5 flex flex-col">
          <span className="text-[8px] text-muted-foreground uppercase">Vida útil consumida</span>
          <span className="text-foreground font-bold">
            {whatIf.lifeConsumedH.toFixed(3)} h <span className="text-muted-foreground">L10</span>
          </span>
        </div>
        <div
          className={`rounded border px-2 py-1.5 flex flex-col ${
            whatIf.failureRisk === "CRÍTICO"
              ? "border-destructive/60 bg-destructive/10 text-destructive"
              : whatIf.failureRisk === "ALTO"
                ? "border-warning/60 bg-warning/10 text-warning"
                : whatIf.failureRisk === "MÉDIO"
                  ? "border-warning/40 bg-warning/5 text-warning"
                  : "border-success/40 bg-success/5 text-success"
          }`}
        >
          <span className="text-[8px] text-muted-foreground uppercase">Risco de falha</span>
          <span className="font-bold">{whatIf.failureRisk}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={props.onRun}
          className={`flex-1 h-8 rounded text-[10px] font-mono font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
            active
              ? "bg-primary/20 border border-primary text-primary"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          <Play className="h-3 w-3" />
          {active ? "Cenário ativo" : "Executar simulação"}
        </button>
        <button
          onClick={props.onReset}
          title="Restaurar valores"
          className="h-8 px-2 rounded border border-border bg-card/60 hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ResetIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ScenarioSlider({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
        <span className="text-[10px] font-mono font-bold text-foreground tabular-nums">
          {value > 0 ? "+" : ""}
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full accent-primary cursor-pointer"
      />
      {hint && <span className="text-[9px] text-muted-foreground/70 font-mono">{hint}</span>}
    </div>
  );
}

function CompareRow({
  label,
  unit,
  real,
  sim,
  decimals = 0,
  inverse = false,
}: {
  label: string;
  unit: string;
  real: number;
  sim: number;
  decimals?: number;
  inverse?: boolean;
}) {
  const delta = sim - real;
  const deltaPct = real !== 0 ? (delta / Math.abs(real)) * 100 : 0;
  // Inverse=true means a positive delta is BAD (e.g. efficiency drop is bad
  // when delta<0, so flipping logic)
  const worse = inverse ? delta < 0 : delta > 0;
  const color =
    Math.abs(deltaPct) < 1 ? "text-muted-foreground" : worse ? "text-warning" : "text-success";
  return (
    <div className="grid grid-cols-[1fr_70px_70px_60px] text-[10px] font-mono px-2 py-1 border-b border-border/40 last:border-b-0">
      <span className="text-foreground">
        {label} <span className="text-muted-foreground">({unit})</span>
      </span>
      <span className="text-right text-muted-foreground tabular-nums">
        {real.toFixed(decimals)}
      </span>
      <span className="text-right text-foreground font-bold tabular-nums">
        {sim.toFixed(decimals)}
      </span>
      <span className={`text-right font-bold tabular-nums ${color}`}>
        {delta > 0 ? "+" : ""}
        {delta.toFixed(decimals)}
      </span>
    </div>
  );
}
