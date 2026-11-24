# Genealogy Scan

> **Code:** [src/actions/genealogy-scan.actions.ts](../src/actions/genealogy-scan.actions.ts) · [src/lib/genealogy-scan/service.ts](../src/lib/genealogy-scan/service.ts) · [src/lib/genealogy-scan/graph.ts](../src/lib/genealogy-scan/graph.ts) · [src/lib/genealogy-scan/request.ts](../src/lib/genealogy-scan/request.ts) · [src/mobile/views/scan.ts](../src/mobile/views/scan.ts) · [agent definition](../../../agents/genealogy-scan/agent.md) · [environment](../../../agents/genealogy-scan/environment.yaml)
> **Entry points:** mobile `/genealogy-scan` and `/genealogy-scan/<id>`; mobile API views `genealogyScans`, `genealogyScan`; actions `startGenealogyScan`, `deleteGenealogyScan`
> **Depends on:** [BILLING-QUOTAS](BILLING-QUOTAS.md) · [FAMILY-TREE](FAMILY-TREE.md) · [MOBILE-API](../../../docs/MOBILE-API.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-11-23 at `8bde62d` plus this task's uncommitted changes. No scan has been run against the Anthropic API: no key is configured yet.

A Premium user gives a family surname and, optionally, anchors (relatives' names, places, approximate years). An AI research agent searches the public web and builds a knowledge graph: the surname, its variants, places, events, families and people, with a source and a confidence on every node. The mobile app shows the graph as an explorable network and lets the user add a person from it to their own family tree.

A surname alone is shared by many unrelated families. Without anchors the result is a map of the surname, not the user's ancestry; the app says so before a scan starts.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Validate the request and check access | deterministic | [src/lib/genealogy-scan/request.ts](../src/lib/genealogy-scan/request.ts) `startScanSchema` | A validated request, or a localised refusal |
| 2 | Start one research session with a spend cap | external call | [src/lib/genealogy-scan/service.ts](../src/lib/genealogy-scan/service.ts) `startScan` | A `GenealogyScan` row in `RUNNING` with the session id |
| 3 | Research the web and write `graph.json` | LLM (Claude Opus 5.5, Anthropic Managed Agents) | [agent definition](../../../agents/genealogy-scan/agent.md) | A graph file, rewritten as research progresses |
| 4 | Pull, validate and store the newest graph on each read | deterministic | [src/lib/genealogy-scan/graph.ts](../src/lib/genealogy-scan/graph.ts) `parseGraph` | A clamped, reference-checked graph; `COMPLETED` or `FAILED` once the session stops |

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/genealogy-scan.actions.ts](../src/actions/genealogy-scan.actions.ts) | `startGenealogyScan`, `deleteGenealogyScan` | Authenticated mutation orchestration |
| [src/lib/genealogy-scan/service.ts](../src/lib/genealogy-scan/service.ts) | `decideScanAccess`, `startScan`, `syncScan`, `SCAN_POLICY` | Shared policy and the Anthropic integration |
| [src/lib/genealogy-scan/graph.ts](../src/lib/genealogy-scan/graph.ts) | `parseGraph`, `safeHttpUrl`, `GRAPH_LIMITS` | Input validation of model output |
| [src/lib/genealogy-scan/request.ts](../src/lib/genealogy-scan/request.ts) | `startScanSchema`, `buildScanDescription`, `SCAN_RUBRIC` | Input validation and the task text |
| [src/mobile/views/scan.ts](../src/mobile/views/scan.ts) | `genealogyScans`, `genealogyScan` | Scoped data for the mobile screens |

## Rules and why

- **Premium only, five scans per calendar month (UTC), one running at a time.** Each scan spends real money on the Anthropic API. Failed scans do not count against the month.
- **Hard spend cap per scan.** The session is created with a budget of 400 US cents at list prices (`SCAN_POLICY.budgetCents`); the platform stops issuing model requests at the cap. A scan that stops at the cap completes with whatever graph exists.
- **Starting is idempotent.** The client sends a `requestId` (UUID) and a retried request returns the scan it already started. The row is created only after the session exists, so a failed start consumes no allowance.
- **The API key never leaves the server.** The mobile app only talks to the APP backend.
- **Nothing holds a connection open.** The agent runs on Anthropic's side and writes a file; each read of a running scan pulls that file (at most once every five seconds). This fits serverless request limits, and it means a scan only advances in the database when someone reads it.
- **Nobody approves tool calls, so nothing may ask.** The agent has only web search, web fetch, file read and file write, all set to run without confirmation, and no shell.
- **Model output is untrusted.** `parseGraph` drops unknown types and relations, dangling or duplicate edges and non-http(s) links, clamps every size, and downgrades any node without a surviving source to `speculative`: nothing unsourced is shown as established.
- **User text is data, not instructions.** The request is passed to the agent as a fenced JSON block, and surnames and names accept only letters, spaces, apostrophes, dots and hyphens.
- **Living private people are excluded** by the agent's instructions and by the grading rubric. This is a model behaviour, not a deterministic filter: see GENEALOGY-SCAN-G2.
- **Scans are private to their owner.** Another user's scan id is a 404. Deleting a running scan interrupts its session first.

## Contracts and data

Inputs and outputs are typed in [apps/mobile/src/api/scan.ts](../../mobile/src/api/scan.ts). Actions return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts) with localised messages under `Actions.genealogyScan`.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `GenealogyScan` | `app_genealogy_scans` | [20261122000000_mobile_push_and_genealogy_scan](../../../packages/db/prisma/migrations/20261122000000_mobile_push_and_genealogy_scan/migration.sql) |

