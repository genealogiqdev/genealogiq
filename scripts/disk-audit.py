#!/usr/bin/env python3
"""Read-only disk inventory. Uses metadata only; never deletes or opens file contents.

Python 3.10+, standard library only. Run --help for options. Reports contain local
paths and should remain private. Directory sizes are logical, not reclaimable space.
"""

import argparse
import csv
import ctypes
import datetime as dt
import heapq
import json
import os
from pathlib import Path
import re
import shutil
import stat
import time

MIB = 1024 ** 2
GIB = 1024 ** 3
REPARSE_POINT = 0x400


def category(path):
    """Conservative labels for review, never authorization to remove a folder."""
    p = str(path).replace("\\", "/").lower().rstrip("/")
    name = p.rsplit("/", 1)[-1]
    if name in {".git", "node_modules", ".venv", "venv"}:
        return "Preserve: source history or installed development dependencies"
    if name == "wsl" or name == "docker" or "/docker/wsl" in p:
        return "Preserve: inspect Docker/WSL with its own tools; may contain databases"
    if name == ".codex" or "/codex-runtimes" in p:
        return "Preserve: developer application state or installed runtime"
    if name == ".next" or re.fullmatch(r"\.next[-.](?:local|qa|test|build).*", name):
        return "Review: generated Next.js output; confirm no running server uses it"
    if name == ".turbo":
        return "Review: Turbo task cache; confirm it is generated cache"
    if p.endswith("/.angular/cache"):
        return "Cache candidate: Angular build cache; stop builds before clearing"
    if name in {"_cacache", "_logs"} and "/npm-cache/" in p:
        return "Cache candidate: npm download cache/logs; packages may need downloading again"
    if p.endswith(("/pip/cache", "/uv/cache", "/nuget/v3-cache", "/yarn/cache")):
        return "Cache candidate: package downloads; retain offline/private dependencies if needed"
    if p.endswith("/pnpm/store"):
        return "Review: pnpm store; use pnpm store prune, do not remove linked dependencies"
    if p.endswith("/appdata/local/temp") or p in {"c:/windows/temp", "c:/temp", "c:/tmp"}:
        return "Review: temporary files; age is not proof of disuse, skip live/locked items"
    if p.endswith(("/appdata/local/crashdumps", "/windows/minidump")):
        return "Cache candidate: crash dumps; keep if diagnosing a failure"
    browser = "/google/chrome/user data/" in p or "/microsoft/edge/user data/" in p
    if browser and name in {"cache", "code cache", "gpucache", "shadercache", "grshadercache"}:
        return "Cache candidate: browser cache; use browser clear-cache controls only"
    if p.endswith("/appdata/local/d3dscache") or p.endswith("/nvidia/dxcache"):
        return "Cache candidate: shader cache; close graphics apps, expect rebuilding"
    if name == "$recycle.bin":
        return "Review: recycle bin; inspect contents before permanently emptying"
    if p.endswith("/windows/softwaredistribution/download"):
        return "Review: Windows Update downloads; use Windows Storage cleanup"
    return ""


def is_link(info):
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & REPARSE_POINT)


def allocated_bytes(path):
    """Windows allocation for selected large files; never infer from VHD capacity."""
    if os.name != "nt":
        return None
    api = ctypes.WinDLL("kernel32", use_last_error=True)
    get_size = api.GetCompressedFileSizeW
    get_size.argtypes = [ctypes.c_wchar_p, ctypes.POINTER(ctypes.c_uint32)]
    get_size.restype = ctypes.c_uint32
    high = ctypes.c_uint32()
    ctypes.set_last_error(0)
    low = get_size(str(path), ctypes.byref(high))
    if low == 0xFFFFFFFF and ctypes.get_last_error():
        return None
    return (high.value << 32) | low


