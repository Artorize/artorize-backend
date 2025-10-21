# Deployment Guide

This guide covers deploying the Artorize Backend to a Debian 12 server using the automated deployment script.

## Prerequisites

- Fresh Debian 12 server with root access
- SSH access to the server
- Domain name (optional, for production with SSL)

## Quick Start

### One-Line Deployment (Recommended)

Run directly on your server:

```bash
curl -sSL https://raw.githubusercontent.com/Artorize/artorize-backend/main/deploy.sh | sudo bash -s -- --production
```

With domain for SSL:
```bash
curl -sSL https://raw.githubusercontent.com/Artorize/artorize-backend/main/deploy.sh | sudo bash -s -- --production --domain your-domain.com
```

The script will automatically clone the repository to `/opt/artorize-backend` and set up all services.

### Manual Deployment

If you prefer to clone first:

```bash
# Clone the repository
git clone https://github.com/Artorize/artorize-backend.git
cd artorize-backend

# Run deployment script
chmod +x deploy.sh
sudo ./deploy.sh --production
```

## Deployment Script Options

The `deploy.sh` script supports several options:

```bash
./deploy.sh [options]

Options:
  --skip-system-deps    Skip system dependencies installation
  --skip-mongodb        Skip MongoDB installation
  --skip-nginx          Skip Nginx installation and configuration
  --production          Set up for production environment
  --domain DOMAIN       Domain name for Nginx (optional)
  --app-dir DIR         Application directory (default: /opt/artorize-backend)
  --port PORT           Application port (default: 5001)
  --help                Show help message
```

### Examples

**Full production deployment with domain:**
```bash
sudo ./deploy.sh --production --domain api.artorize.com
```

**Development deployment without Nginx:**
```bash
sudo ./deploy.sh --skip-nginx
```

**Custom application directory:**
```bash
sudo ./deploy.sh --production --app-dir /var/www/artorize --port 3000
```

**Update existing deployment (skip system deps):**
```bash
sudo ./deploy.sh --production --skip-system-deps --skip-mongodb
```

## What the Script Does

The automated deployment script performs the following steps:

1. **System Update**: Updates all system packages
2. **Node.js Installation**: Installs Node.js 20.x from NodeSource
3. **System Dependencies**: Installs build tools and required libraries (git, build-essential, etc.)
4. **MongoDB Installation**: Installs and configures MongoDB 7.0
5. **User Creation**: Creates a dedicated `artorize` system user
6. **Repository Clone**: Clones the GitHub repository to `/opt/artorize-backend`
7. **Backup**: Backs up existing installations before updating
8. **Application Setup**: Installs npm dependencies as the application user
9. **Configuration**: Creates or restores runtime configuration file
10. **Systemd Service**: Sets up automatic startup and process management with security hardening
11. **Nginx Setup**: Configures reverse proxy with proper headers (optional)
12. **Firewall**: Configures UFW to allow HTTP/HTTPS traffic
13. **Service Start**: Starts and enables the application

## Post-Deployment Steps

### 1. Verify Installation

Check that all services are running:

```bash
# Check application status
systemctl status artorize-backend

# Check MongoDB status
systemctl status mongod

# Check Nginx status (if installed)
systemctl status nginx

# Test health endpoint
curl http://localhost/health
```

### 2. Configure Application

Edit the runtime configuration:

```bash
sudo nano /opt/artorize-backend/config/runtime.json
```

Example production configuration:

```json
{
  "environment": "production",
  "port": 5001,
  "mongodb": {
    "uri": "mongodb://localhost:27017",
    "database": "artorize"
  },
  "logging": {
    "level": "info"
  }
}
```

After changes, restart the service:

```bash
sudo systemctl restart artorize-backend
```

### 3. Seed Database (Optional)

For development/testing, seed the database with sample data:

```bash
cd /opt/artorize-backend
sudo -u artorize npm run seed:inputdata
```

### 4. Set Up SSL (Production)

For production deployments with a domain, set up SSL with Let's Encrypt:

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain and configure SSL certificate
sudo certbot --nginx -d your-domain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

Certbot will automatically:
- Obtain an SSL certificate
- Configure Nginx for HTTPS
- Set up automatic renewal

### 5. Configure MongoDB Authentication (Recommended)

For production, enable MongoDB authentication:

```bash
# Connect to MongoDB
mongosh

# Switch to admin database
use admin

# Create admin user
db.createUser({
  user: "admin",
  pwd: "your-secure-password",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
})

# Create application user
use artorize
db.createUser({
  user: "artorize_app",
  pwd: "your-app-password",
  roles: [ { role: "readWrite", db: "artorize" } ]
})

exit
```

Enable authentication in MongoDB:

```bash
sudo nano /etc/mongod.conf
```

Add:
```yaml
security:
  authorization: enabled
```

Update runtime configuration:

```bash
sudo nano /opt/artorize-backend/config/runtime.json
```

Update MongoDB URI:
```json
{
  "mongodb": {
    "uri": "mongodb://artorize_app:your-app-password@localhost:27017/artorize?authSource=artorize",
    "database": "artorize"
  }
}
```

Restart services:

```bash
sudo systemctl restart mongod
sudo systemctl restart artorize-backend
```

## Service Management

### Systemd Commands

```bash
# Start the service
sudo systemctl start artorize-backend

# Stop the service
sudo systemctl stop artorize-backend

# Restart the service
sudo systemctl restart artorize-backend

# Check service status
sudo systemctl status artorize-backend

# Enable automatic startup on boot
sudo systemctl enable artorize-backend

# Disable automatic startup
sudo systemctl disable artorize-backend
```

