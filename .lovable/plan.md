## Melhorias solicitadas

### 1. CNPJ no cadastro de nova imobiliária (`/registro`)
- Adicionar campo `cnpj` (opcional, máscara `00.000.000/0000-00`, validação básica de 14 dígitos) no formulário `new_agency` em `src/routes/registro.tsx`.
- Incluir `cnpj` no schema Zod e no insert de `real_estate_agencies` em `src/routes/api/public/registro.submit.ts`.
- Migration: `ALTER TABLE public.real_estate_agencies ADD COLUMN cnpj text` (sem unique para não quebrar dados existentes; index parcial para consulta).

### 2. Mission Control — cards clicáveis com drill-down
- Em `src/routes/_authenticated/dashboard.tsx` (ou componente equivalente do Mission Control de gestão de atividades), transformar cada card de métrica em botão/`Dialog`.
- Ao clicar: abrir um modal listando as imobiliárias que compõem aquele indicador (ex.: "13 imobiliárias sem atividade há 15 dias") com nome, consultor, dias sem interação e link para `/portfolio/$agencyId`.
- Dados vêm da mesma query que já alimenta o card; expor a lista bruta no estado do componente.

### 3. Três repositórios de anexo no card da imobiliária (carteira)
- Em `src/components/agency-files.tsx` (e/ou `agency-activity.tsx`) separar os anexos por categoria:
  - **Base importada** (arquivo bruto enviado pela imobiliária)
  - **Base tratada** (arquivo após higienização)
  - **Resultado da base** (planilha/relatório final)
- Migration: adicionar coluna `category` (enum/text com check) em `public.agency_files` com default `imported`; backfill dos registros existentes como `imported`.
- UI: três seções/tabs dentro do card, cada uma com seu próprio botão "Anexar arquivo" gravando a categoria correta.

### 4. Regras de negócio em "Importar clientes"
Arquivo: `src/lib/client-import/heuristics.ts` + `src/routes/_authenticated/import-clients.tsx` (ou wizard correspondente).
- Após o parse, validar cada linha:
  - `tipo_imovel` ∈ {`residencial`, `comercial`}. Se diferente → marcar linha como "precisa ajuste" e oferecer dropdown na UI antes da exportação.
  - Se `tipo_imovel = comercial` → `subtipo` deve ser `casa`. Caso contrário, oferecer alteração para `casa`.
  - Se `tipo_imovel = residencial` → `subtipo` ∈ {`casa`, `apartamento`, `chácara`}. Caso contrário, oferecer alteração para uma dessas opções.
- Bloquear o botão "Exportar" enquanto existirem linhas pendentes de ajuste; mostrar contador "X linhas precisam de revisão".

---

## Ordem de execução
1. Migrations (CNPJ + categoria de arquivos) — uma única chamada de migração.
2. Após aprovação, atualizar backend (`registro.submit.ts`, server fns de upload de arquivo).
3. UI: `/registro`, Mission Control, carteira (anexos), import-clients.

## Pontos a confirmar
- **CNPJ**: obrigatório ou opcional? (proponho **opcional** para não bloquear cadastros rápidos)
- **Categorias de anexo**: nomes exatos que devem aparecer na UI? (proponho "Base importada", "Base tratada", "Resultado")
- **Mission Control**: quais cards exatamente devem virar clicáveis? (proponho **todos** os cards de contagem de imobiliárias)
- **Import-clients**: posso assumir os valores canônicos em minúsculas sem acento (`residencial`, `comercial`, `casa`, `apartamento`, `chacara`)?
