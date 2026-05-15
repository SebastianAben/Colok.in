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
- Shared testing API: `https://api-dev-colokin.albern.space/v1`
- Production API: `https://api-colokin.albern.space/v1`
- LAN API, only when intentionally testing against a local API laptop: `http://<api-laptop-lan-ip>:4000/v1`

Mobile uses `EXPO_PUBLIC_API_URL`; see `apps/mobile/.env.local.example` and `apps/mobile/.env.server.example`.

For shared testing from another laptop or phone, point the mobile app at the dev home-server API:

```env
EXPO_PUBLIC_API_URL=https://api-dev-colokin.albern.space/v1
```

Restart Expo after changing `EXPO_PUBLIC_API_URL`. If the app still cannot connect, open
`https://api-dev-colokin.albern.space/v1/health` in the tester's browser to confirm the public
backend is reachable from their network.

Only use a LAN IP when you intentionally run the API from a local laptop instead of the home server.
In that mode, do not use `localhost` or `127.0.0.1` in the mobile app environment. Those addresses
point to the device running the app, not the laptop running the API. Use the API laptop's Wi-Fi/LAN
IP instead:

```bash
# macOS: find the API laptop's Wi-Fi IP
ipconfig getifaddr en0
```

Then set `apps/mobile/.env.local`:

```env
EXPO_PUBLIC_API_URL=http://<api-laptop-lan-ip>:4000/v1
```

The API already listens on `0.0.0.0`, so if `http://<api-laptop-lan-ip>:4000/v1/health` is
unreachable from the other laptop, check that both devices are on the same network and that the API
laptop firewall allows incoming connections to port `4000`.

## Deployment

The backend stack is designed to run on a physical home server documented as a cloud server. Public access is expected through Cloudflare Tunnel because the server does not have a reachable public IP or port forwarding.

See [Home Server Deployment](docs/deployment/HOME_SERVER.md).
