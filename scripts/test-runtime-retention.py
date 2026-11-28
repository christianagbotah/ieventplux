#!/usr/bin/env python3
"""Isolated fixtures only; never invoke the deployment or removal entry point."""
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("retention", Path(__file__).with_name("prune-runtime-releases.py"))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

class RuntimeRetentionPolicy(unittest.TestCase):
    def test_rejects_wrong_component_and_path(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for name in ("../worker-abcdef0-20261128", "web-abcdef0-20261128"):
                with self.assertRaises(ValueError):
                    r.entry(root, {"name": name, "sha": "abcdef0" + "1"*33, "component": "worker"})

    def test_rejects_unsafe_archive_members(self):
        for name in ("../secret", "/etc/passwd", "node_modules/.env", "node_modules/cache.db", "public/uploads/a"):
            with self.assertRaises(ValueError):
                r.relative_name(tarfile.TarInfo(name), "web")
        link = tarfile.TarInfo("node_modules/link")
        link.type = tarfile.SYMTYPE
        link.linkname = "../../private"
        with self.assertRaises(ValueError):
            r.relative_name(link, "web")

    def test_compiled_upload_route_is_not_persistent_media(self):
        self.assertEqual(r.relative_name(tarfile.TarInfo(".next/server/app/uploads/route.js"), "web"),
                         ".next/server/app/uploads/route.js")
        with self.assertRaises(ValueError):
            r.relative_name(tarfile.TarInfo(".next/server/app/uploads/customer.png"), "web")
        with self.assertRaises(ValueError):
            r.relative_name(tarfile.TarInfo("public/uploads/unknown.png"), "web")
        self.assertEqual(r.relative_name(tarfile.TarInfo("public/uploads/reviewed.png"), "web",
                                        {"public/uploads/reviewed.png": "a"*64}),
                         "public/uploads/reviewed.png")

    def test_exact_archive_comparison_and_extra_data_hold(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "runtime"
            root.mkdir()
            archive = Path(d) / "worker.tar.gz"
            content = b"example worker"
            with tarfile.open(archive, "w:gz") as tar:
                member = tarfile.TarInfo("worker.mjs")
                member.size = len(content)
                tar.addfile(member, io.BytesIO(content))
            (root / "worker.mjs").write_bytes(content)
            (root / ".source_sha_verified").write_text("a"*40)
            self.assertEqual(r.compare_archive(root, archive, "worker", allow_extra_static=True), 1)
            (root / "unrecognized").write_text("do not remove")
            with self.assertRaises(ValueError):
                r.compare_archive(root, archive, "worker", allow_extra_static=True)
            (root / "unrecognized").unlink()
            (root / "worker.mjs").write_bytes(b"changed")
            with self.assertRaises(ValueError):
                r.compare_archive(root, archive, "worker", allow_extra_static=True)

    def test_local_identity_refuses_source_checkout(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / ".git").mkdir()
            (root / ".source_sha_verified").write_text("a"*40)
            with self.assertRaises(ValueError):
                r.local_identity(root, {"sha": "a"*40})

if __name__ == "__main__":
    unittest.main(verbosity=2)
