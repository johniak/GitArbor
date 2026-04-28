#!/usr/bin/env bash
# Build the e2e Docker image (cached on bun.lock) and run the Playwright
# suite inside it. Forwards extra arguments to the in-container test:e2e
# script — e.g. `bun run test:e2e:docker -- --workers=4 --grep merge`.
#
# Test artefacts (test-results/, playwright-report/) are copied out of
# the container into the host repo so failure traces are inspectable
# the same way as a local run.

set -euo pipefail

IMAGE_TAG="${GITARBOR_E2E_IMAGE:-gitarbor-e2e:dev}"
CONTAINER_NAME="gitarbor-e2e-$$"

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

echo "▶ Building $IMAGE_TAG (cached on package.json + bun.lock)…"
docker build --tag "$IMAGE_TAG" --file Dockerfile .

# Wipe stale outputs so failure-trace dirs are unambiguous.
rm -rf test-results playwright-report

# Failure to copy artefacts shouldn't mask the actual exit code.
copy_artefacts() {
  local exit_code=$?
  set +e
  echo ""
  echo "▶ Copying test artefacts back to host…"
  docker cp "$CONTAINER_NAME:/workspace/test-results"     ./test-results     2>/dev/null || true
  docker cp "$CONTAINER_NAME:/workspace/playwright-report" ./playwright-report 2>/dev/null || true
  docker rm --force "$CONTAINER_NAME" >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap copy_artefacts EXIT

echo ""
echo "▶ Running e2e suite (workers default to container CPU count)…"
echo "  → docker run … $IMAGE_TAG -- $*"
echo ""

docker run \
  --name "$CONTAINER_NAME" \
  --rm=false \
  --init \
  --ipc=host \
  --shm-size=1g \
  --tmpfs /tmp:rw,exec,size=2g \
  -e CI=1 \
  "$IMAGE_TAG" \
  "$@"
