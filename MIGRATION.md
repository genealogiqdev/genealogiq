# Genealogiq — Runbook de migração para monorepo

Guia passo a passo para consolidar `genealogiq-bms`, `genealogiq-seq` e `genealogiq-app` num único monorepo (pnpm + Turborepo), **preservando o histórico git** e mantendo os três deploys/domínios independentes na Vercel.

> Referência da decisão: `../ADR-0001-monorepo-consolidation.md`. Faseamento do menor para o maior risco. **Não execute a Fase 4 (schema único) antes de a Fase 2 ter testes.**

---

## Status de execução

- ✅ **Fase 1a** (esqueleto) — pronto.
- ✅ **Fase 1b** (import + workspace-ize) — **executado e validado localmente** neste diretório (`monorepo/` já é um repo git com 344 commits). Detalhes:
  - `git init` + 3× `git subtree add` a partir dos **repos locais** (não dos URLs do GitHub, pois o sandbox não tinha credenciais) — histórico preservado, e já inclui os commits de correção de segurança/P1 ainda não empurrados.
  - Pacotes renomeados para `@genealogiq/{bms,seq,app}` (o SEQ tinha typo `genealogic-seq`), scripts `typecheck`/`db:generate` adicionados, `.github` e `package-lock.json` por app removidos, CI raiz pnpm+turbo adicionada.
  - `pnpm install` (1 lockfile), `pnpm db:generate` e **`pnpm typecheck` passam 0 erros nos 3** (6/6 tasks do Turbo).
  - **Achado:** o pnpm (estrito) expôs **deps fantasma** herdadas do npm (ex.: `@radix-ui/react-avatar` importado sem ser declarado — só `radix-ui` está no `package.json`). Desbloqueado com `.npmrc` `shamefully-hoist=true` (transitório). _Follow-up:_ declarar as deps reais e remover o flag.
- ⏭️ **Resta a você** (precisa de credencial/painel): criar o repo vazio `bahiensed/genealogiq` no GitHub, `git remote add origin …` + `git push -u origin main`, e a **Fase 1c (Vercel)** abaixo.

> Nota: o `monorepo/` vive dentro de `Projects/genealogiq/` só para revisão; mova-o para onde quiser. Os 3 repos originais continuam intactos ao lado. O `node_modules/` instalado é grande e ignorado pelo git — pode apagar (`rm -rf monorepo/node_modules`) e reinstalar com `pnpm install` quando precisar.

---

## Estado atual deste esqueleto (Fase 1a — pronto)

```
monorepo/
├── package.json            # raiz privada, scripts via turbo
├── pnpm-workspace.yaml     # apps/* e packages/*
├── turbo.json              # pipeline build/dev/lint/typecheck/db:generate
├── tsconfig.base.json      # base estrita compartilhada (apps fazem extends)
├── .gitignore
├── apps/                   # (vazio — recebe bms/seq/app na Fase 1b)
├── packages/               # (vazio — recebe core/db/ui nas Fases 2–4)
└── scripts/
    └── check-schema-parity.mjs   # detector de drift entre as 3 schemas
```

Os apps **ainda não foram movidos**. Nada nos repos atuais foi alterado.

---

## Fase 1b — Inicializar o repo e importar os 3 apps com histórico

Pré-requisitos: `pnpm` instalado (`npm i -g pnpm`), `git` recente.

### 1. Criar o repo monorepo a partir deste esqueleto

```bash
# a partir de Projects/genealogiq/monorepo
git init
git add .
git commit -m "chore: monorepo skeleton (pnpm + turborepo)"
# crie o repo vazio no GitHub (ex.: bahiensed/genealogiq) e:
git remote add origin git@github.com:bahiensed/genealogiq.git
```

### 2. Importar cada app preservando histórico (git subtree)

`git subtree` não exige ferramenta extra e mantém todo o histórico de cada app sob `apps/<nome>`.

```bash
git subtree add --prefix=apps/bms https://github.com/bahiensed/genealogiq-bms.git main
git subtree add --prefix=apps/seq https://github.com/bahiensed/genealogiq-seq.git main
git subtree add --prefix=apps/app https://github.com/bahiensed/genealogiq-app.git main
```

