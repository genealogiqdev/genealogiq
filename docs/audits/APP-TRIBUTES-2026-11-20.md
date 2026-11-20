# APP multiple tributes, 2026-11-20

This audit covers the user report that Add disappeared after one tribute.
The starting revision was `084670f` on local branch `main`.
The starting working tree was clean.
Other SEQ work appeared during this session.
It is outside this change.

## Source

The old list replaced Add with Edit when it found an author's tribute.
The old edit page loaded that row without a selected ID.
The old action used an upsert on the author/profile pair.
An upsert adds a row or replaces the row that matches its key.
The schema allowed only one row for that pair.
No tribute source changes appeared in the checked paths since `6e06634`.

The new list keeps Add available.
The Add link opens an empty form.
Each owned tribute has an edit link with its own ID.
Pending and rejected tributes have separate private edit links.
The edit query and action check the ID, author and profile.
New and edited tributes still need approval.
The public query still reads only approved rows.
The image check still uses the target profile and signed-in author prefix.
Removing an image clears its stored link.
Image bytes stay when another tribute uses them.

The migration removes the old unique key and adds a regular index.
It changes no existing tribute or notification row.
It handles both a legacy unique index and a database constraint.

## Tests

- The full `pnpm test` run passed 1,567 tests in 167 files. It skipped 71 opt-in tests in ten files. This run included the concurrent SEQ working tree.
- The first focused tribute run passed 23 tests in three files.
- The final focused run passed 29 tests in four files. It includes the new edit-page boundary tests.
- `pnpm typecheck` passed all eleven tasks.
- `pnpm lint` passed with no errors. It kept eight APP, 21 BMS and 20 SEQ warnings outside the tribute changes.
- Schema parity, migration shape and locale parity passed. The migration check found 80 ordered migrations.
- Locale references had no errors. The check skipped 103 dynamic calls and one unmapped columns file.
- The documentation check passed. Its first run saw a link to the concurrent SEQ audit before that file existed. A later run passed after that file was saved.
- The full APP production build passed. Compilation took 6.6 minutes. TypeScript and all 33 static pages passed. The tribute list, edit and moderation routes were present in the build output.

## Local database

Started only this repository's PostgreSQL and Azurite services.
The local database had 25 APP users and no tribute rows.
The old key existed as a unique index.

The SQL test used a transaction on the local database.
It added one synthetic approved tribute.
The old key rejected a second tribute from the same author to the same profile.
The test applied the exact migration twice.
It then added a second tribute and edited its text by ID.
Independent checks found two rows.
The first row kept its original text and APPROVED status.
The second row had the edited text and PENDING status.
The test rolled back all its rows and schema changes.
The migration was then applied only to the normal local database for APP startup.

## Runtime

Started `node scripts/local-qa.mjs --app=app`.
It used the loopback database and disabled external providers.
APP started on `http://localhost:3000`.
The first HTTP probe timed out during slow compilation.
A later `/api/health/ready` request returned 200.
This proves database readiness.
It does not prove a tribute submission.

## Browser

Selected the connected Google Chrome integration.
The first local tab navigation timed out.
The connection then returned `GetCursorPos failed: Access is denied (0x80070005)`.
The Chrome DOM access attempt had the same error.
No authenticated browser submission, approval or save/reload was completed.
No built-in browser was used.
The remaining browser scenarios are in [TRIBUTES](../../apps/app/docs/TRIBUTES.md#manual-scenarios).

## Release and next work

The release owner must publish the APP code that uses tribute IDs first.
The owner must then apply the reviewed migration in the same release window.
The old database key still blocks second submissions until this step is done.
Old APP code uses the removed unique key.
It cannot run after this migration.
The release owner must then test Add, two submissions, approval, exact-ID editing and denied access in Chrome.
No production migration, merge or deployment was done in this task.

## Final checks and cleanup

Stopped the owned APP launcher with Ctrl+C.
Its port 3000 listener was removed.
Restored only the APP TypeScript paths that this launcher added.
The transaction test left no synthetic tribute rows.
PostgreSQL and Azurite remain available for the other local SEQ task.
No database volume was removed.
The APP build uses `.next-qa-tributes-build`, a separate ignored output folder.
It omits standalone copying.
It is a local compilation check, not a deployment package.
The build exited with code 0.
Restored only its generated APP TypeScript include paths.
Kept the local `main` branch.
The review publication uses the verified GitHub `main` base.
It contains only this change, without the separate SEQ commit made during the session.

## Related

## Release preparation after the user's merge and deploy request

The user authorized production release later on November 20.
The release adds a guarded job in the existing APP build.
Normal builds do not run it.
It accepts only the named APP project, production and the existing Neon database.
The job checks for the one tribute migration.
It saves a private row snapshot and reads back its hash before migration.
The operator must publish ID-based APP code before enabling the migration mode.
The job then uses canonical Prisma migration and checks its saved SQL hash.
Its message check adds two temporary rows and edits the second by ID.
It rolls back the temporary rows.

Two release guard tests passed.
One real PostgreSQL test passed in a disposable local database copy.
That test reproduced the old duplicate rejection.
It applied the exact SQL twice and checked the message test and rollback.
Documentation, migration shape and whitespace checks passed.
Production execution and the final release receipt are recorded in the later release audit.

[TRIBUTES](../../apps/app/docs/TRIBUTES.md) · [DATABASE](../DATABASE.md) · [LOCAL-DEVELOPMENT](../LOCAL-DEVELOPMENT.md) · [TESTING](../TESTING.md)
