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

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=build /repo/apps/web/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
