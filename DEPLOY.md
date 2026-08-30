# Deploy with Docker

Run **Stock & Money** in Docker on port **7777**, with optional HTTPS on your domain via **nginx + certbot** (free Let's Encrypt certificates).

## Requirements

- Docker and Docker Compose on your server (VPS, cloud VM, etc.)
- Port **7777** open in the firewall (for direct access)
- For HTTPS on a domain: ports **80** and **443** open, DNS pointed at the server

## 1. Prepare the server

```bash
git clone <your-repo-url> stock-and-money
cd stock-and-money
```

## 2. Configure environment

```bash
cp .env.docker.example .env
```

Edit `.env` and set at minimum:

```env
JWT_SECRET=a-long-random-secret-at-least-32-characters
ADMIN_PASSWORD=your-secure-admin-password
```

Generate a secret (Linux/macOS):

```bash
openssl rand -base64 32
```

## 3. Build and start (port 7777)

```bash
docker compose up -d --build
```

Open:

- **http://YOUR_SERVER_IP:7777**

Default admin (if `SEED_ADMIN=true`):

- Email: value of `ADMIN_EMAIL` (default `admin@stockmoney.com`)
- Password: value of `ADMIN_PASSWORD`

Check logs:

```bash
docker compose logs -f app
```

Stop:

```bash
docker compose down
```

Database files live in the Docker volume `app-data` and persist across restarts.

## 4. Deploy with your domain (nginx + Let's Encrypt)

### DNS

Point DNS at your server:

| Type | Name | Value |
|------|------|--------|
| A | `@` | Your server public IP |
| A | `www` | Your server public IP (optional) |

Wait until DNS resolves:

```bash
ping yourdomain.com
```

### Firewall

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 7777/tcp
sudo ufw enable
```

### Environment

Set in `.env`:

```env
DOMAIN=yourdomain.com
ACME_EMAIL=you@yourdomain.com
COOKIE_SECURE=true
SEED_ADMIN=false
CERTBOT_STAGING=0
```

- `SEED_ADMIN=false` after the first deploy so the admin password is not reset on restart.
- Optional: set `CERTBOT_STAGING=1` for a test run first (avoids Let's Encrypt rate limits while debugging).

### Issue certificate and start nginx

On the server (Linux):

```bash
chmod +x docker/init-letsencrypt.sh
./docker/init-letsencrypt.sh
```

This script will:

1. Start the app
2. Create a temporary certificate so nginx can boot
3. Request a **real Let's Encrypt certificate** via certbot
4. Reload nginx and start automatic renewal

Open:

- **https://yourdomain.com**

nginx listens on **80/443**. Port **7777** still works for direct access if the firewall allows it.

### Manual start (after certificates exist)

```bash
docker compose -f docker-compose.yml -f docker-compose.domain.yml up -d --build
```

### Renew certificates

Certbot runs in a sidecar container and renews certificates automatically every 12 hours. To renew manually:

```bash
docker compose -f docker-compose.yml -f docker-compose.domain.yml run --rm certbot renew
docker compose -f docker-compose.yml -f docker-compose.domain.yml exec nginx nginx -s reload
```

## 5. Useful commands

```bash
# Rebuild after code changes
docker compose up -d --build

# Domain stack
docker compose -f docker-compose.yml -f docker-compose.domain.yml up -d --build

# View running containers
docker compose ps

# Shell into the app container
docker compose exec app sh

# Backup SQLite database
docker compose exec app cat /data/dev.db > backup-$(date +%F).db
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `JWT_SECRET` error on start | Set a real secret in `.env`, not the placeholder |
| Login works on HTTP but not HTTPS | Set `COOKIE_SECURE=true` when using nginx/HTTPS |
| Certificate request fails | Confirm `DOMAIN` DNS points to this server; ports 80/443 reachable from the internet |
| Rate limit from Let's Encrypt | Set `CERTBOT_STAGING=1`, run init script, then switch to `0` and run again |
| nginx fails to start | Run `./docker/init-letsencrypt.sh` — nginx needs cert files under `/etc/letsencrypt/live/$DOMAIN/` |
| Blank page after deploy | Run `docker compose logs app` and rebuild |
