# Multi-stage build for the NestJS API. Built from the monorepo root:
#   docker build -f apps/api/Dockerfile -t flowerp-api .
FROM node:24-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace=apps/api --include-workspace-root

COPY apps/api apps/api
WORKDIR /repo/apps/api
RUN npm run prisma:generate
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /repo

# tini is a real init: it forwards SIGTERM to Node and reaps zombies. Node as
# PID 1 does neither, so without it `docker stop` waits out the 10s grace period
# and then SIGKILLs — cutting off the graceful shutdown main.ts enables. wget
# (busybox) is already present for the HEALTHCHECK below.
RUN apk add --no-cache tini

ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace=apps/api --include-workspace-root --omit=dev

# Owned by the unprivileged `node` user (uid 1000, ships with the image) so the
# process never runs as root. migrate deploy and the server need only read these
# files and reach the database over the network — no write to the image.
COPY --from=build --chown=node:node /repo/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /repo/apps/api/prisma apps/api/prisma
COPY --from=build --chown=node:node /repo/node_modules/.prisma node_modules/.prisma
COPY --from=build --chown=node:node /repo/node_modules/@prisma node_modules/@prisma

WORKDIR /repo/apps/api
USER node
EXPOSE 4000

# Liveness from the container's own perspective. /health is the process-only
# check (no DB), matching what Caddy polls; SkipThrottle keeps it off the rate
# limiter. Compose/orchestrators restart the container when this fails.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:4000/health || exit 1

# tini as PID 1; the migrate-then-serve command is unchanged. migrate deploy
# never runs migrate dev, so it can never offer to reset the database.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
