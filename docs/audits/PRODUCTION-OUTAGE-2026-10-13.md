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

## Initial recovery status and next steps

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

## Follow-up after user upgrade

At 13:11–13:14 America/Sao_Paulo (16:11–16:14 UTC), after the user reported
upgrading the plan, the live subscription API changed to **Enabled**,
`PayAsYouGo_2014-09-01`, `spendingLimit: Off`. The billing upgrade is confirmed;
compute recovery is not.

- All three app resources still reported `Failed`, with ready/latest/ingress
  fields unavailable. APP revision listing continued to return
  `ManagedClusterSuspended`, including the 16:13:46 UTC recheck.
- All three custom-domain liveness requests again timed out, with 15-second
  bounds and curl `000`. No TLS/HTTP or product recovery pass is claimed.
- One authorized attempt to start the existing APP resource using
  `Microsoft.App/containerApps/start`, API `2025-01-01`, was rejected with
  `ReadOnlyDisabledSubscription`. No successful cloud mutation occurred; there
  was no reason to send identical start requests to BMS/SEQ while the provider
  still rejected subscription writes.
- PostgreSQL still reported `Ready` and public access `Disabled`; the environment
  still reported provisioning `Succeeded`. These do not establish app readiness.
- Read [Microsoft's reactivation guidance](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/subscription-disabled#after-reactivation):
  resources generally resume automatically; resource management may lag account
  activation, and a delay exceeding 30 minutes should be referred to Azure Billing
  Support. This is an escalation threshold, not a guaranteed recovery time.

**Current status: subscription active, applications still unavailable while the
Container Apps provider reports subscription suspension.** The remaining work is
to repeat revision/public health checks after provider recovery, then complete
the production UI/boundary and job checks above. Billing acceptance is no longer
the pending user action. No images, migrations, data, configuration, DNS or
secrets were changed, and no owned process remains running.

### Second recheck after activation

At 13:18–13:20 America/Sao_Paulo (16:18–16:20 UTC), on `f43cc69`, live
subscription state remained Enabled/PayAsYouGo/limit Off. All three app resource
summaries now returned `Succeeded`, `Running`, and latest/ready revision
`--0000013`. APP retained image
`acrgenohqluyie.azurecr.io/genealogiq-app:462f8a976ee02156f34e989778abdb00313baa57`
and 100% latest-revision traffic. These restored control-plane fields did not
correspond to serving traffic:

- Custom-domain live **and** ready requests for APP/BMS/SEQ all timed out at
  15 seconds. Azure-generated hostname liveness requests also all timed out.
- Revision list APIs for all three apps still returned `ManagedClusterSuspended`.
  APP revision show returned `RevisionNotFound` for the revision advertised by
  the app resource summary; it is not evidence that the revision was deleted.
- One further APP start request was rejected with
  `ReadOnlyDisabledSubscription`; no restart or configuration write succeeded.
- The managed infrastructure public IP still reported Succeeded with the
  original `20.197.202.148`; no managed infrastructure was changed.
- Daily-job history became readable: latest returned successful execution was
  `job-genealogiq-daily-prod-29860200` on October 10 at 06:00 UTC. Its configured
  schedule remained `0 6 * * *` and the scheduler retained release image
  `462f8a976ee02156f34e989778abdb00313baa57`. Historical execution success is not
  proof that the schedule has resumed; no extra mail-producing job was started.

**Still unavailable at 13:20 local time.** Account activation and restored app
summary metadata are confirmed; live compute/provider recovery remains blocked.
The 30-minute resource-access escalation threshold is approximately 13:41 local
time, measured conservatively from the first observed Enabled state at 13:11.
This is not a promised recovery deadline. Production browser/authenticated checks
remain n/a while HTTPS cannot connect; no local/cloud processes need cleanup.
The documentation checker and `git diff --check` passed for this appended audit.

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
| 2026-10-13 | 0a0e5ec + follow-up docs | Azure runtime | User upgrade confirmed by live Enabled/PayAsYouGo/limit Off; provider still suspended and APP start rejected. Public health still times out; app recovery pending. |
| 2026-10-13 | f43cc69 + follow-up docs | Azure runtime | Resource summaries now Running/Succeeded, but revision APIs still suspended, both custom/default HTTPS hosts timed out and APP start was rejected. Daily-job history readable; compute recovery pending. |