> Alternativa (histórico mais limpo, exige `git-filter-repo`): clonar cada repo, rodar
> `git filter-repo --to-subdirectory-filter apps/<nome>` e dar `git merge --allow-unrelated-histories`.
> Use subtree salvo se você já usa filter-repo.

### 3. Renomear pacotes e apontar workspace

Em cada `apps/<nome>/package.json`, troque o `name` para um identificador de workspace:

```jsonc
// apps/bms/package.json
{ "name": "@genealogiq/bms", /* ... */ }
// apps/seq/package.json  → "@genealogiq/seq"
// apps/app/package.json  → "@genealogiq/app"
```

Cada app precisa expor os scripts que o Turbo orquestra (`build`, `dev`, `lint`,
`typecheck`, `db:generate`). Os apps já têm `build`/`dev`/`lint`; adicione:

```jsonc
"scripts": {
  "typecheck": "tsc --noEmit",
  "db:generate": "prisma generate"
}
```

### 4. Lockfile único e primeira instalação

```bash
# remova os package-lock.json antigos de cada app (passamos de npm → pnpm)
rm -f apps/*/package-lock.json
pnpm install            # gera um pnpm-lock.yaml único na raiz
pnpm db:generate        # gera os clients Prisma dos 3 apps
pnpm typecheck          # gate: deve passar 0 erros nos 3 (já validado hoje)
```

> Cada app continua com seu próprio `prisma/schema.prisma` nesta fase — o
> `scripts/check-schema-parity.mjs` segue valendo. Schema único é a Fase 4.

### 5. CI do monorepo

Adicione `.github/workflows/ci.yml` (versão pnpm+turbo) — ver apêndice no fim deste arquivo.

---

## Fase 1c — Reconfigurar a Vercel (3 projetos, 1 repo)

Cada um dos 3 projetos Vercel existentes passa a apontar para o **mesmo** repo
`genealogiq`, diferenciando pelo **Root Directory**:

| Projeto Vercel | Root Directory | Domínio (inalterado) |
|----------------|----------------|----------------------|
| genealogiq-bms | `apps/bms`     | bms.genealogiq.app   |
| genealogiq-seq | `apps/seq`     | sequoia.rip          |
| genealogiq-app | `apps/app`     | genealogiq.app       |

Por projeto, em **Settings → General**:
- **Root Directory:** `apps/<nome>` e marque **"Include files outside the root directory in the build"** (o build precisa do workspace/pnpm-lock da raiz).
- **Install Command:** `pnpm install --frozen-lockfile` (ou deixe a Vercel detectar pnpm).
- **Build Command:** `pnpm turbo run build --filter=@genealogiq/<nome>...` (ou o default `next build`, já que o root dir é o app).
- **Ignored Build Step** (opcional, economiza builds): `npx turbo-ignore @genealogiq/<nome>` — só builda o projeto quando o app **ou suas deps** mudam.
- **Variáveis de ambiente:** permanecem **por projeto** — `AUTH_SECRET`, `AUTH_URL`, nomes de cookie (`bms./seq./app.session-token`), `STRIPE_*`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `DATABASE_URL`. O monorepo compartilha **código**, nunca segredos.

Valide um deploy de preview por projeto **antes** de re-apontar produção.

## Migração de mídia para Azure Blob

Os três aplicativos agora usam a camada compartilhada
`@genealogiq/services/media-storage` para novos uploads. Durante a transição,
URLs legadas do Vercel Blob e URLs da conta Azure configurada são aceitas.

A migração de dados é executada pelo job manual
`job-gen-media-migrate-prod`. O job inventaria objetos referenciados pelo banco,
grava um manifesto retomável no container privado `media-migration`, copia e
verifica os arquivos e só então atualiza referências que ainda tenham o valor
de origem. Consulte `docs/AZURE-DEPLOYMENT.md` antes de iniciar o job.

---

## Fases seguintes (resumo — detalhar quando chegarmos)

