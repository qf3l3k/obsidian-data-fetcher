#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>" >&2
  echo "Example: $0 1.0.7" >&2
  exit 1
fi

V="$1"

require_clean_tree() {
  local dirty
  dirty="$(git status --porcelain | grep -vE '^\?\? DEV_NOTES\.md$' || true)"
  if [[ -n "$dirty" ]]; then
    echo "Working tree is not clean. Commit/stash changes before running release script." >&2
    exit 1
  fi
}

require_ref() {
  local ref="$1"
  if ! git rev-parse --verify "$ref" >/dev/null 2>&1; then
    echo "Missing required ref: $ref" >&2
    exit 1
  fi
}

echo "==> Releasing version $V"
require_clean_tree

echo "==> Internal release on origin/main"
git checkout main
git pull origin main
npx tsc -noEmit -skipLibCheck
npm run build
git add manifest.json versions.json package.json package-lock.json CHANGELOG.md README.md
git commit -m "release: $V"
git tag "$V"
git push origin main --tags

echo "==> Preparing PR branch from public/main"
git fetch public --tags
require_ref "public/main"
require_ref "$V"

BRANCH="public-fix-$V"
git checkout -B "$BRANCH" public/main
git checkout "$V" -- manifest.json versions.json package.json package-lock.json
git add manifest.json versions.json package.json package-lock.json
git commit -m "public: bump release metadata to $V"
git push public "$BRANCH"

echo "==> Open PR:"
echo "https://github.com/qf3l3k/obsidian-data-fetcher/pull/new/$BRANCH"
