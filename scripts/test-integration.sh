#!/usr/bin/env bash
# scripts/test-integration.sh
# Run Go integration suites across standalone, fullstack, and demo fixtures.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

(cd "$ROOT/tests/integration" && go test -v -count=1)
(cd "$ROOT/tests/fullstack" && go test -v -count=1)
(cd "$ROOT/tests/i18n" && go test -v -count=1)
(cd "$ROOT/tests/fs-router" && go test -v -count=1 ./...)

printf '\n==> Feature demo tests\n'
for demo in stream-upload context-auth query-mutation handoff-narrowing channel-subscription; do
  (cd "$ROOT/tests/features/$demo" && go test -v -count=1)
done

(cd "$ROOT/tests/workspace-integration" && go test -v -count=1 -timeout 120s)
(cd "$ROOT/tests/markdown-demo" && go test -v -count=1)
