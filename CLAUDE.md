# REIH v1.0 — rules for AI coding assistants

## What this is
REIH (Real Estate Intelligence Hub) is a B2B web platform for real-estate brokers in the UAE:
a map of developers' off-plan projects, filters, project and unit details, sales-contact reveal,
and branded PDF catalogs. Graduation project, one developer, deadline 31 January 2027.
Source of truth: docs/srs.md (SRS v3.1). Every feature traces to an ID: FR-XXX-nn, NFR-nn, BR-nn, UC-nn.n, D-nn.
Never invent requirements. If the SRS is silent or ambiguous, stop and ask me.

## Stack (decided in SRS 2.5 — do not change)
- pnpm workspaces + Turborepo, TypeScript strict, Node 24 LTS
- apps/api: NestJS modular monolith, REST + JSON under /api/v1
- apps/pdf-worker: NestJS standalone app, BullMQ consumer, Playwright (headless Chromium)
- apps/broker-web (Broker, Agency Admin) and apps/ops-web (Data Operator, Platform Admin):
  Next.js App Router, TanStack Query, next-intl (ar = rtl, en = ltr)
- PostgreSQL 16 + PostGIS 3.4 + pg_trgm + citext; Drizzle ORM + drizzle-kit migrations
- Redis 7 + BullMQ; MapLibre GL JS + OpenFreeMap tiles; Caddy (HTTPS); Docker Compose; Mailpit in dev
- zod schemas in packages/contracts, shared by API and web; Argon2id for passwords
- Tests: Vitest (unit), Supertest + Testcontainers postgis/postgis:16-3.4 (API), Playwright (e2e)
Ask me before adding any other runtime dependency.

## Repository layout
apps/api/src/modules/<module>/   api/ application/ domain/ infrastructure/ index.ts <module>.module.ts
apps/api/src/shared/             database, config, events, queue, files, mail, localization, http, audit
packages/contracts | packages/ui | packages/i18n | packages/config
docs/srs.md | docs/design/ | docs/progress.md | docs/decisions.md

## Architecture: modular monolith (NFR-13)
Modules and the tables they OWN. Only the owner writes its tables.

| module        | SRS      | owns |
|---------------|----------|------|
| identity      | ACC      | users, sessions, invitations, password_reset_tokens |
| agency        | AGY      | agencies, agency_branding |
| admin         | ADM      | currencies, exchange_rates, settings, property_types, layouts, unit_levels, furnishing_types, unit_tags, amenity_categories, amenities, catalog_themes |
| content       | DAT      | developers, sales_contacts, areas, projects, project_verifications, media_files, payment_plans, payment_plan_milestones, units, unit_history, project_sales_contacts, project_amenities, unit_tag_links |
| explore       | MAP, FLT | none — reads through content's ProjectReadModel |
| project-query | PRJ, UNT | none — reads through content's ProjectReadModel |
| contact       | CNT      | contact_reveals |
| catalog       | CAT      | catalogs, catalog_items, catalog_versions |
| favorites     | FAV      | favorites |
| shared/audit  | ADM-08   | audit_logs |

Rules:
1. A module's public API is ONLY its index.ts. Never import another module's internal files.
2. Never read or write another module's tables; call its exported service
   (e.g. AgencyService, InvitationService, RatesReader, SettingsReader, SalesContactReader, ProjectReadModel).
3. Inside a module: api/ (controllers + DTOs, HTTP only) -> application/ (services, transactions)
   -> domain/ (pure TypeScript rules, no Nest or Drizzle imports) -> infrastructure/ (Drizzle schema, repositories).
4. Cross-module side effects use in-process events on shared/events:
   AgencySuspended, MemberDeactivated, ProjectPublished, ProjectUnpublished.
5. shared/ is infrastructure only and never imports a module. Localization helpers there are pure functions;
   the latest exchange rate comes from admin's RatesReader.
6. eslint-plugin-boundaries enforces rules 1 and 5 in CI. A violation fails the build.

## Data rules
- Reference design: docs/design/schema.sql (36 tables). The Drizzle schema must produce the same database.
- After pnpm db:generate, check that geography(...) types are not quoted in the new migration; drizzle-kit quotes them,
  so remove the quotes before it is applied. apps/api/test/migrations.test.ts fails if any remain.
