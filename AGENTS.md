# AGENTS.md

- O motor FBD executável vive em `src/lib/fbd/engine/` (modelo → registry → compilador → IR → runtime → simulação); o editor visual deve apenas representar esse modelo, nunca conter lógica de execução — garante uma única fonte da verdade semântica.
- Blocos FBD são definidos somente via `BlockRegistry` com `execute` real; nada de blocos hardcoded no editor — permite bibliotecas IEC/fabricante/custom extensíveis.
- O compilador nunca entrega IR com diagnósticos de erro, e a simulação usa passo fixo `cycleTimeMs` — resultados determinísticos e sem "sucesso" falso.
- O editor FBD converte nós/arestas para `FbdDocument` só via `src/lib/fbd/editor-bridge.ts` e simula via `useFbdEngine`; paleta e pinos vêm do `BlockRegistry` — o canvas nunca decide tipos nem executa lógica.
- EN/ENO são portas implícitas de todo bloco não-SYSTEM (`effectiveInputs/effectiveOutputs`); blocos nunca os declaram — comportamento IEC uniforme.
