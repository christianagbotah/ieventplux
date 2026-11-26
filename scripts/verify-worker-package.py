#!/usr/bin/env python3
"""Validate compiled service runtime archives, including Prisma engines."""
import pathlib
import sys
import tarfile

PREFIXES = ("node_modules/@prisma/client", "node_modules/.prisma/client")
PARENTS = {"node_modules", "node_modules/@prisma", "node_modules/.prisma"}
FORBIDDEN = {".git", ".github", ".ssh", ".env"}
BAD_SUFFIXES = (".db", ".sqlite", ".sqlite3", ".dump", ".key", ".pem", ".jks", ".keystore", ".p12", ".pfx")

def validate(path, entry="worker.mjs"):
    if entry not in {"worker.mjs", "realtime.mjs"}:
        raise ValueError("Unknown compiled service")
    roots = {entry, "node_modules"}
    seen = set()
    with tarfile.open(path, "r:gz") as archive:
        for member in archive:
            n = member.name.removeprefix("./")
            p = pathlib.PurePosixPath(n)
            if not p.parts or p.is_absolute() or ".." in p.parts or p.parts[0] not in roots:
                raise ValueError("Unexpected worker runtime entry: " + n)
            if n != entry and n not in PARENTS and not any(n == x or n.startswith(x + "/") for x in PREFIXES):
                raise ValueError("Unexpected worker dependency: " + n)
            if any(x in FORBIDDEN or x.startswith(".env.") for x in p.parts) or n.lower().endswith(BAD_SUFFIXES):
                raise ValueError("Possible private data: " + n)
            if not (member.isfile() or member.isdir()):
                raise ValueError("Only regular files/directories permitted: " + n)
            if n in seen:
                raise ValueError("Duplicate archive entry: " + n)
            seen.add(n)
    required = {
        entry, "node_modules/@prisma/client/package.json",
        "node_modules/.prisma/client/index.js",
        "node_modules/.prisma/client/libquery_engine-rhel-openssl-1.1.x.so.node",
        "node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node",
    }
    if not required <= seen:
        raise ValueError("Missing worker runtime files: " + str(sorted(required - seen)))
    print(("WORKER" if entry == "worker.mjs" else "REALTIME") + "_RUNTIME_ARCHIVE_POLICY_PASSED")

if __name__ == "__main__":
    validate(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else "worker.mjs")
