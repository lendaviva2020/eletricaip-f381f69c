---
status: living-document
owner: equipe
last_review: 2026-09-12
---

# 13 · Backlog Priorizado

Cada item tem ID estável (referenciado por commits e PRs). Não remova IDs — marque como `done` ou `wontfix`.

## Fase 2 — Workspace (crítico)

### WebGL Unifilar
- **#WGL-01** ✅ Portas/handles em `symbols.ts` com hit-test — implementado
  em `render/ports.ts` (catálogo de portas por NodeKind) + `render/stage.ts`
  (`rebuildPorts`, hitArea ampliado 8px sobre desenho de 4px)
- **#WGL-02** ✅ Drag de edges com preview ortogonal + commit via
  `cmd.addEdge` — `beginEdgeDraft`/`onPointerMove`/`onPointerUp` em
  `stage.ts`, commit real via `dispatch(cmd.addEdge(...))` em
  `webgl-canvas.tsx`
- **#WGL-03** ✅ Seleção múltipla (rubber-band) — marquee via Shift+drag em
  `stage.ts`, ligado a `onSelectMany`/`selectedNodeIds`
- **#WGL-04** ✅ Snap-to-grid em `MoveNode` — `snapFnRef` conectado ao
  parâmetro `snap` do `DiagramStage`
- **#WGL-05** ✅ Context menu HTML overlay — `onContextMenu` do stage →
  `openContextMenu` do store → componente `<ContextMenu>` em
  `webgl-canvas.tsx`
- **#WGL-06** ⚠️ Export DXF/PDF a partir de `DiagramDoc` — PARCIAL: o
  export DXF (`export-dxf.ts`) está correto e completo. O export PDF
  (`handleExportPdf` em `webgl-canvas.tsx`) tinha `bom: []` e `totalBRL: 0`
  hardcoded, gerando um Memorial Descritivo sempre vazio mesmo com BOM real
  salvo — fix pendente de aplicação (conectar `listBom` real). Marcar como
  ✅ somente depois que este fix for aplicado e verificado.
- **#WGL-07** Descomissionamento do `VoltaiStore` — ✅ store, canvas legado (`unifilar-canvas.tsx`) e symbols removidos; `RightPropertyPanel` e colaboração Realtime (`use-collab.ts`) agora consomem `useDiagramStore` (`diagram:v2:${projectId}`). Slot `voltai` do snapshot mantido apenas como passthrough legado em `projects.functions.ts` para leitura de projetos antigos.

### PLC ↔ Editor
- **#PLC-01** Bloco do PlcStore abre Ladder/FBD com `rungs`/`fbdNodes` carregados; persistir na troca de aba
- **#PLC-02** Botão "Compilar" → `compileProgram(rungs, 'ST')`
- **#PLC-03** Export `.plcproj` (PLCopen XML, skeleton)
- **#PLC-04** Mapa de endereços I/O por slot
- **#PLC-05** Validação de compatibilidade de slots no rack

### SCADA
- **#SCADA-01** Snapshot do canvas (posições, sizes, params) → `useProjectStore` único
- **#SCADA-02** Substituir `new Function(script)` por Web Worker sandboxed
- **#SCADA-03** Modal "Bind to tag" com autocomplete
- **#SCADA-04** Alarm banner aciona `pushNotification`

### Ladder
- **#LAD-01** TOF e TP no `scanRungs`
- **#LAD-02** Validador de operando com feedback inline
- **#LAD-03** Autocomplete de tags
- **#LAD-04** Importação IL/ST externo — ✅ `lib/ladder/importer.ts` + botão "Importar" no toolbar; roundtrip contra `compileProgram` coberto por `ladder-import.test.ts`
- **#LAD-05** Colunas configuráveis — ✅ `LadderRung.cols` opcional + `resizeRungCols` (limites 3–12) + controles ± no header de cada rung; runtime/compilador usam largura real por row. Cobertura: `ladder-rung-cols.test.ts`

### FBD
- **#FBD-01** Parâmetros de bloco (PT, PV) sincronizados com runtime
- **#FBD-02** Export SVG/PNG do diagrama
- **#FBD-03** Validação visual de tipo de pin (substituir `alert()`)

## Fase 3 — Servidor e segurança

- **#SEC-01** Fechar issues remanescentes do scanner
- **#SEC-02** Auditar `timingSafeEqual` em webhooks Stripe/MP
- **#SEC-03** Rate limit burst por endpoint sensível (IA, IoT, webhooks)
- **#SEC-04** 🔒 Leaked Password Protection (dashboard Supabase)

## Fase 4 — IA

- **#AI-01** Schema Zod compartilhado client/server para tool-calling
- **#AI-02** Preview diff antes do commit do patch IA
- **#AI-03** Dashboard de telemetria por operação (`ai_credit_costs`)

## Fase 5 — Digital Twin

- **#TWIN-01** Auto-seed via `seedDigitalTwinDemo` na primeira visita
- **#TWIN-02** Persistir `telemetryBuffers` em hypertable (`tag_samples`)
- **#TWIN-03** Upload GLB/GLTF para bucket privado com signed URL
- **#TWIN-04** Modelo "E se?" usando nameplate real de `catalog_components`

## Fase 6 — Billing, Convites, Onboarding

- **#BIL-01** Fluxo upgrade Stripe/MP com atualização imediata via webhook
- **#INV-01** Wire `/invite/:token` ao RPC `accept_invite`
- **#ONB-01** Tour guiado pós-criação de tenant — ✅ `components/onboarding-tour.tsx` (overlay 6 passos: Welcome → Unifilar → Ladder → FBD → SCADA → Fim, ativando cada modo) + gatilho via `markTourPending()` no `/onboarding` após `createProject`; flags `eletricai:tour-pending` / `eletricai:tour-seen:v1` no localStorage. Cobertura: `onboarding-tour.test.tsx`

## Transversais

- **#R-01** `workspace.tsx` aceita `?projectId=:id` e hidrata stores
- **#R-02** Criar `/settings/protocols` (OPC-UA, Modbus configs)
- **#DOC-01** Toda mutação no Pixi DEVE passar por `dispatch(Command)`
- **#DOC-02** Toda server function nova: `requireSupabaseAuth` + Zod
