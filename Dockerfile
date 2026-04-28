# GitArbor — e2e in Docker
#
# Mirrors the Ubuntu jammy environment used by GitHub Actions in
# .github/workflows/test.yml: Microsoft's Playwright image already ships
# all chromium system deps + Xvfb, plus the matching browser binaries.
# We only need to add Bun on top.
#
# Build:  docker build -t gitarbor-e2e .
# Run:    xvfb-run is invoked by the default CMD via wrapper script.
FROM mcr.microsoft.com/playwright:v1.50.0-jammy

ENV DEBIAN_FRONTEND=noninteractive \
    BUN_INSTALL=/usr/local \
    PATH=/usr/local/bin:$PATH \
    CI=1

# bun.sh installer needs unzip — not in the slim playwright image.
RUN apt-get update \
    && apt-get install --no-install-recommends -y unzip \
    && rm -rf /var/lib/apt/lists/*

# Bun (matches the version that GitHub Actions' setup-bun installs by default).
RUN curl -fsSL https://bun.sh/install | bash

WORKDIR /workspace

# Layer 1 — dependencies. Cache invalidates only when bun.lock or
# package.json change.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Layer 2 — sources. Anything else in the repo lands here.
COPY . .

# Default invocation: build the Electron app and run the Playwright
# suite under Xvfb. Pass extra arguments through to playwright via the
# wrapper script (e.g. --workers=4, --grep "Interactive rebase").
ENTRYPOINT ["/usr/bin/xvfb-run", "--auto-servernum", "--", "bun", "run", "test:e2e", "--"]
CMD []
