#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="$PROJECT_ROOT/config"
CONFIG_FILE="$CONFIG_DIR/runtime.json"
CONFIG_ARG="--config=$CONFIG_FILE"

mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" <<'EOF'
{
  "environment": "production",
  "port": 3000,
  "mongo": {
    "uri": "mongodb://localhost:27017",
    "dbName": "artgallery"
  },
  "logLevel": "info"
}
EOF
  echo "Created default configuration at $CONFIG_FILE"
  echo "Update database credentials in the generated file before rerunning if needed."
fi

cd "$PROJECT_ROOT"

if [ "${SKIP_INSTALL:-0}" != "1" ]; then
  echo "Installing dependencies..."
  npm ci
else
  echo "Skipping dependency installation (SKIP_INSTALL=$SKIP_INSTALL)"
fi

echo "Ensuring MongoDB indexes..."
node scripts/ensure-indexes.js "$CONFIG_ARG"

if [ "${SKIP_SERVER_START:-0}" = "1" ]; then
  echo "Skipping API server start (SKIP_SERVER_START=$SKIP_SERVER_START)"
  exit 0
fi

echo "Starting API server..."
exec node src/server.js "$CONFIG_ARG"
