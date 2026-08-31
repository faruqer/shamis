# Deploy with Docker

Run **Stock & Money** at **http://YOUR_SERVER_IP:7777**.

## Requirements

- Docker and Docker Compose
- Port **7777** open in the firewall

## 1. Prepare the server

```bash
git clone <your-repo-url> stock-and-money
cd stock-and-money
```

## 2. Configure environment

```bash
cp .env.docker.example .env
```

Edit `.env`:

```env
JWT_SECRET=a-long-random-secret-at-least-32-characters
ADMIN_PASSWORD=your-secure-admin-password
```

Generate a secret (Linux/macOS):

```bash
openssl rand -base64 32
```

## 3. Build and start

```bash
export DOCKER_BUILDKIT=1
docker compose up -d --build
```

First build can take **5–15 minutes** on a small VPS (`npm ci` + Next.js build). Later rebuilds are faster. Only one `npm install` runs during the build now.

Open:

- **http://YOUR_SERVER_IP:7777**

Default admin (if `SEED_ADMIN=true`):

- Email: `ADMIN_EMAIL` (default `admin@stockmoney.com`)
- Password: `ADMIN_PASSWORD`

## 4. Useful commands

```bash
docker compose logs -f app          # view logs
docker compose up -d --build        # rebuild after updates
docker compose down                 # stop
docker compose exec app sh          # shell into container
docker compose exec app cat /data/dev.db > backup.db   # backup database
```

## 5. Firewall (Ubuntu)

```bash
sudo ufw allow 7777/tcp
sudo ufw enable
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `JWT_SECRET` error on start | Set a real secret in `.env` |
| Cannot connect on port 7777 | Open port 7777 in firewall / cloud security group |
| Blank page after deploy | Run `docker compose logs app` and rebuild |
