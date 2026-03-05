# SeamJS — unified task runner
# Usage: just <recipe>   |   just --list

set dotenv-load := true
set shell := ["bash", "-euo", "pipefail", "-c"]

# === Meta ===

# List all recipes
default:
    @just --list

# Format + lint (pre-commit gate)
pre-commit: fmt lint

# === Format ===

# Run all formatters
fmt:
    chore .
    oxfmt --write .
    dprint fmt
    cargo fmt --all
    gofmt -w .

# Format TS only (oxfmt)
fmt-ts:
    oxfmt --write .

# Format markdown (dprint)
fmt-md:
    dprint fmt

# Format Rust
fmt-rust:
    cargo fmt --all

# Format Go
fmt-go:
    gofmt -w .

# Normalize file paths (chore)
fmt-path:
    chore .

# Check formatting without writing
fmt-check:
    oxfmt --check .
    dprint check
    cargo fmt --all -- --check
    test -z "$(gofmt -l .)"

# === Lint ===

# Run all linters
lint: lint-ts lint-clippy lint-go

# Lint TS (oxlint + eslint)
lint-ts:
    oxlint
    NODE_OPTIONS='--import tsx/esm' eslint .

# Lint Rust (clippy)
lint-clippy:
    cargo clippy --workspace --all-features --all-targets -- -D warnings

# Lint Go (golangci-lint per module)
lint-go:
    #!/usr/bin/env bash
    set -euo pipefail
    status=0
    while IFS= read -r mod; do
      dir="$(dirname "$mod")"
      rel="${dir#"$(pwd)"/}"
      printf '  -> %s\n' "$rel"
      (cd "$dir" && golangci-lint run ./...) || status=1
    done < <(find . -name go.mod -not -path '*/vendor/*')
    exit $status

# Check unlisted dependencies (knip)
lint-deps:
    knip --include dependencies,unlisted,unresolved

# Check markdown links
lint-links:
    bash scripts/ci/check-links.sh

# Auto-fix lint issues
lint-fix:
    oxlint --fix
    NODE_OPTIONS='--import tsx/esm' eslint . --fix

# === Build ===

# Build TS + Rust
build: build-ts build-rs

# Build all TS packages (3-phase dependency order)
build-ts:
    bun run build:ts

# Build Rust workspace
build-rs:
    cargo build --workspace

# Build CLI binary (release)
build-cli:
    cargo build -p seam-cli --release

# Build WASM packages (injector + engine)
build-wasm:
    bash src/server/injector/build-wasm.sh
    bash src/server/engine/build-wasm.sh

# Build fullstack fixtures for integration/e2e tests
build-fixtures:
    bash scripts/ci/build-fixtures.sh

# === Test ===

# Run all tests (unit + integration + e2e)
test: test-unit test-integration test-e2e

# Run all unit tests (Rust + TS)
test-unit: test-rs test-ts

# Rust unit tests
test-rs:
    cargo test --workspace

# TS unit tests (vitest across all packages)
test-ts:
    bun run test:ts

# Go unit tests
test-go:
    cd src/server/core/go && go test -v -count=1 ./...

# Go integration tests (standalone + fullstack + i18n + workspace)
test-integration:
    #!/usr/bin/env bash
    set -euo pipefail
    cd tests/integration && go test -v -count=1
    cd ../fullstack && go test -v -count=1
    cd ../i18n && go test -v -count=1
    cd ../workspace-integration && go test -v -count=1 -timeout 120s

# Filesystem router tests
test-fs-router:
    cd tests/fs-router && go test -v -count=1 ./...

# Feature demo tests
test-features:
    #!/usr/bin/env bash
    set -euo pipefail
    for demo in stream-upload context-auth query-mutation handoff-narrowing; do
      cd tests/features/$demo && go test -v -count=1
      cd ../../..
    done

# Playwright E2E tests
test-e2e:
    cd tests/e2e && bunx playwright test

# === CI / Release ===

# TypeScript type checking
typecheck:
    bash scripts/ci/typecheck.sh

# Full verification pipeline (fmt + lint + build + all tests)
verify:
    bash scripts/verify-all.sh

# Smoke test (build + integration + e2e)
smoke:
    bash scripts/smoke-fullstack.sh

# Publish packages
publish *ARGS:
    bash scripts/publish.sh {{ ARGS }}

# Bump version across all packages
bump VERSION:
    bash scripts/bump-version.sh {{ VERSION }}

# Cross-compile CLI binaries
build-cli-cross *ARGS:
    bash scripts/build-cli.sh {{ ARGS }}

# Push commits and local-only tags to remote
push:
    #!/usr/bin/env bash
    set -euo pipefail
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    BEHIND_AHEAD=$(git rev-list --left-right --count "origin/$BRANCH...$BRANCH" 2>/dev/null || echo "0 0")
    AHEAD=$(echo "$BEHIND_AHEAD" | awk '{print $2}')
    if [ "$AHEAD" -gt 0 ]; then
      echo "Pushing $AHEAD commit(s) to origin/$BRANCH..."
      git push
    else
      echo "No unpushed commits."
    fi
    LOCAL_TAGS=$(git tag -l)
    REMOTE_TAGS=$(git ls-remote --tags origin 2>/dev/null | awk '{print $2}' | sed 's|refs/tags/||')
    NEW_TAGS=()
    for tag in $LOCAL_TAGS; do
      if ! echo "$REMOTE_TAGS" | grep -qx "$tag"; then
        NEW_TAGS+=("$tag")
      fi
    done
    if [ ${#NEW_TAGS[@]} -gt 0 ]; then
      echo "Pushing ${#NEW_TAGS[@]} new tag(s):"
      for tag in "${NEW_TAGS[@]}"; do echo "  $tag"; done
      git push --tags
    else
      echo "No new tags to push."
    fi

# Lines of code statistics
scol:
    tokei
