#!/bin/bash
set -e

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.domain.yml"

if [ ! -f .env ]; then
  echo "Create .env first: cp .env.docker.example .env"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "$DOMAIN" ] || [ -z "$ACME_EMAIL" ]; then
  echo "Set DOMAIN and ACME_EMAIL in .env"
  exit 1
fi

rsa_key_size=4096
staging=${CERTBOT_STAGING:-0}
domain_path="/etc/letsencrypt/live/$DOMAIN"

echo "Starting app..."
$COMPOSE up -d --build app

echo "Creating temporary self-signed certificate (nginx needs files before Let's Encrypt issues real ones)..."
$COMPOSE run --rm --entrypoint "\
  mkdir -p '$domain_path' && \
  openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1 \
    -keyout '$domain_path/privkey.pem' \
    -out '$domain_path/fullchain.pem' \
    -subj '/CN=localhost'" certbot

echo "Starting nginx..."
$COMPOSE up -d nginx

echo "Removing temporary certificate..."
$COMPOSE run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/$DOMAIN && \
  rm -Rf /etc/letsencrypt/archive/$DOMAIN && \
  rm -Rf /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

staging_arg=""
if [ "$staging" != "0" ]; then
  staging_arg="--staging"
  echo "Using Let's Encrypt staging (test) certificates."
fi

echo "Requesting Let's Encrypt certificate for $DOMAIN..."
$COMPOSE run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    -d $DOMAIN \
    --email $ACME_EMAIL \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --no-eff-email \
    --force-renewal" certbot

echo "Reloading nginx with real certificate..."
$COMPOSE exec nginx nginx -s reload

echo "Starting certbot auto-renewal..."
$COMPOSE up -d certbot

echo ""
echo "Done. Open https://$DOMAIN"
echo "Set COOKIE_SECURE=true and SEED_ADMIN=false in .env for production."
