#!/bin/sh
set -e

mkdir -p /data

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "your-super-secret-jwt-key-change-in-production" ]; then
  echo "ERROR: Set a strong JWT_SECRET in your .env file before starting the container."
  exit 1
fi

if [ ! -f /data/dev.db ]; then
  echo "Creating new database from template..."
  cp /app/prisma/template.db /data/dev.db
  chown nextjs:nodejs /data/dev.db
fi

echo "Applying database schema..."
prisma db push --skip-generate --schema=/app/prisma/schema.prisma
chown nextjs:nodejs /data/dev.db 2>/dev/null || true

if [ "$SEED_ADMIN" = "true" ]; then
  echo "Seeding admin account..."
  su-exec nextjs node /app/docker/seed-admin.mjs
fi

echo "Starting app on port ${PORT:-3000}..."
exec su-exec nextjs node server.js
