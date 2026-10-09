# Verified Genealogiq email sender — 2026-10-09

## Source and scope

The user authorized changing the local and production sender after configuring
the Resend domain in Hostinger. The shared transport now sends from
`no-reply@genealogiq.com.br` in APP, BMS and SEQ. The former
`no-reply@rohling.com.br` sender returned HTTP 403 `validation_error` because its
domain was not verified for the BMS credential. Azure BMS logs showed repeated
`Email delivery was rejected by the provider` errors during staff invitations
and resends. The existing staff action propagates this failure to the error page;
graceful provider-failure UI is outside this sender correction.

Work stayed on the existing `main` branch. Unrelated working changes were not
included in the sender commit. The already committed `77d4bc0` SEQ QR fix and
`ac34bc1` BMS consumer-directory change are ancestors of sender commit
`4d1af78731b511be055cd2a8391f9b5310929758` and are included in its release.
No schema changes or credential rotations are required by the sender change.

## Tests

- Prisma generation and all workspace typechecks passed.
- Lint passed with existing warnings; migration shape, schema parity, locale
  parity/references, documentation checks and Bicep compilation passed.
- The deployment YAML parsed successfully. Contract checks verified the optional
  SHA input, exact checkout, full-SHA validation, matching build/deployment image
  tags and deploy-after-build dependency. The successful release also exercised
  the pinned-source path on GitHub's Linux runners.
- Full Vitest: 114 files / 999 tests passed; four opt-in integration files /
  24 tests skipped. This run includes unrelated working-tree changes and is
  recorded as workspace evidence, not as an isolated production-source run.
- The email suite has eight tests, including a literal expectation for the
  verified sender, BMS setup URL and 72-hour invitation text. Existing tests
  cover resolved provider rejection and thrown transport failures.

## Runtime and provider evidence

- Public DNS resolved the DKIM TXT, both sending CNAMEs and DMARC record.
- Direct API test from the new sender returned HTTP 200 with message ID
  `01a120c9-1d25-7e33-8374-3012d2359448`.
- A subsequent test invoked the changed local shared `sendFeedbackEmail`
  transport with the BMS environment credential and the user-authorized inbox.
  The actual shared function returned successfully after Resend acceptance.
  Neither test establishes inbox receipt.
- Local BMS product/UI and persistence: n/a. The documented isolated launcher
  stopped before starting the app because loopback PostgreSQL was unavailable.
  Docker's engine connection was denied and `docker desktop start --timeout 30`
  timed out. No local database or application process was created by the launcher.

## Production

Before deployment, APP/BMS/SEQ used image tag
`8422e6cacd3af9d7aeb151afdd3259e6ad6e887d`, revision `--0000011`.
The enabled subscription was verified as
`c710b26f-e3c7-4a45-9477-eaaf3bdcc329`.
The image-only what-if was reviewed before publication: all three Container App
images change to the verified SHA; other differences were Azure-computed
read-only fields. No DNS, certificate, identity or secret configuration change
was applied.

The initial push raced with another task's `e80c449` commit. Its automatic
deployment run `37935982982` was canceled during builds, before any deployment
job ran. A dispatch using release tag `email-sender-20261009-4d1af78` failed
Azure login because the existing federated identity only trusts `main`.
No identity permissions were changed. The deployment workflow now accepts an
optional exact `source_sha`, checked out and validated before building; manual
dispatch stays on `main` and all image tags use the same verified SHA. This
allows release of `4d1af78` without including the later concurrent APP change.

### Completed release

- Workflow fix: `01201a0`. Successful pinned-source run:
  [37936272340](https://github.com/genealogiqdev/genealogiq/actions/runs/37936272340).
- APP/BMS/SEQ images use immutable tag
  `4d1af78731b511be055cd2a8391f9b5310929758`. All builds, migration and Azure CLI
  deployment/verification steps succeeded.
- Migration execution `job-genealogiq-migrate-prod-vd9lng8` succeeded. The
  sender change itself introduced no migrations.
- All three apps report `Succeeded`, latest-ready revision `--0000012`, and
  100% traffic to the latest revision. BMS additionally reported active,
  Healthy and Running in the revision query.
- Both `/api/health/live` and `/api/health/ready` returned HTTP 200 on
  `genealogiq.com.br`, `bms.genealogiq.com.br` and `sequoia.genealogiq.com.br`.
- A read-only scan inside the serving BMS container found three compiled JS
  files containing `no-reply@genealogiq.com.br`, zero containing the former
  sender, and a populated Resend process credential (value never printed).
- A real test from that BMS container, using its process credential and the
  new sender, returned Resend HTTP 200, message ID
  `01a120da-c6a2-7201-8256-83085ecaabd5`. Recipient was the user-authorized inbox.
  This proves production provider acceptance, not inbox delivery or a new
  authenticated staff-resend UI run.
- Production UI: not re-exercised. The connected browser inventory failed
  with an unavailable Codex auth token; no authenticated browser was used.

### Process cleanup

The owned Azure shell was exited and the CLI reported successful disconnect.
The local launcher never created an app process because its DB prerequisite
failed. Existing Docker processes were left intact; no shared services or
volumes were stopped/deleted. The failed long-command probe helper was removed;
ignored what-if receipts remain in `.azure` without credential values.

## Recovery and limits

The old immutable image tag above is the application rollback target; it also
restores the rejected old sender. Prefer correcting a failed release forward.
Preserve Hostinger website records, Azure hostname/certificate bindings and
existing secrets. A provider-only sending key cannot list Resend domains.
