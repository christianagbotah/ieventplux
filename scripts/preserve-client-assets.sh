#!/usr/bin/env bash
# Restore immutable Next.js JS/CSS assets from older releases before web startup.
set -euo pipefail
ROOT="/home/lightworld/releases/ieventplux"
if printenv IEVENTPLUX_RELEASE_ROOT >/dev/null 2>&1; then ROOT="$(printenv IEVENTPLUX_RELEASE_ROOT)"; fi
ROOT="$(realpath -e "$ROOT")"
TARGET="$(pwd -P)"
case "$TARGET" in "$ROOT"/*) ;; *) echo "Refusing an unauthorized release root" >&2; exit 2;; esac
[ -d "$TARGET/.next/static" ] && [ -d "$TARGET/.next/standalone/.next/static" ] || {
  echo "Current build has no standalone Next.js assets" >&2; exit 3
}
shopt -s nullglob
count=0
for PRIOR in "$ROOT"/*; do
  [ -L "$PRIOR" ] && continue
  [ -d "$PRIOR/.next/static" ] || continue
  [ "$(realpath -e "$PRIOR")" = "$TARGET" ] && continue
  cp -an "$PRIOR/.next/static/." "$TARGET/.next/static/"
  cp -an "$PRIOR/.next/static/." "$TARGET/.next/standalone/.next/static/"
  count=$((count + 1))
done
echo "Preserved missing versioned assets from $count earlier iEventPlux releases."
