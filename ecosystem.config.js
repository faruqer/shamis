// PM2 configuration. Start with:  pm2 start ecosystem.config.js
// The app reads DATABASE_URL and JWT_SECRET from .env in this folder.
// PORT and HOST are read from .env too (defaults: 3000 on all interfaces).
const fs = require("fs");
const path = require("path");

function readEnvFile() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/i);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

const fileEnv = readEnvFile();
const PORT = process.env.PORT || fileEnv.PORT || "3000";
// Behind nginx use HOST=127.0.0.1 so the app is only reachable through nginx.
const HOST = process.env.HOST || fileEnv.HOST || "0.0.0.0";

module.exports = {
  apps: [
    {
      name: "shamis",
      script: "node_modules/next/dist/bin/next",
      args: `start -H ${HOST} -p ${PORT}`,
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
