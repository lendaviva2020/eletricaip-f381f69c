# AGENTS.md

- O motor FBD executável vive em `src/lib/fbd/engine/` (modelo → registry → compilador → IR → runtime → simulação); o editor visual deve apenas representar esse modelo, nunca conter lógica de execução — garante uma única fonte da verdade semântica.
- Blocos FBD são definidos somente via `BlockRegistry` com `execute` real; nada de blocos hardcoded no editor — permite bibliotecas IEC/fabricante/custom extensíveis.
- O compilador nunca entrega IR com diagnósticos de erro, e a simulação usa passo fixo `cycleTimeMs` — resultados determinísticos e sem "sucesso" falso.
