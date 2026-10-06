#!/usr/bin/env bash
# Visual-regression-gate (Experience 2.0 §10b, PR 0.3) — lokaal in het
# vastgepinde Playwright-image draaien, identiek aan .github/workflows/visual.yml.
#
#   npm run test:visual:docker                 # vergelijken met de Linux-baselines
#   npm run test:visual:docker -- --update-snapshots   # baselines (her)genereren
#
# Let op: gebruik --platform linux/amd64 (standaard hieronder) zodat de opnames
# overeenkomen met de GitHub-runners (ubuntu-latest = x86_64). Op Apple Silicon
# loopt dat via emulatie en is het traag; de CI-job (workflow_dispatch) is de
# gezaghebbende bron voor baselines.
set -euo pipefail

cd "$(dirname "$0")/.."

PW_VERSION="$(node -p "require('./package.json').devDependencies['@playwright/test']")"
if [[ ! "$PW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "@playwright/test moet exact gepind zijn (gevonden: $PW_VERSION)" >&2
  exit 1
fi
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"
PLATFORM="${VISUAL_PLATFORM:-linux/amd64}"

# node_modules en .next in eigen volumes: de macOS-varianten (native SWC/sharp)
# mogen nooit in de Linux-container belanden, en andersom.
docker run --rm --init --ipc=host --platform "$PLATFORM" \
  -v "$PWD":/work -w /work \
  -v t4xi-visual-node-modules:/work/node_modules \
  -v t4xi-visual-next:/work/.next \
  -e APP_ENV=development -e CI=true -e NEXT_TELEMETRY_DISABLED=1 \
  -e LANG=nl_NL.UTF-8 -e LANGUAGE=nl_NL:nl -e LC_ALL=nl_NL.UTF-8 \
  "$IMAGE" \
  bash -c 'npm ci --no-audit --no-fund && npm run build && npx playwright test "$@"' _ "$@"
