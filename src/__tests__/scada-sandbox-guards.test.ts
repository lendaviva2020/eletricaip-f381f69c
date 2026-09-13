import { describe, it, expect, vi } from "vitest";
import {
  captureTrustedPostMessage,
  neutralizeMessageChannelGlobals,
  MESSAGE_CHANNEL_GLOBALS,
} from "@/lib/simulation/worker-guards";

// jsdom/node não têm um Worker completo, então estes testes validam a lógica
// de neutralização isoladamente, simulando o `self` do worker com um objeto
// simples. O worker real usa exatamente estes helpers na mesma ordem:
// capturar → registrar listener → neutralizar.

function makeFakeSelf() {
  const posted: unknown[] = [];
  const listeners: Record<string, ((ev: unknown) => void)[]> = {};
  const fakeSelf: Record<string, unknown> = {
    postMessage(msg: unknown) {
      posted.push(msg);
    },
    addEventListener(type: string, cb: (ev: unknown) => void) {
      (listeners[type] ||= []).push(cb);
    },
    removeEventListener() {
      /* noop */
    },
  };
  return { fakeSelf, posted, listeners };
}

describe("scada worker message-channel guards", () => {
  it("captura postMessage confiável antes de neutralizar", () => {
    const { fakeSelf, posted } = makeFakeSelf();
    const trusted = captureTrustedPostMessage(fakeSelf);
    expect(trusted).not.toBeNull();

    neutralizeMessageChannelGlobals(fakeSelf);

    trusted!({ reqId: 1, ok: true });
    expect(posted).toEqual([{ reqId: 1, ok: true }]);
  });

  it('script com self["postMessage"](...) falha com TypeError e não forja resposta', () => {
    const { fakeSelf, posted } = makeFakeSelf();
    captureTrustedPostMessage(fakeSelf);
    neutralizeMessageChannelGlobals(fakeSelf);

    // Exatamente o que o script sandboxed veria após a neutralização:
    // acesso por colchetes retorna undefined → TypeError "not a function".
    const script = `self["postMessage"]({ reqId: 999, ok: true, tags: {} })`;
    const fn = new Function("self", `"use strict";\n${script}`);
    expect(() => fn(fakeSelf)).toThrow(TypeError);
    expect(() => fn(fakeSelf)).toThrow(/not a function/);
    expect(posted).toEqual([]); // nenhuma resposta forjada chegou ao host
  });

  it("script com alias indireto (const p = self.postMessage) falha da mesma forma", () => {
    const { fakeSelf, posted } = makeFakeSelf();
    captureTrustedPostMessage(fakeSelf);
    neutralizeMessageChannelGlobals(fakeSelf);

    const script = `const p = self.postMessage; p({ reqId: 999, ok: true })`;
    const fn = new Function("self", `"use strict";\n${script}`);
    expect(() => fn(fakeSelf)).toThrow(TypeError);
    expect(posted).toEqual([]);
  });

  it("script com const p = self.addEventListener; p(...) falha sem persistir listener", () => {
    const { fakeSelf, listeners } = makeFakeSelf();
    captureTrustedPostMessage(fakeSelf);
    neutralizeMessageChannelGlobals(fakeSelf);

    const script = `const p = self.addEventListener; p("message", () => {})`;
    const fn = new Function("self", `"use strict";\n${script}`);
    expect(() => fn(fakeSelf)).toThrow(TypeError);
    expect(listeners["message"] ?? []).toEqual([]); // nada persistiu entre ticks
  });

  it("neutraliza exatamente postMessage/addEventListener/removeEventListener", () => {
    const { fakeSelf } = makeFakeSelf();
    neutralizeMessageChannelGlobals(fakeSelf);
    for (const k of MESSAGE_CHANNEL_GLOBALS) {
      expect(fakeSelf[k]).toBeUndefined();
    }
  });

  it("ignora globais não-configuráveis sem lançar", () => {
    const locked: Record<string, unknown> = {};
    Object.defineProperty(locked, "postMessage", {
      value: vi.fn(),
      writable: false,
      configurable: false,
    });
    expect(() => neutralizeMessageChannelGlobals(locked)).not.toThrow();
  });

  it("captureTrustedPostMessage retorna null quando não há postMessage", () => {
    expect(captureTrustedPostMessage({})).toBeNull();
  });
});
