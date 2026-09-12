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
