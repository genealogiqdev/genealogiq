# Preserved project memory and migration plan

> **Last source verification:** 2026-10-03 at `6e06634` + this documentation/test/launcher change. Historical incidents remain historical evidence, not current runtime proof.

## Modes and preserved entry files

The repository root is Create mode: no root AGENTS.md existed. APP/BMS/SEQ are Adopt mode: their existing AGENTS.md contained generated Next.js rules but no session protocol or feature index. APP/SEQ retain their generated rule text. BMS acquired Next's expanded package-resolution/regeneration wording during startup. All three original tracked guides are preserved in the snapshots below.

The original APP CLAUDE.md had 815 lines and is now replaced by an @AGENTS.md pointer with explicit user approval. A byte-for-byte recovery copy is at [apps/app/docs/history/CLAUDE-2026-10-03.md](../apps/app/docs/history/CLAUDE-2026-10-03.md); SHA-256 is `4b97b5f259f26ea6f894c2a81d44c9b21a227c74bc19857edfe5cfcc6c9ecacb`. Every original byte remains in the recovery copy; its pre-replacement SHA-256 matches. BMS/SEQ CLAUDE.md remain their existing @AGENTS.md pointers; the new root CLAUDE.md also points to the root guide.

The supplied document requires a migration table and explicit yes before moving a memory file over about 800 lines. The migration table and recovery copy were prepared before asking. The user answered “Yes, replace it and keep the archive” on 2026-10-03, and the pointer replacement was completed.

## Concrete migration table

