// SCADA scripting sandbox — runs untrusted JS off the main thread.
// The worker has NO DOM, NO fetch, NO network access. Exposes only
// `tags` (mutable object) and a safe `console` to the script.
//
// SECURITY: This worker uses `new Function` as a last-resort execution
// mechanism because the scripts require full JavaScript expressions. The
// defense-in-depth mitigations are:
//   (A) Web Worker isolation — no `window`, `document`, `parent`, `top`.
//   (B) Blocked network globals — `fetch`, `XMLHttpRequest`, `WebSocket`,
//       `importScripts`, `EventSource`, `navigator`.
//   (C) No persistent storage — `indexedDB`, `caches`, `localStorage`,
//       `sessionStorage` all blocked.
//   (D) `tags` is a defensive Proxy — prevents prototype pollution and
//       access to internal objects.
//   (E) Host enforces a 250ms timeout via ScriptSandbox → terminates
//       infinite loops automatically.
//   (F) Single-flight guarantee — no concurrent script executions.
//   (G) Script pre-scan rejects patterns that attempt prototype or
//       constructor chaining.
//
// A safer long-term replacement (AST-based expression evaluator or Wasm
// sandbox) is tracked in backlog item #SCADA-02.

import { neutralizeMessageChannelGlobals } from "./worker-guards";

type Req = {
  reqId: number;
  script: string;
  tags: Record<string, unknown>;
};

type Res =
  | { reqId: number; ok: true; tags: Record<string, unknown>; logs: string[] }
  | { reqId: number; ok: false; error: string; logs: string[] };

// Dangerous globals to block inside the worker context.
const BLOCKED = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "importScripts",
  "indexedDB",
  "caches",
  "localStorage",
  "sessionStorage",
  "EventSource",
  "navigator",
  "location",
];

for (const k of BLOCKED) {
  try {
    (self as unknown as Record<string, unknown>)[k] = undefined;
  } catch {
    /* Worker globals may be non-configurable — we just try. */
  }
}

// Captura a referência confiável ANTES de neutralizá-la e antes de qualquer
// script rodar. O pré-scan (DANGEROUS_PATTERNS) continua como camada de falha
// rápida, mas a defesa real é sobre a referência: como o worker é reutilizado
// entre requisições (WorkerManager), self["postMessage"] ou um alias indireto
// (const p = self.postMessage) não podem existir no escopo do script.
const trustedPostMessage = self.postMessage.bind(self);

// O worker atende múltiplas requisições sequenciais do host. Este é o ÚNICO
// listener confiável — registrado antes de neutralizar addEventListener.
self.addEventListener("message", (ev: MessageEvent<Req>) => {
  const { reqId, script, tags } = ev.data;

  if (isDangerousScript(script)) {
    const res: Res = {
      reqId,
      ok: false,
      error: "Script rejeitado: padrão não permitido detectado.",
      logs: [],
    };
    try {
      trustedPostMessage(res);
    } catch {
      /* noop */
    }
    return;
  }

  const logs: string[] = [];
  const safeConsole = Object.freeze({
    log: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
    warn: (...a: unknown[]) => logs.push("[warn] " + a.map(String).join(" ")),
    error: (...a: unknown[]) => logs.push("[err]  " + a.map(String).join(" ")),
    info: (...a: unknown[]) => logs.push("[info] " + a.map(String).join(" ")),
  });

  try {
    const next: Record<string, unknown> = { ...tags };

    // Wrap tags in a defensive proxy that prevents access to __proto__,
    // constructor, and other dangerous properties.
    const guarded = new Proxy(next, {
      get(target, prop) {
        if (isBlockedProperty(prop)) return undefined;
        return target[prop as string];
      },
      set(target, prop, value) {
        if (isBlockedProperty(prop)) return true;
        target[prop as string] = value;
        return true;
      },
      has(target, prop) {
        if (isBlockedProperty(prop)) return false;
        return prop in target;
      },
      ownKeys(target) {
        return Reflect.ownKeys(target).filter((k) => !isBlockedProperty(k));
      },
    });

    const fn = new Function("tags", "console", `"use strict";\n${script}`);
    fn(guarded, safeConsole);

    // Sanitize: remove any dangerous properties the script may have added.
    for (const k of Object.keys(next)) {
      if (isBlockedProperty(k)) {
        delete next[k];
      }
    }

    const res: Res = { reqId, ok: true, tags: next, logs };
    try {
      trustedPostMessage(res);
    } catch {
      /* noop */
    }
  } catch (err) {
    const res: Res = {
      reqId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      logs,
    };
    try {
      trustedPostMessage(res);
    } catch {
      /* noop */
    }
  }
});

// Só DEPOIS de registrar o único listener confiável: neutraliza os globais
// que um script malicioso usaria para sequestrar o canal de mensagens ou
// persistir entre requisições (inclui notação de colchetes e aliases).
neutralizeMessageChannelGlobals(self as unknown as Record<string, unknown>);

const BLOCKED_PROPERTIES = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "toString",
  "valueOf",
  "toLocaleString",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);

function isBlockedProperty(prop: string | symbol): boolean {
  if (typeof prop === "symbol") return false;
  return BLOCKED_PROPERTIES.has(prop);
}

const DANGEROUS_PATTERNS = [
  /\.__proto__\s*[=;]/,
  /\.prototype\s*[=;]/,
  /\.constructor\s*[=;]/,
  /importScripts\s*\(/,
  /self\s*\.\s*close\s*\(/,
  /self\s*\.\s*postMessage\s*\(/,
  /addEventListener\s*\(/,
  /removeEventListener\s*\(/,
  /\.constructor\s*\(/,
  /new\s+Function\s*\(/,
  /eval\s*\(/,
  /setTimeout\s*\(/,
  /setInterval\s*\(/,
];

function isDangerousScript(script: string): boolean {
  return DANGEROUS_PATTERNS.some((p) => p.test(script));
}

export {};