The graph is stored as one JSON document (`graph`), read and replaced as a whole: `{version, surname, summary, nodes[], edges[], sources[]}` with at most 400 nodes, 1,200 edges and 400 sources.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/api/mobile/v1/views/genealogyScans` | [src/mobile/views/scan.ts](../src/mobile/views/scan.ts) |
| GET | `/api/mobile/v1/views/genealogyScan?id=` | [src/mobile/views/scan.ts](../src/mobile/views/scan.ts) |
| POST | `/api/mobile/v1/actions/startGenealogyScan`, `deleteGenealogyScan` | [src/mobile/actions.ts](../src/mobile/actions.ts) |

| Setting | Default | Validation / owner | Consequence |
| --- | --- | --- | --- |
| ANTHROPIC_API_KEY | absent | service.ts | Without all three settings the feature reports `notConfigured` and starts nothing |
| GENEALOGY_SCAN_AGENT_ID | absent | service.ts | Id of the agent created from `agents/genealogy-scan/agent.md` |
| GENEALOGY_SCAN_ENVIRONMENT_ID | absent | service.ts | Id of the environment created from `agents/genealogy-scan/environment.yaml` |

## How to test it (AI-runnable)

Run commands from the repository root `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Install workspace dependencies first.

| Layer | Command | Needs | Cost | Proves |
| --- | --- | --- | --- | --- |
| Unit (deterministic) | `pnpm test` | Workspace install | Free, seconds | Graph sanitising, request validation, task text fencing, access rule order, month boundary, budget constant |
| Contract / schema | `pnpm check:schema-parity` and `node scripts/check-migrations.mjs` | Workspace install | Free, seconds | Canonical schema and a well-formed additive migration |
| Golden / replay | n/a: no recorded session fixture | A stored `graph.json` from a real scan; cache misses must fail | Not run | Model regression is not yet covered |
| End-to-end / harness | n/a: needs an Anthropic key, agent id and environment id | See the runbook | About 4 US dollars per scan at the cap | A real scan from start to graph |
| Offline evidence | `node scripts/check-docs.mjs` | Repository docs | Free, seconds | Paths, links, headings, metadata and indexes |
| Manual product QA | `node scripts/local-qa.mjs --app=app` → scenarios below | Local PostgreSQL and APP | Local/free without a key | Refusals, validation and ownership over HTTP |

**Specs:** [src/lib/genealogy-scan/genealogy-scan.test.ts](../src/lib/genealogy-scan/genealogy-scan.test.ts) · [src/mobile/registry.test.ts](../src/mobile/registry.test.ts).

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. A graph produced by a model is never a reference answer for the validator.

**Acceptance:** an unconfigured server refuses without creating a row; invalid input is refused; a valid configured start creates exactly one row per `requestId`; a finished session leaves the scan `COMPLETED` with a graph that satisfies the validator's rules, or `FAILED` with none.

**Telling failures apart:** `notConfigured` is a missing setting, not a defect. A scan stuck in `RUNNING` with nobody reading it is expected (reads drive the sync). A `[genealogy-scan]` log line with a status code is an Anthropic API failure: 401/403 means the key or ids are wrong, 429/5xx is transient and the next read retries. A graph that changes between two real scans of the same surname is model and web variance, not a regression.

### Manual scenarios