| Original section | Classification / current destination | Completed action |
| --- | --- | --- |
| PROJECT: Genealogiq App | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| STACK | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| PROJECT STRUCTURE | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| ARCHITECTURE RULES | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| ROUTING TABLE | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| CURRENT STATE | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| Design System — concluído ✅ | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| Auth Pages — concluído ✅ | Feature-specific: [ACCOUNTS](../apps/app/docs/ACCOUNTS.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| Header + Home — concluído ✅ | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| Auth — concluído ✅ | Feature-specific: [ACCOUNTS](../apps/app/docs/ACCOUNTS.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| Profile — concluído ✅ | Feature-specific: [PUBLIC-PROFILES](../apps/app/docs/PUBLIC-PROFILES.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| Edit Profile — concluído ✅ | Feature-specific: [PUBLIC-PROFILES](../apps/app/docs/PUBLIC-PROFILES.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| Biography — concluído ✅ | Feature-specific: [BIOGRAPHY](../apps/app/docs/BIOGRAPHY.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| Gallery — concluído ✅ | Feature-specific: [GALLERY](../apps/app/docs/GALLERY.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| Tributes — concluído ✅ | Feature-specific: [TRIBUTES](../apps/app/docs/TRIBUTES.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| Geolocation — concluído ✅ | Feature-specific: [GEOLOCATION](../apps/app/docs/GEOLOCATION.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| Memorialized — concluído ✅ | Feature-specific: [MEMORIALS-GUARDIANS](../apps/app/docs/MEMORIALS-GUARDIANS.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| Shared DB note | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| Padrão de autorização para guardiões | Feature-specific: [MEMORIALS-GUARDIANS](../apps/app/docs/MEMORIALS-GUARDIANS.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| MANDATORY RULES | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| FORBIDDEN | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| QUALITY GATES | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| ENV VARS | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| urls | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| prisma | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| auth | Feature-specific: [ACCOUNTS](../apps/app/docs/ACCOUNTS.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| vercel blob | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| resend | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| sentry (observability) — provisioned in sentry.io; never commit real values. | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| NEXT_PUBLIC_SENTRY_DSN is per-app (public). SENTRY_AUTH_TOKEN/ORG/PROJECT are set in | Feature-specific: [ACCOUNTS](../apps/app/docs/ACCOUNTS.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| the Vercel project env for source-map upload at build (no-op locally/CI without them). | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| web push (VAPID) — generate once with `npx web-push generate-vapid-keys`; | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| public key is public by design; missing values disable push gracefully. | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| HOOKS | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| COMMANDS | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |
| PERSONA | Cross-cutting/duplicate/historical: [APP guide](../apps/app/AGENTS.md) / [CONFIGURATION](CONFIGURATION.md) / [TESTING](TESTING.md) | Original preserved verbatim in recovery copy; current claims checked in the destination; pointer replaced after explicit user approval on 2026-10-03 |

The original's many dated/numbered incident details remain in the byte-identical copy. No incident ID, figure or named symbol is silently dropped. Obsolete current-state prose is not copied as verified behavior: the current feature docs cite the checked implementation and retain one-line removal histories. Future extraction of additional gap/TODO detail from the archive must preserve its original wording and permanent evidence.

## Existing docs retained and reclassified

| Existing path | Current treatment |
| --- | --- |
| [APP CONVENTIONS](../apps/app/docs/CONVENTIONS.md) | Keep the existing filename/voice; correct source mismatches inline and link feature memory |
| [FLUXO-COMERCIAL-ATUAL](FLUXO-COMERCIAL-ATUAL.md) | Keep the Portuguese commercial explanation; correct standalone-purchase and role/callback assumptions |
| [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) | Extend the existing named runbook with real isolation/auth/baseline/evidence/recovery |
| [Database README](../packages/db/README.md) | Preserve former GitHub/Neon/Vercel operations as historical; prepend current Azure/local pointers |
| [PHASE-4-DB-CONSOLIDATION](PHASE-4-DB-CONSOLIDATION.md) | Historical consolidation/migration proposal; superseded by current shared package and DATABASE |
| [MIGRATION](../MIGRATION.md), [SMOKE-TESTS](../SMOKE-TESTS.md), [ENGAGEMENT-SUMMARY](../ENGAGEMENT-SUMMARY.md) | Preserve dated narrative/figures; mark historical and link the current guide |
| [APP INCEPTION](../apps/app/INCEPTION.md) | Preserve product intent; not a current code/runtime contract |
| Existing Azure guides | Preserve operational filenames and constraints; live resource identities remain unverified without authorized cloud discovery |

## Verification and completed action

Before replacement, the original APP memory and recovery copy hashes matched. The recovery copy is unchanged. The root/app feature indexes now lead to current checked source/test contracts. The user explicitly approved the large-file migration on 2026-10-03: “Yes, replace it and keep the archive.” apps/app/CLAUDE.md now contains @AGENTS.md; the exact recovery copy and migration table remain. No cloud deployment, Git commit/push or deletion is part of that step.

## Verification log

| Date | Revision | Scope | Evidence / limits |
| --- | --- | --- | --- |
| 2026-10-03 | 6e06634 + docs/tests/launcher | Source preservation | All original APP memory bytes copied; generated Next blocks preserved; named existing docs retained. |
| 2026-10-03 | Same | Adoption boundary | Approval was requested after preparing the exact recovery copy and migration table. |
| 2026-10-03 | Same + completed pointer migration | User approval and preservation check | Explicit approval received; APP CLAUDE replaced with @AGENTS.md. Recovery bytes/hash unchanged. |

## Original generated app guides

The prior tracked guides are preserved verbatim: [APP](../apps/app/docs/history/AGENTS-before-2026-10-03.md), [BMS](../apps/bms/docs/history/AGENTS-before-2026-10-03.md), [SEQ](../apps/seq/docs/history/AGENTS-before-2026-10-03.md). APP/SEQ retain the original Next rule text. Next dev expanded BMS's original short generated block with package-resolution and regeneration guidance; the original wording remains in its snapshot. Git's LF form and the original APP CLAUDE working file's CRLF form differ only in line endings; the CLAUDE recovery copy preserves the working file bytes exactly.

## Related

[AGENTS.md](../AGENTS.md) · [GAPS](GAPS.md) · [Dated audit](audits/AGENT-MEMORY-2026-10-03.md)
