#!/usr/bin/env bash
set -euo pipefail

# Artorize Storage Backend - Automatic Deployment Script for Debian/Ubuntu
# This script handles full deployment including service setup

# Configuration
REPO_URL="${REPO_URL:-https://github.com/Artorize/artorize-backend.git}"
DEPLOY_DIR="/opt/artorize-storage-backend"
SERVICE_NAME="artorize-backend"
SERVICE_USER="www-data"
SERVICE_GROUP="www-data"
BACKUP_DIR="/var/backups/artorize"
CONFIG_FILE="$DEPLOY_DIR/config/runtime.json"
LOG_DIR="/var/log/artorize"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root"
   exit 1
fi

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js version 18+ required. Current version: $(node -v)"
        exit 1
    fi

    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed."
        exit 1
    fi

    # Check MongoDB
    if ! systemctl is-active --quiet mongodb.service && ! systemctl is-active --quiet mongod.service; then
        log_warn "MongoDB service not running. Ensure MongoDB is properly configured."
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    # Check git
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed."
        exit 1
    fi

    log_info "Prerequisites check completed."
}

# Backup existing deployment
backup_existing() {
    if [ -d "$DEPLOY_DIR" ]; then
        log_info "Backing up existing deployment..."
        mkdir -p "$BACKUP_DIR"
        BACKUP_NAME="artorize-backup-$(date +%Y%m%d-%H%M%S)"
        tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" -C "$(dirname $DEPLOY_DIR)" "$(basename $DEPLOY_DIR)" 2>/dev/null || true
        log_info "Backup created: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
    fi
}

# Deploy application
deploy_application() {
    log_info "Deploying application..."

    # Stop service if running
    if systemctl is-active --quiet $SERVICE_NAME; then
        log_info "Stopping $SERVICE_NAME service..."
        systemctl stop $SERVICE_NAME
    fi

    # Remove old deployment (after backup)
    if [ -d "$DEPLOY_DIR" ]; then
        rm -rf "$DEPLOY_DIR"
    fi

    # Clone repository
    log_info "Cloning repository from $REPO_URL..."
    git clone "$REPO_URL" "$DEPLOY_DIR"

    # Restore config if exists in backup
    if [ -f "$BACKUP_DIR/runtime.json.backup" ]; then
        log_info "Restoring configuration from backup..."
        mkdir -p "$DEPLOY_DIR/config"
        cp "$BACKUP_DIR/runtime.json.backup" "$CONFIG_FILE"
    fi

    # Create log directory
    mkdir -p "$LOG_DIR"
    chown $SERVICE_USER:$SERVICE_GROUP "$LOG_DIR"

    # Set permissions
    chown -R $SERVICE_USER:$SERVICE_GROUP "$DEPLOY_DIR"

    # Install dependencies
    log_info "Installing dependencies..."
    cd "$DEPLOY_DIR"
    sudo -u $SERVICE_USER npm ci --production

    # Generate default config if not exists
    if [ ! -f "$CONFIG_FILE" ]; then
        log_info "Generating default configuration..."
        sudo -u $SERVICE_USER mkdir -p "$(dirname $CONFIG_FILE)"
        cat > "$CONFIG_FILE" <<EOF
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
        chown $SERVICE_USER:$SERVICE_GROUP "$CONFIG_FILE"
        log_warn "Default configuration created at $CONFIG_FILE"
        log_warn "Please update MongoDB credentials if needed!"
    else
        # Backup current config
        cp "$CONFIG_FILE" "$BACKUP_DIR/runtime.json.backup"
    fi

    # Ensure MongoDB indexes
    log_info "Creating MongoDB indexes..."
    sudo -u $SERVICE_USER node scripts/ensure-indexes.js --config="$CONFIG_FILE"
}

# Setup systemd service
setup_service() {
    log_info "Setting up systemd service..."

    # Copy service file
    cp "$DEPLOY_DIR/scripts/artorize-backend.service" "/etc/systemd/system/$SERVICE_NAME.service"

    # Reload systemd
    systemctl daemon-reload

    # Enable service
    systemctl enable $SERVICE_NAME

    log_info "Service $SERVICE_NAME has been configured."
}

# Start service
start_service() {
    log_info "Starting $SERVICE_NAME service..."
    systemctl start $SERVICE_NAME

    # Wait for service to start
    sleep 3

    if systemctl is-active --quiet $SERVICE_NAME; then
        log_info "Service started successfully!"
        systemctl status $SERVICE_NAME --no-pager
    else
        log_error "Service failed to start. Check logs with: journalctl -u $SERVICE_NAME -n 50"
        exit 1
    fi
}

# Test deployment
test_deployment() {
    log_info "Testing deployment..."

    # Wait a moment for service to be ready
    sleep 2

    # Test health endpoint
    if curl -f -s "http://localhost:3000/health" > /dev/null; then
        log_info "Health check passed!"
        curl -s "http://localhost:3000/health" | python3 -m json.tool 2>/dev/null || curl -s "http://localhost:3000/health"
    else
        log_error "Health check failed!"
        exit 1
    fi
}

# Setup nginx (optional)
setup_nginx() {
    read -p "Do you want to setup Nginx reverse proxy? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if ! command -v nginx &> /dev/null; then
            log_info "Installing Nginx..."
            apt-get update
            apt-get install -y nginx
        fi

        read -p "Enter your domain name (or press Enter for localhost): " DOMAIN
        DOMAIN=${DOMAIN:-localhost}

        cat > /etc/nginx/sites-available/artorize-storage <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 256M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
    }
}
EOF

        ln -sf /etc/nginx/sites-available/artorize-storage /etc/nginx/sites-enabled/
        nginx -t && systemctl reload nginx
        log_info "Nginx configured for domain: $DOMAIN"
    fi
}

# Main execution
main() {
    log_info "Starting Artorize Storage Backend deployment..."

    check_prerequisites
    backup_existing
    deploy_application
    setup_service
    start_service
    test_deployment
    setup_nginx

    echo
    log_info "Deployment completed successfully!"
    log_info "Service: systemctl status $SERVICE_NAME"
    log_info "Logs: journalctl -u $SERVICE_NAME -f"
    log_info "Config: $CONFIG_FILE"
    log_info "API: http://localhost:3000"
}

# Run main function
main "$@"