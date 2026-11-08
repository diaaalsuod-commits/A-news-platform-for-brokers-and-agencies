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

   | Variable               | Local value                                                       |
   | ---------------------- | ----------------------------------------------------------------- |
   | `NODE_ENV`             | `development`                                                     |
   | `API_PORT`             | `4000` (Caddy expects this port)                                  |
   | `LOG_LEVEL`            | `info`                                                            |
   | `POSTGRES_USER`        | any name, for example `reih`                                      |
   | `POSTGRES_PASSWORD`    | any local password                                                |
   | `POSTGRES_DB`          | any name, for example `reih`                                      |
   | `DATABASE_URL`         | `postgres://<user>:<password>@localhost:5432/<db>`, same as above |
   | `REDIS_URL`            | `redis://localhost:6379`                                          |
   | `SMTP_HOST`            | `127.0.0.1` (not `localhost`, see below)                          |
   | `SMTP_PORT`            | `1025` (Mailpit)                                                  |
   | `SMTP_FROM`            | `REIH <no-reply@reih.localhost>`                                  |
   | `SMTP_USER`            | leave blank (Mailpit needs no login)                              |
   | `SMTP_PASSWORD`        | leave blank                                                       |
   | `FILES_DIR`            | `./.data/files` (relative to `apps/api`)                          |
   | `URL_SIGNING_SECRET`   | at least 32 characters, generated as below                        |
   | `APP_URL`              | `https://app.localhost`                                           |
   | `OPS_URL`              | `https://ops.localhost`                                           |
   | `FIRST_ADMIN_EMAIL`    | optional; only the first-admin seed needs it                      |
   | `FIRST_ADMIN_PASSWORD` | optional; only the first-admin seed needs it                      |

   Generate `URL_SIGNING_SECRET` with:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   ```

   The mail library looks a host name up in DNS and not in the hosts file, so `localhost` can hang
   until it times out. Use the address.

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

## Seed data

Run `pnpm db:migrate` first. Each seed can run again and changes nothing the second time.

| Command              | What it does                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm db:seed`       | Reference data: currencies, dictionaries, amenities, emirates, communities                                      |
| `pnpm db:seed:admin` | Creates the first Platform Admin from `FIRST_ADMIN_EMAIL` and `FIRST_ADMIN_PASSWORD`, and refuses if one exists |
| `pnpm db:seed:demo`  | Fictional developers, 30 published projects, and demo exchange rates                                            |
| `pnpm db:seed:load`  | 5,000 published projects and 250,000 units for the load tests                                                   |

`db:seed:demo` refuses to run in production unless `ALLOW_DEMO_SEED=true`. The exchange rates it adds
are demo values, not market rates; an entry in `audit_logs` marks each one.

`db:seed:load` has no undo, so it refuses to run in production and on any database whose name does not
end with `_load`. Give it a database of its own. A `DATABASE_URL` in the environment takes priority
over `.env`:

```bash
docker compose exec postgres sh -c 'createdb -U "$POSTGRES_USER" reih_load'
```

```bash
DATABASE_URL=postgres://<user>:<password>@localhost:5432/reih_load pnpm db:migrate
```

```bash
DATABASE_URL=postgres://<user>:<password>@localhost:5432/reih_load pnpm db:seed:load
```