1. **Happy path (needs the three settings):** start a scan for a surname with one anchor; expect `{ok: true, data: {id}}`, a `RUNNING` row, then a growing graph on repeated reads and `COMPLETED` within the session's run.
2. **Boundary:** without the settings, starting answers "isn't available yet" in the request language and creates no row; a surname of `<b>` answers invalid data; a second start while one is running is refused; a FREE account is refused with the Premium message.
3. **Persistence/cleanup:** re-read the scan after completion and confirm the same node count; delete it and confirm the row is gone and a second read is a 404.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-11-23, `8bde62d` + working changes | `node scripts/local-qa.mjs --port-offset=1000 --host=127.0.0.1`; seeded Premium identity; curl with a mobile token | Boundary only. Expected a refusal and no row when unconfigured: observed `access.denial = notConfigured`, the es-MX "aún no está disponible" message, and invalid data for `<b>` | Pass for the unconfigured boundary. n/a: the happy path, the running-scan rules and the mobile graph screen need an Anthropic key | Recorded in this row |

## Runbooks

### Turn the feature on

1. Install the `ant` CLI and sign in to the Anthropic workspace that will pay for scans.
2. From the repository root, review the plan with `ant apply --dry-run -v agents/genealogy-scan/agent.md agents/genealogy-scan/environment.yaml`, then apply it. Commit the `claude-lock.json` it writes.
3. Set `ANTHROPIC_API_KEY`, `GENEALOGY_SCAN_AGENT_ID` and `GENEALOGY_SCAN_ENVIRONMENT_ID` (ids from `claude-lock.json`) for the APP deployment only.
4. Run the happy-path scenario once and record cost, duration and graph size here.

### Change the agent

Edit `agents/genealogy-scan/agent.md` and re-run `ant apply`; do not edit the agent in the Console, or the next apply refuses to run. Running scans keep the version they started with. If the output shape changes, change `parseGraph`, the mobile contract and the tests in the same change.

### Change the cost of a scan

Adjust `SCAN_POLICY` (budget per scan, scans per month, grading iterations) in [service.ts](../src/lib/genealogy-scan/service.ts) and its test. The model is set in `agent.md`.

## Gaps and fixes

### GENEALOGY-SCAN-G1: No scan has run against the Anthropic API

- **Status:** open
- **Found:** 2026-11-23, initial implementation.
- **Evidence:** No API key was available; the session create, file listing and download calls type-check against `@anthropic-ai/sdk` 1.12 but have never executed.
- **Impact:** Real cost, duration, graph quality and the exact session lifecycle are unmeasured.
- **Root cause:** The key is to be provided later.
- **Resolution:** Not fixed. Follow "Turn the feature on" and record the first run.

### GENEALOGY-SCAN-G2: Exclusion of living people is not enforced in code

- **Status:** open
- **Found:** 2026-11-23, initial implementation.
- **Evidence:** The rule lives in the agent's instructions and the grading rubric; `parseGraph` cannot tell whether a named person is alive.
- **Impact:** A scan may still include a living private individual found on a public page.
- **Root cause:** No reliable deterministic signal exists in the graph.
- **Resolution:** Not fixed. Review the first real scans; consider dropping person nodes whose `years` start within the last 100 years and have no end year.

### GENEALOGY-SCAN-G3: The environment allows open network egress

- **Status:** open
- **Found:** 2026-11-23, initial implementation.
- **Evidence:** `environment.yaml` sets `networking: unrestricted`, because web search and fetch only reach listed hosts under `limited` networking and genealogy sources cannot be listed in advance.
- **Impact:** Open egress applies to the whole sandbox. The agent has no shell, no mounted files and no credentials, so there is nothing to send out; adding any of those would change that.
- **Root cause:** Platform constraint on the web tools.
- **Resolution:** Accepted for now and documented in the file. Confirm before the first `ant apply`.

### GENEALOGY-SCAN-G4: A finished scan sends no notification, and there is no web screen

- **Status:** open
- **Found:** 2026-11-23, initial implementation.
- **Evidence:** The scan settles only when a client reads it, and only the mobile app has screens for it.
- **Impact:** The user has to reopen the scan to see that it finished.
- **Root cause:** Poll-driven design without a background worker.
- **Resolution:** Not fixed. A webhook from the agent platform, or a pass in the daily job, could settle scans and send a push.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-11-23 | `8bde62d` + uncommitted work | Source trace and tests | Source: actions, service, validator, views, agent files. Tests: `pnpm test` 1,849 passed, 71 skipped | None in tests |
| 2026-11-23 | Same | Local runtime over HTTP | Unconfigured boundary and input validation, as in QA evidence | Happy path n/a without a key (G1) |
| 2026-11-24 | `2d02307` (merged PR #218) | Production release | The `app_genealogy_scans` table exists in production; the feature stays off until its three settings are configured. [Release audit](../../../docs/audits/PRODUCTION-RELEASE-2026-11-24.md) | Happy path still n/a (G1) |

## Related

[MOBILE-API](../../../docs/MOBILE-API.md) · [FAMILY-TREE](FAMILY-TREE.md) · [BILLING-QUOTAS](BILLING-QUOTAS.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
