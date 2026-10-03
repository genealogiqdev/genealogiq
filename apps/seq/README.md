# Sequoia SEQ

Resolve tenant scope with verifyTenantSession; never trust a browser tenantId. SEQ customer records use AppUser.tenantId. Administrative staff actions use verifyAdmin; operational inventory uses its documented gates. Current purchasing checks tenant membership only, which is an open policy gap. Supplier module flags still gate real supplier screens; retired digital-license screens must not return.

Start from the repository root `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Follow [LOCAL-DEVELOPMENT](../../docs/LOCAL-DEVELOPMENT.md) for dependency setup, normal local Credentials authentication, startup, baseline and cleanup. Use `node scripts/local-qa.mjs --app=seq` for an isolated loopback server at http://localhost:3002.

[AGENTS.md](AGENTS.md) contains the app feature index and mandatory session/update protocol. [TESTING](../../docs/TESTING.md) documents the runnable checks; [GAPS](../../docs/GAPS.md) records known incomplete behavior/fixtures. Production deployment follows [AZURE-AGENT-RUNBOOK](../../docs/AZURE-AGENT-RUNBOOK.md).

**Source verification:** 2026-10-03 at `6e06634` plus this documentation/test/launcher change. Product evidence is in the [dated audit](../../docs/audits/AGENT-MEMORY-2026-10-03.md).
