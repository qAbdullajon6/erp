# Deployment

Frontend → Vercel. Backend + PostgreSQL → VPS (Docker).

## 1. Frontend (Vercel)

1. In the Vercel dashboard: **Add New Project** → import `qAbdullajon6/erp` from GitHub.
2. Project settings:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: Vite (auto-detected)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: leave default (Nitro's `.output`, auto-detected)
3. Environment variables (Project Settings → Environment Variables): none required to build. The API is reached through the `/api/*` rewrite in `apps/web/vercel.json`, not through a `VITE_*` base URL.
4. Also add `NITRO_PRESET=vercel` as an environment variable, just to force the correct build target in case Vercel's platform auto-detection doesn't kick in for TanStack Start's Nitro build.
5. Deploy.

### After the VPS is up (step 2)

Edit `apps/web/vercel.json` and replace `REPLACE_WITH_VPS_DOMAIN` with the real VPS domain/IP, e.g.:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://api.yourdomain.com/:path*" }
  ]
}
```

Commit and push — Vercel redeploys automatically. Until this is set, anything that calls the API from the deployed frontend will fail (expected — backend doesn't exist yet).

## 2. Backend + Database (VPS)

Once the VPS is provisioned (Docker + Docker Compose installed):

```bash
git clone https://github.com/qAbdullajon6/erp.git
cd erp

cp apps/api/.env.example .env.prod
# Edit .env.prod and set:
#   POSTGRES_PASSWORD=<strong random password>
#   CORS_ORIGIN=https://<your-vercel-domain>.vercel.app
#   JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

This starts:
- `postgres` — PostgreSQL 16, data persisted in a named volume
- `api` — the NestJS API, built from `apps/api/Dockerfile`; runs `prisma migrate deploy` automatically on container start, then serves on port `4000`

Verify:

```bash
curl http://localhost:4000/health
```

Point a domain or reverse proxy (Caddy/Nginx) at port 4000 for TLS — the API itself does not terminate HTTPS. Once a domain is live, update `apps/web/vercel.json` as described above.

### Redeploying after code changes

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
