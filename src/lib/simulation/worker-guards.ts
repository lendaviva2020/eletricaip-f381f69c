// Guardas do canal de mensagens do worker SCADA.
// Neutraliza globais que um script malicioso usaria para sequestrar o canal
// de mensagens (postMessage) ou persistir estado entre requisições
// (addEventListener/removeEventListener). A defesa é sobre a REFERÊNCIA real,
// não sobre o texto do script — cobre self["postMessage"] e aliases indiretos.

export const MESSAGE_CHANNEL_GLOBALS = [
  "postMessage",
  "addEventListener",
  "removeEventListener",
] as const;

/**
 * Captura a referência confiável de postMessage ANTES de neutralizá-la.
 * Deve ser chamada antes de qualquer script rodar e antes de
 * `neutralizeMessageChannelGlobals`.
 */
export function captureTrustedPostMessage(
  host: Record<string, unknown>,
): ((message: unknown) => void) | null {
  const fn = host["postMessage"];
  if (typeof fn !== "function") return null;
  return (fn as (message: unknown) => void).bind(host);
}

/**
 * Neutraliza (define como undefined) os globais do canal de mensagens no host.
 * Só chamar DEPOIS de registrar o único listener confiável e de capturar o
 * postMessage confiável. Propriedades não-configuráveis são ignoradas.
 */
export function neutralizeMessageChannelGlobals(host: Record<string, unknown>): void {
  for (const k of MESSAGE_CHANNEL_GLOBALS) {
    try {
      host[k] = undefined;
    } catch {
      /* noop — global não-configurável */
    }
  }
}
