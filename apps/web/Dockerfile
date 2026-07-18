# Multi-stage build for the TanStack Start frontend. Built from the monorepo root:
#   docker build -f apps/web/Dockerfile -t flowerp-web .
#
# The build emits a Nitro server bundle. It must be the `node-server` preset —
# Nitro's default here is a Cloudflare Workers module, which will not start
# under Node. See apps/web/vite.config.ts.
FROM node:24-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace=apps/web --include-workspace-root

COPY apps/web apps/web
WORKDIR /repo/apps/web
RUN npm run build

# The Nitro bundle carries its own node_modules, so the runtime image needs
# nothing but Node and .output.
FROM node:24-alpine AS runtime
WORKDIR /app

# Real init: forwards SIGTERM to the Nitro server and reaps zombies, so
# `docker stop` shuts the SSR server down cleanly instead of SIGKILLing it.
RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Owned by the unprivileged `node` user (uid 1000, ships with the image); the
# SSR server only reads its own bundle.
COPY --from=build --chown=node:node /repo/apps/web/.output ./.output

USER node
EXPOSE 3000

# The SSR root answers 200; a failed check restarts the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", ".output/server/index.mjs"]
