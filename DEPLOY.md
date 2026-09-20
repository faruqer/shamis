# Deploying Stock & Money with PM2

Server layout used in these steps: the app lives in `/home/faruqer/shamis` and runs on port 3000.

## 1. Requirements (once)

```bash
node -v            # 18 or newer
npm i -g pm2
```

## 2. Get the code

```bash
cd /home/faruqer/shamis
git pull
npm ci             # not --production: the maintenance scripts need tsx
```

## 3. Configure `.env`

`.env` sits in `/home/faruqer/shamis/.env` and is never committed.

```env
DATABASE_URL="file:/home/faruqer/shamis/prisma/dev.db"
JWT_SECRET="<paste the generated value>"
```

Generate the secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The app refuses to start in production with a missing, short or example secret. Changing it logs everyone out.

Add `HSTS=true` only once the app is served over HTTPS.

## 4. Put the database in place

```bash
pm2 stop shamis 2>/dev/null
cp /path/to/backup.db prisma/dev.db     # skip if the database is already there
npx prisma db push --skip-generate      # creates/updates tables, keeps data
npm run db:optimize                     # WAL mode: avoids "database is locked"
npm run db:repair:stock                 # preview stock repairs
npm run db:repair:stock -- --apply      # apply them
```

Check the database the app will actually use:

```bash
npm run db:check:login -- admin@stockmoney.com "the-password"
```

It prints the file path, how many users/imports/sales it holds, and whether the password matches.

## 5. Build

```bash
npm run build
```

## 6. Start under PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup          # run the command it prints, so the app survives a reboot
```

This starts two processes:

| Process | What it does |
|---|---|
| `shamis` | the app, port 3000, single instance (SQLite has one writer) |
| `shamis-backup` | database backup every night at 02:00 into `backups/`, keeps the last 30 |

Check it:

```bash
pm2 status
curl http://localhost:3000/api/health     # {"status":"ok", ...}
pm2 logs shamis --lines 50
```

## 7. Updating later

```bash
cd /home/faruqer/shamis
npm run db:backup            # backup first
git pull
npm ci
npm run build
pm2 restart shamis --update-env
```

`--update-env` matters: a plain `pm2 restart` keeps the environment the app was first started with, so `.env` changes are ignored without it.

## Day-to-day commands

| Task | Command |
|---|---|
| Backup now | `npm run db:backup` |
| Restore a backup | `pm2 stop shamis` → copy the file over `prisma/dev.db` → `pm2 start shamis` |
| Compact the database | `npm run db:optimize` |
| Check/repair stock rows | `npm run db:repair:stock` (add `-- --apply`) |
| Diagnose a failed login | `npm run db:check:login -- <email> "<password>"` |
| Reset a password | `npm run db:check:login -- <email> --reset "<new-password>"` |
| Logs | `pm2 logs shamis`, or `logs/app.log` and `logs/error.log` |

Restoring: stop the app first, and also delete any `dev.db-wal` and `dev.db-shm` files next to the database before starting again.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Invalid email or password" with correct details | The app is on the wrong database file. Run `npm run db:check:login` and compare the path with `DATABASE_URL`. |
| "The table `main.User` does not exist" | Same cause: the file is empty or missing. Put the backup at the `DATABASE_URL` path, then `npx prisma db push --skip-generate`. |
| "JWT_SECRET is missing or insecure" in the logs | Set a real secret in `.env`, then `pm2 restart shamis --update-env`. |
| "Too many login attempts" | 10 failed tries per account or 30 per IP within 5 minutes. It clears itself, or restart the app. |
| `.env` changes seem ignored | `pm2 restart shamis --update-env`. |
| "database is locked" | `npm run db:optimize` (enables WAL), and keep `instances: 1` in the PM2 config. |

## Behind nginx (optional)

For a domain or HTTPS, put nginx in front and forward to port 3000. It must pass the real client address, otherwise all users share one rate-limit bucket:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

With HTTPS working, add `HSTS=true` to `.env` and restart.
