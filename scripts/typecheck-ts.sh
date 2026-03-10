#!/usr/bin/env bash
# scripts/typecheck-ts.sh
# Run tsc --noEmit for all TypeScript packages that ship typed surfaces.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

packages=(
  src/server/engine/js
  src/server/injector/js
  src/server/injector/native
  src/server/core/typescript
  src/server/adapter/hono
  src/server/adapter/bun
  src/server/adapter/node
  src/client/vanilla
  src/client/react
  src/router/tanstack
  src/router/seam
  src/cli/vite
  src/eslint
  src/i18n
  src/query/seam
  src/query/react
)

failed=()
printf '\n==> Type check (tsc --noEmit)\n'

for pkg in "${packages[@]}"; do
  printf '  %s ... ' "$pkg"
  if (cd "$ROOT" && bunx tsc --noEmit -p "$pkg/tsconfig.json") 2>&1; then
    printf 'ok\n'
  else
    printf 'FAIL\n'
    failed+=("$pkg")
  fi
done

if [[ ${#failed[@]} -gt 0 ]]; then
  printf '\n==> Type check FAILED in:\n'
  for pkg in "${failed[@]}"; do
    printf '  - %s\n' "$pkg"
  done
  exit 1
fi

printf '==> Type check passed.\n'
