FROM oven/bun:1.2.22-alpine AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.json tsup.config.ts biome.json ./
RUN bun install --frozen-lockfile
COPY src ./src
RUN bun run build

FROM oven/bun:1.2.22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    PROFILE_GATEWAY_CACHE_DIR=/tmp/profile-gateway
COPY --from=build /app/package.json /app/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
USER bun
EXPOSE 3000
CMD ["bun", "run", "dist/server.js"]
