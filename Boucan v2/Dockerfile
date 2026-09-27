# BOUCAN — production image: one Node process serves the game page AND the WebSocket.
#
#   docker build -t boucan .
#   docker run -p 3001:3001 boucan            → http://localhost:3001
#
# Everything is built from source (no pre-built client/dist needed). See docs/DEPLOYMENT.md.

# ── 1. Build: typecheck + client (Vite) + server bundle (esbuild) ─────────────
FROM node:24-alpine AS build
WORKDIR /src
# Manifests first: the npm ci layer is cached until dependencies change.
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY sdk/package.json sdk/
COPY client/package.json client/
RUN npm ci
COPY shared/ shared/
COPY server/ server/
COPY sdk/ sdk/
COPY client/ client/
RUN npm run build

# ── 2. Runtime: server bundle + built client + production deps (ws, zod) ──────
FROM node:24-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY sdk/package.json sdk/
COPY client/package.json client/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /src/server/dist/ server/dist/
COPY --from=build /src/client/dist/ client/dist/
ENV CLIENT_DIR=/app/client/dist
USER node
WORKDIR /app/server
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1
CMD ["node", "dist/main.js"]
