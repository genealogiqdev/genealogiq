"""Independent fixtures for metadata totals and read-only/permission boundaries."""
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("disk_audit", Path(__file__).with_name("disk-audit.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditTests(unittest.TestCase):
    def test_totals_age_and_source_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "source"
            root.mkdir()
            nested = root / "nested"
            nested.mkdir()
            recent = root / "source.txt"
            old = nested / "old.bin"
            recent.write_bytes(b"12345")
            old.write_bytes(b"abcdefg")
            now = 2_000_000_000
            os.utime(recent, (now, now))
            os.utime(old, (now - 40 * 86400, now - 40 * 86400))
            before = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in (recent, old)}
            output = Path(tmp) / "report"
            result = audit.Audit(root, output, 0, now=now).run()
            self.assertEqual(result["scanned_logical_bytes"], 12)
            self.assertEqual(result["file_count"], 2)
            row = next(r for r in result["directories"] if r["path"] == str(root))
            self.assertEqual(row["modified_30d_ago_bytes"], 7)
            self.assertEqual(row["modified_7d_ago_bytes"], 7)
            self.assertEqual(before, {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in before})
            self.assertEqual(json.loads((output / "audit.json").read_text())["scanned_logical_bytes"], 12)

    def test_permission_failure_is_reported_not_zero_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            blocked = root / "private"
            blocked.mkdir()
            (root / "visible.txt").write_bytes(b"abc")
            original = os.scandir
            def guarded(path):
                if Path(path) == blocked:
                    raise PermissionError("fixture denied")
                return original(path)
            scanner = audit.Audit(root, root / "report", 0)
            with patch.object(audit.os, "scandir", guarded):
                result = scanner.run()
            self.assertEqual(result["scanned_logical_bytes"], 3)
            self.assertEqual(len(result["errors"]), 1)
            self.assertEqual(result["errors"][0]["path"], str(blocked))
            self.assertEqual(result["directories"][0]["errors"], 1)

    def test_reparse_point_never_enumerated(self):
        scanner = audit.Audit(Path.cwd(), Path.cwd() / "report-not-created")
        info = types.SimpleNamespace(st_mode=stat.S_IFDIR, st_file_attributes=0x400)
        with patch.object(audit.os, "lstat", return_value=info), patch.object(audit.os, "scandir") as enumerate_dir:
            self.assertEqual(scanner.visit(Path("junction")), (0, 0, 0, 0, 0, 1))
            enumerate_dir.assert_not_called()
        self.assertEqual(scanner.links, ["junction"])

    def test_existing_report_and_scan_root_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "source"
            root.mkdir()
            with self.assertRaises(ValueError):
                audit.Audit(root, root).run()
            output = Path(tmp) / "existing"
            output.mkdir()
            marker = output / "audit.json"
            marker.write_text("preserve")
            with self.assertRaises(FileExistsError):
                audit.Audit(root, output).run()
            self.assertEqual(marker.read_text(), "preserve")

    def test_conservative_classification(self):
        self.assertTrue(audit.category("C:/projects/app/.git").startswith("Preserve"))
        self.assertTrue(audit.category("C:/projects/app/node_modules").startswith("Preserve"))
        self.assertTrue(audit.category("C:/Users/Tiger/.cache/codex-runtimes/runtime").startswith("Preserve"))
        self.assertTrue(audit.category("C:/projects/app/.next-local-qa").startswith("Review"))
        self.assertTrue(audit.category("C:/Users/Tiger/AppData/Local/npm-cache/_cacache").startswith("Cache candidate"))
        self.assertTrue(audit.category("C:/projects/frontend/.angular/cache").startswith("Cache candidate"))
        self.assertEqual(audit.category("C:/Users/Tiger/AppData/Local/Google/Chrome/User Data/Default/Local Storage"), "")
        self.assertEqual(audit.category("C:/projects/app/dist"), "")


if __name__ == "__main__":
    unittest.main()
