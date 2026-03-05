#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

printf '\n==> Lint (oxlint + eslint + clippy + golangci-lint)\n'
cd "$ROOT"
oxlint
NODE_OPTIONS='--import tsx/esm' eslint .
cargo clippy --workspace --all-features --all-targets -- -D warnings

status=0
while IFS= read -r mod; do
  dir="$(dirname "$mod")"
  rel="${dir#"$ROOT"/}"
  printf '  -> %s\n' "$rel"
  (cd "$dir" && golangci-lint run ./...) || status=1
done < <(find "$ROOT" -name go.mod -not -path '*/vendor/*')
[ $status -eq 0 ] || exit 1

printf '\n==> Check unlisted dependencies (knip)\n'
(cd "$ROOT" && bunx knip --include unlisted)

printf '\n==> Check markdown links\n'
bash "$ROOT/scripts/ci/check-links.sh"
