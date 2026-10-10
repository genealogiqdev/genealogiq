# BMS B2C new-customer wizard — 2026-10-09

## Source

Started on `main` at `01201a0`. Reviewed root/BMS guides, CONSUMERS, PARTNERS, GAPS, TESTING, LOCAL-DEVELOPMENT, the installed Next.js form guide and changes since the feature verification revisions. The working tree already contained APP QR, consumer-expiry and documentation changes; another task added consumer revocation during this work. These are separate from the wizard change.

`CustomerNewForm` now offers **Guardião / Usuário Final** and delegates that selection to `ConsumerForm`'s five-step mode. The existing compact consumer route stays available. Names, access email and optional purpose reach the existing platform-protected consumer action; the last steps review the App administrator/guardian and the complimentary 12-month Premium grant. The shared stepper retains partner labels when a partner segment is selected. All new copy is present in pt-BR, en-US and es-MX.

No schema, entitlement writer, mail provider or staff authorization change belongs to this task. A B2C selection creates no Tenant/staff User and does not grant guardianship over an arbitrary profile. Existing duplicate prevention, paid-period preservation, email-pending recovery and live platform privilege checks remain authoritative.

## Automated checks

Pending final run. New tests assert literal App/Premium step labels, retained partner Sequoia labels, partner-action rejection of the B2C segment, and exclusion of partner fields from the consumer grant arguments.

## Runtime and UI

Pending local browser verification and independent persistence checks. A native PostgreSQL fixture is already listening on loopback; Docker CLI access is unavailable, so this task does not own or stop that database.

## Cleanup and limits

Pending owned-process cleanup. Real inbox delivery and a production deployment are outside this task's verification.

## Consolidated completion follow-up, 2026-10-09

The pending statements above describe the interrupted original chat. The [consolidated release audit](PRODUCTION-RELEASE-2026-10-09.md) records the completed source review, final deterministic and disposable PostgreSQL checks, deployment and cleanup. Current browser automation was waived by the user; earlier recorded browser evidence is preserved without being counted as a new UI run. The expiry repair version 2 additionally cancels only the replaced migration allowance so a later gift revocation cannot revive it; its new preview/hash is recorded in that audit.
