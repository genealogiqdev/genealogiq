# Legacy memorial plaque scan follow-up — 2026-10-29

## Source and observed problem

Started on `main` at `f61444c`. Reviewed the existing `557974f` memorial-place redirects, the place query's profile scope, public-profile guard, Premium download action, Zod download contract and canonical GeoPlace schema. No schema, entitlement or provider change is required.

Decoded the user's first attached PNG locally with ZXing. It contains the older `/profile/<id>/places/<placeId>` format. A read-only request to that exact production URL returned a streamed Next redirect to the places list, rather than to the profile. In the reviewed resolver, that branch means the scoped place is unavailable. This observation does not establish whether the row was deleted, omitted from recovery or associated differently. The October 20 recovery's September data boundary is historical context, not proof of this row's history.

New behavior: after confirming the profile is accessible, a missing scoped place on a bare legacy URL opens that existing human memorial. Explicit details navigation retains missing-place handling. Missing profiles, private living profiles and pet/living place links retain their existing boundaries. No place data from a different profile is read or shown. Existing generated memorial-place codes still resolve through their category rule. Premium export checks remain unchanged; a visitor scanning a public plaque does not need Premium.

## Automated verification

- Focused Vitest: 41 passed across place entry, Premium PNG/SVG action and QR preview specs. New literal expectations cover anonymous/authenticated missing-place fallback, explicit details, living/pet exclusion and missing-profile rejection. Existing privacy and Premium-expiry cases pass.
- APP TypeScript (`tsc --noEmit --incremental false`): passed.
- ESLint on both changed TSX files: passed.
- Full suite during concurrent work: 1,418 passed, 51 skipped, two failed. Failures were in `consumer-revoke.test.ts` and BMS `consumer.actions.test.ts`, whose source/tests were concurrently modified outside this change. This is not a full-suite pass.

## Local runtime and UI

The first PostgreSQL image pull failed with registry HTTP 502; a second compose attempt succeeded. Started APP using the guarded local launcher at `http://localhost:3000`, with external providers disabled. Used existing fixture memorial `clocalgrandfather000000001` and a nonexistent place identifier; no fixture creation/deletion or entitlement edits were needed.

Independent HTTP checks confirmed the streamed destinations: bare old link → memorial root; explicit details → places list; missing profile → sign-in; older `?place=` form → detail resolver. HTTP 200 alone is not counted as a redirect pass: the Next refresh destination was inspected.

Chrome visibly opened Antônio Silva's memorial from the anonymous bare old link. Explicit details navigated to the places list. Normal Credentials sign-in reached `/home`. The subsequent authenticated scan could not be verified visually: Chrome commands timed out/lost their tab and server logs reported a session secret mismatch while multiple local sessions were running. Authenticated scan/reload remains n/a for browser acceptance, although the deterministic authenticated fallback passes. No browser fallback was used.

The independent PostgreSQL snapshot of `app_geo_places` stayed unchanged (zero rows; MD5 `d41d8cd98f00b204e9800998ecf8427e`) before and after the repeated scan requests. Profile viewing can still run the existing view tracker; the new redirect does not write any place, QR or entitlement row. The owned APP launcher was stopped with Ctrl+C. PostgreSQL is retained because concurrent local tasks are using it. Generated local outputs/logs remain ignored. A production build was not run in this concurrently changing checkout; the route was compiled and exercised by Next locally.

The initial documentation check was blocked by another task's not-yet-created BMS consumer audit link. Final documentation verification is recorded at publication.

## Publication

The user explicitly chose to keep `main` and publish directly after being informed it is also the default GitHub base and already contains ten local commits. No main-to-main PR can be created. Publication verification is recorded in the final response; pushing source does not establish production deployment.
