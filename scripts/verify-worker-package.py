#!/usr/bin/env python3
"""Validate the compiled worker runtime archive, including Prisma engines."""
import pathlib
import sys
import tarfile

ROOTS = {"worker.mjs", "node_modules"}
PREFIXES = ("node_modules/@prisma/client", "node_modules/.prisma/client")
PARENTS = {"node_modules", "node_modules/@prisma", "node_modules/.prisma"}
FORBIDDEN = {".git", ".github", ".ssh", ".env"}
BAD_SUFFIXES = (".db", ".sqlite", ".sqlite3", ".dump", ".key", ".pem", ".jks", ".keystore", ".p12", ".pfx")

def validate(path):
    seen = set()
    with tarfile.open(path, "r:gz") as archive:
        for member in archive:
            n = member.name.removeprefix("./")
            p = pathlib.PurePosixPath(n)
            if not p.parts or p.is_absolute() or ".." in p.parts or p.parts[0] not in ROOTS:
                raise ValueError("Unexpected worker runtime entry: " + n)
            if n != "worker.mjs" and n not in PARENTS and not any(n == x or n.startswith(x + "/") for x in PREFIXES):
                raise ValueError("Unexpected worker dependency: " + n)
            if any(x in FORBIDDEN or x.startswith(".env.") for x in p.parts) or n.lower().endswith(BAD_SUFFIXES):
                raise ValueError("Possible private data: " + n)
            if not (member.isfile() or member.isdir()):
                raise ValueError("Only regular files/directories permitted: " + n)
            if n in seen:
                raise ValueError("Duplicate archive entry: " + n)
            seen.add(n)
    required = {
        "worker.mjs", "node_modules/@prisma/client/package.json",
        "node_modules/.prisma/client/index.js",
        "node_modules/.prisma/client/libquery_engine-rhel-openssl-1.1.x.so.node",
        "node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node",
    }
    if not required <= seen:
        raise ValueError("Missing worker runtime files: " + str(sorted(required - seen)))
    print("WORKER_RUNTIME_ARCHIVE_POLICY_PASSED")

if __name__ == "__main__":
    validate(sys.argv[1])
