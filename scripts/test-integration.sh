#!/usr/bin/env bash
# scripts/test-integration.sh
# Run Go integration suites in parallel across standalone, fullstack, and demo fixtures.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

pids=()
names=()
codes=()

launch() {
  local name=$1 dir=$2; shift 2
  names+=("$name")
  (cd "$ROOT/$dir" && go test -v -count=1 "$@") >"$tmpdir/$name.log" 2>&1 &
  pids+=($!)
}

launch integration            tests/integration
launch fullstack              tests/fullstack
launch i18n                   tests/i18n
launch fs-router              tests/fs-router              ./...
launch stream-upload          tests/features/stream-upload
launch context-auth           tests/features/context-auth
launch query-mutation         tests/features/query-mutation
launch handoff-narrowing      tests/features/handoff-narrowing
launch channel-subscription   tests/features/channel-subscription
launch workspace-integration  tests/workspace-integration  -timeout 120s
launch markdown-demo          tests/markdown-demo

printf 'Launched %d suites in parallel\n' "${#pids[@]}"

# Wait for all suites
for i in "${!pids[@]}"; do
  wait "${pids[$i]}"
  codes+=($?)
done

# Print results sequentially
failed=0
for i in "${!names[@]}"; do
  printf '\n==> %s (exit %d)\n' "${names[$i]}" "${codes[$i]}"
  cat "$tmpdir/${names[$i]}.log"
  if [ "${codes[$i]}" -ne 0 ]; then
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  printf '\nSome suites failed.\n'
  exit 1
fi

printf '\nAll suites passed.\n'
