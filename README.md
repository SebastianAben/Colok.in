# Colok.in

Colok.in is a full-stack mobile platform for renting extension cables from smart lockers. The MVP stack is:

- Expo React Native mobile app.
- Express.js TypeScript API.
- PostgreSQL with Prisma.
- Mosquitto MQTT broker for mock IoT.
- Firebase Cloud Messaging in no-op mode until credentials are configured.
- Docker Compose for local development and home-server deployment.

## Workspace

```text
apps/
  api/
  mobile/
packages/
  shared/
docker/
  mosquitto/
docs/
```

## Local Development

Install dependencies:

```bash
pnpm install
```

Start PostgreSQL and Mosquitto:

```bash
pnpm docker:up
```

Run Prisma migration and seed against the Docker PostgreSQL port:

```bash
DATABASE_URL="postgresql://colokin:colokin@127.0.0.1:15432/colokin?schema=public" pnpm --filter @colokin/api prisma:migrate
DATABASE_URL="postgresql://colokin:colokin@127.0.0.1:15432/colokin?schema=public" pnpm --filter @colokin/api prisma:seed
```

Start the API:

```bash
pnpm dev:api
```

Start Expo:

```bash
pnpm dev:mobile
```

## API URLs

- Local API: `http://127.0.0.1:4000/v1`
- Planned tunnel API: `https://api-colokin.albern.space/v1`

Mobile uses `EXPO_PUBLIC_API_URL`; see `apps/mobile/.env.local.example` and `apps/mobile/.env.server.example`.

## Deployment

The backend stack is designed to run on a physical home server documented as a cloud server. Public access is expected through Cloudflare Tunnel because the server does not have a reachable public IP or port forwarding.

See [Home Server Deployment](docs/deployment/HOME_SERVER.md).
