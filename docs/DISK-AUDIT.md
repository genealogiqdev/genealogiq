# Read-only Windows disk audit

The [audit script](../scripts/disk-audit.py) inventories a directory or volume
using Python 3.10+ and the standard library. It reads file metadata and writes
reports to a new directory. It has no deletion, pruning, ACL, service-control,
network or file-content-reading mode. Keep reports outside Git: paths can reveal
private project names and personal filenames.

## Run and inspect

From the repository root in PowerShell:

```powershell
python -B scripts/disk-audit.py --root C:\ --output "$env:USERPROFILE\DiskAudit\run-2026-10-14"
```

Choose a new output directory on every run. The output contains `SUMMARY.md`,
`directories.csv` and `audit.json`. The JSON includes permission failures,
skipped links and the largest files. An output directory inside the scan root
is excluded. Existing report directories are never overwritten.

Scan each physical volume once. Windows `subst` aliases can point at a folder
on the same volume; summing the alias and original drive double-counts it.
Folder rows include descendants, so parent and child rows also overlap.

Directory figures are **logical bytes**, not guaranteed space savings. NTFS
hard links, especially in Windows and package stores, can count repeatedly.
Sparse/compressed files can occupy less than their length; selected large-file
rows include Windows allocated size where readable. The volume's used/free
space is measured separately. Modification age is not last use or evidence
that a project, installer or temporary file is disposable.

All junctions, symbolic links and other reparse points are skipped rather than
followed; cloud placeholders are not hydrated. Access failures are recorded and
propagated into folder rows. Inaccessible profiles are **unmeasured**, not empty.
For another user's profile, have that user run the script in their own session,
or run the audit from an elevated PowerShell session with the user's approval.
Do not take ownership or change permissions to complete an inventory.

## Preserve development work

| Finding | Conservative response |
| --- | --- |
| npm/Yarn/pip download caches, browser cache, shader cache, crash dumps | Review exact cache boundaries. Clear with the owning application's controls or package manager; close relevant applications and retain any irreplaceable offline/private package copies. |
| User Temp | Inspect old entries; retain unknown project data and active/locked files. A blanket deletion is not justified by the directory name. |
| `.next` / named QA builds / `.turbo` | Generated output may be rebuilt; confirm the exact directory and owning process first. Do not follow workspace links or remove similarly named source directories. |
| `.angular/cache` | Rebuildable Angular cache. Stop the project's build/watch process before using its cache-clean command. |
| pnpm store | Prefer `pnpm store prune` after inspecting its store path and offline requirements. Hard links mean logical size is not a space-saving promise. |
| `node_modules`, virtual environments, SDKs, `.cache/codex-runtimes` | Preserve installed development dependencies and runtimes. The word cache alone does not establish disposability. |
| Git worktrees, repositories, editor application state | Preserve source, uncommitted files, local commits, stashes and recovery/history data. Age does not prove that a worktree is abandoned. |
| Docker/WSL `.vhdx` | Preserve the disk and volumes. Compare `docker system df -v` and the guest filesystem's used space. Compaction is a separate backup/shutdown/verification operation; never delete the virtual disk to reclaim space. |
| Docker unused volumes or stopped containers | May contain databases and useful local state. Do not use volume pruning or broad system pruning under a cache-only cleanup scope. |
| Windows, Installer, WinSxS, pagefile | Preserve. Use Windows Storage/Disk Cleanup for eligible OS caches; never manually remove servicing files or a live pagefile. |
| Downloads, documents, backups, recycle bin | Review with the owner. These are not automatically disposable. |

If cleanup is separately authorized, first make the exact targets and exclusions
reviewable. Recheck absolute paths and junctions immediately before removal;
perform any Windows file removal entirely within PowerShell. Then measure real
free-space change and verify affected development tools/data. No cleanup command
is part of this audit utility.

## Verification

```powershell
python -B scripts/test-disk-audit.py
node scripts/check-docs.mjs
```

The independent fixtures cover literal byte/age totals, source content and mtime
preservation, saved-report persistence, an access-denied subtree, a reparse point
that must never be enumerated, report overwrite protection and conservative
classification. The real machine scan exercises the command and permission
boundary. This standalone utility changes no APP/BMS/SEQ behavior; product UI,
provider and database tests are not evidence of disk-audit correctness.

| Date | Revision | Layer | Evidence / limits |
| --- | --- | --- | --- |
| 2026-10-14 | `58d4145` + audit utility | Source | Metadata-only traversal, no-follow boundaries and report-only writes reviewed. Logical-size and access limits are explicit. |
| 2026-10-14 | Same | Tests | Five independent Python tests pass. |
| 2026-10-14 | Same | Runtime | C: scan completed in 790 seconds: 5,589,099 files and 847,951 directories; 72,353 reparse points skipped. Raw private reports are outside Git. The pc profile and protected OS directories remain unmeasured; 111 errors include one transient resource failure. No files were deleted. |
| 2026-10-14 | Same | Follow-up runtime | Final script scanned one Angular cache: 4,206 files, no errors; concise summary and JSON persisted. The transient dependency-folder error was retried successfully (nine files, 46,248 bytes), without rewriting the original full-scan evidence. |
| 2026-10-14 | Same | Documentation | Initial repository documentation check passed. A later check reported seven links to a missing BMS partner-email audit in unrelated concurrent edits; disk-audit links reported no failures. |
| 2026-10-14 | Same | Final checks | Five Python tests and the complete documentation check pass after the concurrent audit file appeared. All 33 previously measured QA output roots remained present on recheck; their changing sizes are saved separately from the original inventory. |
| 2026-10-14 | Same | UI / app baseline | n/a: standalone command-line disk inventory, no product/UI/setup behavior changed. No app servers, builds or databases were started/stopped for this audit. |
| 2026-10-14 | Same | Disk-full boundary | Concurrent disk activity exhausted free space during a runbook save, leaving this new file empty. Once space returned, the runbook was restored from the authored text; the script, tests and private findings report remained intact. |

## Related

[Local development](LOCAL-DEVELOPMENT.md) · [Shared runbooks](RUNBOOKS.md)
