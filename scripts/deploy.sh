#!/usr/bin/env bash
set -euo pipefail

# Artorize Storage Backend - Unified Deployment Script
# Usage:
#   ./deploy.sh              # Local development deployment
#   ./deploy.sh --production # Full production deployment with systemd

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="$PROJECT_ROOT/config"
CONFIG_FILE="$CONFIG_DIR/runtime.json"
CONFIG_ARG="--config=$CONFIG_FILE"

# Production-specific settings
PRODUCTION_MODE=0
DEPLOY_DIR="/opt/artorize-storage-backend"
SERVICE_NAME="artorize-backend"
SERVICE_USER="www-data"
SERVICE_GROUP="www-data"
BACKUP_DIR="/var/backups/artorize"
LOG_DIR="/var/log/artorize"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parse arguments
for arg in "$@"; do
  case $arg in
    --production)
      PRODUCTION_MODE=1
      shift
      ;;
  esac
done

# Helper functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root (required for production mode)
check_root() {
  if [[ $EUID -ne 0 ]]; then
    log_error "Production mode requires root privileges. Run with sudo."
    exit 1
  fi
}

# Check prerequisites for production deployment
check_prerequisites() {
  log_info "Checking prerequisites..."

  # Check Node.js
  if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Install Node.js 18+ first."
    exit 1
  fi

  NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js 18+ required. Current: $(node -v)"
    exit 1
  fi

  # Check npm
  if ! command -v npm &> /dev/null; then
    log_error "npm is not installed."
    exit 1
  fi

  # Check MongoDB (warning only)
  if ! systemctl is-active --quiet mongodb.service && ! systemctl is-active --quiet mongod.service; then
    log_warn "MongoDB service not running. Ensure MongoDB is configured."
  fi

  log_info "Prerequisites OK"
}

# Create default configuration
create_config() {
  local config_path="$1"
  mkdir -p "$(dirname "$config_path")"

  if [ ! -f "$config_path" ]; then
    cat > "$config_path" <<'EOF'
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
    log_info "Created default configuration at $config_path"
    log_warn "Update MongoDB credentials if needed"
  else
    log_info "Configuration exists at $config_path"
  fi
}

# Install dependencies
install_dependencies() {
  local target_dir="$1"
  local user="${2:-}"

  cd "$target_dir"

  if [ "${SKIP_INSTALL:-0}" = "1" ]; then
    log_info "Skipping dependency installation (SKIP_INSTALL=1)"
    return
  fi

  log_info "Installing dependencies..."
  if [ -n "$user" ]; then
    sudo -u "$user" npm ci --production
  else
    npm ci
  fi
}

# Ensure MongoDB indexes
ensure_indexes() {
  local target_dir="$1"
  local config_path="$2"
  local user="${3:-}"

  log_info "Creating MongoDB indexes..."
  cd "$target_dir"

  if [ -n "$user" ]; then
    sudo -u "$user" node scripts/ensure-indexes.js "--config=$config_path"
  else
    node scripts/ensure-indexes.js "--config=$config_path"
  fi
}

# Backup existing deployment
backup_existing() {
  if [ -d "$DEPLOY_DIR" ]; then
    log_info "Backing up existing deployment..."
    mkdir -p "$BACKUP_DIR"
    BACKUP_NAME="artorize-backup-$(date +%Y%m%d-%H%M%S)"
    tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" -C "$(dirname $DEPLOY_DIR)" "$(basename $DEPLOY_DIR)" 2>/dev/null || true

    # Backup config separately for easy restore
    if [ -f "$DEPLOY_DIR/config/runtime.json" ]; then
      cp "$DEPLOY_DIR/config/runtime.json" "$BACKUP_DIR/runtime.json.backup"
    fi

    log_info "Backup: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
  fi
}