### View Logs

```bash
# View recent logs
sudo journalctl -u artorize-backend -n 100

# Follow logs in real-time
sudo journalctl -u artorize-backend -f

# View logs from today
sudo journalctl -u artorize-backend --since today

# View logs with specific time range
sudo journalctl -u artorize-backend --since "2025-01-01 00:00:00" --until "2025-01-02 00:00:00"
```

## Updating the Application

To update the application to a new version:

```bash
# Stop the service
sudo systemctl stop artorize-backend

# Backup current installation
sudo cp -r /opt/artorize-backend /opt/artorize-backend.backup

# Pull latest changes (if using git)
cd /opt/artorize-backend
sudo -u artorize git pull

# Or copy new files
# rsync -avz --exclude='node_modules' ./ root@server:/opt/artorize-backend/

# Install dependencies
sudo -u artorize npm ci --production

# Restart the service
sudo systemctl restart artorize-backend

# Verify it's running
sudo systemctl status artorize-backend
```

## Troubleshooting

### Service Won't Start

Check logs for errors:
```bash
sudo journalctl -u artorize-backend -n 50 --no-pager
```

Common issues:
- Port already in use: Check with `sudo lsof -i :5001`
- MongoDB not running: `sudo systemctl status mongod`
- Configuration errors: Validate `config/runtime.json`
- Permission issues: Ensure files are owned by `artorize` user

### MongoDB Connection Issues

Test MongoDB connection:
```bash
mongosh mongodb://localhost:27017/artorize
```

Check MongoDB logs:
```bash
sudo journalctl -u mongod -n 50
```

### Nginx Issues

Test Nginx configuration:
```bash
sudo nginx -t
```

View Nginx logs:
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### File Upload Issues

If file uploads fail, check:
1. Client max body size in Nginx: `/etc/nginx/sites-available/artorize-backend`
2. Disk space: `df -h`
3. MongoDB GridFS collection: `mongosh` → `use artorize` → `db.fs.files.find()`
4. Permissions on app directory: `ls -la /opt/artorize-backend`

## Security Considerations

### Firewall

The deployment script configures UFW to allow:
- SSH (port 22)
- HTTP (port 80)
- HTTPS (port 443)

To restrict SSH access:
```bash
sudo ufw allow from your-ip-address to any port 22
sudo ufw delete allow 22/tcp
```

### MongoDB Security

- Enable authentication (see post-deployment steps)
- Bind to localhost only (default)
- Use strong passwords
- Regularly update MongoDB

### Application Security

- Keep Node.js and npm packages updated
- Use SSL/TLS in production
- Configure proper CORS settings
- Review and update security headers in Nginx
- Enable rate limiting (already configured in application)

### Regular Maintenance

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Update npm packages (careful with breaking changes)
cd /opt/artorize-backend
sudo -u artorize npm outdated
sudo -u artorize npm update

# Check disk usage
df -h
du -sh /opt/artorize-backend

# Backup MongoDB
mongodump --out=/backup/mongodb-$(date +%Y%m%d)
```

## Monitoring

### Basic Monitoring

Check service health:
```bash
# Application health
curl http://localhost/health

# Resource usage
htop
free -h
df -h
```

### Set Up Monitoring (Optional)

Consider setting up:
- **PM2** for advanced process management
- **Prometheus + Grafana** for metrics
- **Uptime monitoring** (UptimeRobot, Pingdom, etc.)
- **Log aggregation** (ELK stack, Loki, etc.)

## Backup Strategy

### MongoDB Backup

Create a backup script:

```bash
sudo nano /usr/local/bin/backup-mongodb.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/backup/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
mongodump --out=$BACKUP_DIR/dump_$DATE
tar -czf $BACKUP_DIR/dump_$DATE.tar.gz -C $BACKUP_DIR dump_$DATE
rm -rf $BACKUP_DIR/dump_$DATE

# Keep only last 7 days
find $BACKUP_DIR -name "dump_*.tar.gz" -mtime +7 -delete
```

```bash
sudo chmod +x /usr/local/bin/backup-mongodb.sh
```

Add to crontab:
```bash
sudo crontab -e
```

Add daily backup at 2 AM:
```
0 2 * * * /usr/local/bin/backup-mongodb.sh
```

### Application Backup

Backup the entire application directory:
```bash
tar -czf /backup/artorize-backend-$(date +%Y%m%d).tar.gz /opt/artorize-backend
```

## Support

For issues or questions:
- Check logs: `journalctl -u artorize-backend -f`
- Review this guide
- Check GitHub issues
- Contact support

## Environment Variables Reference

The systemd service sets:
- `NODE_ENV`: Set to "production" or "development"
- `APP_CONFIG_PATH`: Points to runtime configuration file

Additional environment variables can be added to `/etc/systemd/system/artorize-backend.service`

## Performance Tuning

### Node.js

For high-traffic deployments, consider:
- Increase Node.js memory limit in systemd service
- Use clustering (PM2 or Node.js cluster module)
- Enable HTTP/2 in Nginx

### MongoDB

For better performance:
- Ensure indexes are created (automatic on startup)
- Monitor slow queries
- Configure appropriate WiredTiger cache size
- Consider replica sets for high availability

### Nginx

Tune for large file uploads:
- Adjust `client_max_body_size`
- Configure buffering appropriately
- Enable gzip compression for API responses
