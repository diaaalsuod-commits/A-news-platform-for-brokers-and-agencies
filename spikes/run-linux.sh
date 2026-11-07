#!/usr/bin/env bash
# Runs both spikes in a clean Linux container sized like the NFR-16 server: no GPU, 4 vCPU, 8 GB.
# Run it from the repository root. Results go to spikes/out/linux.
set -euo pipefail

mkdir -p spikes/out/linux

# Docker Hub downloads can be cut off on a poor connection, so retry the pull.
for attempt in $(seq 1 15); do
  docker pull node:24-bookworm-slim && break
  echo "pull attempt $attempt failed"
  sleep 20
done

MSYS_NO_PATHCONV=1 docker run --rm --cpus=4 --memory=8g \
  -v "$PWD/spikes:/src/spikes:ro" \
  -v "$PWD/packages/ui/fonts:/src/fonts:ro" \
  -v "$PWD/spikes/out/linux:/results" \
  node:24-bookworm-slim bash -c '
    set -euo pipefail
    mkdir -p /work/packages/ui /work/spikes
    cp -r /src/fonts /work/packages/ui/fonts
    cd /src/spikes
    cp -r README.md common.mjs package.json pdf map /work/spikes/
    ln -s /results /work/spikes/out
    cd /work/spikes
    npm install --no-audit --no-fund --loglevel=error
    PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install --with-deps chromium > /results/install.log 2>&1
    chown -R node:node /work /results
    uname -a
    id node
    su node -c "cd /work/spikes && node pdf/arabic.mjs" | sed -E "s/\"webgl\":\{[^}]*\},//" | cut -c1-260
    su node -c "cd /work/spikes && node pdf/catalog.mjs" | cut -c1-300
    su node -c "cd /work/spikes && node map/clusters.mjs" > /results/b.log 2>&1
    tail -3 /results/b.log | cut -c1-80
  '
