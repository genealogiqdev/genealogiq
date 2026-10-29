# APP guarded memorials in the family tree — 2026-10-29

## Source

Starting revision: `f61444c`, branch `main`. The user explicitly confirmed work on `main`. Reviewed the tree action/query/dialog, accepted guardian contract, Zod relation schema, canonical Prisma models, installed Next route-handler guidance and intervening history from `6e06634` (tree-profile promotion in `818c2c6`). Other chats had unrelated changes in the same checkout and locale files.

The add-relative dialog now offers **Perfis sob minha guarda**, backed by an authenticated, rate-limited `guarded-relative` search for the actor's accepted `APP_MEMO` profiles. Empty and short name filters work; results retain the existing eight-item limit. Switching sources clears selection and ignores late responses. Failed HTTP responses show a translated error instead of being treated as profile arrays.

The relation action accepts a memorial outside the tree only after reading the actor's current accepted guardianship. It preserves the original profile, guardian and content records. Living accounts retain consent; unrelated ghosts and pets remain excluded. Duplicate, conflicting-type, cycle and spouse-scope checks still apply. Quota growth includes the memorial's existing accepted relatives and also covers relations anchored at the root; links between existing members remain possible after a downgrade.

## Deterministic checks

- Focused action, search-route and DOM tests: **66 passed**, including **25 new cases**. They cover existing-ID parent/child/spouse/sibling additions, accepted guardian query scope, missing/revoked permission, external ghosts, cap/subtree growth, existing-member downgrade behavior, optional spouse link, cycles/conflicts/duplicates, anonymous/rate-limit/empty search, selection clearing, late responses, HTTP failure and pet separation.
- Full `pnpm test` rerun: **159 files / 1,496 tests passed; 9 files / 59 opt-in tests skipped**. The first run passed 1,478 tests but encountered a concurrently edited SEQ test file disappearing during collection; the completed rerun supersedes that failure. Logs: ignored `.local-qa/tree-guarded-tests.log`.
- APP TypeScript: passed.
- Isolated provider-disabled APP production build: passed, including TypeScript and all 33 static pages; process exit 0. Output `.next-qa-tree-guarded-build` omits standalone copying as required by the local runbook. Log: ignored `.local-qa/tree-guarded-build.log`.
- APP ESLint: zero errors, eight existing warnings outside the changed tree/search files. Log: ignored `.local-qa/tree-guarded-lint.log`.
- Documentation index/link/metadata checks: passed after concurrent feature documentation edits settled.
- Locale parity: passed for all nine catalogs. Locale references: zero errors, 96 dynamic calls skipped and one unmapped columns file.

## Runtime and UI

Started a provider-disabled APP launcher on port 4100 against the existing loopback PostgreSQL. `/api/health/ready` returned `ready`. Normal Credentials login with the local fixture succeeded. Chrome visibly displayed the existing seven-person/two-pet tree, opened **Adicionar membro da família**, and displayed the new **Perfis sob minha guarda** control.

Concurrent APP sessions on the same hostname invalidated the shared session cookie. The guarded search returned HTTP 401; the dialog visibly showed **Não foi possível buscar os perfis. Tente novamente.**, with **Adicionar** disabled. This verifies the expired-session UI boundary, not a successful memorial inclusion.

A temporary copy of the isolated launcher under `.local-qa` allowed only the additional loopback hostname `tree-guarded.localhost`, to isolate cookies without changing tracked auth configuration. Chrome then repeatedly timed out on navigation, button interaction and screenshot capture. The successful selection → save → reload and revoked-guardian-after-selection scenarios remain **n/a / pending manual validation**. No screenshot or persisted family relation is claimed as a pass.

## Cleanup and limits

Created only disposable memorial `ctreeguardqa20261029memo` (Memorial Árvore QA), with accepted guardianship for the local fixture. Cleanup deleted that exact temporary profile (one row); the independent remaining-fixture count was zero. Its guardian row cascaded; no production data or existing family relation is changed. Owned dev launchers were stopped before the isolated build. The build exited successfully; only this task's generated TypeScript include paths were removed. Existing PostgreSQL and other chats' listeners/output files are preserved. Temporary launcher, fixture scripts and logs stay ignored under `.local-qa`.

No schema migration, email, checkout or cloud data mutation is required. Production deployment and full browser acceptance are separate from the checks above.
