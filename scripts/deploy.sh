#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing environment file '$ENV_FILE'. Set ENV_FILE or create it before deploying." >&2
  exit 1
fi

export ENV_FILE
export NODE_ENV="${NODE_ENV:-production}"

echo "Installing dependencies..."
npm ci

echo "Applying database indexes..."
node scripts/ensure-indexes.js

echo "Starting API server..."
npm run start:prod
