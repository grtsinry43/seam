#!/usr/bin/env bash
# scripts/test-integration.sh
# Run Go integration suites in parallel across standalone, fullstack, and demo fixtures.
#
# integration, workspace-integration, and markdown-demo all rebuild shared TS
# packages (server/core/typescript etc.) via tsdown in TestMain. tsdown cleans
# dist/ before writing, so parallel runs race on the same output directory.
# These three suites run sequentially as one background group; the remaining
# eight suites run fully in parallel.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

pids=()
names=()

# run_suite: run a single suite, capture output and exit code to temp files.
run_suite() {
  local name=$1 dir=$2; shift 2
  (cd "$ROOT/$dir" && go test -v -count=1 "$@") >"$tmpdir/$name.log" 2>&1
  echo $? >"$tmpdir/$name.exit"
}

# launch: run a suite in the background.
launch() {
  local name=$1; shift
  names+=("$name")
  run_suite "$name" "$@" &
  pids+=($!)
}

# --- Sequential group: suites that rebuild shared TS packages ---
# Run as a single background process to avoid concurrent tsdown races.
names+=(integration workspace-integration markdown-demo)
(
  run_suite integration           tests/integration
  run_suite workspace-integration tests/workspace-integration -timeout 120s
  run_suite markdown-demo         tests/markdown-demo
) &
pids+=($!)

# --- Independent suites: safe to run fully in parallel ---
launch fullstack              tests/fullstack
launch i18n                   tests/i18n
launch fs-router              tests/fs-router              ./...
launch stream-upload          tests/features/stream-upload
launch context-auth           tests/features/context-auth
launch query-mutation         tests/features/query-mutation
launch handoff-narrowing      tests/features/handoff-narrowing
launch channel-subscription   tests/features/channel-subscription

printf 'Launched %d tasks (11 suites, 3 sequential + 8 parallel)\n' "${#pids[@]}"

# Wait for all tasks
for pid in "${pids[@]}"; do
  wait "$pid"
done

# Collect results from all 11 suites
all_names=(integration workspace-integration markdown-demo
           fullstack i18n fs-router stream-upload context-auth
           query-mutation handoff-narrowing channel-subscription)

failed=0
for name in "${all_names[@]}"; do
  code=$(cat "$tmpdir/$name.exit" 2>/dev/null || echo 1)
  printf '\n==> %s (exit %s)\n' "$name" "$code"
  cat "$tmpdir/$name.log" 2>/dev/null
  if [ "$code" != "0" ]; then
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  printf '\nSome suites failed.\n'
  exit 1
fi

printf '\nAll suites passed.\n'
