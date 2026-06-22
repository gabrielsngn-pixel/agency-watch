## Objetivo

Criar uma rota pública `/registro` (fora do `_authenticated`) com a mesma lógica do Google Forms, alimentando o CRM em tempo real, sem necessidade de ajustar Forms a cada nova etapa/imobiliária.

## Fluxos (na ordem de destaque na UI)

1. **Anexar base de clientes** (imobiliária existente) — fluxo principal
2. **Cadastrar nova imobiliária** (+ anexar base opcional na sequência)
3. **Registrar atividade / FUP** (ligação, WhatsApp, reunião, visita, e-mail, proposta etc.)
4. **Mover etapa do Kanban** (com etapa anterior → nova, lista carregada do banco)

## Acesso

- URL pública: `/registro` (sem layout `_authenticated`, sem item de menu no CRM).
- Identificação: campo "E-mail do consultor" com autocomplete contra `consultants.email`. Se o e-mail não existir na base, bloqueia o envio com mensagem "Consultor não cadastrado — fale com o admin".
- Nenhum dado sensível exposto: a página só lista nomes de imobiliárias + etapas do Kanban (nada de financeiro, notas internas, etc.).

## Carregamento dinâmico (resolve a dor)

- **Imobiliárias**: autocomplete buscando `real_estate_agencies` em tempo real (nome, cidade, UF) via server fn pública read-only. Resultado: nova imobiliária cadastrada já aparece no próximo registro, sem ajustar Forms.
- **Etapas Kanban**: select alimentado por `kanban_stages` em tempo real. Nova etapa criada/renomeada/removida no admin já reflete aqui.
- **Tipos de atividade**: lista estática mantida em `src/lib/constants.ts` (igual ao CRM).

## Gravação no CRM

Cada submissão passa por uma server route pública `POST /api/public/registro/submit` que:

- Valida payload com Zod (e-mail consultor, tipo de fluxo, campos obrigatórios por fluxo).
- Resolve o consultor (`consultants.email` → id) e a imobiliária (id existente ou cria nova).
- Insere em `agency_activities` reaproveitando triggers já existentes (`apply_agency_activity`, `audit_agency_activity`, `create_client_base_upload_from_activity`, `notify_stage_change_email`).
- Para "anexar base": faz upload no bucket `agency-files` e seta `attachment_url` + `activity_type='client_base_received'`, disparando a criação automática em `client_base_uploads`.
- Para "mover etapa": registra atividade com `status_changed=true` + `new_status` (a trigger faz o resto).
- `source='public_form'` em todos os registros (novo valor — diferencia de `manual`, `google_forms`, `whatsapp`, `slack`).

## Segurança

- Rota sob `/api/public/*` (bypass auth do edge), porém com:
  - Validação Zod estrita;
  - Rate limit simples por IP (janela 1 min) em memória do worker;
  - Upload com limite de tamanho e tipos (xlsx, csv, pdf, jpg, png);
  - Não retorna dados de outras imobiliárias além das necessárias ao autocomplete (nome/cidade/UF);
  - Policies `TO anon` apenas em `real_estate_agencies` (nome/cidade/uf) e `kanban_stages` — projeção restrita via server fn publishable-key, sem expor colunas sensíveis.
- Nada de service-role no client. Server route usa `supabaseAdmin` apenas no handler para escrita.

## UI/UX

- Página single-page, identidade visual coerente com o CRM mas standalone (sem sidebar/menu).
- Topo: campo e-mail do consultor (persiste em localStorage para não digitar de novo).
- Tabs grandes/cards: "Anexar base", "Nova imobiliária", "Atividade/FUP", "Mover etapa".
- Confirmação visual após envio + botão "Registrar outro".
- Mobile-first (consultores em campo).

## Detalhes técnicos

- Novo arquivo `src/routes/registro.tsx` (route pública SSR, sem auth gate).
- `src/routes/api/public/registro/submit.ts` — server route POST.
- `src/routes/api/public/registro/lookup.ts` — GET com `?type=agencies|stages|consultants&q=...` para autocomplete.
- `src/lib/public-registro/schema.ts` — Zod schemas compartilhados.
- Migration: adicionar policies `TO anon SELECT` em colunas seguras de `real_estate_agencies` (id, name, city, state), `kanban_stages` (stage_key, label, position, color), `consultants` (id, name, email) — todas restritas via views ou colunas explícitas no select. Adicionar `'public_form'` ao tipo `source` se for enum.
- Sem mudança nos triggers existentes (reaproveita todo o fluxo).

## Fora de escopo

- Login/magic link.
- Listagem/edição de registros pela página pública (write-only).
- Substituição imediata do Google Forms — coexistem; o Forms pode ser desativado depois.
