/**
 * Valida que um destino de redirect pós-login é um caminho relativo seguro
 * — nunca uma URL absoluta ou protocol-relative (`//host/...`), que o
 * browser trataria como navegação cross-origin em window.location.assign.
 * Isomorfo (sem depender de `window`) para funcionar em validateSearch,
 * que também roda durante SSR.
 */
export function isSafeRedirect(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/")) return false;
  // Bloqueia "//evil.com" (protocol-relative) e "/\\evil.com" (alguns
  // parsers de URL tratam barra invertida como equivalente a "/").
  if (/^\/[\\/]/.test(path)) return false;
  return true;
}
