# Movimentação da Carteira — Plano de Implementação

## Visão Geral

Nova seção no Dashboard Executivo dedicada à inteligência operacional da carteira: o que mudou, quem se moveu no funil, onde a operação está parada. Snapshot semanal + log granular de alterações alimentam comparativos, timeline, fluxo de movimentação e composição por etapa.

## 1. Banco de Dados (migration)

### Tabela `kanban_stage_snapshots`
Foto semanal da composição do kanban. Permite comparar "mesmas imobiliárias ou trocou?".
- `id`, `snapshot_date`, `week_start`, `week_end`
- `agency_id`, `agency_name`, `status`, `consultant_id`, `regional_director`
- `contract_stock`, `c_level_support_needed`, `created_at`
- Índices: `(week_start)`, `(status, week_start)`, `(agency_id, week_start)`
- RLS: leitura para admin/manager/consultant (mesma regra do dashboard atual)

### Tabela `agency_change_log`
Log granular de toda alteração de campo.
- `id`, `agency_id`, `agency_name`
- `field_name`, `old_value` (text), `new_value` (text)
- `previous_status`, `new_status`, `is_stage_change` (bool)
- `change_source` (`slack` | `manual` | `import` | `bot`)
- `changed_by` (uuid), `changed_by_name`, `slack_user_id`, `consultant_id`
- `changed_at`
- Índices: `(changed_at desc)`, `(agency_id, changed_at)`, `(is_stage_change, changed_at)`

### Trigger de captura automática
Trigger `BEFORE UPDATE` em `real_estate_agencies`:
- Comparar OLD vs NEW para os campos relevantes (`negotiation_status`, `contract_stock`, `next_steps`, `feedback`, `current_offer`, `c_level_support_needed`, `main_contact`, `consultant_id`, `guarantor_type`, `current_guarantor`, `regional_director`).
- Gravar uma linha em `agency_change_log` por campo alterado.
- Se `negotiation_status` mudou → `is_stage_change = true` + `previous_status`/`new_status`.
- Origem: ler de `current_setting('app.change_source', true)` (default `manual`). Slack/import setam esse GUC antes do update; web usa default.

### Função de snapshot
`public.generate_kanban_snapshot()` — insere foto atual de todas as agências para a semana corrente (idempotente por `(agency_id, week_start)`).

### Cron semanal
`pg_cron` toda segunda 08:00 (America/Sao_Paulo) chamando `generate_kanban_snapshot()`. SQL via insert tool (não migration).

## 2. Server Functions

`src/lib/movement.functions.ts`:
- `getMovementOverview({ from, to, filters })` → cards (atualizadas, mudanças de etapa, novas, sem update 15+, etapas ganho/perda).
- `getRecentUpdates({ filters, limit })` → linhas de `agency_change_log` com join em consultor/agência.
- `getStageMovements({ filters })` → apenas `is_stage_change = true` + cálculo de tempo na etapa anterior.
- `getWeeklyStageComparison()` → atual vs snapshot semana passada por etapa (entraram/saíram/permaneceram).
- `getStageComposition(status)` → listas: permaneceram, entraram, saíram (vs snapshot anterior).
- `getStageFlow()` → arestas A→B com contagem (últimos 7d) para Sankey.
- `getStageAging()` → tempo médio em cada etapa hoje.

Todas com `requireSupabaseAuth`; filtros zod-validados.

## 3. Integração das origens (change_source)

- **Slack flows** (`src/lib/slack/flows.server.ts`): antes de cada update em `real_estate_agencies`, executar `SELECT set_config('app.change_source', 'slack', true)` na mesma transação (usar `supabaseAdmin.rpc` helper).
- **Import** (`src/routes/_authenticated/import.tsx`): mesmo padrão com `'import'`.
- **Manual web**: default do trigger já é `manual`, nada a fazer.

Helper utilitário `setChangeSource(client, source)` em `src/lib/audit.server.ts`.

## 4. UI — Rota `/dashboard/movement`

Nova rota `src/routes/_authenticated/dashboard.movement.tsx` (e link no dashboard atual + sidebar).

### Layout (dark premium, tokens semânticos)
- **Header**: "Movimentação da Carteira" + subtítulo + barra de filtros (período, consultor, regional, UF, etapa, origem, C-Level, estoque mínimo).
- **Linha 1 — Cards** (6 cards): atualizadas/semana, mudanças de etapa, novas, sem update 15+d, etapas ganho, etapas perda.
- **Linha 2 — Comparativo Semanal por Etapa**: tabela com Atual / Semana passada / Δ abs / Δ % / Entraram / Saíram / Permaneceram. Clique na linha → drawer com composição.
- **Linha 3 (2 colunas)**:
  - **Fluxo de Movimentação** (Sankey simplificado com SVG custom — sem nova dep; arestas A→B agrupadas).
  - **Aging por etapa** (barras horizontais com tempo médio).
- **Linha 4 — Timeline**: feed cronológico das últimas alterações (avatar consultor, agência, "Status X→Y" / "Estoque 104→130", origem badge).
- **Linha 5 — Tabelas**:
  - Aba "Atualizações recentes" (todos os campos)
  - Aba "Movimentações de Kanban" (apenas stage changes + tempo na etapa anterior)
- **Drawer composição da etapa**: 4 listas (permaneceram, entraram, saíram, novas no sistema nessa etapa).

### Componentes novos
- `MovementCard` (variação do `StatCard` com delta).
- `SankeyFlow` (SVG puro, ~150 LOC).
- `StageComparisonTable`.
- `ChangeTimeline`.
- `StageCompositionDrawer`.

## 5. Snapshot inicial

Gerar snapshot da semana atual no momento da migração (assim já há baseline para "semana passada" depois) — chamada da função de snapshot inserida via insert tool após a migration.

## Arquivos

**Migrations:**
- `kanban_stage_snapshots` + `agency_change_log` + trigger + função snapshot + RLS + grants.

**Insert tool (pós-migration):**
- Agendar cron semanal.
- Gerar snapshot inicial.

**Backend:**
- `src/lib/audit.server.ts` — helper `setChangeSource`.
- `src/lib/movement.functions.ts` — todas as server fns.
- Editar `src/lib/slack/flows.server.ts` para chamar `setChangeSource('slack')` antes de updates.
- Editar `src/routes/_authenticated/import.tsx` para `setChangeSource('import')`.

**Frontend:**
- `src/routes/_authenticated/dashboard.movement.tsx` (rota principal).
- `src/components/movement/` — `MovementCard.tsx`, `SankeyFlow.tsx`, `StageComparisonTable.tsx`, `ChangeTimeline.tsx`, `StageCompositionDrawer.tsx`, `MovementFilters.tsx`.
- Link no `src/routes/_authenticated/dashboard.tsx` e na sidebar (`src/routes/_authenticated/route.tsx`).

## Notas técnicas

- Sem novas dependências (Sankey em SVG puro).
- `old_value`/`new_value` armazenados como `text` (cast genérico) — UI formata por tipo de campo.
- `week_start` calculado como segunda-feira (`date_trunc('week', date)` no Postgres já retorna segunda).
- Trigger ignora updates onde somente `updated_at`/`updated_by` mudaram.
- Filtros respeitam RLS naturalmente (queries vão pelo client autenticado).
