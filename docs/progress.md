# REIH v1.0 progress

One box per FR and NFR in docs/srs.md (SRS v3.1). When you tick an ID, update its module counter and the total.

**Total: 6 / 95 done** (78 FR: 64 Must, 14 Should; 17 NFR)

## ACC: Accounts and access

**5 / 6 done** (6 Must, 0 Should)

- [x] FR-ACC-01 (Must) Activate account by invitation
- [x] FR-ACC-02 (Must) Log in and log out, session timeout, account lockout
- [x] FR-ACC-03 (Must) Password reset and password change
- [x] FR-ACC-04 (Must) Enforce four roles on the server
- [ ] FR-ACC-05 (Must) Manage profile — backend done; catalog check pending
- [x] FR-ACC-06 (Must) Choose language, display currency and area unit

## AGY: Agency and team

**0 / 4 done** (4 Must, 0 Should)

- [ ] FR-AGY-01 (Must) Manage agency branding
- [ ] FR-AGY-02 (Must) Invite members, resend or cancel invitations
- [ ] FR-AGY-03 (Must) See members and pending invitations
- [ ] FR-AGY-04 (Must) Change member role, deactivate or reactivate member

## MAP: Map

**0 / 6 done** (4 Must, 2 Should)

- [ ] FR-MAP-01 (Must) Interactive UAE map with zoom and pan
- [ ] FR-MAP-02 (Must) Project markers, distinct marker for upcoming projects
- [ ] FR-MAP-03 (Must) Marker clusters with counts
- [ ] FR-MAP-04 (Must) Load only visible projects that match the filters
- [ ] FR-MAP-05 (Should) Results list beside the map
- [ ] FR-MAP-06 (Should) Keep map state in the page address

## FLT: Search and filters

**0 / 9 done** (8 Must, 1 Should)

- [ ] FR-FLT-01 (Must) Search names with suggestions
- [ ] FR-FLT-02 (Must) Location filter
- [ ] FR-FLT-03 (Must) Developer filter
- [ ] FR-FLT-04 (Must) Price filter
- [ ] FR-FLT-05 (Must) Handover filter
- [ ] FR-FLT-06 (Must) Stage filter
- [ ] FR-FLT-07 (Must) Unit filters: property type, layout, size
- [ ] FR-FLT-08 (Should) More filters: ownership, furnishing, levels, price per area, down payment
- [ ] FR-FLT-09 (Must) Active filter counts, remove one or clear all

## PRJ: Project card

**0 / 9 done** (9 Must, 0 Should)

- [ ] FR-PRJ-01 (Must) Project card: gallery, header, description, close
- [ ] FR-PRJ-02 (Must) Information tab
- [ ] FR-PRJ-03 (Must) Last verification and "Stale data" badge
- [ ] FR-PRJ-04 (Must) Amenities tab
- [ ] FR-PRJ-05 (Must) Payment Plans tab
- [ ] FR-PRJ-06 (Must) Documents & Videos tab
- [ ] FR-PRJ-07 (Must) Seller tab with numbers hidden
- [ ] FR-PRJ-08 (Must) "Add to catalog" and "Full units list" actions
- [ ] FR-PRJ-09 (Must) Expected launch date and "Preliminary" label

## UNT: Units

**0 / 5 done** (4 Must, 1 Should)

- [ ] FR-UNT-01 (Must) Units tab grouped by layout
- [ ] FR-UNT-02 (Must) Unit card
- [ ] FR-UNT-03 (Must) Full units list: sort, filter, floor order
- [ ] FR-UNT-04 (Must) Unit card actions: "Add to catalog" and "Contact"
- [ ] FR-UNT-05 (Should) Unit price history

## CNT: Sales contacts

**0 / 3 done** (2 Must, 1 Should)

- [ ] FR-CNT-01 (Must) Reveal sales contact, with logging
- [ ] FR-CNT-02 (Should) Daily reveal limit
- [ ] FR-CNT-03 (Must) Call, open WhatsApp or copy after a reveal

## CAT: Catalogs and presentation

**0 / 9 done** (7 Must, 2 Should)

- [ ] FR-CAT-01 (Must) Create catalog, add projects and units
- [ ] FR-CAT-02 (Must) Edit catalog items: remove, reorder, payment plan, notes
- [ ] FR-CAT-03 (Must) Catalog settings
- [ ] FR-CAT-04 (Must) Generate branded A4 PDF
- [ ] FR-CAT-05 (Must) Background generation with status and retry
- [ ] FR-CAT-06 (Must) Frozen catalog versions
- [ ] FR-CAT-07 (Must) Catalog library
- [ ] FR-CAT-08 (Should) Presentation mode
- [ ] FR-CAT-09 (Should) Catalog color themes

