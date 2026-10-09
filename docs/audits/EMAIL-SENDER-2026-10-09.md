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
included. The existing unpublished `77d4bc0` SEQ QR fix is already part of this
branch's source history; the standard deployment builds the committed branch.
No schema changes or credential rotations are required by the sender change.

## Tests

- Prisma generation and all workspace typechecks passed.
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
Deployment and post-deployment verification evidence will be appended after
the immutable build is available. Production is not considered verified by
the local provider acceptance above.

## Recovery and limits

The old immutable image tag above is the application rollback target; it also
restores the rejected old sender. Prefer correcting a failed release forward.
Preserve Hostinger website records, Azure hostname/certificate bindings and
existing secrets. A provider-only sending key cannot list Resend domains.
