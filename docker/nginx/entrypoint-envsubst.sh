#!/bin/sh
set -e

if [ -z "$DOMAIN" ]; then
  echo "DOMAIN is not set"
  exit 1
fi

envsubst '${DOMAIN}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
