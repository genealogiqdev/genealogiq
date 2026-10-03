# Local development

> **Code:** [compose.yaml](../compose.yaml), [local launcher](../scripts/local-qa.mjs), [local seed](../scripts/seed-local.ts), [root scripts](../package.json)
> **Last verified against code:** 2026-10-03 at `6e06634`, including the current launcher/documentation/test changes. Runtime/UI evidence is recorded separately below and in the [dated audit](audits/AGENT-MEMORY-2026-10-03.md).

The smallest baseline stack is PostgreSQL plus the relevant Next.js app. Run all three apps for repository documentation/setup QA; include Azurite for real upload/SAS behavior. The checked-in launcher supplies local configuration in child processes without rewriting existing .env files or inheriting provider keys.

## Runtime and dependency inventory

| Component | Repository contract | Observed local version / endpoint | Readiness |
| --- | --- | --- | --- |
| Node.js | >=22 in root package.json | 24.14.1 | node --version |
| pnpm | 9.15.0 in packageManager | 9.15.0 | pnpm --version |
| Next.js / React / Prisma | Installed lockfile/workspace dependencies | 16.3.1 / 19.2.8 / 7.9.1 | Generated client + Next Ready + DB readiness |
| Docker | Running Docker engine | 29.1.3 | docker compose ps |
| PostgreSQL | compose postgres:17-alpine | localhost:5432, database genealogiq | pg_isready and SELECT 1 |
| Azurite | compose 3.35.0 blob service | 127.0.0.1:10000 | Enabled media integration exercises PUT/read/delete |
| APP | @genealogiq/app | http://localhost:3000 | GET /api/health/ready returns ready |
| BMS | @genealogiq/bms | http://localhost:3001 | GET /api/health/ready returns ready |
| SEQ | @genealogiq/seq | http://localhost:3002 | GET /api/health/ready returns ready |

These are installed/checked-out versions, not a statement about the latest upstream releases. The launcher binds web listeners to loopback. Browser authentication must use canonical localhost, because a redirect from 127.0.0.1 to localhost leaves the old-origin cookie behind.

## First-time setup

Working directory for every command here is `C:/Users/Tiger/Desktop/dev/personal/genealogiq` (the repository root).

