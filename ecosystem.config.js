// PM2 configuration. Start with:  pm2 start ecosystem.config.js
// The app reads DATABASE_URL and JWT_SECRET from .env in this folder.
module.exports = {
  apps: [
    {
      name: "shamis",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 0.0.0.0 -p 3000",
      cwd: __dirname,
      // SQLite allows one writer, so run a single instance (no cluster mode).
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "700M",
      env: {
        NODE_ENV: "production",
      },
      time: true,
      out_file: "logs/app.log",
      error_file: "logs/error.log",
      merge_logs: true,
    },
    {
      // Daily database backup at 02:00 into ./backups (keeps the last 30).
      name: "shamis-backup",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "scripts/db-maintenance.ts backup",
      cwd: __dirname,
      autorestart: false,
      cron_restart: "0 2 * * *",
      env: {
        NODE_ENV: "production",
      },
      time: true,
      out_file: "logs/backup.log",
      error_file: "logs/backup.log",
      merge_logs: true,
    },
  ],
};
