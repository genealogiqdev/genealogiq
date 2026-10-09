# APP biography Unicode investigation — 2026-10-09

## Outcome and limits

The new screenshot matches one of the two biographies whose accents were
recovered on 2026-10-07 while unknown symbols were deliberately preserved.
Its remaining runs contain three and four question marks. These are compatible
with lost punctuation or emoji, but neither their original characters nor the
historical operation responsible for the loss have been established.

Current biography code and a real local save/reload preserve accents and emoji.
This change adds two regression cases and documents the diagnosis; it changes
no application runtime code, production content, database schema or deployment.
The six unresolved production fields recorded in the [earlier name follow-up](APP-TEXT-ENCODING-2026-10-09.md)
remain unresolved. Unknown symbols need original text or owner confirmation.

## Source evidence

Work remained on main at 12bbeb6, with concurrent unrelated working changes.
History since the biography document's 6e06634 verification was checked along
with the current working tree. The biography text path had no intervening
runtime changes; the latest action changes were media authorization at a165f45.

- BioEditForm keeps quote/text in React state and passes those strings directly
  to saveBio. Normal Credentials authentication and accepted guardianship gate
  the editor and mutation.
- bioSchema trims surrounding whitespace. saveBio passes the parsed strings
  unchanged to both Prisma upsert branches. Limits reject excessive content
  without transcoding or cutting off text bytes.
- Bio.text maps to PostgreSQL text; Bio.quote maps to varchar(140). The shared
  client uses the PostgreSQL adapter. No ASCII conversion exists on this path.
- getBioByUserId returns the stored values; the reader splits the biography at
  blank lines and renders its paragraphs as React text.
- The tracked transfer-database.sh introduced in 8cbbeb7 uses a custom-format
  pg_dump file, or downloads that file directly, and gives the file to
  pg_restore. It does not decode content through a text pipeline. This source
  review cannot establish which historical command populated the damaged rows.

The prior private audit/approved manifest identifies the screenshot's biography:
multiple question-mark runs before the accent repair, and only the three- and
four-character runs afterward. The independent production comparison earlier
on 2026-10-09 confirmed the approved value. No fresh production query was
needed for this follow-up, and no private biography is copied into Git.

## Controlled encoding reproduction

On this Windows runtime, applying
`[Text.Encoding]::ASCII.GetString([Text.Encoding]::UTF8.GetBytes($sample))`
to synthetic strings produced these exact values:

| Original | UTF-8 bytes (hex) | ASCII-decoded result |
| --- | --- | --- |
| É | c3 89 | ?? |
| ção | c3 a7 c3 a3 6f | ????o |
| … | e2 80 a6 | ??? |
| 👽 | f0 9f 91 bd | ???? |
| 🌎 | f0 9f 8c 8e | ???? |

This reproduces the loss signature, not the historical writer. Four question
marks cannot distinguish the two illustrated emoji or two accented letters;
literal punctuation is also possible. Composed emoji may use multiple code
points and more than four bytes. A display-time replacement would invent data.
The earlier audit found PostgreSQL server/client encoding UTF8; its available
pre-Azure dump had no matching originals. No stronger provenance is claimed.

## Automated evidence

| Check | Result | Scope |
| --- | --- | --- |
| Focused biography action specs | 11 passed | Literal accents, punctuation, single/composed emoji, both create/update payloads, unknown runs and existing permission/quota guards |
| pnpm test | 118 files / 1,064 tests passed; five files / 33 tests skipped | Full current working tree, including concurrent changes; the skips are opt-in consumer access/revocation, partner onboarding, coupon and storage integrations |
| Documentation / patch checks | Passed | Four guides, 40 features, 2,435 local links, 161 named source references, 12 optional evidence links; git diff --check passed |
| Build / Prisma generation / schema migration | Not run | No runtime module, dependency, bundle or schema change in this investigation |

Unit assertions exercise the actual biography schema and the mocked Prisma
write boundary. They do not independently demonstrate transport or persistence;
the local checks below cover those layers.

## Local runtime and UI evidence

An existing, identified native PostgreSQL process supplied the loopback
genealogiq database and normal seeded identity. The earlier Docker pipe failure
remains historical evidence; no Docker permissions or shared service setup was
changed. The normal APP launcher ran on 127.0.0.1:3700 with isolated output.

A unique disposable memorial and accepted guardianship were prepared locally.
The first fixture transaction rolled back on a parameter-type mismatch; using
distinct parameters for the differently typed columns allowed preparation.
The installed Chromium was driven through Playwright because the Codex browser
tool's asset-path failure had prevented initialization earlier in this session.
Authentication used the normal Credentials form, without injected sessions.

The owner saved quote `Memórias de São José 🌳` and two text paragraphs:
`Nasci no verão… 👽🌎`, followed by `Família ❤️ 👨‍👩‍👧‍👦. Continua???`.
Reader reload and editor reopen retained the exact strings. Independent
PostgreSQL queries confirmed both fields and their blank-line separator;
server_encoding and client_encoding were UTF8. The visible editor and reader
glyphs were inspected, including accented letters, ellipsis and emoji.

An anonymous editor request redirected to sign-in, exposed no biography input
and left both values and updated_at unchanged. The public memorial reader still
showed the correct glyphs. The first reader screenshot preceded the paragraph's
entrance animation; a second read-only capture waited for full opacity and was
visually checked. A screenshot-time caret style triggered a development
hydration warning on the editor; the exact field values were unchanged.

Ignored .local-qa retains the synthetic fixture/browser scripts, result JSON,
full test log and editor, anonymous-boundary and visible-reader screenshots with
the bio-unicode-20261009 prefix. This is local product evidence; no production
save/reload with a newly inserted emoji was performed.

## Cleanup

The fixture profile was deleted using its exact ID, role and synthetic names.
Subsequent counts confirmed zero remaining fixture profiles, biographies and
guardianships. No media objects were created. Both browser instances closed.
Only the recorded port-3700 Next process tree was stopped; shared PostgreSQL
and other tasks' servers were retained. No port-3700 TypeScript include entries
remained to remove. Other working-tree changes were kept outside this commit.

## Related

[Biography contracts](../../apps/app/docs/BIOGRAPHY.md) ·
[Recovery runbook and DATABASE-G2](../DATABASE.md#recover-damaged-app-text) ·
[Original production recovery](APP-TEXT-ENCODING-2026-10-07.md)
