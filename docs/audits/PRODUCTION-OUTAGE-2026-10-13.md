# Production outage investigation — 2026-10-13

## Scope and source

User requested investigation and restoration of all production apps using Azure
CLI. Investigation at approximately 13:00–13:12 America/Sao_Paulo
(16:00–16:12 UTC). Starting revision: `45305e6`, branch `main`, clean working
tree. Reviewed the root guide, Azure deployment/operations guides, observability,
open gaps, testing/local-development runbooks, October 9 release audit and
infrastructure/runbook changes since `6e06634`. No application, schema, image,
DNS, secret or cloud resource changes were made during this investigation.

## Production runtime evidence

Subscription: `c710b26f-e3c7-4a45-9477-eaaf3bdcc329`, resource group
`rg-genealogiq-prod`.

| Check | Observed result |
| --- | --- |
| APP, BMS and SEQ custom-domain `/api/health/live` | Each HTTPS request timed out after 20 seconds; curl status `000`, not an HTTP response |
| All three Container App resources | `provisioningState: Failed`; current ingress/latest/ready fields unavailable |
| Revision listing for each app | `ManagedClusterSuspended`: compute for `cae-genealogiq-prod` suspended because the subscription has been disabled |
| Cached `az account show` | `Enabled`; insufficient evidence of current account health |
| Live subscription ARM GET, API `2022-12-01` | `state: Warned`, `quotaId: FreeTrial_2014-09-01`, `spendingLimit: On` |
| Container Apps environment | Provisioning `Succeeded`, original domain and IP `20.197.202.148`; this did not establish active compute |
| PostgreSQL | `Ready`, public network access `Disabled`, original private delegated subnet/DNS zone |
| DNS | Apex resolved to `20.197.202.148`; BMS/Sequoia CNAMEs matched their original Azure-generated hostnames |
| Metric alerts | All eight existing alerts enabled; incident detection/delivery not established |
| Daily-job execution listing | Azure `InternalServerError`; current execution outcome unavailable |
| Activity log | Resource-group 24-hour query and subscription seven-day failed-event query returned empty; no outage onset/cause inferred from absence |
| Resource Health query | Authorization/provider-registration error; no Resource Health pass claimed |

The shared compute suspension is the confirmed immediate blocker. The free-trial
policy and `Warned` state require billing-owner investigation, but these API
responses do not prove the exact credit balance, expiry date or billing trigger.
Database control-plane readiness is not a data-integrity or app-connection test.

## Recovery status and next steps

**Unresolved: awaiting subscription billing/reactivation.** Asked the user to
review Azure Portal > Subscriptions > Azure subscription 1 and resolve its
reactivation notice. No paid-plan acceptance or payment change was attempted.

Once the live ARM state is `Enabled`, recheck the existing app revisions and
custom-domain live/ready endpoints. If compute remains suspended, investigate
Azure recovery/support before changing infrastructure. If individual revisions
need intervention, inspect and restart only the affected existing revisions.
Verify all three sign-in pages, anonymous protected-route rejection, default
and custom-host health, certificates and daily-job execution visibility. Follow
the [Azure runbook](../AZURE-AGENT-RUNBOOK.md) for the remaining verification.

No release, migration or rollback was performed. Previously recorded release
images and migration history remain historical evidence until Azure exposes
the active revisions again. Do not claim service restored from subscription
activation alone.

## Tests, local runtime, UI and cleanup

- Source: documentation-only incident/runbook update; no product behavior changed.
- Tests: `node scripts/check-docs.mjs` passed (4 guides, 40 features, 2,511 local
  links, 161 source references); `git diff --check` passed. No application
  suite/build was required for a cloud account diagnosis.
- Local runtime: attempted the isolated three-app launcher with port offset 1000;
  it exited before starting apps because local PostgreSQL on 5432 was unavailable.
- UI/persistence: n/a. Local three-app sign-in/save/reload/sign-out baseline lacks
  its PostgreSQL prerequisite; production UI and authenticated persistence remain
  blocked by compute suspension. HTTP timeout evidence is not UI verification.
- Cleanup: launcher started no app children; no owned server, job, tunnel, cloud
  write, deployment or migration needs cleanup.

## Verification log

| Date | Revision | Scope | Evidence / limits |
| --- | --- | --- | --- |
| 2026-10-13 | 45305e6 + incident documentation | Source/runtime | Subscription suspension confirmed independently by live ARM and all three revision APIs; recovery remains blocked on account reactivation. |
