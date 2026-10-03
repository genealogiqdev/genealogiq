# Genealogiq APP

Use [CONVENTIONS](docs/CONVENTIONS.md) for existing schema/form/media/UI choices. Profile content is scoped by owner or co-guardian; public readers are selected/redacted separately. Physical QR/GenCode ownership is not a consumer subscription. Tree positions remain in schema for history, but the current canvas uses automatic layout. Media quotas come from database-backed effective entitlements; do not hardcode a plan or revive maxProfiles.

Start from the repository root `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Follow [LOCAL-DEVELOPMENT](../../docs/LOCAL-DEVELOPMENT.md) for dependency setup, normal local Credentials authentication, startup, baseline and cleanup. Use `node scripts/local-qa.mjs --app=app` for an isolated loopback server at http://localhost:3000.

[AGENTS.md](AGENTS.md) contains the app feature index and mandatory session/update protocol. [TESTING](../../docs/TESTING.md) documents the runnable checks; [GAPS](../../docs/GAPS.md) records known incomplete behavior/fixtures. Production deployment follows [AZURE-AGENT-RUNBOOK](../../docs/AZURE-AGENT-RUNBOOK.md).

**Source verification:** 2026-10-03 at `6e06634` plus this documentation/test/launcher change. Product evidence is in the [dated audit](../../docs/audits/AGENT-MEMORY-2026-10-03.md).
