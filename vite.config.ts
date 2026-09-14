// @lovable.dev/vite-tanstack-config já inclui TanStack Start, React, Tailwind
// e path-alias. Nitro é pinado para Vercel quando o build sai do CI.
//
// IMPORTANTE: NÃO fazemos manualChunks de React/scheduler/@tanstack — separar
// esses chunks quebra a ordem de avaliação no SSR streaming do TanStack Start
// (causa tela branca em produção mesmo com dev verde). Deixamos o Vite/Rollup
// fazer code-splitting por rota automaticamente; só forçamos vendor chunks
// para libs pesadas e claramente isoladas por rota (3D, canvas, charts).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

const env = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
Object.assign(process.env, env);

export default defineConfig({
  nitro: { preset: "vercel" },
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        external: (id: string) => id.startsWith("cloudflare:"),
        output: {
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return undefined;

            // Three.js / @react-three — só Digital Twin
            if (
              id.includes("/three/") ||
              id.includes("@react-three") ||
              id.includes("camera-controls") ||
              id.includes("troika-")
            ) {
              return "vendor-3d";
            }

            // Konva — canvases gráficos
            if (id.includes("/konva/") || id.includes("react-konva")) {
              return "vendor-konva";
            }

            // PixiJS / viewport
            if (id.includes("/pixi.js") || id.includes("pixi-viewport")) {
              return "vendor-pixi";
            }

            // React Flow
            if (id.includes("reactflow") || id.includes("@xyflow")) {
              return "vendor-reactflow";
            }

            // Recharts / D3
            if (id.includes("recharts") || id.includes("/d3-")) {
              return "vendor-charts";
            }

            // Monaco editor — só páginas de código (workers ficam em chunks próprios)
            if (
              id.includes("monaco-editor") &&
              !id.includes(".worker") &&
              !id.includes("?worker")
            ) {
              return "vendor-monaco";
            }

            // jsPDF
            if (id.includes("jspdf")) {
              return "vendor-pdf";
            }

            return undefined;
          },
        },
      },
    },
  },
});