- Money: AED in numeric(14,2); in TypeScript use decimal strings or decimal.js, never float math.
  Converted prices are display only; the AED price is always shown next to them (BR-03).
- Areas in m²; ft² = m² × 10.7639 for display only (BR-04).
- Times: timestamptz in UTC, shown in Asia/Dubai (UTC+4). Daily limits use the UAE calendar day (NFR-06).
- Bilingual fields *_ar / *_en; a missing translation falls back to the other language (FR-LOC-03).
- Versioned migrations only; never edit an applied migration. DB rules stay in SQL migrations:
  BR-02 plan total = 100, BR-16 append-only unit_history, unit price/status history trigger
  (reads the acting user from SET LOCAL reih.user_id).

## API conventions
- REST under /api/v1, plural nouns (/projects/:id/units), JSON bodies validated with zod.
- Errors: { "error": { "code": "UPPER_SNAKE", "message": "...", "details": {} } } with the right HTTP status;
  messages in ar/en by Accept-Language.
- Every endpoint declares @Roles(...); only auth endpoints are @Public(). Agency Admin has all Broker rights.
  Data is scoped to the user's agency, and catalogs/favorites to their owner (NFR-09, BR-12).
- Sessions: server-side, cookie reih_session (Secure, HttpOnly, SameSite=Lax), 8-hour idle timeout;
  CSRF token on every POST/PUT/PATCH/DELETE (SRS 3.3).
- Lists: ?page&pageSize (max 100) -> { items, total, page, pageSize }.
- A sales contact's phone, WhatsApp and email leave the API ONLY from POST /contacts/:id/reveal (FR-CNT-01).
- Brokers see only published projects (BR-08) and only media with a license (BR-14).

## Frontend conventions
- No hard-coded UI text: packages/i18n (ar, en). Switching language keeps the current screen.
- Every data view has loading, empty, and error-with-retry states (SRS 3.1, NFR-12, NFR-17).
- Keyboard usable, visible focus, WCAG 2.1 AA contrast (NFR-14).
- Forms: react-hook-form + the zod schemas from packages/contracts.
- Wrap numbers, units, dates and Latin tokens inside Arabic text in <bdi dir="ltr"> (web and PDF).
- Map snapshots for PDFs need preserveDrawingBuffer and a check that the image is not blank.

## Security (NFR-08, NFR-10)
Argon2id; rate limits on login, password reset and reveal; uploads checked by real file type and size;
SVG logos sanitized; files served by short-lived signed links; no secrets in the repo; .env.example has names only.

## Tests (NFR-09, NFR-13)
- Every endpoint: a test for an allowed role, a forbidden role (403), and another agency/owner.
- Every acceptance criterion and business rule has a test named with its ID,
  e.g. it('FR-CNT-01 no phone number before a reveal').
- domain/ code: unit tests without a database. Repositories and API: integration tests on Testcontainers.

## How to work in this repo
1. Read this file and the SRS sections named in the task before writing code.
2. Propose a short plan (files, endpoints, tables, tests) and wait for my approval.
3. Implement in small steps; run pnpm lint, pnpm typecheck and pnpm test until all pass.
4. Tick the finished IDs in docs/progress.md; record any decision in docs/decisions.md.
5. End with: what changed, how I can try it, what is left. Do not commit unless I ask.
- Touch only the modules named in the task.
- Should requirements wait until every Must passes (D-01), unless the task says otherwise.
- Demo data is fictional and self-made (D-02); never use GenieMap data or assets (BR-15).

## Design files (docs/design/)
- schema.sql — reference database, 36 tables (tested on PostgreSQL 16).
- architecture.svg — the adopted modular monolith diagram.
- erd.svg, db_1_accounts.svg, db_2_content.svg, db_3_broker_work.svg — ER diagrams.
- class_all.svg, class_4_services.svg, class_5_enums.svg — class names, services and enums.
- use-cases/uc_00 … uc_06 — use case diagrams (screens and permissions).
- REIH_Activity_Sequence_Diagrams.pdf — step-by-step flow of 10 use cases.

## Commands
pnpm dev | pnpm test | pnpm lint | pnpm typecheck | pnpm db:generate | pnpm db:migrate
pnpm db:seed | pnpm db:seed:demo | pnpm db:seed:load | docker compose up -d