# Setup systemd service
setup_service() {
  log_info "Setting up systemd service..."

  # Use the service file from repo
  if [ -f "$DEPLOY_DIR/scripts/artorize-backend.service" ]; then
    cp "$DEPLOY_DIR/scripts/artorize-backend.service" "/etc/systemd/system/$SERVICE_NAME.service"
  else
    log_error "Service file not found at $DEPLOY_DIR/scripts/artorize-backend.service"
    exit 1
  fi

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  log_info "Service $SERVICE_NAME configured"
}

# Start service
start_service() {
  log_info "Starting $SERVICE_NAME service..."
  systemctl start "$SERVICE_NAME"
  sleep 3

  if systemctl is-active --quiet "$SERVICE_NAME"; then
    log_info "Service started successfully"
    systemctl status "$SERVICE_NAME" --no-pager
  else
    log_error "Service failed to start. Check: journalctl -u $SERVICE_NAME -n 50"
    exit 1
  fi
}

# Test deployment
test_deployment() {
  local port="${1:-3000}"
  log_info "Testing deployment..."
  sleep 2

  if curl -f -s "http://localhost:$port/health" > /dev/null; then
    log_info "Health check passed"
    curl -s "http://localhost:$port/health" | python3 -m json.tool 2>/dev/null || curl -s "http://localhost:$port/health"
  else
    log_warn "Health check failed (service may still be starting)"
  fi
}

# Production deployment workflow
deploy_production() {
  check_root
  check_prerequisites

  log_info "Starting production deployment..."

  # Stop service if running
  if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    log_info "Stopping $SERVICE_NAME..."
    systemctl stop "$SERVICE_NAME"
  fi

  # Backup existing deployment
  backup_existing

  # Deploy to /opt
  if [ -d "$DEPLOY_DIR" ]; then
    rm -rf "$DEPLOY_DIR"
  fi

  log_info "Copying application to $DEPLOY_DIR..."
  mkdir -p "$DEPLOY_DIR"
  cp -r "$PROJECT_ROOT"/* "$DEPLOY_DIR/"

  # Restore config if backup exists
  if [ -f "$BACKUP_DIR/runtime.json.backup" ]; then
    log_info "Restoring configuration from backup..."
    cp "$BACKUP_DIR/runtime.json.backup" "$DEPLOY_DIR/config/runtime.json"
  else
    create_config "$DEPLOY_DIR/config/runtime.json"
  fi

  # Create log directory
  mkdir -p "$LOG_DIR"
  chown "$SERVICE_USER:$SERVICE_GROUP" "$LOG_DIR"

  # Set permissions
  chown -R "$SERVICE_USER:$SERVICE_GROUP" "$DEPLOY_DIR"

  # Install dependencies
  install_dependencies "$DEPLOY_DIR" "$SERVICE_USER"

  # Ensure indexes
  ensure_indexes "$DEPLOY_DIR" "$DEPLOY_DIR/config/runtime.json" "$SERVICE_USER"

  # Setup and start service
  setup_service
  start_service
  test_deployment

  echo
  log_info "Production deployment complete!"
  log_info "Service: systemctl status $SERVICE_NAME"
  log_info "Logs: journalctl -u $SERVICE_NAME -f"
  log_info "Config: $DEPLOY_DIR/config/runtime.json"
  log_info "API: http://localhost:3000"
}

# Local development deployment
deploy_local() {
  log_info "Starting local deployment..."

  cd "$PROJECT_ROOT"

  # Create config
  create_config "$CONFIG_FILE"

  # Install dependencies
  install_dependencies "$PROJECT_ROOT"

  # Ensure indexes
  ensure_indexes "$PROJECT_ROOT" "$CONFIG_FILE"

  # Start server unless skipped
  if [ "${SKIP_SERVER_START:-0}" = "1" ]; then
    log_info "Skipping server start (SKIP_SERVER_START=1)"
    exit 0
  fi

  log_info "Starting API server..."
  exec node src/server.js "$CONFIG_ARG"
}

# Main execution
main() {
  if [ "$PRODUCTION_MODE" = "1" ]; then
    deploy_production
  else
    deploy_local
  fi
}

main "$@"