1. Install workspace dependencies with the pinned package manager. If pnpm is absent, use Corepack to activate the packageManager version. Do not overwrite an existing credentials/environment file.

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
```

2. Start only this repository's compose services and explicitly select the loopback database for Prisma/seed commands. The public local password below is disposable fixture data.

```powershell
pnpm db:up
$env:DATABASE_URL = "postgresql://genealogiq:genealogiq@127.0.0.1:5432/genealogiq"
pnpm db:generate
pnpm db:push
pnpm seed:local
```

The installed workspace, db up, generation, db push and seed were exercised on 2026-10-03. A fresh dependency download is a prerequisite rather than a feature test. setup:local is the existing db-up → db-push → seed alias; explicitly generate first after schema changes. db push intentionally initializes disposable local data because the historical migration tree does not prove empty-database bootstrapping. Deployed migrations follow [DATABASE](DATABASE.md) and the existing Azure runbook.

3. Run the isolation launcher in its own terminal. It checks database/web ports and the generated Prisma/Next dependencies before spawning. It prints only local origins and owned child PIDs, not AUTH_SECRET.

```powershell
node scripts/local-qa.mjs
```

For a one-app change, use one of:

```powershell
node scripts/local-qa.mjs --app=app
node scripts/local-qa.mjs --app=bms
node scripts/local-qa.mjs --app=seq
```

The ordinary pnpm dev/per-app dev scripts still use ordinary environment files. Use this launcher for the documented local baseline. It sets DB/origins/Azurite, generates an ephemeral secret separately for each app, and disables Stripe, Resend, Google, Sentry, VAPID, Turnstile and WikiTree search. External postal lookup/map tiles are not intercepted. A network/provider fixture is required to claim those integrations work.

## Check dependencies and readiness

Run these in a second terminal at the repository root:

```powershell
docker compose ps
docker compose exec -T postgres pg_isready -U genealogiq -d genealogiq
docker compose exec -T postgres psql -U genealogiq -d genealogiq -c "SELECT 1"
Invoke-RestMethod http://localhost:3000/api/health/live
Invoke-RestMethod http://localhost:3000/api/health/ready
Invoke-RestMethod http://localhost:3001/api/health/ready
Invoke-RestMethod http://localhost:3002/api/health/ready
```

Liveness returns status=ok without checking providers. Readiness executes SELECT 1 and returns ready, or 503 unavailable with a DB failure log. Neither proves authentication, save/reload or provider delivery. The first route compilation may be slower than later requests; inspect the terminal rather than assuming a refused port means a broken feature.

## Local identity and authentication

| Record | Identity / role | Scope |
| --- | --- | --- |
| APP consumer | local-admin@genealogiq.test, APP_USER, active/verified | Premium consumer sale, family and accepted guardianship |
| BMS staff | Same email, SUPER_ADMIN, active/verified | Local company |
| SEQ staff | Same email, SUPER_ADMIN, active/verified | LOCAL-TENANT-001 |
| Password | Local-Password-123! | Public disposable fixture value defined by seed-local.ts |

Open /sign-in on each app and submit through the normal Credentials form. The same fixture email/password selects separate APP/staff records and separate app.session-token, bms.session-token and seq.session-token cookies. Sign in separately for each app; a valid browser session in one does not authorize the others. Do not inject tokens or bypass DAL checks. Restarting the launcher changes secrets, invalidating old sessions; sign in again.

The seed is idempotent and refuses non-loopback URLs or another database name. It includes seven human family members across four displayed generations and the pets Rex/Luna. Rex has Local Admin and Marina Silva as tutors; Luna is linked to Helena. Older guidance described three generations; the checked tree UI displays four. The fixture currently creates PREMIUM but no FREE Subscription row, so free-fallback scenarios remain [BILLING-QUOTAS-G2](../apps/app/docs/BILLING-QUOTAS.md#gaps-and-fixes).

## Baseline product/manual QA

Expected values here are handwritten scenario values, independent of the app output. For a documentation/setup task, perform all three rows; for a feature change also exercise its own happy and boundary scenarios. Use browser interactions and inspect visible state plus persistence.

| App | Exact happy path | Boundary | Independent persistence/expected result |
| --- | --- | --- | --- |
| APP | Sign in, open Rex from /home, remove the favorite, restore it, reload; open the local owner's tree, zoom/fit, search Rex and inspect its tutor sheet | Normal sign-out, revisit /home | One favorite for fixture viewer/Rex after restore; seven people/four generations/two pets; Rex tutors Marina Silva + Local Admin; anonymous /home shows /sign-in |
| BMS | Sign in, /system/company, set trade name Genealogiq Local QA 2026-10-03, save, reload, then restore Genealogiq Local and save | Sign out, revisit /system/company | Changed value survives reload; companies.tax_id=LOCAL-COMPANY-001 is restored to Genealogiq Local; anonymous edit route redirects to /sign-in |
| SEQ | Sign in, /system/company, set trade name Local Tenant QA 2026-10-03, save, reload, then restore Local Tenant and save | Sign out, revisit /system/company | Changed value survives reload; tenants.tax_id=LOCAL-TENANT-001 is restored to Local Tenant; anonymous edit route redirects to /sign-in |

Read-only persistence check (PowerShell here-string preserves SQL quotes):

```powershell
@'
SELECT trade_name FROM companies WHERE tax_id='LOCAL-COMPANY-001';
SELECT trade_name FROM tenants WHERE tax_id='LOCAL-TENANT-001';
SELECT COUNT(*) AS favorite_count
FROM app_favorites f JOIN app_users u ON u.id=f.app_user_id
WHERE f.app_target_id='clocalpetrex000000000000001'
  AND u.email='local-admin@genealogiq.test';
