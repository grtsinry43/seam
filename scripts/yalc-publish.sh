#!/usr/bin/env bash
# Publish all TS packages to yalc local store.
# Usage: bash scripts/yalc-publish.sh [--push]
set -euo pipefail

PUSH=false
[[ "${1:-}" == "--push" ]] && PUSH=true

PACKAGES=(
  src/cli/seam
  src/server/engine/js
  src/client/vanilla
  src/cli/vite
  src/i18n
  src/router/seam
  src/query/seam
  src/eslint
  src/server/core/typescript
  src/client/react
  src/query/react
  src/server/adapter/hono
  src/server/adapter/bun
  src/server/adapter/node
  src/router/tanstack
  src/cli/pkg
)

CMD="yalc publish"
$PUSH && CMD="yalc push"

printf '==> yalc %s (%d packages)\n' "$($PUSH && echo push || echo publish)" "${#PACKAGES[@]}"

for pkg in "${PACKAGES[@]}"; do
  name=$(jq -r .name "$pkg/package.json")
  printf '  %s (%s)\n' "$name" "$pkg"
  (cd "$pkg" && $CMD --no-scripts)
done

printf '==> Done.\n'
