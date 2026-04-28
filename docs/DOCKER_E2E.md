# Running e2e tests in Docker

`bun run test:e2e:docker` runs the full Playwright suite inside a
container that mirrors the GitHub Actions environment defined in
`.github/workflows/test.yml` (Ubuntu jammy + Microsoft's Playwright
base image + Bun + Xvfb). Use it locally when you need:

- a clean, deterministic environment (no host-tooling drift),
- to reproduce a CI-only failure on macOS or Windows,
- to run the suite without polluting the host's `out/`, `node_modules/`
  or `~/.cache/ms-playwright/`.

## Quick start

```bash
bun run test:e2e:docker
```

First run builds the image (≈3 min, ~2 GB pulled). Subsequent runs
reuse the cached `bun install` layer; only the source-copy layer is
re-built when files change.

Test artefacts land in `test-results/` and `playwright-report/` on the
host — same paths as a native run.

## Filtering / parallelism

Anything after `--` is forwarded to `playwright test` inside the
container.

```bash
# Pin worker count (default = container CPU count, same as Playwright's default)
bun run test:e2e:docker -- --workers=4

# Run a single describe / test by regex
bun run test:e2e:docker -- --grep "Interactive rebase"

# Combine
bun run test:e2e:docker -- --workers=2 --grep "Appearance"
```

By default Playwright matches workers to the CPU count the container
sees. Docker exposes the host's CPUs unless you pass `--cpus`, so you
get full parallelism out of the box.

## Memory / shared-memory

The wrapper script sets `--shm-size=1g` and `--tmpfs /tmp:size=2g` —
chromium needs more shared memory than Docker's 64 MB default, and
the e2e fixture creates temp git repos under `/tmp` (one per worker).

## Troubleshooting

**Image is stale** — force a rebuild:

```bash
docker rmi gitarbor-e2e:dev
bun run test:e2e:docker
```

**Need a shell inside the image** — for poking at packaged Electron
output or running git commands the way the test fixture does:

```bash
docker run --rm -it --entrypoint /bin/bash gitarbor-e2e:dev
```

**Different Playwright version** — bump
`mcr.microsoft.com/playwright:vX.Y.Z-jammy` in `Dockerfile` to match
the version in `package.json` (`@playwright/test`). Mismatch causes
"browser executable not found" errors at runtime.

**Image tag** — override via env:

```bash
GITARBOR_E2E_IMAGE=gitarbor-e2e:debug bun run test:e2e:docker
```

## Files

- `Dockerfile` — base image + bun + frozen-lockfile install + ENTRYPOINT
- `.dockerignore` — excludes `node_modules`, `out/`, `.git`, agent
  state, etc. so the build context stays small (tens of MB rather than
  hundreds).
- `scripts/docker-e2e.sh` — build + run wrapper, copies
  `test-results/` and `playwright-report/` back to the host on exit
  (success or failure).
- `package.json` — `test:e2e:docker` script.
