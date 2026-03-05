#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

printf '\n==> Build WASM packages\n'
bash "$ROOT/src/server/injector/build-wasm.sh"
bash "$ROOT/src/server/engine/build-wasm.sh"