'@ | docker compose exec -T postgres psql -U genealogiq -d genealogiq
```

On 2026-10-03 the expected/observed restored values were Genealogiq Local, Local Tenant and favorite_count=1. Company edits were visibly saved/reloaded before restoration. Local screenshots are ignored at .local-qa/2026-10-03/{bms-save-reload,seq-save-reload,app-favorite-reload,app-tree,app-pet-owners}.png. [The dated audit](audits/AGENT-MEMORY-2026-10-03.md) records exact scope; the screenshots alone do not establish full feature coverage.

## Integration coverage and remaining scenarios

The real Azurite authorize/PUT/overwrite-reject/promote/read/delete test passed; use [TESTING](TESTING.md) for its opt-in command. Credentials baseline and BMS public Playwright smoke passed. Payment/webhook replay, mail delivery, OAuth, push, production worker/install, browser video codecs, WikiTree import, full ledger/migration replay, multi-consumer moderation and cross-tenant browser IDs require their own fixture or test service. These scenarios remain n/a/incomplete in their feature documents. Compilation or adjacent helper tests do not convert them into product passes.

## Stop and cleanup

1. Restore temporary company/profile/favorite edits through their normal form/action. Keep ledger and permanent audit history.
2. Press Ctrl+C in the launcher terminal; it stops only PIDs it spawned (including their Windows child trees). Wait for the terminal to exit.
3. Check that web listeners are gone; then stop only this repository's compose services, preserving volumes.

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002 -ErrorAction SilentlyContinue
pnpm db:down
docker compose ps
```

Do not stop unrelated Docker services or delete volumes merely to finish QA. A destructive reset is a separate explicit task; the preserved local data supports repeatable inspection.

## Recover an interrupted session

1. Inspect docker compose ps and Get-NetTCPConnection before starting another launcher; an occupied port is a prerequisite conflict, not proof of a usable app.
2. Identify the owning command/PID. If the previous launcher is reachable, use its Ctrl+C. If it is orphaned, inspect the specific Next command line/PID and stop that identified process tree; never kill all Node processes.
3. Run pnpm db:up; regenerate Prisma once if required; restart node scripts/local-qa.mjs. Do not reseed over meaningful existing local edits unless fixture reset is intended.
4. Sign in again using canonical localhost and run the affected save/reload/boundary scenario. Append the new evidence; do not overwrite a prior dated audit.

## Troubleshooting

| Symptom | First check | Recovery |
| --- | --- | --- |
| Missing Prisma/generated symbols or ENOTEMPTY | Concurrent Turbo generation/Windows files | Stop competing checks, run pnpm db:generate once, then typecheck/lint/build sequentially |
| Sign-in loops after redirect | localhost vs 127.0.0.1, app origin, old secret | Use canonical localhost and sign in again after launcher restart |
| FREE subscription row not found | subscriptions WHERE code='FREE' | Open fixture gap; do not treat Premium baseline as FREE-plan proof |
| Missing browser | Playwright install for pinned Chromium | pnpm exec playwright install chromium, then rerun public smoke |
| 503 readiness / connection refused | Compose state, DB URL, listener owner | Start repository DB and correct local URL; avoid another service's database |
| Providers missing/disabled | Launcher mode and owning settings | Supply isolated test service/fixture for that scenario; leave it n/a meanwhile |
| Unexpected .next/build problems | Dev server and build sharing .next | Stop launcher before build; restart and reauthenticate afterward |

## Gaps and fixes

### LOCAL-DEVELOPMENT-G1: No repeatable isolated three-app launcher

- **Status:** fixed
- **Found:** 2026-10-03, bootstrap startup/authentication audit.
- **Evidence:** Ordinary Next launches inherit app environment files; the baseline needed explicit loopback dependencies and separate normal app sessions.
- **Impact:** A future agent could not reliably reproduce the documented local mode.
- **Root cause:** Setup/seed existed but no all-app environment overlay and owned-process lifecycle were documented.
- **Resolution:** 2026-10-03, added scripts/local-qa.mjs and this startup/authentication/baseline/cleanup runbook. All three Credentials sessions, save/reload and anonymous boundaries were exercised. The launcher uses normal auth and the existing loopback-guarded seed; no auth bypass was added. Changes are uncommitted.

## Verification log

| Date | Revision | Scope | Evidence / limits |
| --- | --- | --- | --- |
| 2026-10-03 | 6e06634 + launcher/docs/tests | Source | Versions/scripts, ports, local overlay, seed auth/roles, health handlers and cleanup traced. |
| 2026-10-03 | Same | Runtime | Compose, db push/generate/seed, three app startup/readiness and opt-in Azurite test exercised. |
| 2026-10-03 | Same | UI | Three-app baseline save/reload/favorite/tree and anonymous boundaries passed; provider/full-feature scenarios remain incomplete as listed. |

## Related

[AGENTS.md](../AGENTS.md) · [CONFIGURATION](CONFIGURATION.md) · [DATABASE](DATABASE.md) · [TESTING](TESTING.md) · [GAPS](GAPS.md)
