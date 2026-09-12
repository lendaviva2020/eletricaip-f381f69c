---
status: living-document
owner: equipe
last_review: 2026-09-12
---

# 15 · Decisões e Riscos

## Decisões arquiteturais (ver `docs/adr/` para detalhes)

- **ADR-0001** WebGL (Pixi) substitui ReactFlow no Unifilar — performance com 1000+ nós
- **ADR-0002** Command Pattern em `DiagramStore` — undo/redo + patches IA reversíveis
- **ADR-0003** Isolamento multi-tenant via RLS — `tenant_id` em toda tabela

## Auditoria SECURITY DEFINER (2026-09-12)

As 27 funções `SECURITY DEFINER` do schema `public` foram auditadas via `pg_proc` + `aclexplode` (a consulta em `information_schema.routine_privileges` falha com `42703 security_type` nesta versão do Supabase, então usamos `pg_proc` como fonte de verdade).

- Nenhuma função é executável por `anon` ou `PUBLIC`.
- Das 10 funções executáveis por `authenticated`, 8 são chamadas ativamente pelo client e corretamente gated internamente por `auth.uid()` (o warning do linter de segurança é esperado e aceito para essas 8).
- 2 funções — `increment_ai_tokens(integer)` e `change_tenant_plan(text)` — não são chamadas por nenhum código client hoje. Nesta data seus grants para `authenticated` foram revogados, sem impacto funcional:
  - `increment_ai_tokens(integer)` foi superada por `consume_ai_credits`, que já gerencia custo/quota.
  - `change_tenant_plan(text)` só afeta o tenant do próprio admin que a invoca e não recebe um tenant alvo, portanto hoje não serve para um admin gerenciar o plano de um cliente.
- `accept_invite` foi mantida intacta, reservada para a tarefa `#INV-01` do backlog.

Após a revogação, o warning "Signed-In Users Can Execute SECURITY DEFINER Function" do linter caiu de 9 para 7 issues. O warning remanescente "Leaked Password Protection Disabled" é preexistente e depende de configuração no dashboard do Supabase (#SEC-04).

## Riscos abertos

| ID | Risco | Mitigação | Status |
|---|---|---|---|
| RISK-01 | `new Function(script)` no SCADA permite XSS se script vier do DB | Web Worker sandboxed (#SCADA-02) | 🔴 Alto |
| RISK-02 | Duas fontes de verdade no Unifilar (VoltaiStore + DiagramStore) | Descomissionar VoltaiStore (#WGL-07) | 🟡 Médio |
| RISK-03 | Telemetria do Twin só em memória — perde ao reload | Persistir em `tag_samples` (#TWIN-02) | 🟡 Médio |
| RISK-04 | Leaked Password Protection desabilitado | Ativar no dashboard (#SEC-04) | 🟡 Médio |
| RISK-05 | Webhook signature sem `timingSafeEqual` confirmado | Auditar (#SEC-02) | 🟡 Médio |
| RISK-06 | PLC blocos não conectados ao editor central | Wire (#PLC-01) | 🟡 Médio |
| RISK-07 | Ladder com 6 colunas fixas | Configurável (#LAD-05) | 🟢 Baixo |

## Decisões pendentes (precisa input)

1. **Formato do projeto PLC exportado** — `.plcproj` (Siemens) vs PLCopen XML puro vs IEC 61131-10
2. **Storage de modelos 3D** — bucket Supabase vs CDN externa (R2/Cloudflare)
3. **Stripe vs MercadoPago como primário no Brasil** — atualmente ambos, mas falta política de fallback
