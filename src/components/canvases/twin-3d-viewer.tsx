import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, ThreeElements } from "@react-three/fiber";
import { OrbitControls, Text, Html } from "@react-three/drei";
import * as THREE from "three";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import {
  useDigitalTwinStore,
  type HotspotConfig,
  type TwinRenderState,
} from "@/lib/digital-twin-store";

/* ─── helpers ─── */
function getTag(name: string): number {
  const projectTags = useProjectStore.getState().tags;
  const editorTags = useEditorStore.getState().editorTags;
  for (const [k, v] of Object.entries(projectTags)) {
    if (k.toUpperCase().includes(name.toUpperCase())) return Number(v) || 0;
  }
  for (const [, v] of Object.entries(editorTags)) {
    if (v.name.toUpperCase() === name.toUpperCase()) return Number(v.value) || 0;
  }
  return 0;
}

const ACCENT = "#3fb6d6";
const ACCENT_GLOW = "#3fb6d6";
const BG = "#080C16";
const FLOOR = "#0F1629";

/* ─── 3D Motor ─── */
function Motor3D({ running, speed }: { running: boolean; speed: number }) {
  const rpm = running ? (speed || 1450) / 60 : 0;
  const rotorRef = useRef<THREE.Group>(null!);

  useFrame((_, dt) => {
    if (rotorRef.current && running) {
      (rotorRef.current.rotation as THREE.Euler).y += rpm * dt * Math.PI * 2;
    }
  });

  return (
    <group position={[-1.5, 0.3, 0]}>
      {/* Stator */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.5, 24]} />
        <meshStandardMaterial
          color={running ? "#22c55e" : "#475569"}
          metalness={0.6}
          roughness={0.4}
        />
      </mesh>
      {/* Rotor / fan */}
      <group ref={rotorRef} position={[0, 0, 0.35]}>
        <mesh>
          <boxGeometry args={[0.1, 0.3, 0.02]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.1, 0.3, 0.02]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      </group>
      {/* Accent ring */}
      <mesh position={[0, 0, -0.25]}>
        <torusGeometry args={[0.2, 0.03, 8, 24]} />
        <meshStandardMaterial
          color={ACCENT}
          emissive={running ? ACCENT_GLOW : "#000"}
          emissiveIntensity={running ? 0.4 : 0}
        />
      </mesh>
      {/* Label */}
      <Text position={[0, -0.5, 0]} fontSize={0.08} color="#8a99b3">
        M01 {running ? `${speed.toFixed(0)} RPM` : "OFF"}
      </Text>
    </group>
  );
}

/* ─── 3D Tank ─── */
function Tank3D({ level }: { level: number }) {
  const pct = Math.min(1, Math.max(0, level / 100));
  // Animate surface ripple using a shader displacement approach — simple: use a sine-wave offset
  const liquidRef = useRef<THREE.Mesh>(null!);
  // Tempo acumulado localmente a partir do delta do frame — evita depender de
  // `THREE.Clock` (deprecado nesta versão do Three.js em favor de THREE.Timer).
  const elapsedRef = useRef(0);
  useFrame((_, dt) => {
    elapsedRef.current += dt;
    const elapsed = elapsedRef.current;
    if (liquidRef.current) {
      const g = liquidRef.current.geometry as THREE.BoxGeometry;
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const wave =
          Math.sin(x * 8 + elapsed * 2) * 0.005 + Math.sin(z * 6 + elapsed * 1.5) * 0.005;
        pos.setZ(i, wave + 0.01);
      }
      pos.needsUpdate = true;
    }
  });

  return (
    <group position={[1.5, 0.3, 0]}>
      {/* Glass tank outer */}
      <mesh>
        <boxGeometry args={[0.5, 0.6, 0.4]} />
        <meshPhysicalMaterial
          color="#1a2030"
          metalness={0.1}
          roughness={0.5}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Liquid fill */}
      <mesh ref={liquidRef} position={[0, -0.15 - (0.5 - pct * 0.5), 0]}>
        <boxGeometry args={[0.42, pct * 0.5, 0.32, 16, 1, 8]} />
        <meshPhysicalMaterial
          color={ACCENT}
          transparent
          opacity={0.7}
          emissive={ACCENT_GLOW}
          emissiveIntensity={0.15}
        />
      </mesh>
      {/* Top rim */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.52, 0.02, 0.42]} />
        <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.3} />
      </mesh>
      <Text position={[0, -0.5, 0]} fontSize={0.08} color="#8a99b3">
        LT_01 {(pct * 100).toFixed(0)}%
      </Text>
    </group>
  );
}

