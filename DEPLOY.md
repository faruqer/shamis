# Deploying Stock & Money with PM2

From an empty Ubuntu server to a running app. These steps use the folder
`/home/faruqer/shamis` and port 3000 — change them if yours differ.

## 1. Server preparation (once)

```bash
sudo apt update && sudo apt install -y git curl sqlite3

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v                       # v20.x

sudo npm i -g pm2
```

Set the server clock to Ethiopian time (the app also pins its own time zone, so this is
only for logs and cron):

```bash
sudo timedatectl set-timezone Africa/Addis_Ababa
```

## 2. Get the code

```bash
cd /home/faruqer
git clone <your-repo-url> shamis
cd shamis
npm ci                        # not --production: the maintenance scripts need tsx
mkdir -p logs backups
```

## 3. Create `.env`

```bash
nano /home/faruqer/shamis/.env
```

```env
DATABASE_URL="file:/home/faruqer/shamis/prisma/dev.db"
JWT_SECRET="<paste the value generated below>"
```

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the absolute path for `DATABASE_URL`. A relative path is resolved from the `prisma/`
folder, which is easy to get wrong. The app refuses to start in production with a missing,
short or example `JWT_SECRET`. Add `HSTS=true` only after HTTPS works.

## 4. Set up the database

Create the tables and turn on WAL mode (WAL prevents "database is locked" when several
people use the app at once):

```bash
cd /home/faruqer/shamis
npx prisma db push --skip-generate
npm run db:optimize
```

**A. Restoring your existing data:**

```bash
cp /path/to/backup.db prisma/dev.db
npx prisma db push --skip-generate       # adds any new columns, keeps data
npm run db:optimize
npm run db:repair:stock                  # preview stock repairs
npm run db:repair:stock -- --apply       # apply them
```

**B. Starting fresh:** create the owner account (choose your own password):

```bash
NODE_ENV=production ADMIN_EMAIL="owner@shamis.com" ADMIN_PASSWORD="<strong-password>" \
  ADMIN_NAME="Shemsi" npm run db:seed:admin
```

Then confirm the app will see what you expect:

```bash
npm run db:check:login -- owner@shamis.com "<strong-password>"
```

It prints the database file, how many users/imports/sales it holds, and whether the
password matches.

## 5. Build

```bash
npm run build
```

### On a 1 GB server

`npm ci` and `next build` both need more memory than 1 GB alone provides — the server looks
"stuck" while it swaps or the process gets killed. Add swap once, then build in low-memory
mode:

```bash
# 2 GB swap file (once, survives reboots)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h                      # Swap: 2.0Gi

# install and build with less memory
npm ci --no-audit --no-fund --prefer-offline
pm2 stop shamis 2>/dev/null  # free the running app's memory while building
LOW_MEMORY=true NODE_OPTIONS=--max-old-space-size=640 npm run build
pm2 start shamis
```

`LOW_MEMORY=true` builds with a single worker: slower (a few minutes), but it fits. Check
for an out-of-memory kill with `dmesg | tail -20` or `journalctl -k | grep -i oom`.

Running the app afterwards is comfortable on 1 GB — it uses roughly 150–250 MB.

## 6. Start under PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup                   # run the command it prints, so it restarts after a reboot
```

Two processes start:

| Process | What it does |
|---|---|
| `shamis` | the app on port 3000, single instance (SQLite allows one writer) |
| `shamis-backup` | nightly backup at 02:00 into `backups/`, keeps the last 30 |

Check it:

```bash
pm2 status
curl http://localhost:3000/api/health      # {"status":"ok", ...}
pm2 logs shamis --lines 50
```

## 7. Open the port

```bash
sudo ufw allow 3000/tcp
sudo ufw enable
```

Open `http://YOUR_SERVER_IP:3000` and log in. Also open the cloud provider's firewall if
there is one.

## 7b. Serving on port 80

Ubuntu only lets root open ports below 1024, so pick one of these.

**A. nginx in front (recommended — also the path to HTTPS later)**

```bash
sudo apt install -y nginx
sudo tee /etc/nginx/sites-available/shamis > /dev/null <<'EOF'
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/shamis /etc/nginx/sites-enabled/shamis
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

In `.env`, keep the app private behind nginx:

```env
PORT=3000
HOST=127.0.0.1
```

Then `pm2 delete shamis; pm2 start ecosystem.config.js; pm2 save`, and in the firewall
`sudo ufw allow 'Nginx HTTP'` and `sudo ufw delete allow 3000/tcp`.

**B. Node directly on port 80**

```bash
sudo setcap 'cap_net_bind_service=+ep' "$(readlink -f "$(which node)")"
```

`.env`: `PORT=80`, then `pm2 delete shamis; pm2 start ecosystem.config.js; pm2 save` and
`sudo ufw allow 80/tcp`. Re-run the `setcap` line after every Node.js upgrade, otherwise
the app fails with `EACCES: permission denied 0.0.0.0:80`.

## 8. Updating later

```bash
cd /home/faruqer/shamis
npm run db:backup             # always back up first
git pull
npm ci
npx prisma db push --skip-generate
npm run build
pm2 restart shamis --update-env
```

`--update-env` matters: a plain `pm2 restart` keeps the environment the app first started
with, so `.env` changes are ignored without it.

## Day-to-day commands

| Task | Command |
|---|---|
| Backup now | `npm run db:backup` |
| Restore a backup | `pm2 stop shamis` → copy over `prisma/dev.db` → delete `dev.db-wal`/`dev.db-shm` → `pm2 start shamis` |
| Compact the database | `npm run db:optimize` |
| Check/repair stock rows | `npm run db:repair:stock` (add `-- --apply`) |
| Diagnose a failed login | `npm run db:check:login -- <email> "<password>"` |
| Reset a password | `npm run db:check:login -- <email> --reset "<new-password>"` |
| Logs | `pm2 logs shamis`, or `logs/app.log` and `logs/error.log` |

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Invalid email or password" with correct details | The app is on the wrong database file. Run `npm run db:check:login` and compare its path with `DATABASE_URL`. |
| "The table `main.User` does not exist" | Same cause: an empty or missing file. Put the backup at the `DATABASE_URL` path, then `npx prisma db push --skip-generate`. |
| "JWT_SECRET is missing or insecure" in the logs | Set a real secret in `.env`, then `pm2 restart shamis --update-env`. |
| "Too many login attempts" | 10 failed tries per account, or 30 per IP, in 5 minutes. It clears itself; a restart also clears it. |
| `.env` changes ignored | `pm2 restart shamis --update-env`. |
| "database is locked" | `npm run db:optimize`, and keep `instances: 1` in the PM2 config. |
| Bot errors about "Server Reference ID" | Harmless scanners; the app already answers them with 404. |

## Behind nginx (optional, for a domain or HTTPS)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The forwarded headers matter: without them every user shares one rate-limit bucket. For
HTTPS use `sudo certbot --nginx -d your-domain.com`, then add `HSTS=true` to `.env`,
close port 3000 (`sudo ufw delete allow 3000/tcp`) and restart the app.
