## Escopo

Mudanças grandes em 3 áreas (Importação, Carteira/Kanban) + 2 novas abas (Painel Administrativo, Comunicação). Vou dividir em fases para entregar com qualidade.

---

### Fase 1 — Importação de Clientes (rápido)

1. **Limpeza de linhas vazias**: no parser, descartar linhas onde todas as células relevantes estão vazias (ou apenas whitespace). Aplicar antes do mapeamento.
2. **Imóvel comercial → subtipo "Casa"**: na normalização, quando `tipo_imovel === "Comercial"`, forçar `subtipo_imovel = "Casa"` independente do valor de entrada (ex.: "Ponto comercial" deixa de quebrar).

Arquivos: `src/lib/client-import/heuristics.ts`, `src/lib/client-import/exporter.ts`, `src/routes/_authenticated/import-clients.tsx`.

---

### Fase 2 — Kanban da Carteira

1. **Drag em todo o card**: remover handle restrito aos 6 pontos; aplicar `{...listeners} {...attributes}` no container do card inteiro. Manter clique em botões/links sem disparar drag (usar `pointer-events` ou stopPropagation nos botões internos).
2. **Novo status "Em precificação"**: adicionar ao enum `negotiation_status` no banco, logo após "Base recebida" (ou equivalente), e à lista de colunas do kanban no front.
3. **Kanban customizável** (reordenar/criar/excluir status):
   - Nova tabela `kanban_stages` (id, key, label, order, sla_days, color, is_system, created_at, updated_at).
   - Seed com os status atuais (incluindo "Em precificação").
   - Kanban passa a ler colunas dessa tabela em vez do enum hardcoded.
   - Ao criar/excluir status pelo kanban, gerar um alerta em `mission_control_alerts` (nova tabela) com tipo `kanban_stage_change_requires_forms_update`, que o usuário marca como concluído.
4. **SLA por etapa**: campo `sla_days` em `kanban_stages`; badge no card mostra dias restantes/atrasados conforme o SLA da etapa atual (usa `updated_at` ou data de entrada na etapa — vou usar `last_stage_change_at`, novo campo em `real_estate_agencies`, alimentado via trigger quando `negotiation_status` muda).

Arquivos: migration; `src/components/kanban/*`; `src/routes/_authenticated/portfolio.tsx`; novos hooks `useKanbanStages`, `useMissionControlAlerts`.

---

### Fase 3 — Painel Administrativo (nova aba lateral)

Rota: `/_authenticated/admin`. Acesso: apenas role `admin` (já existe `has_role`).

Seções iniciais (UI dinâmica para parâmetros):
- **Status do Kanban**: tabela editável de `kanban_stages` (reordenar via drag, editar label/cor/SLA, criar/excluir).
- **SLAs**: visão consolidada (mesma fonte que kanban_stages).
- **Campos customizáveis**: placeholder por ora (form simples para futura expansão), com nota de evolução.

Sidebar: adicionar item "Painel Administrativo" visível apenas para admins.

---

### Fase 4 — Comunicação (nova aba lateral)

Rota: `/_authenticated/communication`.

- Nova tabela `message_templates` (id, channel `whatsapp|email`, name, subject, body com variáveis tipo `{{agency_name}}`, trigger `manual|sla_overdue|...`, active).
- CRUD de templates na UI com preview e lista de variáveis disponíveis.
- Disparo automático: server function `evaluate-sla-alerts` (chamada por cron diário) que detecta agências com SLA estourado e:
  - cria notificação no mission control para o consultor responsável,
  - envia WhatsApp (via Twilio gateway, se configurado) e/ou e-mail (via infra de app emails) usando o template marcado como `sla_overdue` ativo.
- Disparo manual: botão "Enviar mensagem" no card da agência abre modal com escolha de template + canal.

Item de sidebar "Comunicação" para todos os usuários autenticados (criação/edição de templates apenas para admin).

---

## Detalhes técnicos resumidos

- **Migrations**: enum update; novas tabelas `kanban_stages`, `mission_control_alerts`, `message_templates`; coluna `last_stage_change_at` + trigger em `real_estate_agencies`. Todos com GRANT + RLS.
- **Drag-and-drop**: dnd-kit já está no projeto; mover listeners para o wrapper do card.
- **Cron SLA**: novo endpoint `/api/public/cron/sla-evaluator` protegido por `SLACK_CRON_SECRET` (reaproveitar padrão), agendado via pg_cron.
- **Telemetria**: cada criação/exclusão de stage grava em `agency_audit_events` para histórico.

---

## Pergunta antes de implementar

Posso seguir essa divisão e implementar tudo nesta resposta? Ou prefere que eu entregue em fases (sugiro fase 1+2 agora, fase 3+4 numa próxima rodada) para validar cada etapa antes?