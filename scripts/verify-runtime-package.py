#!/usr/bin/env python3
"""Fail closed on unexpected runtime archive contents. Never extract untrusted tar."""
import pathlib
import posixpath
import sys
import tarfile

ALLOWED = {"server.js", "package.json", "node_modules", ".next", "public"}
FORBIDDEN = {".git", ".github", ".env", ".env.local", ".env.production", ".env.development", ".ssh"}
SUFFIXES = (".db", ".sqlite", ".sqlite3", ".dump", ".key", ".jks", ".keystore", ".p12", ".pfx")
def validate(filename):
    with tarfile.open(filename, "r:gz") as tar:
        seen = set()
        for m in tar:
            n = m.name.removeprefix("./")
            p = pathlib.PurePosixPath(n)
            if not p.parts or p.is_absolute() or ".." in p.parts or p.parts[0] not in ALLOWED:
                raise ValueError("Unexpected archive path: " + n)
            if any(x in FORBIDDEN or x.startswith(".env.") for x in p.parts) or n.lower().endswith(SUFFIXES):
                raise ValueError("Potential private or generated data in archive: " + n)
            if n == ".next/cache" or n.startswith(".next/cache/"):
                raise ValueError("Build cache in runtime archive")
            if not (m.isfile() or m.isdir() or m.issym() or m.islnk()):
                raise ValueError("Unsupported archive entry: " + n)
            if m.issym() or m.islnk():
                target = m.linkname
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(n), target) if m.issym() else target)
                if target.startswith("/") or resolved.startswith("../") or resolved.split("/")[0] not in ALLOWED:
                    raise ValueError("External archive link: " + n)
            if n in seen:
                raise ValueError("Duplicate archive path: " + n)
            seen.add(n)
        for required in ("server.js", "package.json", ".next/BUILD_ID"):
            if required not in seen:
                raise ValueError("Missing runtime entry: " + required)
        if not any(n.startswith(".next/static/") for n in seen):
            raise ValueError("Missing client static assets")
    print("RUNTIME_ARCHIVE_POLICY_PASSED")
if __name__ == "__main__":
    validate(sys.argv[1])