class Audit:
    def __init__(self, root, output, min_dir_mib=10, top=250, now=None):
        self.root = Path(os.path.abspath(root))
        self.output = Path(os.path.abspath(output))
        self.min_bytes = min_dir_mib * MIB
        self.top = top
        self.now = time.time() if now is None else now
        self.rows = []
        self.large = []
        self.errors = []
        self.links = []
        self.file_count = 0
        self.dir_count = 0
        self.last_progress = time.monotonic()

    def visit(self, path, depth=0):
        size = count = old7 = old30 = issues = skipped = 0
        if path == self.output:
            return (0, 0, 0, 0, 0, 0)
        try:
            info = os.lstat(path)
            if is_link(info):
                self.links.append(str(path))
                return (0, 0, 0, 0, 0, 1)
            if depth > 160:
                raise OSError("Depth limit exceeded; subtree not scanned")
            self.dir_count += 1
            children = []
            with os.scandir(path) as entries:
                for entry in entries:
                    try:
                        info = entry.stat(follow_symlinks=False)
                        if is_link(info):
                            self.links.append(entry.path)
                            skipped += 1
                        elif stat.S_ISDIR(info.st_mode):
                            children.append(Path(entry.path))
                        elif stat.S_ISREG(info.st_mode):
                            n = info.st_size
                            size += n
                            count += 1
                            self.file_count += 1
                            age = (self.now - info.st_mtime) / 86400
                            old7 += n if age >= 7 else 0
                            old30 += n if age >= 30 else 0
                            if n >= 256 * MIB:
                                row = (n, entry.path, info.st_mtime)
                                if len(self.large) < self.top:
                                    heapq.heappush(self.large, row)
                                elif row > self.large[0]:
                                    heapq.heapreplace(self.large, row)
                    except OSError as exc:
                        self.errors.append({"path": entry.path, "error": str(exc)})
                        issues += 1
            for child in children:
                a, b, c, d, e, f = self.visit(child, depth + 1)
                size += a
                count += b
                old7 += c
                old30 += d
                issues += e
                skipped += f
        except OSError as exc:
            self.errors.append({"path": str(path), "error": str(exc)})
            issues += 1
        label = category(path)
        if size >= self.min_bytes or label or depth <= 2 or issues:
            self.rows.append({"path": str(path), "logical_bytes": size,
                              "files": count, "modified_7d_ago_bytes": old7,
                              "modified_30d_ago_bytes": old30, "errors": issues,
                              "skipped_links": skipped, "category": label})
        if time.monotonic() - self.last_progress >= 20:
            print(f"Scanned {self.file_count:,} files / {self.dir_count:,} folders; currently {path}", flush=True)
            self.last_progress = time.monotonic()
        return size, count, old7, old30, issues, skipped

    def run(self):
        root_info = os.lstat(self.root)
        if is_link(root_info) or not stat.S_ISDIR(root_info.st_mode):
            raise ValueError("Root must be a real directory, not a junction or symbolic link")
        if self.output == self.root or self.output in self.root.parents:
            raise ValueError("Output must not equal or contain the scan root")
        # Refuse output paths through junctions/symlinks, including an existing leaf.
        for item in (self.output, *self.output.parents):
            if item.exists() and is_link(os.lstat(item)):
                raise ValueError("Output must not traverse a junction or symbolic link")
        usage = shutil.disk_usage(self.root)
        started = time.monotonic()
        totals = self.visit(self.root)
        large = [{"path": p, "logical_bytes": n, "allocated_bytes": allocated_bytes(p),
                  "modified_utc": dt.datetime.fromtimestamp(m, dt.timezone.utc).isoformat()}
                 for n, p, m in sorted(self.large, reverse=True)]
        self.rows.sort(key=lambda r: r["logical_bytes"], reverse=True)
        result = {
            "scan_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "root": str(self.root), "duration_seconds": round(time.monotonic() - started, 1),
            "disk": {"total_bytes": usage.total, "used_bytes": usage.used, "free_bytes": usage.free},
            "scanned_logical_bytes": totals[0], "file_count": self.file_count,
            "directory_count": self.dir_count, "errors": self.errors,
            "skipped_links": self.links, "large_files": large,
            "directories": self.rows,
            "limitations": [
                "Directory totals are logical lengths, not promised reclaimable disk space.",
                "Hard links are counted at every path; sparse/compressed files can occupy less.",
                "Parent/child rows overlap. Do not add them together.",
                "All junctions/symbolic links/cloud reparse points are skipped, without hydration.",
                "Permission failures remain unmeasured; no ACL/ownership changes are attempted.",
                "Modification age does not establish last use. Running files may change during scanning.",
                "No content, credentials, browser history or file hashes are read.",
                "Only report files are written. This script has no cleanup mode.",
            ],
        }
        # A unique output directory prevents overwriting a previous report or user files.
        self.output.mkdir(parents=True, exist_ok=False)
        (self.output / "audit.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        with (self.output / "directories.csv").open("w", newline="", encoding="utf-8-sig") as out:
            fields = ["path", "logical_bytes", "files", "modified_7d_ago_bytes", "modified_30d_ago_bytes", "errors", "skipped_links", "category"]
            writer = csv.DictWriter(out, fieldnames=fields)
            writer.writeheader()
            writer.writerows(self.rows)
        lines = ["# Read-only disk audit", "", f"Scanned: `{self.root}`", "",
                 f"Disk used: {usage.used/GIB:.2f} GiB; free: {usage.free/GIB:.2f} GiB.",
                 f"Files: {self.file_count:,}; errors: {len(self.errors):,}; skipped links: {len(self.links):,}.",
                 "", "Directory totals overlap and are logical sizes. Nothing was deleted.", "",
                 "## Largest directories", "", "| GiB | Path |", "| ---: | --- |"]
        lines.extend(f"| {r['logical_bytes']/GIB:.2f} | `{r['path']}` |" for r in self.rows[:60])
        lines.extend(["", "## Classified folders for manual review", "", "| GiB | Path | Assessment |", "| ---: | --- | --- |"])
        classified = []
        for row in self.rows:
            if not row["category"] or row["logical_bytes"] < MIB:
                continue
            # Show a parent once; the complete overlapping detail remains in JSON/CSV.
            if any(Path(parent["path"]) in Path(row["path"]).parents for parent in classified):
                continue
            classified.append(row)
        lines.extend(f"| {r['logical_bytes']/GIB:.2f} | `{r['path']}` | {r['category']} |"
                     for r in classified[:120])
        lines.extend(["", "Showing at most 120 classified roots; complete details are in JSON/CSV."])
        lines.extend(["", "## Limits", ""] + [f"- {v}" for v in result["limitations"]])
        (self.output / "SUMMARY.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default="C:\\" if os.name == "nt" else "/")
    parser.add_argument("--output", required=True, help="New private report directory; must not exist")
    parser.add_argument("--min-dir-mib", type=int, default=10)
    parser.add_argument("--top", type=int, default=250, help="Maximum large-file rows (>=256 MiB)")
    args = parser.parse_args()
    if args.top < 1 or args.min_dir_mib < 0:
        parser.error("--top must be positive and --min-dir-mib nonnegative")
    if Path(args.output).exists():
        parser.error("Output already exists; choose a new directory")
    result = Audit(args.root, args.output, args.min_dir_mib, args.top).run()
    print(f"Done: {result['file_count']:,} files, {len(result['errors']):,} errors. Reports: {args.output}")


if __name__ == "__main__":
    main()
