## O que vou construir

### 1. Nova aba "E-mails → Monitoramento" no admin
Painel restrito a administradores com:
- **Cards de resumo** (total de e-mails únicos, enviados, falhas, suprimidos) para o período filtrado
- **Filtros**: período (24h / 7d / 30d / customizado), template, status (enviado, falha, suprimido)
- **Tabela paginada** com Template / Destinatário / Status (badge colorido) / Data / Erro
- **Lista de e-mails suprimidos** (bounces/reclamações) com motivo
- Todas as queries deduplicam por `message_id` (regra do guia oficial)

### 2. Nova aba "E-mails → Configuração de envio"
- **Parâmetros do cron** (tabela `email_send_state`):
  - Tamanho do lote (`batch_size`)
  - Delay entre envios em ms (`send_delay_ms`)
  - TTL para e-mails de auth (min)
  - TTL para e-mails da aplicação (min)
- **Templates ativos**: lista os templates registrados e permite ligar/desligar cada um (nova tabela `email_template_settings`).

### 3. Nova aba "E-mails → Notificações do Kanban"
- Para cada etapa do Kanban (`kanban_stages`):
  - Ligar/desligar notificação por e-mail quando uma imobiliária entra na etapa
  - Escolher destinatários: consultor da imobiliária, diretor regional, admins, e/ou e-mails extras
  - Escolher o template a usar
- Armazenado em nova tabela `kanban_stage_notifications`.

### 4. Controle por imobiliária
- Nova coluna `notify_consultant_on_change boolean default true` em `real_estate_agencies`
- Toggle no formulário de detalhes da imobiliária (`portfolio.$agencyId.tsx`) para desativar avisos ao consultor naquela conta específica.

### 5. Disparo automático
- Trigger SQL `notify_stage_change_email` em `real_estate_agencies` que, quando `negotiation_status` muda:
  - Lê a configuração da nova etapa em `kanban_stage_notifications`
  - Respeita o flag `notify_consultant_on_change` da imobiliária
  - Insere mensagens na fila `transactional_emails` via `enqueue_email(...)`
- Novo template `kanban-stage-change` em `src/lib/email-templates/` com dados da imobiliária, etapa anterior, nova etapa e quem moveu.

### 6. Correções rápidas (silenciosas)
- Instalar `@react-email/components` e `@react-email/render` (faltando — causando os 500 atuais no preview).

## Detalhes técnicos

**Novas tabelas (migration)**
- `email_template_settings(template_name text PK, enabled boolean, updated_at)`
- `kanban_stage_notifications(stage_key text PK, enabled boolean, template_name text, notify_consultant boolean, notify_regional_director boolean, notify_admins boolean, extra_emails text[], updated_at)`
- Coluna `real_estate_agencies.notify_consultant_on_change boolean default true`
- GRANTs + RLS: admins gerenciam; service_role total
- Trigger PL/pgSQL que monta o payload e chama `enqueue_email('transactional_emails', payload)` para cada destinatário resolvido

**Frontend**
- Estendo `src/routes/_authenticated/admin.tsx` com 3 novas abas (Monitoramento, Configuração, Notificações Kanban)
- Componentes em `src/components/admin/email-*.tsx` para manter o arquivo enxuto
- Toggle por imobiliária integrado na página de detalhes

**Segurança**: toda nova tabela tem RLS com `has_role(auth.uid(), 'admin')` para escrita; leitura também restrita a admins. Dashboard usa `email_send_log` via service-role server function (já há infraestrutura).

## Fora do escopo
- Notificações por WhatsApp/Slack (já existem fluxos separados)
- Edição visual de templates (apenas liga/desliga e seleção)