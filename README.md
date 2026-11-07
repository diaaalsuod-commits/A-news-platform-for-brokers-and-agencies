# REIH

Real Estate Intelligence Hub: a B2B web platform for real-estate brokers in the UAE.
The requirements are in [docs/srs.md](docs/srs.md), and the rules for working in this repository
are in [CLAUDE.md](CLAUDE.md).

## Run locally

You need Node 24, pnpm (`corepack enable`), and Docker Desktop.

1. Install the dependencies:

   ```bash
   pnpm install
   ```

2. Create your environment file and fill in every value:

   ```bash
   cp .env.example .env
   ```

   | Variable            | Local value                                                       |
   | ------------------- | ----------------------------------------------------------------- |
   | `NODE_ENV`          | `development`                                                     |
   | `API_PORT`          | `4000` (Caddy expects this port)                                  |
   | `LOG_LEVEL`         | `info`                                                            |
   | `POSTGRES_USER`     | any name, for example `reih`                                      |
   | `POSTGRES_PASSWORD` | any local password                                                |
   | `POSTGRES_DB`       | any name, for example `reih`                                      |
   | `DATABASE_URL`      | `postgres://<user>:<password>@localhost:5432/<db>`, same as above |
   | `REDIS_URL`         | `redis://localhost:6379`                                          |

   The API and the worker stop at startup if a variable is missing or invalid.

3. Start Postgres, Redis, Mailpit and Caddy:

   ```bash
   docker compose up -d
   ```

4. Start the apps:

   ```bash
   pnpm dev
   ```

5. Open the apps through Caddy:

   | URL                                 | What it is              |
   | ----------------------------------- | ----------------------- |
   | https://app.localhost               | Broker Web App          |
   | https://ops.localhost               | Operations Dashboard    |
   | https://app.localhost/api/v1/health | API health              |
   | http://localhost:8025               | Mailpit (caught emails) |

   Caddy uses its own local certificate, so the browser warns once for each address. Accept the
   warning to continue. The apps call the API on their own address, so use these URLs rather than
   ports 3001 and 3002.

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The API and worker tests start their own containers, so Docker must be running.
