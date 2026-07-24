#!/usr/bin/env sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$project_dir"
[ -f .env ] || { echo '.env is required' >&2; exit 1; }
set -a
. ./.env
set +a

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

: "${BACKEND_PORT:?BACKEND_PORT is required}"
: "${FRONTEND_PORT:?FRONTEND_PORT is required}"
[ "$BACKEND_PORT" != "$FRONTEND_PORT" ] || { echo 'API and UI ports must be distinct' >&2; exit 1; }
for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then echo "Port $port is occupied" >&2; exit 1; fi
done

node backend/server.js & api_pid=$!
npm --prefix frontend run preview -- --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort & ui_pid=$!
cleanup() {
  kill -TERM "${api_pid:-}" "${ui_pid:-}" 2>/dev/null || true
  wait "${api_pid:-}" "${ui_pid:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
while kill -0 "$api_pid" 2>/dev/null && kill -0 "$ui_pid" 2>/dev/null; do sleep 1; done
exit 1
