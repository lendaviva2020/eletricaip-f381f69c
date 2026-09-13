// Monaco self-hosted setup.
//
// CAUSA RAIZ CORRIGIDA AQUI: `@monaco-editor/react` por padrão carrega o Monaco
// de um CDN externo (jsDelivr) via loader AMD. O CSP da aplicação (vercel.json)
// só permite scripts de 'self', então o CDN era bloqueado e o Monaco caía em
// `importScripts("blob:...")` apontando para o CDN — gerando os erros
// "Monaco initialization: error", "Failed to execute 'importScripts'" e
// "worker module init function failed to rehydrate".
//
// Aqui o Monaco vem do próprio bundle e cada linguagem recebe o worker correto,
// empacotado pelo Vite (`?worker` → módulo same-origin com URL estável).
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

export type MonacoApi = typeof monaco;

interface MonacoEnvironmentLike {
  getWorker: (moduleId: string, label: string) => Worker;
}

function createWorker(label: string): Worker {
  switch (label) {
    case "json":
      return new JsonWorker();
    case "css":
    case "scss":
    case "less":
      return new CssWorker();
    case "html":
    case "handlebars":
    case "razor":
      return new HtmlWorker();
    case "typescript":
    case "javascript":
      return new TsWorker();
    default:
      return new EditorWorker();
  }
}

let initPromise: Promise<MonacoApi> | null = null;

/**
 * Inicializa o Monaco no cliente (idempotente). Rejeita no servidor.
 * Em caso de falha, o estado é limpo para permitir "Tentar novamente".
 */
export function ensureMonaco(): Promise<MonacoApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("monaco_requires_browser"));
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const globalScope = window as unknown as { MonacoEnvironment?: MonacoEnvironmentLike };
    globalScope.MonacoEnvironment = {
      getWorker: (_moduleId: string, label: string) => createWorker(label),
    };

    // Usa a instância empacotada; nunca busca o loader remoto.
    loader.config({ monaco });
    await loader.init();
    return monaco;
  })().catch((err: unknown) => {
    initPromise = null;
    throw err instanceof Error ? err : new Error(String(err));
  });

  return initPromise;
}

/** Limpa o cache de inicialização para uma nova tentativa após erro. */
export function resetMonaco(): void {
  initPromise = null;
}
