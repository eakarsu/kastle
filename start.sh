#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# Load env
export $(grep -v '^#' .env | grep -v '^$' | xargs)

echo "🔒 Kastle Systems Security Operations Platform"
echo "================================================"

# Aggressive cleanup — kill everything on our ports
cleanup_ports() {
  echo "Cleaning up ports 3000 and 4002..."
  for port in 3000 4002; do
    # Kill all processes on the port (SIGTERM first, then SIGKILL)
    lsof -ti:$port 2>/dev/null | xargs kill 2>/dev/null || true
    sleep 0.5
    lsof -ti:$port 2>/dev/null | xargs kill -9 2>/dev/null || true
  done
  # Wait until ports are confirmed free
  for port in 3000 4002; do
    attempts=0
    while lsof -ti:$port >/dev/null 2>&1; do
      attempts=$((attempts + 1))
      if [ $attempts -ge 10 ]; then
        echo "ERROR: Port $port still in use after cleanup. Kill it manually."
        exit 1
      fi
      sleep 1
    done
  done
  echo "Ports are free."
}

cleanup_ports

# Create database if not exists
echo "Setting up database..."
psql -U $(whoami) -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'kastle'" | grep -q 1 || \
  createdb kastle 2>/dev/null || echo "Database 'kastle' already exists"

# Backend setup
echo "Installing backend dependencies..."
cd "$ROOT_DIR/backend"
npm install

echo "Seeding database..."
node seed.js

# Frontend setup
echo "Installing frontend dependencies..."
cd "$ROOT_DIR/frontend"
npm install

# Final port check before starting services
for port in 3000 4002; do
  if lsof -ti:$port >/dev/null 2>&1; then
    echo "ERROR: Port $port got occupied during setup. Cleaning again..."
    lsof -ti:$port 2>/dev/null | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

# Start backend
echo "Starting backend on port $BACKEND_PORT..."
cd "$ROOT_DIR/backend"
npx nodemon server.js &
BACKEND_PID=$!

# Wait for backend to be ready before starting frontend
echo "Waiting for backend to start..."
attempts=0
while ! curl -s http://localhost:$BACKEND_PORT >/dev/null 2>&1; do
  attempts=$((attempts + 1))
  if [ $attempts -ge 15 ]; then
    echo "WARNING: Backend may not be ready yet, starting frontend anyway..."
    break
  fi
  sleep 1
done

# Start frontend
echo "Starting frontend on port $FRONTEND_PORT..."
cd "$ROOT_DIR/frontend"
npx vite --host --port $FRONTEND_PORT &
FRONTEND_PID=$!

echo ""
echo "✅ Kastle Platform Running!"
echo "   Frontend: http://localhost:$FRONTEND_PORT"
echo "   Backend:  http://localhost:$BACKEND_PORT"
echo "   Login:    admin@kastle.com / password123"
echo ""
echo "Press Ctrl+C to stop all services"

# Trap for clean shutdown
trap "echo ''; echo 'Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

wait
