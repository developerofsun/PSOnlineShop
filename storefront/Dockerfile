# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# API_URL is read at build time by next.config.ts (rewrites) and at runtime by server components.
# Inside the compose network the API is reachable as http://api:8080.
ARG API_URL=http://api:8080
ARG NEXT_PUBLIC_SITE_URL=http://localhost
ARG MAP_TILE_ORIGIN=https://tile.openstreetmap.org
ENV API_URL=$API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    MAP_TILE_ORIGIN=$MAP_TILE_ORIGIN \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Next's standalone output bundles only the files the server needs.
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
