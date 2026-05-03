# CI/CD Runbook

## Required One-Time Server Setup

1. Register a new self-hosted runner for `SebastianAben/Colok.in`.
2. Add custom runner labels: `docker,colokin`.
3. Create these server env files:
   - `/home/froztbitez/web-server/colokin/dev/.env.server.dev`
   - `/home/froztbitez/web-server/colokin/prod/.env.server.prod`
4. Configure Nginx Proxy Manager hosts:
   - `api-dev.colokin.albern.space` -> `http://127.0.0.1:4001`
   - `api.colokin.albern.space` -> `http://127.0.0.1:4000`

## Deploy Policy

- `dev` deploys automatically to the dev stack and runs seed.
- `main` deploys automatically to the prod stack and does not run seed.
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
curl https://api-dev.colokin.albern.space/v1/health
curl http://127.0.0.1:4000/v1/health
curl https://api.colokin.albern.space/v1/health
```
