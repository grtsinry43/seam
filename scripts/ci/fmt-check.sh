#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

printf '\n==> Format check (oxfmt + dprint + cargo fmt + gofmt)\n'
cd "$ROOT"
oxfmt --check .
dprint check
cargo fmt --all -- --check
test -z "$(gofmt -l .)"