- **Fase 2 — `packages/core` + testes.** Extrair `prisma`, `auth*`, `dal`, `rate-limit`, `email`, `stripe`, `gen-code`, `masks`. Cobrir tenancy/IDOR/webhook com testes. A partir daqui, o P1-10 (hash de tokens) vira mudança única e testada.
- **Fase 3 — `packages/ui` + `packages/config`.** shadcn `ui/`, `address`, `data-table`, forms; eslint/tsconfig/tailwind base.
- **Fase 4 — `packages/db` (schema único).** Reconciliar as 6 divergências que o `check-schema-parity` aponta (taxId @unique global vs escopado; colunas Stripe em Subscription; default de id em PhysicalQrLicense; colunas de auditoria em AppUser/SupplierCategory). Snapshot do Neon + janela de manutenção. Fase mais arriscada — por último.
- **Fase 5 — Hardening.** Renovate/Dependabot, `pnpm audit` no CI, versões pinadas; virar o `eslint` para bloqueante após limpar a baseline.

---

## Apêndice — `.github/workflows/ci.yml` do monorepo (usar na Fase 1b)

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      # Prisma generate/validate não conectam ao banco — URL fake basta.
      DATABASE_URL: postgresql://user:pass@localhost:5432/db
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm typecheck             # bloqueante
      - run: pnpm check:schema-parity || true  # informativo até a Fase 4 (hoje 6 divergem)
      - run: pnpm lint || true          # não-bloqueante até a baseline ser limpa
```

> `check:schema-parity` hoje **falha** (6 modelos divergem). Mantê-lo não-bloqueante
> (`|| true`) ou só informativo até a Fase 4, quando passa a ser um no-op com schema único.

---

## Baseline do histórico de migrations (`packages/db`) — estado canônico

Depois da Fase 4 (schema único derivado via `prisma db pull`), o **histórico de
migrations foi rebaseado**: `0_init` é o baseline e várias migrations antigas e
granulares foram colapsadas. Por isso a tabela `_prisma_migrations` do banco tem
**mais linhas do que a pasta `prisma/migrations/`** — são resquícios anteriores ao
baseline. **Isto é esperado e benigno**: `prisma migrate status` reporta
"Database schema is up to date!" e o Prisma tolera linhas órfãs de histórico.

### As 7 linhas órfãs (existem no banco, não na pasta) — **não apagar**

Todas datadas de 2026-04-07, anteriores ao `0_init`:

```
20260324165458_add_user_model
20260325084009_add_email_verification_and_password_reset
20260325100017_add_rate_limiting_and_email_change
20260406130806_add_owner_relation_to_customer
20260406172552_add_tenant_scoping
20260407000000_add_customer_modules
20260415000000_add_tax_id_unique
```

Apagar linhas de `_prisma_migrations` à mão é **desencorajado pelo Prisma** e não
traz benefício — `migrate status` já está verde. Deixe-as como histórico.

### Reconciliação de drift de schema (`20260607010000_reconcile_schema_drift`)

`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`
acusava **2 desvios** de longa data entre o banco e o schema canônico. A migration
acima os fecha (diff → vazio):

1. **`_CouponPackages`** (join table M2M implícita): Prisma antigo criava índice
   `@unique` em (A, B); o Prisma atual espera `PRIMARY KEY` composta. Equivalente —
   PK construída a partir do índice único existente, depois o índice redundante é
   removido. Não há como expressar a forma antiga no schema, então o banco é que
   migra.
2. **`subscriptions.max_profiles / term_length / price`**: o schema os trata como
   obrigatórios (o client gerado já os tipa non-null), mas as colunas eram
   anuláveis. Verificado **0 linhas NULL** (de 3) antes de aplicar `SET NOT NULL`.

> Aplicada em produção via SQL Editor do Neon (após snapshot) + `migrate resolve
> --applied 20260607010000_reconcile_schema_drift`, seguindo o mesmo padrão de
> `20260607000000_add_backoffice_indexes` — porque o histórico diverge e
> `migrate deploy` não é usado neste banco.
