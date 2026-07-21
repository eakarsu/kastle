FROM node:22-alpine AS frontend-dependencies
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM frontend-dependencies AS frontend-build
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine AS backend-dependencies
WORKDIR /build/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production BACKEND_HOST=0.0.0.0 BACKEND_PORT=4002
WORKDIR /app
COPY --chown=node:node backend/ ./backend/
COPY --from=backend-dependencies --chown=node:node /build/backend/node_modules ./backend/node_modules
COPY --from=frontend-build --chown=node:node /build/frontend/dist ./frontend/dist
COPY --chown=node:node start.sh ./start.sh
USER node
EXPOSE 4002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4002/api/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["./start.sh"]
