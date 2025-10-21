#!/bin/bash
set -e

# Artorize Backend - Automated Debian 12 Deployment Script
# This script automates the complete deployment process on a fresh Debian 12 server

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration variables (can be overridden via environment)
APP_USER="${APP_USER:-artorize}"
APP_DIR="${APP_DIR:-/opt/artorize-backend}"
APP_PORT="${APP_PORT:-5001}"
MONGODB_VERSION="${MONGODB_VERSION:-7.0}"
NODE_VERSION="${NODE_VERSION:-20}"
DOMAIN="${DOMAIN:-}"  # Optional: for nginx setup
REPO_URL="${REPO_URL:-https://github.com/Artorize/artorize-backend.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"

# Parse command line arguments
SKIP_SYSTEM_DEPS=false
SKIP_MONGODB=false
SKIP_NGINX=false
PRODUCTION_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-system-deps)
            SKIP_SYSTEM_DEPS=true
            shift
            ;;
        --skip-mongodb)
            SKIP_MONGODB=true
            shift
            ;;
        --skip-nginx)
            SKIP_NGINX=true
            shift
            ;;
        --production)
            PRODUCTION_MODE=true
            shift
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --app-dir)
            APP_DIR="$2"
            shift 2
            ;;
        --port)
            APP_PORT="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --skip-system-deps    Skip system dependencies installation"
            echo "  --skip-mongodb        Skip MongoDB installation"
            echo "  --skip-nginx          Skip Nginx installation and configuration"
            echo "  --production          Set up for production environment"
            echo "  --domain DOMAIN       Domain name for Nginx (optional)"
            echo "  --app-dir DIR         Application directory (default: /opt/artorize-backend)"
            echo "  --port PORT           Application port (default: 5001)"
            echo "  --help                Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

log_info "Starting Artorize Backend deployment on Debian 12"
log_info "Target directory: $APP_DIR"
log_info "Application port: $APP_PORT"

# Step 1: Update system packages
if [ "$SKIP_SYSTEM_DEPS" = false ]; then
    log_info "Updating system packages..."
    apt-get update
    apt-get upgrade -y
    log_success "System packages updated"
fi

# Step 2: Install Node.js
if [ "$SKIP_SYSTEM_DEPS" = false ]; then
    log_info "Installing Node.js ${NODE_VERSION}..."

    # Check if Node.js is already installed
    if command -v node &> /dev/null; then
        CURRENT_NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$CURRENT_NODE_VERSION" -ge "$NODE_VERSION" ]; then
            log_success "Node.js ${CURRENT_NODE_VERSION} already installed"
        else
            log_warning "Node.js version $CURRENT_NODE_VERSION is older than $NODE_VERSION, upgrading..."
        fi
    else
        # Install Node.js from NodeSource
        apt-get install -y ca-certificates curl gnupg
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
        echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_VERSION}.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
        apt-get update
        apt-get install -y nodejs
        log_success "Node.js installed: $(node -v)"
    fi
fi

# Step 3: Install system dependencies
if [ "$SKIP_SYSTEM_DEPS" = false ]; then
    log_info "Installing system dependencies..."
    apt-get install -y \
        git \
        build-essential \
        python3 \
        pkg-config \
        libssl-dev \
        curl \
        wget \
        unzip
    log_success "System dependencies installed"
fi

# Step 4: Install MongoDB
if [ "$SKIP_MONGODB" = false ]; then
    log_info "Installing MongoDB ${MONGODB_VERSION}..."

    if command -v mongod &> /dev/null; then
        log_success "MongoDB already installed: $(mongod --version | head -n1)"
    else
        # Import MongoDB GPG key
        curl -fsSL https://www.mongodb.org/static/pgp/server-${MONGODB_VERSION}.asc | \
            gpg -o /usr/share/keyrings/mongodb-server-${MONGODB_VERSION}.gpg --dearmor

        # Add MongoDB repository
        echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-${MONGODB_VERSION}.gpg ] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/${MONGODB_VERSION} main" | \
            tee /etc/apt/sources.list.d/mongodb-org-${MONGODB_VERSION}.list

        # Install MongoDB
        apt-get update
        apt-get install -y mongodb-org

        # Start and enable MongoDB
        systemctl start mongod
        systemctl enable mongod

        log_success "MongoDB installed and started"
    fi
