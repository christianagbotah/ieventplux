#!/usr/bin/env bash
set -euo pipefail
runner="$(cd "$(dirname "$0")" && pwd)/preserve-client-assets.sh"
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
mkdir -p "$dir/old/.next/static/chunks" "$dir/current/.next/static/chunks" "$dir/current/.next/standalone/.next/static/chunks"
printf old >"$dir/old/.next/static/chunks/previous-bundle.js"
printf live >"$dir/old/.next/static/chunks/current-bundle.js"
printf new >"$dir/current/.next/static/chunks/current-bundle.js"
printf new >"$dir/current/.next/standalone/.next/static/chunks/current-bundle.js"
(cd "$dir/current" && IEVENTPLUX_RELEASE_ROOT="$dir" bash "$runner")
test "$(cat "$dir/current/.next/static/chunks/previous-bundle.js")" = old
test "$(cat "$dir/current/.next/standalone/.next/static/chunks/previous-bundle.js")" = old
test "$(cat "$dir/current/.next/static/chunks/current-bundle.js")" = new
if (cd / && IEVENTPLUX_RELEASE_ROOT="$dir" bash "$runner" >/dev/null 2>&1); then
  echo "Error: unauthorized root was accepted" >&2
  exit 1
fi
echo "PASS client-asset retention and release-root guard"
