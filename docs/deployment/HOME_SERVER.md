# Home Server Deployment

Colok.in deploys the backend stack to a physical home server. The Expo mobile app is not hosted on the server; mobile builds select the backend with `EXPO_PUBLIC_API_URL`.

The API Docker image is built on GitHub-hosted Actions and pushed to GitHub Container Registry (GHCR). The home server only pulls the image, runs migrations, optionally seeds dev, restarts services, and smoke tests the result.

## Environments

| Branch | Environment | Server path                                | Docker bridge API port | Public API                                |
| ------ | ----------- | ------------------------------------------ | ---------------------- | ----------------------------------------- |
| `dev`  | dev         | `/home/froztbitez/web-server/colokin/dev`  | `172.17.0.1:4001`      | `https://api-dev-colokin.albern.space/v1` |
| `main` | prod        | `/home/froztbitez/web-server/colokin/prod` | `172.17.0.1:4000`      | `https://api-colokin.albern.space/v1`     |

The two stacks use separate Compose project names and therefore separate PostgreSQL volumes.

## Server Files

Create the deploy directories and copy one env file per environment:

```bash
mkdir -p /home/froztbitez/web-server/colokin/dev
mkdir -p /home/froztbitez/web-server/colokin/prod

cp .env.server.dev.example /home/froztbitez/web-server/colokin/dev/.env.server.dev
cp .env.server.prod.example /home/froztbitez/web-server/colokin/prod/.env.server.prod
```

Fill strong values for:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- Firebase fields if `FCM_ENABLED=true`

`POSTGRES_PASSWORD` is the raw PostgreSQL password. `DATABASE_URL` is the Prisma connection URL used by the API. If the password contains URL-reserved characters such as `@`, `:`, `/`, `#`, `?`, `%`, or `&`, URL-encode the password inside `DATABASE_URL`, or use a hex password generated with `openssl rand -hex 32`.

Do not commit real `.env.server.dev` or `.env.server.prod` files.

## GitHub Runner

The existing Stride runner is repository-scoped, so Colok.in needs its own runner service on the same server.

In GitHub, open `SebastianAben/Colok.in` -> Settings -> Actions -> Runners -> New self-hosted runner. Use the generated token in:

```bash
mkdir -p /home/froztbitez/actions-runner-colokin
cd /home/froztbitez/actions-runner-colokin

# Use the download URL GitHub shows for the current runner version.
tar xzf actions-runner-linux-x64-*.tar.gz

./config.sh \
  --url https://github.com/SebastianAben/Colok.in \
  --token <GITHUB_RUNNER_TOKEN> \
  --name colokin-home \
  --labels docker,colokin \
  --work _work

sudo ./svc.sh install
sudo ./svc.sh start
```

The workflow targets `[self-hosted, Linux, X64, docker, colokin]`.

The deploy workflow also needs GitHub Actions package permissions so it can push and pull:

```text
ghcr.io/sebastianaben/colokin-api
```

## CI/CD Behavior

`.github/workflows/ci.yml` runs on pushes and PRs to `dev` and `main`:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
docker compose --env-file .env.server.prod.example -f docker-compose.server.yml config
```

`.github/workflows/deploy-home-server.yml` deploys:

- push to `dev` -> dev stack
- push to `main` -> prod stack
- manual dispatch -> selected environment

Deploy steps:

1. Build and push the API image to GHCR on a GitHub-hosted runner.
2. Sync repo files to the environment path while preserving env files and backups.
3. Pull the selected API image on the home server.
4. Start PostgreSQL and Mosquitto.
5. Create a predeploy PostgreSQL backup under `backups/`.
6. Run `pnpm prisma:migrate:deploy`.
7. Run `pnpm prisma:seed` only for dev.
8. Start API and smoke test local plus public health endpoints.

## Nginx Proxy Manager

Cloudflare Tunnel should continue routing public traffic to Nginx Proxy Manager. Add two proxy hosts:

```text
api-dev-colokin.albern.space -> http://172.17.0.1:4001
api-colokin.albern.space     -> http://172.17.0.1:4000
```

Cloudflare Tunnel can keep pointing to Nginx Proxy Manager, for example `http://172.17.0.1:80`.
Cloudflare handles public TLS; Nginx Proxy Manager should forward to the API over plain HTTP.
Keep PostgreSQL and Mosquitto private.

If Nginx Proxy Manager runs in Docker bridge mode and cannot reach host loopback addresses, either run NPM with host networking, route through a host-reachable address, or switch this stack to a shared Docker network before enabling the public smoke test.

## Manual Operations

From the environment path:

```bash
export API_IMAGE=ghcr.io/sebastianaben/colokin-api:dev-latest
docker compose --env-file .env.server.dev -f docker-compose.server.yml ps
docker compose --env-file .env.server.dev -f docker-compose.server.yml logs -f api
docker compose --env-file .env.server.dev -f docker-compose.server.yml run --rm migrate
docker compose --env-file .env.server.dev -f docker-compose.server.yml run --rm seed
```

Prod equivalents use `.env.server.prod`.

Create a manual backup:

```bash
export API_IMAGE=ghcr.io/sebastianaben/colokin-api:prod-latest
docker compose --env-file .env.server.prod -f docker-compose.server.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "backups/manual-prod-$(date +%Y%m%d%H%M%S).sql"
```

## Troubleshooting GHCR Pulls

If deploy fails while pulling `ghcr.io/sebastianaben/colokin-api`, check GitHub package permissions or `docker login ghcr.io` on the runner. The home server should not run `pnpm install` during deploy; npm registry failures indicate the workflow is using an old commit or a manual Docker build command.

## Mobile Configuration

Development/staging:

```env
EXPO_PUBLIC_API_URL=https://api-dev-colokin.albern.space/v1
```

Production/demo final:

```env
EXPO_PUBLIC_API_URL=https://api-colokin.albern.space/v1
```
