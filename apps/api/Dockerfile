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

ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace=apps/api --include-workspace-root --omit=dev

COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/prisma apps/api/prisma
COPY --from=build /repo/node_modules/.prisma node_modules/.prisma
COPY --from=build /repo/node_modules/@prisma node_modules/@prisma

WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
