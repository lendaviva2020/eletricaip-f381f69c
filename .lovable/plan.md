# Estabilização do EletricAI em produção

Correção dos erros de editor de código, workers, 3D e telemetria, sem remover módulos nem trocar editores por placeholders.

## Diagnóstico (verificado no código)

**1. Editor de código (Monaco) — causa raiz confirmada**
`@monaco-editor/react@4.7` está instalado, mas o pacote `monaco-editor` **não** é dependência do projeto. Nessa configuração o editor baixa tudo de um CDN externo (jsDelivr) em tempo de execução. O cabeçalho de segurança em `vercel.json` só permite scripts de `'self'` e domínios Lovable — o CDN é bloqueado. Daí vêm, em cadeia:
- "Monaco initialization: error"
- "Failed to execute 'importScripts' on 'WorkerGlobalScope'"
- "The script at 'blob:...' failed to load"
- "worker module init function failed to rehydrate" / "init did not return a callable function"

Os workers próprios do projeto (`src/lib/simulation/scada-worker.ts` via `script-sandbox.ts`) já usam o padrão nativo correto do bundler; serão validados no build, não reescritos.

**2. Telemetria do Digital Twin — causa raiz confirmada**
`flushTwinTelemetry` (`src/lib/digital-twin.functions.ts`) chama a função de banco `create_monthly_tag_samples_partition` com a identidade do usuário logado. Duas migrations revogam explicitamente a execução dessa função para usuários autenticados (é operação administrativa de particionamento). Resultado: "permission denied for function create_monthly_tag_samples_partition". A permissão está correta; a chamada está no lugar errado.

**3. 3D / WebGL**
O visualizador 3D é montado em dois lugares (`src/routes/digital-twin.tsx` e `src/components/canvases/twin-canvas.tsx`), sem tratamento de perda de contexto gráfico e sem estado de recuperação — abrir/fechar repetidamente esgota contextos e gera "Context Lost". O aviso `THREE.Clock` vem da leitura de `clock` no laço de animação; parte dele é interna da biblioteca (será medida após a correção, sem trocar versão do Three.js).

## O que será feito

**Editor de código**
- Adicionar `monaco-editor` como dependência e configurar o editor para usar os arquivos do próprio build (sem CDN), com os workers de linguagem correspondentes (edição, TypeScript/JavaScript, JSON, CSS, HTML).
- Manter carregamento só no cliente, com estado "Inicializando editor…", estado de erro com botão "Tentar novamente" e isolamento para que uma falha do editor não derrube o Workspace.
- Ajustar os cabeçalhos de segurança em `vercel.json` apenas no necessário (sem liberar CDN externo).

**Workers**
- Criar um gerenciador central (`src/lib/workers/worker-manager.ts`) com estados `idle | initializing | ready | running | error | terminated`, timeout de inicialização, reinício após falha, encerramento correto e prevenção de instâncias duplicadas.
- Migrar `script-sandbox.ts` para esse gerenciador, preservando o comportamento atual (timeout de 250 ms, execução única por vez, reciclagem do worker).

**3D / WebGL**
- Um único ponto de criação do renderizador, com limpeza completa ao desmontar (laço de animação, geometrias, materiais, texturas, controles).
- Tratamento de `webglcontextlost` / `webglcontextrestored`: parar o laço, mostrar estado "Recuperando visualização 3D…" e reconstruir quando o contexto voltar.
- Substituir a leitura de `clock` por tempo acumulado no laço; se o aviso restante for interno da biblioteca, será relatado com a origem exata, sem trocar a versão do Three.js.

**Digital Twin resiliente**
- Separar estado/telemetria/simulação da renderização: estados `loading | ready | degraded | error | recovering`. Falha no 3D deixa o Twin em `degraded`, com simulação e telemetria funcionando.

**Telemetria**
- Fila com lote, retentativas com espera crescente (1 s, 2 s, 4 s) e limite máximo; depois do limite, registra erro visível em métricas (`queuedSamples`, `flushedSamples`, `failedSamples`, `lastFlush`, `lastError`, `retryCount`) sem parar o Digital Twin e sem perder dados em silêncio.
- A garantia da partição mensal passa a ser feita pelo servidor com a identidade administrativa (nunca pela do usuário), e uma falha nela não impede a gravação das amostras. Nenhuma permissão nova é concedida a usuários; nenhuma política de acesso é ampliada.

**Isolamento de falhas**
- Aplicar o componente de isolamento já existente (`src/components/error-boundary.tsx`) em torno de Workspace, Editor, Digital Twin, SCADA, Ladder, Unifilar e Simulação, com mensagem e ação de recuperação por módulo.
- Rever os pontos assíncronos críticos (editor, worker, 3D, banco, telemetria, carregar/salvar projeto) para que erros virem estado de tela, eliminando "Uncaught (in promise)".

## Validação

Depois de cada grupo de mudanças: verificação de tipos, lint e a suíte completa de testes. No fim, build de produção e navegação real no build gerado (não apenas em desenvolvimento) pelas telas Workspace, Digital Twin, SCADA, Ladder, Unifilar e Simulação — abrindo e fechando o editor e o 3D várias vezes, simulando perda de contexto gráfico e falha da telemetria, e conferindo o console limpo dos erros listados.

## Entrega

Relatório final com: causa raiz de cada erro, arquivos alterados, migrations e permissões (com justificativa de cada uma), configuração do editor e dos workers, correções do 3D, testes executados, resultado de build e lint, e riscos remanescentes.
