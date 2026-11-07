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
