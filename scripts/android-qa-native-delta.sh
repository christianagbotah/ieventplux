#!/usr/bin/env bash
# 0: build required, 1: no native delta, 2: invalid input/git error.
set -euo pipefail
head_sha=${1:-}; tag=${2:-}
[[ "$head_sha" =~ ^[a-f0-9]{40}$ ]] || exit 2
git cat-file -e "$head_sha^{commit}" || exit 2
if [[ -z "$tag" ]]; then echo 'No verified APK baseline; build required.'; exit 0; fi
[[ "$tag" =~ ^android-qa-[a-f0-9]{7,40}$ ]] || exit 2
# Legacy tags may have been created against a moving default branch. Resolve
# the stamped revision, not merely the tag pointer, and require ancestry.
base=$(git rev-parse --verify "${tag#android-qa-}^{commit}" 2>/dev/null) || { echo 'APK baseline revision unavailable; build required.'; exit 0; }
if ! git merge-base --is-ancestor "$base" "$head_sha"; then echo 'APK baseline is not an ancestor; build required.'; exit 0; fi
if git diff --quiet "$base" "$head_sha" -- mobile/ .github/workflows/android-debug-apk.yml; then
 echo 'No unreleased native changes.'; exit 1
else
 rc=$?; [[ "$rc" = 1 ]] || exit 2; echo 'Unreleased native changes detected.'; exit 0
fi
