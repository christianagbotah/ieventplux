#!/usr/bin/env python3
"""Manifest-driven, fail-closed retention for source-light runtime releases.

Run after a verified deployment. A trusted deployer writes an updated root-only
manifest atomically; stale active paths, missing recovery packages, dirty or
unrecognized local data and live references all prevent removal. No source
checkout, database, upload directory, or credentials are ever eligible.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import shutil
import stat
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone

COMPONENTS = {"web", "worker", "realtime"}
HEX = re.compile(r"^[0-9a-f]{40}$")
NAME = re.compile(r"^(web|worker|realtime)-([0-9a-f]{7,40})-[0-9]{8}$")
FORBIDDEN = {".git", ".github", ".ssh", ".env", "media-uploads", "pgdata", "backups"}
SUFFIXES = (".db", ".sqlite", ".sqlite3", ".dump", ".key", ".jks", ".keystore", ".p12", ".pfx")

def command(*args):
    return subprocess.check_output(args, text=True).strip()

def gh(repo, *args):
    return json.loads(command("gh", "api", f"repos/{repo}/" + "/".join(args)))

def digest(file):
    h = hashlib.sha256()
    for chunk in iter(lambda: file.read(1024 * 1024), b""):
        h.update(chunk)
    return h.hexdigest()

def digest_path(path):
    with path.open("rb") as file:
        return digest(file)

def archive_name(item):
    suffix = "" if item["component"] == "web" else "-" + item["component"]
    return f"ieventplux{suffix}-{item['sha']}.tar.gz"

def artifact_name(item):
    suffix = "" if item["component"] == "web" else "-" + item["component"]
    return f"ieventplux{suffix}-candidate-{item['sha']}"

def entry(root, item):
    name, sha, component = item["name"], item["sha"], item["component"]
    match = NAME.fullmatch(name)
    if not match or not HEX.fullmatch(sha) or component not in COMPONENTS:
        raise ValueError("Invalid runtime identity")
    if match[1] != component or not sha.startswith(match[2]):
        raise ValueError("Runtime name and source SHA disagree")
    path = root / name
    if path.is_symlink() or path.resolve() != path:
        raise ValueError("Unexpected runtime symlink")
    return path

def local_identity(path, item):
    if not path.is_dir() or path.is_symlink():
        raise ValueError("Runtime directory missing")
    if (path / ".git").exists():
        raise ValueError("Source checkout is never eligible")
    marker = path / ".source_sha_verified"
    if marker.is_symlink() or marker.read_text().strip() != item["sha"]:
        raise ValueError("Runtime provenance mismatch")

def release_metadata(repo, item):
    release = gh(repo, "releases", "tags", "runtime-candidate-" + item["sha"])
    if release["draft"] or not release["prerelease"]:
        raise ValueError("Expected preserved candidate prerelease")
    names = {a["name"] for a in release["assets"] if a["state"] == "uploaded" and a["size"] > 0}
    if not {archive_name(item), "SHA256SUMS", "SOURCE_SHA", "CI_RUN_ID"} <= names:
        raise ValueError("Recovery release incomplete")
    return release

def download(repo, item, scratch, durable=False):
    archive = archive_name(item)
    if durable:
        release_metadata(repo, item)
        for pattern in (archive, "SHA256SUMS", "SOURCE_SHA", "CI_RUN_ID"):
            command("gh", "release", "download", "runtime-candidate-" + item["sha"],
                    "-R", repo, "--pattern", pattern, "-D", str(scratch))
    else:
        run_id = str(item["run_id"])
        if not re.fullmatch(r"[0-9]{1,20}", run_id):
            raise ValueError("Invalid CI run ID")
        run = gh(repo, "actions", "runs", run_id)
        if (run["status"] != "completed" or run["conclusion"] != "success"
            or run["head_sha"] != item["sha"] or run["head_repository"]["full_name"] != repo
            or run["path"] != ".github/workflows/release-artifact.yml"):
            raise ValueError("CI recovery provenance not verified")
        command("gh", "run", "download", run_id, "-R", repo,
                "--name", artifact_name(item), "--dir", str(scratch))
        if (scratch / "CI_RUN_ID").read_text().strip() != run_id:
            raise ValueError("CI run marker mismatch")
    if (scratch / "SOURCE_SHA").read_text().strip() != item["sha"]:
        raise ValueError("Artifact source marker mismatch")
    path = scratch / archive
    if path.is_symlink() or not path.is_file():
        raise ValueError("Expected archive missing")
    expected = digest_path(path) + "  " + archive
    if expected not in (scratch / "SHA256SUMS").read_text().splitlines():
        raise ValueError("Artifact checksum mismatch")
    return path

def relative_name(member, component, tracked_uploads=None):
    tracked_uploads = tracked_uploads or {}
    name = member.name.removeprefix("./")
    p = PurePosixPath(name)
    allowed = {"server.js", "package.json", "node_modules", ".next", "public"} if component == "web" else {component + ".mjs", "node_modules"}
    if (not p.parts or p.is_absolute() or ".." in p.parts or p.parts[0] not in allowed
        or any(x in FORBIDDEN or x.startswith(".env.") for x in p.parts)
        or name.lower().endswith(SUFFIXES)):
        raise ValueError("Unsafe runtime archive member")
    if "uploads" in p.parts:
        compiled_route = name.startswith(".next/server/app/") and (member.isdir() or name.endswith((".js", ".js.map", ".json")))
        reviewed_asset = (member.isfile() and name in tracked_uploads) or (member.isdir() and any(n.startswith(name + "/") for n in tracked_uploads))
        if not compiled_route and not reviewed_asset:
            raise ValueError("Unreviewed upload path in runtime archive")
    if not (member.isfile() or member.isdir() or member.issym() or member.islnk()):
        raise ValueError("Unsupported archive member")
    if member.issym() or member.islnk():
        target = member.linkname
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), target) if member.issym() else target)
        if target.startswith("/") or resolved == ".." or resolved.startswith("../") or resolved.split("/")[0] not in allowed:
            raise ValueError("External archive link")
    return name

def compare_archive(path, archive, component, protected_web=(), allow_extra_static=False, tracked_uploads=None):
    """Do not extract. Reject changed or extra files except already preserved immutable browser assets."""
    tracked_uploads = tracked_uploads or {}
    seen = set()
    files = 0
    with tarfile.open(archive, "r:gz") as tar:
        for member in tar:
            name = relative_name(member, component, tracked_uploads)
            if name in seen:
                raise ValueError("Duplicate archive member")
            seen.add(name)
            target = path / name
            if member.isfile():
                if not target.is_file() or target.is_symlink() or not target.resolve().is_relative_to(path):
                    raise ValueError("Runtime file missing or redirected")
                with tar.extractfile(member) as source:
                    actual = digest(source)
                    if actual != digest_path(target):
                        raise ValueError("Runtime file differs from recovery archive")
                    if name in tracked_uploads and actual != tracked_uploads[name]:
                        raise ValueError("Reviewed source asset hash mismatch")
                files += 1
            elif member.issym():
                if not target.is_symlink() or os.readlink(target) != member.linkname:
                    raise ValueError("Runtime symbolic link differs")
            elif member.islnk():
                original = path / member.linkname
                if not target.exists() or not original.exists() or not os.path.samefile(target, original):
                    raise ValueError("Runtime hardlink differs")
            elif not target.is_dir() or target.is_symlink():
                raise ValueError("Runtime directory differs")
    required = {"server.js", "package.json", ".next/BUILD_ID"} if component == "web" else {component + ".mjs"}
    if not required <= seen:
        raise ValueError("Runtime archive incomplete")
    if not allow_extra_static:
        return files
    for base, dirs, fs in os.walk(path, followlinks=False):
        for name in dirs + fs:
            child = Path(base) / name
            rel = child.relative_to(path).as_posix()
            if rel in seen or rel == ".source_sha_verified":
                continue
            if component == "web" and rel.startswith(".next/static/") and not child.is_symlink():
                if child.is_dir():
                    continue
                if child.is_file() and any(
                    (other / rel).is_file() and not (other / rel).is_symlink()
                    and digest_path(child) == digest_path(other / rel)
                    for other in protected_web
                ):
                    continue
            raise ValueError("Unrecognized local content; review before removal")
    return files

def process_references():
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        for p in [proc/"cwd", proc/"exe", *list((proc/"fd").glob("*"))]:
            try:
                yield os.readlink(p)
            except OSError:
                pass
        for name in ("cmdline", "maps"):
            try:
                yield (proc/name).read_text(errors="replace")
            except OSError:
                pass

def external_links(roots, runtime_root):
    result = []
    for root in roots:
        if not root.is_dir() or root.is_symlink():
            continue
        data = subprocess.check_output(["find", str(root), "-xdev", "-name", ".git", "-prune", "-o", "-type", "l", "-printf", r"%p\0%l\0"])
        parts = data.decode(errors="surrogateescape").split("\0")
        for link, target in zip(parts[::2], parts[1::2]):
            if not link:
                continue
            dst = Path(os.path.normpath(os.path.join(os.path.dirname(link), target)))
            if dst.is_relative_to(root):
                continue
            dst = dst.resolve()
            if dst.is_relative_to(runtime_root):
                result.append((Path(link), dst))
    return result

def config_references(paths):
    for item in paths:
        path = Path(item)
        if path.is_file():
            yield path.read_text(errors="replace")
        elif path.is_dir():
            for file in path.rglob("*"):
                if file.is_file() and file.stat().st_size < 1024 * 1024:
                    yield file.read_text(errors="replace")

def check_health(plan, root):
    for unit, item in plan["active"].items():
        expected = str(entry(root, item))
        if command("systemctl", "show", unit, "-p", "WorkingDirectory", "--value") != expected:
            raise ValueError("Stale deployment manifest: active runtime changed")
        command("systemctl", "is-active", unit)
    for unit in plan.get("required_units", []):
        command("systemctl", "is-active", unit)
    for url in plan["health_urls"]:
        result = json.loads(command("curl", "-fsS", "--max-time", "10", url))
        if result.get("status") != "healthy" or result.get("database", "up") != "up":
            raise ValueError("Application health gate failed")

def log(message):
    print(datetime.now(timezone.utc).isoformat(), message, flush=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    manifest = Path(args.manifest)
    meta = manifest.stat()
    if os.geteuid() != 0 or manifest.is_symlink() or meta.st_uid != 0 or meta.st_mode & 0o077:
        raise SystemExit("Require a root-owned private deployment manifest")
    plan = json.loads(manifest.read_text())
    repo = plan["repo"]
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repo):
        raise ValueError("Invalid repository")
    root = Path(plan["root"])
    if not root.is_absolute() or root.is_symlink() or root.resolve() != root or not root.is_dir():
        raise ValueError("Invalid release root")
    locks = []
    for name in plan["locks"]:
        f = open(name, "a")
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        locks.append(f)
    check_health(plan, root)
    active = list(plan["active"].values())
    rollback = plan["rollback"]
    if {i["component"] for i in active} != COMPONENTS or {i["component"] for i in rollback} != COMPONENTS or len(active) != 3 or len(rollback) != 3:
        raise ValueError("Require one active and one rollback per component")
    if len({i["sha"] for i in rollback}) != 1:
        raise ValueError("Rollback must be one coherent source revision")
    protected = {entry(root, i) for i in active + rollback}
    if len(protected) != 6:
        raise ValueError("Active and rollback runtime paths must be distinct")
    tracked_uploads = plan.get("tracked_uploads", {})
    for name, value in tracked_uploads.items():
        if not re.fullmatch(r"public/(?:public/)?uploads/[A-Za-z0-9._-]+", name) or not re.fullmatch(r"[a-f0-9]{64}", value):
            raise ValueError("Invalid reviewed source asset identity")
    protected_web = [entry(root, i) for i in active + rollback if i["component"] == "web"]
    candidates = [(entry(root, i), i) for i in plan["candidates"]]
    candidates = [(p, i) for p, i in candidates if p.exists() and p not in protected]
    if not candidates:
        log("No eligible superseded runtime paths")
        return
    for item in active + rollback:
        local_identity(entry(root, item), item)
        release_metadata(repo, item)
    for item in rollback:
        with tempfile.TemporaryDirectory(prefix="runtime-rollback-proof-") as tmp:
            archive = download(repo, item, Path(tmp), durable=True)
            files = compare_archive(entry(root, item), archive, item["component"], tracked_uploads=tracked_uploads)
            log(f"ROLLBACK_VERIFIED {item['name']} files={files}")
    configs = list(config_references(plan["reference_paths"]))
    roots = [Path(p) for p in plan["link_roots"]] + [p for p in root.iterdir() if p.is_dir() and not p.is_symlink()]
    links = external_links(roots, root)
    def referenced(path):
        if any(str(path) in x for x in configs) or any(str(path) in x for x in process_references()):
            return True
        if any(link.exists() and (target == path or target.is_relative_to(path)) for link, target in links if not link.is_relative_to(path)):
            return True
        for line in Path("/proc/self/mountinfo").read_text().splitlines():
            mount = Path(line.split()[4].replace(r"\040", " "))
            if mount == path or mount.is_relative_to(path):
                return True
        return False
    for path, item in candidates:
        try:
            if referenced(path):
                log(f"HOLD {path}: service, process, symlink or mount reference")
                continue
            local_identity(path, item)
            with tempfile.TemporaryDirectory(prefix="runtime-recovery-proof-") as tmp:
                archive = download(repo, item, Path(tmp), durable=item.get("durable", False))
                files = compare_archive(path, archive, item["component"], protected_web, allow_extra_static=True, tracked_uploads=tracked_uploads)
            size = int(command("du", "-sxB1", str(path)).split()[0])
            check_health(plan, root)
            if referenced(path):
                raise ValueError("New runtime reference detected")
            if args.apply:
                before = shutil.disk_usage(root).free
                shutil.rmtree(path)
                if path.exists():
                    raise ValueError("Runtime removal incomplete")
                after = shutil.disk_usage(root).free
                log(f"REMOVED {path} allocated={size} filesystem_free_delta={after-before} sha={item['sha']} verified_files={files}")
                check_health(plan, root)
            else:
                log(f"CANDIDATE {path} allocated={size} sha={item['sha']} verified_files={files}")
        except Exception as error:
            log(f"HOLD {path}: {type(error).__name__}: {str(error)[:200]}")
            check_health(plan, root)

if __name__ == "__main__":
    main()
