# Multi-stage build: install + build with full devDependencies, then ship
# only the Nitro node-server output (see vite.config.ts's `nitro.preset`
# override — Lovable's default target is Cloudflare Workers, not a plain
# Node server, which is why that override exists).

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# VITE_API_BASE_URL is baked into the client bundle at build time (Vite env
# vars are compile-time, not runtime) — pass it as a build arg pointed at
# the deployed backend's URL. Never bake a localhost/preview URL in.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV PORT=8080
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