fi

# Step 5: Create application user
if ! id "$APP_USER" &>/dev/null; then
    log_info "Creating application user: $APP_USER..."
    useradd -r -s /bin/bash -d "$APP_DIR" -m "$APP_USER"
    log_success "User $APP_USER created"
else
    log_success "User $APP_USER already exists"
fi

# Step 6: Clone repository
log_info "Cloning repository from $REPO_URL (branch: $REPO_BRANCH)..."

# Backup existing installation if it exists
if [ -d "$APP_DIR" ]; then
    BACKUP_DIR="/var/backups/artorize"
    mkdir -p "$BACKUP_DIR"
    BACKUP_NAME="artorize-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    log_info "Backing up existing installation to $BACKUP_DIR/$BACKUP_NAME..."
    tar -czf "$BACKUP_DIR/$BACKUP_NAME" -C "$(dirname $APP_DIR)" "$(basename $APP_DIR)" 2>/dev/null || true

    # Save config for restore
    if [ -f "$APP_DIR/config/runtime.json" ]; then
        cp "$APP_DIR/config/runtime.json" "$BACKUP_DIR/runtime.json.backup"
    fi

    # Remove old installation
    rm -rf "$APP_DIR"
fi

# Clone repository
git clone --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"

# Restore config if backup exists
if [ -f "/var/backups/artorize/runtime.json.backup" ]; then
    log_info "Restoring configuration from backup..."
    cp "/var/backups/artorize/runtime.json.backup" "$APP_DIR/config/runtime.json"
fi

# Set ownership
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
log_success "Repository cloned and configured"

# Step 7: Install Node.js dependencies
log_info "Installing Node.js dependencies..."
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --production
log_success "Node.js dependencies installed"

# Step 8: Create configuration file
if [ ! -f "$APP_DIR/config/runtime.json" ]; then
    log_info "Creating runtime configuration..."
    mkdir -p "$APP_DIR/config"

    if [ "$PRODUCTION_MODE" = true ]; then
        ENV_TYPE="production"
    else
        ENV_TYPE="development"
    fi

    cat > "$APP_DIR/config/runtime.json" <<EOF
{
  "environment": "$ENV_TYPE",
  "port": $APP_PORT,
  "mongodb": {
    "uri": "mongodb://localhost:27017",
    "database": "artorize"
  },
  "logging": {
    "level": "info"
  }
}
EOF
    chown "$APP_USER:$APP_USER" "$APP_DIR/config/runtime.json"
    log_success "Configuration file created"
else
    log_success "Configuration file already exists"
fi

# Step 9: Create systemd service
log_info "Creating systemd service..."
cat > /etc/systemd/system/artorize-backend.service <<EOF
[Unit]
Description=Artorize Backend Service
Documentation=https://github.com/Artorize/artorize-backend
After=network.target mongodb.service
Wants=mongodb.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=$ENV_TYPE
Environment=APP_CONFIG_PATH=$APP_DIR/config/runtime.json
ExecStart=/usr/bin/node $APP_DIR/src/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=artorize-backend

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
log_success "Systemd service created"

# Step 10: Install and configure Nginx (if not skipped)
if [ "$SKIP_NGINX" = false ]; then
    log_info "Installing and configuring Nginx..."

    if ! command -v nginx &> /dev/null; then
        apt-get install -y nginx
    fi

    # Create Nginx configuration
    NGINX_CONF="/etc/nginx/sites-available/artorize-backend"

    if [ -n "$DOMAIN" ]; then
        SERVER_NAME="$DOMAIN"
    else
        SERVER_NAME="_"
    fi

    cat > "$NGINX_CONF" <<EOF
