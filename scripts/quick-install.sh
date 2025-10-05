#!/usr/bin/env bash
# Quick install script for Artorize Storage Backend
# Run with: curl -sSL https://raw.githubusercontent.com/Artorize/artorize-backend/main/scripts/quick-install.sh | sudo bash

set -euo pipefail

echo "Installing Artorize Storage Backend..."
echo "This script will:"
echo "  - Clone the repository to /opt/artorize-storage-backend"
echo "  - Install dependencies and set up the service"
echo "  - Configure systemd for automatic startup"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Installation cancelled."
    exit 1
fi

# Download and run the auto-deploy script
cd /tmp
wget -q https://raw.githubusercontent.com/Artorize/artorize-backend/main/scripts/auto-deploy.sh
chmod +x auto-deploy.sh
./auto-deploy.sh

# Cleanup
rm -f auto-deploy.sh

echo "Installation complete!"