# FBD Implementation Matrix

| Módulo | Estado | Arquivo | Prioridade |
| --- | --- | --- | --- |
| Domain Model + validação Zod | ✅ P0 | src/lib/fbd/engine/model.ts | P0 |
| Data Types (elementares, ANY_*, alargamento, wrap) | ✅ P0 | src/lib/fbd/engine/datatypes.ts | P0 |
| Ports / Connections (direção, drivers, tipos) | ✅ P0 | src/lib/fbd/engine/compiler.ts | P0 |
| Block Registry | ✅ P0 | src/lib/fbd/engine/registry.ts | P0 |
| IEC Foundation (lógica, SR/RS, R/F_TRIG, TON/TOF/TP, CTU/CTD/CTUD, comparação, seleção, matemática, conversões) | ✅ P0 | src/lib/fbd/engine/iec-library.ts | P0 |
| Dependency Graph + detecção de laço | ✅ P0 | compiler.ts (buildDependencyGraph) | P0 |
| AST / IR / Execution Plan | ✅ P0 | compiler.ts | P0 |
| Runtime determinístico + forçamento + falhas | ✅ P0 | runtime.ts | P0 |
| Basic Simulation (start/pause/stop/step/reset) | ✅ P0 | simulation.ts | P0 |
| Integração do editor visual com o motor | ⏳ | components/canvases/fbd-canvas.tsx | P1 |
| EN/ENO, PLC, Ladder, SCADA, Custom Blocks, Persistência | ⏳ | — | P1 |
| Fabricantes, Document Intelligence, Motion, Comunicação | ⏳ | — | P2 |
