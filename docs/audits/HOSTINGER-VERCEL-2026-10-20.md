# Hostinger DNS follow-up — 2026-10-20

## Source and scope

At `773be4d`, the user reported updating Hostinger. The working tree was clean; application source remains unchanged from the completed recovery. This follow-up checks DNS, TLS, project/deployment state and remaining configuration. No DNS record, database row, media object or production deployment was changed by the agent.

## DNS and HTTPS evidence

Hostinger's authoritative `pixel.dns-parking.com` server and Cloudflare's `1.1.1.1` resolver returned the exact Vercel records:

| Host | Record | Value | Observed TTL |
| --- | --- | --- | --- |
| genealogiq.com.br | A | 216.150.1.1 | 1,600 seconds |
| www.genealogiq.com.br | CNAME | 73eb46deb7a75d29.vercel-dns-017.com | 300 seconds |
| bms.genealogiq.com.br | CNAME | 887e50f92d2ea1fa.vercel-dns-017.com | 14,400 seconds |
| sequoia.genealogiq.com.br | CNAME | 8a6c8eb08070084e.vercel-dns-017.com | 14,400 seconds |

Nameservers remain `pixel.dns-parking.com` and `byte.dns-parking.com`. Mail records were not independently compared with the prior zone. These observations confirm the named resolvers, not universal cache expiration.

Vercel's first API response retained Azure's old apex address and a stale SEQ CNAME. After the normal apex Refresh action in Chrome, the subsequent API results returned all four current configurations with `misconfigured=false` and no conflicts. Chrome shows No Deployment for APP's domains; screenshot `.local-qa/vercel-domains-no-deployment-20261020.png`.

At approximately 20:28 UTC, apex and www returned HTTP 404 over validated TLS from Vercel. BMS and SEQ failed the TLS handshake before an HTTP response, including a separate request pinned to Vercel's advertised address with certificate checks still enabled. Those failures do not prove a particular certificate-provisioning cause. Complete deployment and repeat HTTPS/health checks before claiming the services are restored.

## Deployment prerequisites

All three project inspections and the team's deployment list confirm no deployment and no Git link. Production environments still contain the recovered Neon/Blob connections and prepared non-secret origins, but no AUTH_SECRET, BMS CRON_SECRET or application provider settings. The historical local build/test evidence is in the [recovery audit](NEON-RECOVERY-2026-10-20.md); it does not prove a deployed application.

The existing Vercel CLI 64.5.0 reports logged out. Started its normal device sign-in and opened it in Chrome for the user's Allow Access action. Screenshot `.local-qa/vercel-cli-login-20261020.png` is ignored local evidence. The browser confirmation policy requires confirmation for this separate CLI account grant. The sign-in process may remain waiting while the user responds; its code can expire and is not a durable credential or runbook value.

Existing Azure parameter exports contain Key Vault references rather than inline secrets. A read of the referenced Resend secret did not succeed. Local BMS configuration has a live-prefixed Stripe key and a nonempty Resend value, but this only establishes their presence, not validity or complete production provider setup. Values were not printed, copied into documentation or written into a new credential file. Do not substitute local placeholders for missing production configuration.

## Validation and remaining work

This change is documentation only. DNS/API/HTTPS checks above are current runtime evidence; no application UI or business transaction was exercised. The three-app baseline was not repeated because application behavior did not change. Finish the CLI sign-in, secure environment provisioning and reviewed deployment setup, then verify authentication/tenant scope, health, billing/cron, mail and media. The recovery-retention and legacy public-document gates remain in [VERCEL-MIGRATION](../VERCEL-MIGRATION.md).

`node scripts/check-docs.mjs` passes for four guides, 40 features, 2,651 local links and 161 named source references; `git diff --check` passes. No product server or Docker container was started. CLI inspection and Azure read commands have completed; the device login remains the only task-owned waiting process. No push or deployment was performed.
