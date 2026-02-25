#!/usr/bin/env bash
# =============================================================================
# scripts/publish.sh
#
# Build, test, and publish all @tf-engine packages in the correct order.
#
# Usage:
#   bash scripts/publish.sh           # build + test + publish to npm
#   DRY_RUN=1 bash scripts/publish.sh # build + test only (no npm publish)
#   TAG=next bash scripts/publish.sh  # publish with --tag next
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Publish order matters: dependents come after core.
PACKAGES=(
  "packages/core"
  "packages/react"
  "packages/three"
  "packages/urdf-loader"
)

DRY_RUN="${DRY_RUN:-0}"
TAG="${TAG:-latest}"

# Colour helpers
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Colour

log_step()  { echo -e "\n${GREEN}▶ $*${NC}"; }
log_warn()  { echo -e "${YELLOW}⚠  $*${NC}"; }
log_error() { echo -e "${RED}✗  $*${NC}" >&2; }

# ── Pre-flight checks ─────────────────────────────────────────────────────────

if [[ "$DRY_RUN" == "1" ]]; then
  log_warn "DRY_RUN=1 — packages will be built and tested but NOT published."
else
  # Make sure the user is logged in to npm
  if ! npm whoami &>/dev/null; then
    log_error "Not logged in to npm. Run: npm login"
    exit 1
  fi
  echo "Publishing as: $(npm whoami)"
fi

# ── Build all packages first ──────────────────────────────────────────────────

log_step "Building all packages…"
for pkg in "${PACKAGES[@]}"; do
  pkg_path="$REPO_ROOT/$pkg"
  pkg_name=$(node -p "require('$pkg_path/package.json').name")
  log_step "  build: $pkg_name"
  (cd "$pkg_path" && npm run build)
done

# ── Test all packages ──────────────────────────────────────────────────────────

log_step "Testing all packages…"
for pkg in "${PACKAGES[@]}"; do
  pkg_path="$REPO_ROOT/$pkg"
  pkg_name=$(node -p "require('$pkg_path/package.json').name")
  log_step "  test: $pkg_name"
  (cd "$pkg_path" && npm test)
done

# ── Publish ───────────────────────────────────────────────────────────────────

if [[ "$DRY_RUN" == "1" ]]; then
  log_warn "Skipping publish (DRY_RUN=1). All builds and tests passed ✓"
  exit 0
fi

log_step "Publishing packages with tag '${TAG}'…"
for pkg in "${PACKAGES[@]}"; do
  pkg_path="$REPO_ROOT/$pkg"
  pkg_name=$(node -p "require('$pkg_path/package.json').name")
  pkg_version=$(node -p "require('$pkg_path/package.json').version")
  log_step "  publish: $pkg_name@$pkg_version"
  (cd "$pkg_path" && npm publish --access public --tag "$TAG")
done

echo -e "\n${GREEN}✓ All packages published successfully!${NC}"
