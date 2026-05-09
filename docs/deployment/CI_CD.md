# CI/CD Runbook

## Required One-Time Server Setup

1. Register a new self-hosted runner for `SebastianAben/Colok.in`.
2. Add custom runner labels: `docker,colokin`.
3. Create these server env files:
   - `/home/froztbitez/web-server/colokin/dev/.env.server.dev`
   - `/home/froztbitez/web-server/colokin/prod/.env.server.prod`
4. Configure Nginx Proxy Manager hosts:
   - `api-dev-colokin.albern.space` -> `http://172.17.0.1:4001`
   - `api-colokin.albern.space` -> `http://172.17.0.1:4000`
5. Confirm GitHub Actions can publish and read packages from GHCR:
   - `ghcr.io/sebastianaben/colokin-api`

## Deploy Policy

- `dev` deploys automatically to the dev stack and runs seed.
- `main` deploys automatically to the prod stack and does not run seed.
- API images are built on GitHub-hosted runners and pushed to GHCR.
- The home server pulls the prebuilt image and does not run `pnpm install`.
- Both environments run `prisma migrate deploy`.
- Both environments create a database backup before migration.

## First Deploy Checklist

```bash
ssh asus-server
mkdir -p /home/froztbitez/web-server/colokin/dev
mkdir -p /home/froztbitez/web-server/colokin/prod
```

Copy the matching example env file into each path, fill secrets, then push to `dev` or run the deploy workflow manually.

Health checks:

```bash
curl http://127.0.0.1:4001/v1/health
docker exec nginxproxymanager sh -lc 'curl http://172.17.0.1:4001/v1/health'
curl https://api-dev-colokin.albern.space/v1/health
curl http://127.0.0.1:4000/v1/health
docker exec nginxproxymanager sh -lc 'curl http://172.17.0.1:4000/v1/health'
curl https://api-colokin.albern.space/v1/health
```

Manual compose commands require an image:

```bash
export API_IMAGE=ghcr.io/sebastianaben/colokin-api:dev-latest
docker compose --env-file .env.server.dev -f docker-compose.server.yml ps
```