upstream artorize_backend {
    server 127.0.0.1:$APP_PORT;
    keepalive 64;
}

server {
    listen 80;
    server_name $SERVER_NAME;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Client body size limit (for file uploads)
    client_max_body_size 256M;

    # Timeouts for large file uploads
    client_body_timeout 300s;
    client_header_timeout 300s;

    location / {
        proxy_pass http://artorize_backend;
        proxy_http_version 1.1;

        # Headers
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Timeouts
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;

        # Buffering
        proxy_buffering off;
        proxy_cache_bypass \$http_upgrade;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://artorize_backend/health;
        access_log off;
    }
}
EOF

    # Enable site
    ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/artorize-backend

    # Remove default site if it exists
    rm -f /etc/nginx/sites-enabled/default

    # Test configuration
    nginx -t

    # Restart Nginx
    systemctl restart nginx
    systemctl enable nginx

    log_success "Nginx configured and started"
fi

# Step 11: Configure firewall (UFW)
if command -v ufw &> /dev/null; then
    log_info "Configuring firewall..."
    ufw --force enable
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    log_success "Firewall configured"
else
    log_warning "UFW not installed, skipping firewall configuration"
fi

# Step 12: Start the application
log_info "Starting Artorize Backend service..."
systemctl start artorize-backend
systemctl enable artorize-backend

# Wait a few seconds for the service to start
sleep 3

# Check service status
if systemctl is-active --quiet artorize-backend; then
    log_success "Artorize Backend service is running"
else
    log_error "Failed to start Artorize Backend service"
    log_error "Check logs with: journalctl -u artorize-backend -n 50"
    exit 1
fi

# Step 13: Display deployment summary
echo ""
echo "═══════════════════════════════════════════════════════════"
log_success "Deployment completed successfully!"
echo "═══════════════════════════════════════════════════════════"
echo ""
log_info "Application Details:"
echo "  - User: $APP_USER"
echo "  - Directory: $APP_DIR"
echo "  - Port: $APP_PORT"
echo "  - Config: $APP_DIR/config/runtime.json"
echo ""
log_info "Service Management:"
echo "  - Start:   systemctl start artorize-backend"
echo "  - Stop:    systemctl stop artorize-backend"
echo "  - Restart: systemctl restart artorize-backend"
echo "  - Status:  systemctl status artorize-backend"
echo "  - Logs:    journalctl -u artorize-backend -f"
echo ""
log_info "MongoDB:"
echo "  - Status:  systemctl status mongod"
echo "  - Connect: mongosh"
echo ""

if [ "$SKIP_NGINX" = false ]; then
    log_info "Nginx:"
    echo "  - Status:  systemctl status nginx"
    echo "  - Config:  /etc/nginx/sites-available/artorize-backend"
    echo "  - Test:    nginx -t"
    echo ""
fi

log_info "Health Check:"
if [ "$SKIP_NGINX" = false ]; then
    echo "  curl http://localhost/health"
else
    echo "  curl http://localhost:$APP_PORT/health"
fi
echo ""

if [ -n "$DOMAIN" ]; then
    log_info "Domain: http://$DOMAIN"
    log_warning "For HTTPS, configure SSL with certbot:"
    echo "  apt-get install -y certbot python3-certbot-nginx"
    echo "  certbot --nginx -d $DOMAIN"
    echo ""
fi

log_info "Next Steps:"
echo "  1. Review and customize: $APP_DIR/config/runtime.json"
echo "  2. Seed database: cd $APP_DIR && sudo -u $APP_USER npm run seed:inputdata"
echo "  3. Monitor logs: journalctl -u artorize-backend -f"
if [ -n "$DOMAIN" ]; then
    echo "  4. Set up SSL certificate with certbot"
fi
echo ""
log_success "Happy deploying!"
