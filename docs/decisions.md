# Decisions log

One entry per decision taken during the build. Newest at the bottom.
Format: date — decision — reason — SRS IDs affected.

- 2026-11-05 — Architecture: modular monolith (docs/design/architecture.svg) — SRS 2.5, NFR-13.
- 2026-11-05 — Runtime: Node 24 LTS (Node 20 is end-of-life) — SRS 2.5.
- 2026-11-06 — docs/progress.md shows the category in brackets on NFR lines instead of a priority — the SRS gives NFRs no Must/Should — NFR-01 to NFR-17.
- 2026-11-06 — GET /api/v1/health is the only @Public() endpoint besides the auth endpoints — the status page calls it before any login; approved by the project owner — FR-ACC-04, NFR-09.
- 2026-11-06 — Default language: the browser's language, falling back to English; the saved preference overrides it once FR-ACC-06 exists — the SRS names no default; decided by the project owner — FR-ACC-06, SRS 3.1.
- 2026-11-06 — Added runtime dependencies nestjs-pino (with pino and pino-http), pg and ioredis — logging, the Drizzle driver and the Redis client; approved by the project owner — SRS 2.5.
- 2026-11-06 — TypeScript pinned to 6.0.x — typescript-eslint supports TypeScript below 6.1 — NFR-13.
- 2026-11-06 — No third-party install script runs (allowBuilds false in pnpm-workspace.yaml) — none of the five that asked is needed — NFR-08. Why each one is safe:
  - @parcel/watcher: the script compiles only when build-from-source is requested; the prebuilt binary comes as an optional platform package.
  - @swc/core: the script only checks that the native binary loads; the binary comes as an optional platform package, and the API and worker tests run on it.
  - cpu-features: the script compiles an optional native addon used only by ssh2 to pick a cipher order; ssh2 loads it in a try/catch and it is test-only, through Testcontainers.
  - protobufjs: the script only prints a warning about the version range of dependents, and it is test-only, through Testcontainers.
  - ssh2: the script compiles an optional crypto addon and tolerates failure, using Node's crypto without it; it is test-only, through Testcontainers.
- 2026-11-06 — ESLint boundaries also enforce CLAUDE.md rule 3 for domain/ (no @nestjs/*, drizzle-orm or infrastructure/) — requested by the project owner — NFR-13.
- 2026-11-06 — Follow-up: Remove minimumReleaseAgeExclude from pnpm-workspace.yaml at the start of Phase 1 (after 2026-11-11), then run a frozen install and all checks.
- 2026-11-07 — Added dev dependency drizzle-kit, named in the stack; esbuild's install script stays off (allowBuilds false) because the binary comes as an optional platform package and generate and migrate ran without the script — SRS 2.5, NFR-08.
- 2026-11-07 — Migration order: 0000_extensions (hand-written), 0001_schema (generated), 0002_business_rules (hand-written). The task asked for extensions after the generated migration, but that migration uses citext, geography and gin_trgm_ops, so they have to exist first — NFR-13.
- 2026-11-07 — drizzle-kit quotes custom types, and "geography(Point,4326)" is not a valid type name, so the quotes were removed by hand from 0001_schema.sql before it was first applied. Any later generated migration that adds a geography column needs the same edit, and fails at migrate without it — NFR-13.
- 2026-11-07 — Cross-module foreign keys point at name-only stand-ins in shared/database/fk-targets.ts, so no schema file imports another module's table and no ESLint exception is needed. The stand-ins are for foreignKey() only — CLAUDE.md rules 1, 2 and 5, NFR-13.
- 2026-11-07 — The AED currency row and the single settings row are created by 0002_business_rules, as in schema.sql, not by pnpm db:seed: users.pref_currency defaults to AED and has a foreign key to currencies, so no user can exist without that row — FR-ADM-05, FR-ADM-06.
- 2026-11-07 — withUser uses set_config('reih.user_id', $1, true), which has the effect of SET LOCAL and, unlike it, accepts a bound parameter — FR-DAT-09.
- 2026-11-07 — catalog_versions.exchange_rate_id and catalog_versions.requested_by are ON DELETE RESTRICT, not CASCADE, in docs/design/schema.sql and the Drizzle schema; catalog_id stays CASCADE. Deleting a rate or a user must not erase a frozen catalog version, and users are deactivated, never deleted. 0001_schema was regenerated because no migration had been applied yet; decided by the project owner — BR-11, FR-CAT-06.
- 2026-11-07 — spikes/ is left out of the Prettier check: seven of its files already failed it at the last commit, and the folder holds throwaway experiments and recorded output, not product code; approved by the project owner — NFR-13.
