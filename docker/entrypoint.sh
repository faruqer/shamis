#!/bin/sh
set -e

mkdir -p /data

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "your-super-secret-jwt-key-change-in-production" ]; then
  echo "ERROR: Set a strong JWT_SECRET in your .env file before starting the container."
  exit 1
fi

echo "Applying database schema..."
node ./node_modules/prisma/build/index.js db push --skip-generate

if [ "$SEED_ADMIN" = "true" ]; then
  echo "Seeding admin account..."
  node /app/docker/seed-admin.mjs
fi

echo "Starting app on port ${PORT:-3000}..."
exec node server.js
