# Genealogiq BMS

Use verifyAdmin for administrative mutations; staff roles are session claims and do not guarantee immediate revocation. A BMS customer is a Tenant partner. Catalog edits and Stripe synchronization are separate operations. Reporting must distinguish measured empty counts from failed queries and preserve currency meaning. Inspect every daily job step result even when outer ok is true.

Start from the repository root `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Follow [LOCAL-DEVELOPMENT](../../docs/LOCAL-DEVELOPMENT.md) for dependency setup, normal local Credentials authentication, startup, baseline and cleanup. Use `node scripts/local-qa.mjs --app=bms` for an isolated loopback server at http://localhost:3001.

[AGENTS.md](AGENTS.md) contains the app feature index and mandatory session/update protocol. [TESTING](../../docs/TESTING.md) documents the runnable checks; [GAPS](../../docs/GAPS.md) records known incomplete behavior/fixtures. Production deployment follows [AZURE-AGENT-RUNBOOK](../../docs/AZURE-AGENT-RUNBOOK.md).

**Source verification:** 2026-10-03 at `6e06634` plus this documentation/test/launcher change. Product evidence is in the [dated audit](../../docs/audits/AGENT-MEMORY-2026-10-03.md).
