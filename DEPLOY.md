# Deploy with Docker

Run **Stock & Money** in Docker on port **7777**, with optional HTTPS on your domain.

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

## 4. Deploy with your domain (HTTPS)

Point DNS at your server:

| Type | Name | Value |
|------|------|--------|
| A | `@` | Your server public IP |
| A | `www` | Your server public IP (optional) |

Wait until DNS resolves (often 5–30 minutes):

```bash
ping yourdomain.com
```

Set domain values in `.env`:

```env
DOMAIN=yourdomain.com
ACME_EMAIL=you@yourdomain.com
COOKIE_SECURE=true
SEED_ADMIN=false
```

(`SEED_ADMIN=false` after the first deploy so the admin password is not reset on restart.)

Start app + Caddy (automatic Let's Encrypt certificate):

```bash
docker compose -f docker-compose.yml -f docker-compose.domain.yml up -d --build
```

Open:

- **https://yourdomain.com**

Caddy listens on **80/443** and proxies to the app. Port **7777** still works for direct access if the firewall allows it.

## 5. Useful commands

```bash
# Rebuild after code changes
docker compose up -d --build

# View running containers
docker compose ps

# Shell into the app container
docker compose exec app sh

# Backup SQLite database
docker compose exec app cat /data/dev.db > backup-$(date +%F).db
```

## 6. Firewall examples

**UFW (Ubuntu):**

```bash
sudo ufw allow 7777/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

**Windows Server:** allow inbound TCP **7777**, **80**, and **443** in Windows Firewall.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `JWT_SECRET` error on start | Set a real secret in `.env`, not the placeholder |
| Login works on HTTP but not HTTPS | Set `COOKIE_SECURE=true` when using Caddy/HTTPS |
| Certificate fails | Confirm `DOMAIN` matches DNS and ports 80/443 reach the server |
| Blank page after deploy | Run `docker compose logs app` and rebuild: `docker compose up -d --build` |