## FAV: Favorites

**0 / 1 done** (0 Must, 1 Should)

- [ ] FR-FAV-01 (Should) Favorites: projects, units, developers

## LOC: Localization

**0 / 4 done** (4 Must, 0 Should)

- [ ] FR-LOC-01 (Must) Prices in AED, converted display beside AED — rates and AED fallback done; price display pending
- [ ] FR-LOC-02 (Must) Areas in m² or ft²
- [ ] FR-LOC-03 (Must) Arabic and English names, with fallback
- [ ] FR-LOC-04 (Must) UAE as the only market, every area keeps its country

## DAT: Content management

**1 / 12 done** (10 Must, 2 Should)

- [ ] FR-DAT-01 (Must) Manage developers
- [ ] FR-DAT-02 (Must) Manage sales contacts
- [ ] FR-DAT-03 (Must) Manage emirates and communities
- [ ] FR-DAT-04 (Must) Create and edit projects
- [ ] FR-DAT-05 (Must) Publish only complete projects
- [ ] FR-DAT-06 (Must) Upload media and documents with source and license note
- [ ] FR-DAT-07 (Must) Manage payment plans
- [ ] FR-DAT-08 (Must) Manage units
- [x] FR-DAT-09 (Must) Permanent unit price and status history
- [ ] FR-DAT-10 (Must) Verify project, "Needs verification" list
- [ ] FR-DAT-11 (Should) Upload community boundary as GeoJSON
- [ ] FR-DAT-12 (Should) Import units from CSV or XLSX

## ADM: Platform administration

**0 / 10 done** (6 Must, 4 Should)

- [ ] FR-ADM-01 (Must) Manage agencies, first Agency Admin invitation — backend done; ops-web screen pending
- [ ] FR-ADM-02 (Must) Suspend or reactivate agency — backend done; ops-web screen pending
- [ ] FR-ADM-03 (Must) Manage staff accounts and invitations — backend done; ops-web screen pending
- [ ] FR-ADM-04 (Must) Manage reference data — backend done; ops-web screen and content forms pending
- [ ] FR-ADM-05 (Must) Display currencies and dated exchange rates — backend done; ops-web screen and catalog rate pending
- [ ] FR-ADM-06 (Must) Settings: stale threshold, invitation validity, reveal limit — backend done; ops-web screen pending
- [ ] FR-ADM-07 (Should) Review reveal log
- [ ] FR-ADM-08 (Should) Audit log of administrative actions
- [ ] FR-ADM-09 (Should) Member limit per agency
- [ ] FR-ADM-10 (Should) Operations Dashboard overview

## NFR: Non-functional requirements

**0 / 17 done**

- [ ] NFR-01 (Performance) Map query within 1 s at the 95th percentile
- [ ] NFR-02 (Performance) Search suggestions within 500 ms at the 95th percentile
- [ ] NFR-03 (Performance) Project card within 1.5 s at the 95th percentile
- [ ] NFR-04 (Performance) PDF catalog of up to 10 projects within 60 s
- [ ] NFR-05 (Capacity) 5,000 projects, 250,000 units, 100 concurrent users
- [ ] NFR-06 (Localization) Complete Arabic and English, local formats, UAE time
- [ ] NFR-07 (Compatibility) Supported browsers, desktop and tablet, phones for map and card
- [ ] NFR-08 (Security) Security baseline: HTTPS, Argon2id, CSRF, rate limits, upload checks
- [ ] NFR-09 (Security) Server-side authorization and data scoping on every request
- [ ] NFR-10 (Configuration) No secrets in the repository, .env.example lists names only
- [ ] NFR-11 (Privacy) Limited personal data, logs kept 12 months
- [ ] NFR-12 (Reliability) Daily backups kept 7 days, restore test, error states with retry
- [ ] NFR-13 (Maintainability) Modular monolith, versioned migrations, automated tests, linting
- [ ] NFR-14 (Accessibility) Keyboard use, visible focus, WCAG 2.1 AA contrast
- [ ] NFR-15 (Content licensing) Only licensed or self-produced data and media
- [ ] NFR-16 (Deployment) Docker Compose on one Linux server behind HTTPS
- [ ] NFR-17 (Usability) Visible states, first-time broker done within 10 minutes

## Notes

- Phase 5: check the 30 demo projects on the map; move any that fall in the sea.
