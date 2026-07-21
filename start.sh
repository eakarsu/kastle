#!/usr/bin/env sh
set -eu

: "${NODE_ENV:=production}"
export NODE_ENV

if [ -z "${CORS_ORIGINS:-}" ] && [ "$NODE_ENV" = test ]; then
  CORS_ORIGINS="http://127.0.0.1:${FRONTEND_PORT:-5173}"
  export CORS_ORIGINS
fi

for name in DATABASE_URL JWT_SECRET CORS_ORIGINS; do
  value="$(printenv "$name" || true)"
  if [ -z "$value" ]; then echo "$name is required" >&2; exit 1; fi
done
if [ "${#JWT_SECRET}" -lt 32 ]; then echo "JWT_SECRET must contain at least 32 characters" >&2; exit 1; fi
if [ "$CORS_ORIGINS" = "*" ]; then echo "CORS_ORIGINS must contain explicit origins" >&2; exit 1; fi
if [ ! -f frontend/dist/index.html ]; then echo "frontend/dist is missing; build the release before startup" >&2; exit 1; fi

exec node backend/server.js