/* ─── 3D Pump ─── */
function Pump3D({ running }: { running: boolean }) {
  const impRef = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    if (impRef.current && running) {
      (impRef.current.rotation as THREE.Euler).y += 8 * dt;
    }
  });

  return (
    <group position={[0, 0.3, -1.2]}>
      {/* Body */}
      <mesh>
        <sphereGeometry args={[0.22, 24, 24]} />
        <meshStandardMaterial
          color={running ? "#5fd699" : "#475569"}
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>
      {/* Impeller */}
      <group ref={impRef}>
        <mesh>
          <torusGeometry args={[0.15, 0.02, 8, 16]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.15, 0.02, 8, 16]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      </group>
      {/* Pipe connection */}
      <mesh position={[0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.2, 8]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[-0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.2, 8]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
    </group>
  );
}

/* ─── Ground ─── */
function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color={FLOOR} />
      </mesh>
      <gridHelper args={[6, 12, "#1e2d4d", "#1e2d4d"]} position={[0, 0, 0]} />
    </group>
  );
}

/* ─── Pipes ─── */
function Pipe({
  from,
  to,
  color = "#64748b",
}: {
  from: [number, number, number];
  to: [number, number, number];
  color?: string;
}) {
  const points = useMemo(() => [new THREE.Vector3(...from), new THREE.Vector3(...to)], [from, to]);
  const curve = useMemo(() => new THREE.LineCurve3(points[0], points[1]), [points]);
  return (
    <mesh position={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]}>
      <cylinderGeometry
        args={[
          0.03,
          0.03,
          Math.sqrt((to[0] - from[0]) ** 2 + (to[1] - from[1]) ** 2 + (to[2] - from[2]) ** 2),
          6,
        ]}
      />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

/* ─── Scene ─── */
function Scene({
  selectedHotspotId,
  onHotspotClick,
  viewMode,
  showFlowLines,
}: {
  selectedHotspotId: string | null;
  onHotspotClick?: (id: string) => void;
  viewMode: string;
  showFlowLines: boolean;
}) {
  // Live values from stores
  const speedVal = getTag("SPEED") || Date.now() / 600;
  const levelVal = getTag("NIVEL") || getTag("LEVEL") || 62 + Math.sin(Date.now() / 3000) * 10;
  const motorOn = speedVal > 50;
  const pumpOn = getTag("PUMP") > 0.5;
  const mappings = useDigitalTwinStore.getState().mappings;
  const telemetryBuffers = useDigitalTwinStore.getState().telemetryBuffers;

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 4]} intensity={1.5} />
      <directionalLight position={[-3, 4, -2]} intensity={0.5} color="#3fb6d6" />
      <hemisphereLight args={[0x0a0e1a, 0x1a2030, 0.6]} />

      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        minDistance={1.5}
        maxDistance={6}
        target={[0, 0.3, 0]}
        makeDefault
      />

      <Ground />
      <Motor3D running={motorOn} speed={speedVal} />
      <Tank3D level={levelVal} />
      <Pump3D running={pumpOn || motorOn} />

      {/* Pipes connecting motor <> pump <> tank */}
      <Pipe from={[-1.2, 0.3, 0]} to={[-0.3, 0.3, -1.2]} color="#5fd699" />
      <Pipe from={[0.3, 0.3, -1.2]} to={[1.2, 0.3, 0]} color="#5fd699" />

      {/* Floating HTML labels */}
      <Html position={[-1.5, 1.2, 0]} center>
        <div className="text-[9px] font-mono text-[#3fb6d6] bg-black/60 px-1.5 py-0.5 rounded border border-[#3fb6d6]/30 whitespace-nowrap">
          ⚡ Motor Principal
        </div>
      </Html>
      <Html position={[1.5, 1.2, 0]} center>
        <div className="text-[9px] font-mono text-[#3fb6d6] bg-black/60 px-1.5 py-0.5 rounded border border-[#3fb6d6]/30 whitespace-nowrap">
          🛢️ Tanque Nível
        </div>
      </Html>
      <Html position={[0, 1.2, -1.2]} center>
        <div className="text-[9px] font-mono text-[#5fd699] bg-black/60 px-1.5 py-0.5 rounded border border-[#5fd699]/30 whitespace-nowrap">
          💧 Bomba Centrífuga
        </div>
      </Html>

      {/* Hotspots from mappings */}
      {viewMode !== "alarms-only" &&
        mappings
          .flatMap((m) => m.hotspots)
          .map((h) => {
            const buf = telemetryBuffers[h.tag];
            const latestVal = buf?.samples[buf.samples.length - 1]?.value;
            const isSelected = selectedHotspotId === h.id;
            const scale = isSelected ? 1.3 : 1;
            return (
              <Html
                key={h.id}
                position={[h.position.x, h.position.y, h.position.z]}
                center
                onClick={() => onHotspotClick?.(h.id)}
                style={{ pointerEvents: "auto", cursor: "pointer" }}
              >
                <div
                  className={`transition-all duration-200 ${
                    isSelected ? "scale-110" : "hover:scale-105"
                  }`}
                  style={{ pointerEvents: "auto" }}
                >
                  <div
                    className={`rounded-md px-2 py-1 flex items-center gap-1.5 border whitespace-nowrap ${
                      isSelected ? "border-primary bg-primary/20" : "border-border/60 bg-black/70"
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full animate-pulse shrink-0"
                      style={{ background: h.color }}
                    />
                    <span className="text-[9px] font-mono text-foreground/90">{h.label}</span>
                    {latestVal !== undefined && (
                      <span className="text-[9px] font-mono font-bold" style={{ color: h.color }}>
                        {latestVal.toFixed(1)}
                        <span className="text-[8px] text-muted-foreground ml-0.5">{h.unit}</span>
                      </span>
                    )}
                  </div>
                </div>
              </Html>
            );
          })}
    </>
  );
}

/* ─── Exported 3D Viewer ─── */
export function Twin3DViewer({
  selectedHotspotId,
  onHotspotClick,
  viewMode = "normal",
  showFlowLines = true,
}: {
  selectedHotspotId?: string | null;
  onHotspotClick?: (id: string) => void;
  viewMode?: string;
  showFlowLines?: boolean;
}) {
  const [renderState, setRenderState] = useState<TwinRenderState>("ready");
  // Remonta o Canvas (renderer novo) apenas quando o contexto WebGL volta.
  const [canvasKey, setCanvasKey] = useState(0);
  const [tabVisible, setTabVisible] = useState(true);
  const cleanupRef = useRef<(() => void) | null>(null);
  const setTwinRenderState = useDigitalTwinStore((s) => s.setRenderState);

  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    setTwinRenderState(renderState === "ready" ? "ready" : "recovering");
  }, [renderState, setTwinRenderState]);

  // Remove listeners do canvas ao desmontar (o R3F já descarta renderer,
  // geometrias, materiais e texturas da cena que ele criou).
  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      setTwinRenderState("degraded");
    },
    [setTwinRenderState],
  );

  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    gl.setClearColor(BG);
    const canvas = gl.domElement;

    const onLost = (event: Event) => {
      // preventDefault habilita a restauração automática pelo navegador.
      event.preventDefault();
      setRenderState("recovering");
    };
    const onRestored = () => {
      setRenderState("ready");
      setCanvasKey((k: number) => k + 1);
    };

    canvas.addEventListener("webglcontextlost", onLost, false);
    canvas.addEventListener("webglcontextrestored", onRestored, false);

    cleanupRef.current?.();
    cleanupRef.current = () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, []);

  // Um único laço por renderer; pausa quando a aba está oculta ou o contexto caiu.
  const frameloop = renderState === "ready" && tabVisible ? "always" : "never";

  return (
    <div className="relative h-full w-full bg-[--canvas-bg]">
      <Canvas
        key={canvasKey}
        frameloop={frameloop}
        camera={{ position: [2.5, 2, 3.5], fov: 40, near: 0.1, far: 20 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={handleCreated}
      >
        <Scene
          selectedHotspotId={selectedHotspotId ?? null}
          onHotspotClick={onHotspotClick}
          viewMode={viewMode}
          showFlowLines={showFlowLines}
        />
      </Canvas>
      {renderState === "recovering" ? (
        <div className="absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-sm">
          <div className="text-center px-6">
            <p className="text-sm font-medium">Recuperando visualização 3D…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              O contexto gráfico foi perdido. Simulação e telemetria continuam ativas.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
