# B2B urn printing and final buyer activation — November 6, 2026

## Request and result

The user clarified the urn sale chain. Genealogiq sells codes to MIZPAH.
MIZPAH uses SEQUOIA and prints the codes on urns. It sells urns to funeral homes.
The funeral home knows the final buyer only when it sells the urn.
Printing can happen before an order or for a confirmed order.
Neither case needs a final APP account before printing or wholesale sale.

The starting branch was `main` at `d941f5b`. The working tree was clean.
The [November 5 release](SEQ-B2B-2026-11-05.md) required advance delivery in SEQ.
This correction removes that requirement for unassigned B2B codes.
It keeps advance delivery as an option when the buyer is known.

## Source and contracts

Use **Meus GenCodes → Imprimir QR Codes para urnas**.
Download 1–100 unprinted stock codes. Download does not record a sale or create accounts.
After printing, confirm the printed code list. This changes only the print date.
Register the funeral home under **Clientes → Empresas B2B**.
Record the wholesale sale with the exact codes on the shipped urns.
The sale accepts a list separated by lines, spaces, commas or semicolons.
It checks quantity, duplicates, stock and tenant scope on the server.

The buyer scans the printed QR, creates an APP account and confirms the email.
The normal confirmation link returns to that QR. The buyer creates the memorial.
One transaction assigns the buyer, links a tenantless account to the manufacturer,
grants the existing finite Premium year, creates the memorial and spends its reserved credit.
The assignment does not remove another unit from stock.
The original credit expiry still applies. Printing does not renew it.
Another tenant's account cannot claim the code. A named recipient still owns its code.
Company and code locks use the same order as SEQ delivery.
There is no schema change or new migration in this release.

## Automated evidence

- Default suite: 164 files and 1,524 tests passed. Ten opt-in files and 71 tests skipped.
- Ten enabled PostgreSQL B2B tests passed. They cover exact lots, self-activation, expiry, foreign buyers, concurrent buyers and rollback.
- APP, SEQ and services type checks passed.
- APP and SEQ local production builds passed in sequence.
- Source lint passed with no errors: 20 existing SEQ warnings and eight APP warnings.
- Documentation, schema, migration structure and locale checks passed. The locale key check skips 103 dynamic calls and one unmapped columns file.
- Three print action tests passed again after the final translation variable change.

The SQL tests use a disposable loopback database. They do not use production data.

## Local runtime and Google Chrome evidence

Started the documented local PostgreSQL and Azurite services, APP and SEQ.
Used normal SEQ owner credentials in installed Google Chrome through Playwright.
The desktop Chrome automation connection was unavailable.
Created a separate local MIZPAH fixture with 50 funded codes and no final buyers.

1. Downloaded and confirmed 20 printed codes for stock.
2. Checked the database: all 50 codes remained available and no buyer existed.
3. Registered a funeral home and sold the exact 20 printed codes.
4. Downloaded and confirmed another 20 codes for a confirmed order.
5. Sold that exact second list to the funeral home.
6. Checked 40 sold codes, ten stock codes and no final buyers.
7. Opened each lot's QR as a new anonymous buyer.
8. Used normal APP registration and the actual email confirmation link.
9. Created one memorial from each lot. APP opened each public profile.
10. Reloaded SEQ. It showed 38 available resale codes, zero delivered codes and two activated codes.

Independent SQL confirmed two original 20-code lots matching the printed lists.
It found two verified, password-bearing buyers linked to MIZPAH, one Premium sale per buyer,
two activations and 48 remaining credits. Of these, 38 remain reserved for resale.
An independent QR image decoder read the exact APP activation URL from the printed artwork.
The print file contains 20 QR images.
A request to print 100 codes failed with a stock message. It changed no stock or buyer rows.
A repeated scan opens the existing memorial. It does not offer a second activation.

The normal email transport was replaced only in the local APP process.
The test transport accepts only synthetic `@genealogiq.test` recipients.
It saves the real verification message locally and sends no external email.
This proves registration, token verification, session and QR return in the local product.
It does not prove delivery to a real inbox.
Ignored evidence is under `.local-qa/b2b-20261106/`.

## Limits and remaining work

Printing is an operator workflow. Two operators can download the same unprinted codes before either confirms printing.
Use the exact shipped list when recording a sale. Database checks prevent selling the same stock code twice.
Real inbox delivery, authenticated production resale and physical device printing remain separate acceptance checks.
Existing payment and recovery limits in [the Vercel runbook](../VERCEL-MIGRATION.md) remain open.

## Release and cleanup evidence

Local APP and SEQ processes and owned Chrome sessions were stopped.
Owned PostgreSQL and Azurite containers were stopped. Database volumes and prior local data remain.
The new test rows stay in the separate local MIZPAH fixture. Generated tsconfig edits were restored.
[GitHub PR #211](https://github.com/genealogiqdev/genealogiq/pull/211) is merged.
GitHub verification and all three production container jobs passed.
The released source is `68dbf9882bb486faf5ea8f3a86945643147f9a39`.
The merge commit is `d047abdd607814538533b2304beef1e844a2021a`. Their tracked source trees are identical.

APP deployment: `dpl_4wE1meNhJCGEPwoU3GrrZHtrDGqs`.
SEQ deployment: `dpl_8eHvyXBY1WQWQYFQmeFBHEZMaqCy`.
Both are READY, target Production and use the `gru1` function region.
Both were promoted from the reviewed source archives. No migration ran.
The live HTML at `genealogiq.com.br`, `www.genealogiq.com.br` and
`sequoia.genealogiq.com.br` names these exact deployment IDs.
All four custom HTTPS hosts returned 200. All three database readiness checks returned 200/ready.
Anonymous APP document access returned 401. An unknown QR kept the normal not-found result.
The protected SEQ company page returned the streamed 307 sign-in redirect and no company form.
An initial HTML check looked for a rendered password field; the corrected check reads the redirect marker.
BMS keeps its existing production deployment.
Sanitized release receipts are in `preflight.json`, `production-source.json` and `public-checks.json`
under the ignored evidence folder.
The release uses APP and SEQ source archives from the same reviewed commit.
Do not enable the November 5 migration flags again.
