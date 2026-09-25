# Local development

This monorepo contains three Next.js applications backed by one PostgreSQL
database:

| Application | Package | Local URL |
| --- | --- | --- |
| Genealogiq | `@genealogiq/app` | http://localhost:3000 |
| BMS | `@genealogiq/bms` | http://localhost:3001 |
| Sequoia | `@genealogiq/seq` | http://localhost:3002 |

## Prerequisites

- Node.js 22 or newer
- Corepack (included with Node.js)
- Docker Desktop with the Docker engine running

The repository pins pnpm 9.15.0 in `package.json`.

## First-time setup

From the repository root:

```powershell
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
```

Create `packages/db/.env`:

```dotenv
DATABASE_URL="postgresql://genealogiq:genealogiq@localhost:5432/genealogiq?schema=public"
```

Create an `.env` file in each of `apps/app`, `apps/bms`, and `apps/seq` with
the same local core configuration:

```dotenv
APP_URL="http://localhost:3000"
BMS_URL="http://localhost:3001"
SEQUOIA_URL="http://localhost:3002"
AUTH_TRUST_HOST=true
DATABASE_URL="postgresql://genealogiq:genealogiq@localhost:5432/genealogiq?schema=public"
AUTH_SECRET="replace-with-a-random-local-secret-at-least-32-characters"
AZURE_STORAGE_CONNECTION_STRING="UseDevelopmentStorage=true"
AZURE_STORAGE_MEDIA_CONTAINER="media"
AZURE_STORAGE_STAGING_CONTAINER="media-staging"
AZURE_STORAGE_MIGRATION_CONTAINER="media-migration"
MEDIA_PUBLIC_BASE_URL="http://127.0.0.1:10000/devstoreaccount1/media"
NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL="http://127.0.0.1:10000/devstoreaccount1/media"
```

The `.env` files are gitignored. Generate a secret, for example, with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`compose.yaml` starts Azurite with PostgreSQL. The media containers are created
on the first upload. The other variables in each app's `.env.example` enable
optional integrations such as Google OAuth, Stripe, Resend, Sentry, web push,
and Turnstile.

Start PostgreSQL, create the schema, and seed the local identities:

```powershell
pnpm setup:local
```

`db:push` is intentional for a new local database. The checked-in migration
history reflects historical production DDL, including changes that were applied
outside the repository, and cannot bootstrap an empty database. Do not replace
the production deployment process with `db:push`; production continues to use
`pnpm db:migrate:deploy` as described in `packages/db/README.md`.

To exercise the real upload/SAS path against Azurite:

```powershell
$env:RUN_AZURITE_TESTS="true"
$env:AZURE_STORAGE_CONNECTION_STRING="UseDevelopmentStorage=true"
$env:MEDIA_PUBLIC_BASE_URL="http://127.0.0.1:10000/devstoreaccount1/media"
pnpm exec vitest run --project services packages/services/src/media-storage.integration.test.ts
```

## Local login

`pnpm seed:local` is idempotent and creates the company, tenant, staff identity,
and a Premium Genealogiq account with a three-generation family tree. The demo
also includes the pets Rex and Luna, including shared ownership and a pet linked
to a memorialized relative. Use the same credentials in all three applications:

```text
Email:    local-admin@genealogiq.test
Password: Local-Password-123!
```

The staff identity is a verified, active `SUPER_ADMIN` attached to the local
tenant. The Genealogiq identity is a verified, active `APP_USER`. As a safety
measure, the seed refuses to run unless `DATABASE_URL` points to the local
`genealogiq` database.

Start all applications:

```powershell
pnpm dev
```

The first request can take about a minute while Next.js compiles all three apps.
Subsequent requests are faster.

## Daily use

After the first-time setup:

```powershell
pnpm db:up
pnpm dev
```

Run only one application when needed:

```powershell
pnpm --filter @genealogiq/app dev
pnpm --filter @genealogiq/bms dev
pnpm --filter @genealogiq/seq dev
```

Stop the development server with `Ctrl+C`. Stop PostgreSQL without deleting its
data with:

```powershell
pnpm db:down
```

To delete all local database data and start over:

```powershell
docker compose down --volumes
pnpm setup:local
```

## Verification

Check that PostgreSQL is healthy:

```powershell
docker compose ps
```

Then open each local URL listed above. A command-line smoke test is:

```powershell
curl.exe -I http://localhost:3000
curl.exe -I http://localhost:3001
curl.exe -I http://localhost:3002
```

## Troubleshooting

- **Wrong Node version:** run `node --version`; it must be 22 or newer. With
  NVM for Windows, use an installed compatible version such as `nvm use 24.14.1`.
- **`pnpm` is not recognized:** rerun the two Corepack commands from first-time
  setup in an elevated terminal if Corepack cannot update its shims.
- **Port 5432 is already in use:** stop the other PostgreSQL service, or change
  the host port in `compose.yaml` and in all four `DATABASE_URL` values.
- **A web port is already in use:** free ports 3000, 3001, and 3002 before
  running `pnpm dev`.
- **Database schema errors:** for disposable local data, run the reset commands
  above. Never run those commands against a shared or production database.
