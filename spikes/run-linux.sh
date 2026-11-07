#!/usr/bin/env bash
# Runs the spikes in a clean Linux container sized like the NFR-16 server: no GPU, 4 vCPU, 8 GB.
# Run it from the repository root. Results go to spikes/out/linux.
# The named volume keeps downloads between attempts. Remove it afterwards:
#   docker volume rm reih-spikes-modules
set -uo pipefail

mkdir -p spikes/out/linux

# Docker Hub downloads can be cut off on a poor connection, so retry the pull.
for attempt in $(seq 1 15); do
  docker pull node:24-bookworm-slim && break
  echo "pull attempt $attempt failed"
  sleep 20
done

MSYS_NO_PATHCONV=1 docker run --rm --cpus=4 --memory=8g \
  -v reih-spikes-modules:/work/spikes/node_modules \
  -v "$PWD/spikes:/src/spikes:ro" \
  -v "$PWD/packages/ui/fonts:/src/fonts:ro" \
  -v "$PWD/spikes/out/linux:/results" \
  node:24-bookworm-slim bash -c '
    set -uo pipefail
    mkdir -p /work/packages/ui
    cp -r /src/fonts /work/packages/ui/fonts
    cd /src/spikes
    cp -r README.md common.mjs package.json pdf map /work/spikes/
    ln -s /results /work/spikes/out
    cd /work/spikes
    npm install --no-audit --no-fund --loglevel=error
    export PLAYWRIGHT_BROWSERS_PATH=0 PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=300000
    installed=no
    for attempt in 1 2 3 4 5 6 7 8; do
      if npx playwright install --with-deps --only-shell chromium > /results/install.log 2>&1; then
        installed=yes
        break
      fi
      echo "browser install attempt $attempt failed"
      sleep 15
    done
    if [ "$installed" != yes ]; then
      tail -5 /results/install.log
      exit 1
    fi
    chown -R node:node /work /results
    uname -sr
    nproc
    free -g | sed -n 2p
    su node -c "cd /work/spikes && node pdf/arabic.mjs" | sed -E "s/\"webgl\":\{[^}]*\},//" | cut -c1-240
    su node -c "cd /work/spikes && node pdf/catalog.mjs" | sed -E "s/\"mapsMs\":\[[^]]*\],//" | cut -c1-280
    su node -c "cd /work/spikes && node map/clusters.mjs" > /results/b.log 2>&1
    echo "clusters exit: $?"
  '
