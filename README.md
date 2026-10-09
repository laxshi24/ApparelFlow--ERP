# ApparelFlow ERP — Cutting Operations & Gatekeeper Verification

A full-stack garment-manufacturing ERP module built for the Webtezza (Pvt) Ltd engineering challenge.
Cutting Supervisors record cut batches, Cutting Verifiers physically count every component, and **only
fully counted, shortage-free batches approved by an authenticated verifier ever reach the Sewing Queue.**

> **Live URL:** _not yet deployed — see [Deployment](#deployment)._
> **Demo accounts:** see [Demo accounts](#demo-accounts).

---

## Contents

- [Core invariant](#core-invariant)
- [Technology stack](#technology-stack)
- [Architecture — vertical slices](#architecture--vertical-slices)
- [Database schema](#database-schema)
- [Business rules](#business-rules)
- [Security controls](#security-controls)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Commands](#commands)
- [Testing](#testing)
- [Deployment](#deployment)
- [Demo accounts](#demo-accounts)
- [API reference](#api-reference)
- [Known limitations](#known-limitations)

---

## Core invariant

**A cutting batch can enter the Sewing Queue only after an authenticated Cutting Verifier has explicitly
approved it and every required component has been counted without any shortage.**

It is enforced in four independent layers — removing any one of them still leaves the invariant protected:

| Layer | Mechanism |
|---|---|
| UI | Approve button disabled while any count is missing, invalid or RED (convenience only). |
| API | `POST /api/verification/:id/approve` requires the `cutting_verifier` role (403 otherwise) and returns 422 for missing counts, shortages or a non-pending order. |
| Use case | One transaction with `SELECT … FOR UPDATE` on the order: re-checks state, component coverage, completeness and shortages, then writes an immutable log and the `VERIFIED` transition atomically. |
| Database | A PostgreSQL trigger rejects any transition to `VERIFIED` unless an `APPROVED` log exists for the attempt **and** every item is counted with no shortage; `UNIQUE(order_id, attempt_no)` on decisions; sewing operations can only reference `VERIFIED` orders. |

This was mutation-tested: deleting the application's shortage check still yields **422** (the trigger
blocks it), and deleting the row lock makes the concurrency tests fail.

## Technology stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Cache Components / Partial Prerendering), React 19, strict TypeScript |
| UI | Tailwind CSS v4, lucide icons, native `<dialog>` modals, own accessible component kit |
| API | Next.js Route Handlers (thin) delegating to per-slice server use cases |
| Database | PostgreSQL (production: any managed provider, e.g. Neon) |
| ORM / migrations | Drizzle ORM + drizzle-kit SQL migrations (+ hand-written trigger migration) |
| Validation | Zod v4 (shared by client forms and server) |
| Auth | Server-side sessions in PostgreSQL, opaque token in an `HttpOnly` cookie, Argon2id (`@node-rs/argon2`) |
| Tests | Vitest (unit + HTTP-level integration on real PostgreSQL), Playwright + axe-core (E2E, a11y) |
| Local DB | `embedded-postgres` — real PostgreSQL binaries via npm, no Docker required |
| CI | GitHub Actions with a PostgreSQL service |

## Architecture — vertical slices

Code is organised by business capability. Each slice owns its UI, schemas, server use cases, route
handlers and tests; `src/app` only contains thin routing files that re-export slice handlers/pages.

```
src/
  app/                      # Next.js routing only (pages + one-line route.ts re-exports)
    (app)/                  # authenticated shell: orders, verification, sewing, recipes, audit
    api/                    # REST endpoints → features/*/server/*.handlers.ts
    login/
  features/
    authentication/         # login/logout/me, demo panel, login throttling
    recipes/                # catalog, details, server-side multiplier endpoint
    cutting-orders/         # create (idempotent), list/search, detail read model, re-cut
    verification/           # counts, approval gatekeeper, rejection, terminal UI
    sewing-queue/           # verified-only queue, idempotent assembly start
    audit/                  # order timeline, decision log, wastage reporting
    health/                 # liveness + DB readiness
      └─ each: ui/ schemas/ server/ tests/
  domain/                   # shared pure rules: multiplier, traffic light, wastage (+ unit tests)
  lib/
    auth/                   # sessions, password hashing, permission matrix, guards
    database/               # schema, client, migrate, idempotent seed
    audit/                  # append-only event writer
    http/                   # API wrapper (errors, CSRF, logging) + client fetch helper
    env.ts errors.ts validation.ts logger.ts format.ts
  components/               # cross-slice UI kit, layout, status badges
drizzle/                    # SQL migrations (0001 = triggers / state machine)
e2e/                        # Playwright specs
scripts/                    # dev-db, migrate, seed
```

Slices were built and committed in order (see `git log`): foundation → auth/RBAC → recipes → orders →
verification gatekeeper → terminal & re-cut → sewing → audit → E2E/CI → UI polish → docs.

## Database schema

```mermaid
erDiagram
  users ||--o{ sessions : has
  users ||--o{ cutting_orders : creates
  recipes ||--|{ recipe_components : defines
  recipes ||--o{ cutting_orders : "cut from"
  cutting_orders ||--|{ verification_items : "per attempt × component"
  recipe_components ||--o{ verification_items : counts
  cutting_orders ||--o{ verification_logs : "one decision per attempt"
  users ||--o{ verification_logs : "verifier"
  cutting_orders ||--o| sewing_operations : "assembly start"
  cutting_orders ||--o{ audit_events : timeline
```

| Table | Key columns & constraints |
|---|---|
| `users` | `email` unique + lowercase check, `password_hash` (Argon2id), `role` enum |
| `sessions` | `id` = SHA-256 of the cookie token, `expires_at`; cascade on user delete |
| `recipes` | `recipe_code` unique, `std_fabric_yards numeric(6,2) > 0`, `wastage_cap numeric(5,2)` 0–100 |
| `recipe_components` | `(recipe_id, component_name)` unique, `pieces_per_garment > 0`, `image_url` nullable |
| `cutting_orders` | `order_no` unique (sequence `CO-YYYY-NNNNNN`), `target_qty` 1–100 000, `actual_fabric_yds numeric(10,2) ≥ 0`, `status` enum, `current_attempt ≥ 1`, `UNIQUE(created_by, idempotency_key)` |
| `verification_items` | `UNIQUE(order_id, attempt_no, component_id)`, `expected_qty > 0`, `actual_qty` nullable `≥ 0`, `status` nullable; checks: status present **iff** counted, and status must match the numbers (GREEN/YELLOW/RED) |
| `verification_logs` | `UNIQUE(order_id, attempt_no)`, `decision` enum, rejection note required (≥ 5 chars) for REJECTED and null for APPROVED, fabric + wastage snapshot, `component_variances jsonb` snapshot, server `timestamp`; **append-only (trigger)** |
| `sewing_operations` | `UNIQUE(order_id)`, `started_by`, `started_at`; insert only for VERIFIED orders (trigger), no delete |
| `audit_events` | `event_type` enum, actor, order, `payload jsonb`, `seq` identity for deterministic ordering; **append-only (trigger)** |

All timestamps are `timestamptz` (UTC) and are displayed in `Asia/Colombo` by default
(`NEXT_PUBLIC_DISPLAY_TIMEZONE`).

### Order status state machine (enforced by trigger `cutting_orders_status_guard`)

```
INSERT ─► PENDING_VERIFICATION ──approve──► VERIFIED   (terminal for cutting)
                 │   ▲
          reject │   │ re-cut (attempt + 1, new uncounted items)
                 ▼   │
               REJECTED
```

Sewing state is stored separately in `sewing_operations`, so starting assembly never overwrites the fact
that the batch was verified.

## Business rules

- **Component multiplier:** `expected = target quantity × pieces per garment`, computed on the server from
  the database recipe at order creation (and again for each re-cut). Client-supplied expected counts are
  ignored. 50 Casual Blouses → 50 / 50 / 100 / 50 / 100; 50 Crop Tops → 50 / 50 / 50 / 50 / 100.
- **Traffic light:** GREEN `actual = expected`, YELLOW `actual > expected`, RED `actual < expected`.
  An uncounted component is *incomplete* — never zero and never verified. YELLOW surplus does not block
  approval; any RED or uncounted component does.
- **Fabric wastage:** `expected fabric = target × std yards`; `wastage % = (actual − expected) / expected × 100`,
  computed in integer hundredths with a single division and rounded half away from zero to 2 dp
  (50 × 1.8 = 90 yd; 95 yd → **+5.56 %**). **Negative values mean fabric was saved.** The denominator
  cannot be zero (target ≥ 1, std > 0 enforced by validation and CHECK constraints).
- **Wastage cap (policy decision):** the specification gives caps (5 % / 8 %) but does not say exceeding
  them blocks approval, so the cap is **displayed, flagged and recorded** in the decision snapshot and audit
  reports — it never blocks approval.
- **Rejection:** requires a reason of at least 5 characters (validated in the UI, the API schema and a
  database CHECK). Rejected orders never appear in the Sewing Queue.
- **Re-cut workflow:** a Cutting Supervisor submits a re-cut for a REJECTED order with the (possibly new)
  fabric roll, total fabric used and a note. This opens a **new verification attempt** with fresh,
  uncounted items; the previous attempt's counts and its REJECTED log stay untouched (and are immutable
  in the database). The order must pass the full gatekeeper again.
- **Duplicate submissions:** order creation is idempotent per supervisor via a client idempotency key;
  assembly start is idempotent via `UNIQUE(order_id)`; concurrent approvals produce exactly one decision.

## Security controls

- **Authentication:** Argon2id (OWASP parameters); opaque 256-bit session token in an `HttpOnly`,
  `SameSite=Lax`, `Secure` (production) cookie; only its SHA-256 is stored; 8 h expiry checked against the
  database clock; logout revokes server-side; session fixation prevented on login; uniform 401 and
  equalised timing for unknown e-mail vs wrong password; DB-backed throttling (10 failures / 15 min).
- **Authorisation:** one permission matrix (`src/lib/auth/permissions.ts`) enforced in every Route Handler
  (`requireApiUser`) and page (`requirePageUser`); roles are re-read from the database on every request.
  Navigation hiding is cosmetic only. Use cases re-check the role as defence in depth.
- **Never trusted from the client:** role, verifier id, timestamps, status, expected quantities, traffic-light
  status, wastage, order number. Zod object schemas strip unknown keys, so these fields are ignored.
- **IDOR:** non-UUID ids are 404 without a query; the Sewing Supervisor receives 404 for any non-VERIFIED
  order (existence is not revealed).
- **CSRF:** `SameSite=Lax` cookies plus an `Origin`/`Sec-Fetch-Site` check on every mutating API request.
- **Injection:** Drizzle parameterised queries only; `LIKE` wildcards escaped in search.
- **Errors:** consistent `{ error: { code, message, details? } }`; no stack traces or SQL in responses;
  database integrity violations map to 409/422; structured JSON logs with request ids.
- **Headers:** `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, permissions policy; no
  `X-Powered-By`.
- **Secrets:** `.env*` git-ignored (only `.env.example` committed); environment validated at startup with
  actionable messages.

## Getting started

Requirements: **Node.js ≥ 20.9** (developed on Node 24). No Docker or local PostgreSQL install needed.

```bash
npm install
cp .env.example .env            # defaults work with the embedded database below

# Terminal 1 — local PostgreSQL (real binaries, data in ./.data/pg, creates the dev/test/e2e databases)
npm run db:start

# Terminal 2
npm run db:setup                # apply migrations + idempotent seed (safe to re-run)
npm run dev                     # http://localhost:3000
```

To use your own PostgreSQL instead, point `DATABASE_URL` (and `TEST_DATABASE_URL`, `E2E_DATABASE_URL`) at it
and skip `npm run db:start`.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string (use the provider's pooled URL in production) |
| `MIGRATION_DATABASE_URL` | no | `DATABASE_URL` | Direct connection for migrations (e.g. Neon unpooled URL) |
| `DATABASE_POOL_MAX` | no | `5` | Connections per server instance |
| `SESSION_TTL_HOURS` | no | `8` | Session lifetime (1–72) |
| `DEMO_MODE` | no | `false` | Show the evaluator demo-credential panel and persona switcher |
| `DEMO_PASSWORD` | with `DEMO_MODE` / seeding | — | Password set on the three demo users by `db:seed` (≥ 10 chars, avoid `#`) |
| `NEXT_PUBLIC_DISPLAY_TIMEZONE` | no | `Asia/Colombo` | Display timezone (storage is always UTC) |
| `TEST_DATABASE_URL` | for integration tests | — | Dedicated database, **wiped** on every run (must differ from `DATABASE_URL`) |
| `E2E_DATABASE_URL` | for E2E tests | — | Dedicated database, **wiped** on every run |

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types + `tsc --noEmit` |
| `npm run db:start` | Local embedded PostgreSQL |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Idempotent seed (recipes + demo users) |
| `npm run db:setup` | Migrate + seed |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm test` | Unit tests |
| `npm run test:integration` | HTTP-level integration tests on real PostgreSQL |
| `npm run test:all` | Unit + integration |
| `npm run test:e2e` | Playwright E2E + accessibility (builds and serves the app on port 3100) |

## Testing

Last local run (Windows 11, Node 24, PostgreSQL 18 via embedded-postgres):

- **Unit + integration:** 159 tests in 12 files — all passing (`npm run test:all`).
- **E2E:** 20 Playwright tests (desktop + mobile viewports, axe WCAG 2.1 AA scans) — all passing
  (`npm run test:e2e`).

Integration tests call the real exported Route Handlers with real `NextRequest`s (cookies, `Origin`, JSON
bodies) against a freshly migrated PostgreSQL database — no mocks of the database or auth.

| Required test | Where |
|---|---|
| 1 Verifier approves a fully counted batch | `src/features/verification/tests/gatekeeper.int.test.ts` |
| 2 RED component blocks approval | gatekeeper › 2/3 |
| 3 Missing counts block approval | gatekeeper › 2/3 |
| 4 Rejection without reason rejected by backend | gatekeeper › 4 |
| 5 Non-verifiers get 403 on approval | gatekeeper › 5/6 |
| 6 Non-verifiers cannot reject | gatekeeper › 5/6 |
| 7 Sewing Queue never returns unapproved orders | `src/features/sewing-queue/tests/sewing.int.test.ts` › 7 |
| 8 Client verifier id / timestamps ignored | gatekeeper › 8 |
| 9 Duplicate / concurrent approvals consistent | gatekeeper › 9 |
| 10 Invalid numeric inputs rejected | gatekeeper › 10, `orders.int.test.ts` › validation, `recipes.int.test.ts` |
| 11 Only supervisors create orders | `src/features/cutting-orders/tests/orders.int.test.ts` |
| 12 Only sewing supervisors start assembly | sewing › 12 |
| 13 Data survives reloads | `orders.int.test.ts` (fresh connection pool), E2E reload checks |
| 14 Rejected batches cannot bypass re-verification | `src/features/cutting-orders/tests/recut.int.test.ts` › 14 |
| 15 Failed transactions leave no partial state | gatekeeper › 15 |

Additional coverage: direct-SQL bypass attempts against the triggers, CSRF, session expiry/revocation,
login throttling, API-surface pinning (no write endpoints for audit data), exact-arithmetic property test
for wastage rounding, and E2E for the full three-role workflow.

## Deployment

The app targets **Vercel + a managed PostgreSQL** (e.g. Neon, Vercel Postgres, Supabase).

1. Create a PostgreSQL database and copy its **pooled** connection string (and, optionally, the direct one).
2. Push this repository to GitHub and import it in Vercel (framework preset: Next.js).
3. Set environment variables in Vercel → Settings → Environment Variables:
   `DATABASE_URL` (pooled, `sslmode=require`), optionally `MIGRATION_DATABASE_URL` (direct),
   `DEMO_MODE=true`, `DEMO_PASSWORD=<a strong demo password>`.
4. Deploy. The `vercel-build` script runs `scripts/migrate.ts` before `next build`, so migrations are applied
   on every deployment (they are idempotent).
5. Seed once from your machine: `DATABASE_URL=<production url> DEMO_PASSWORD=<same password> npm run db:seed`
   (idempotent — re-running only re-applies recipes and resets demo passwords).
6. Verify: `GET /api/health` → `{"status":"ok","database":"up"}`, then sign in with each demo account.

## Demo accounts

Seeded by `npm run db:seed`; all three share `DEMO_PASSWORD` (local default: `ApparelFlow-Demo-2026`).
With `DEMO_MODE=true` the login page lists them with one-click sign-in buttons, and the header offers a
persona switcher. Both perform a **real** logout + login through `/api/auth/login` — there is no
client-side role switching.

| Role | E-mail | Can |
|---|---|---|
| Cutting Supervisor | `supervisor@apparelflow.demo` | Create orders, review outcomes and rejection reasons, submit re-cuts |
| Cutting Verifier | `verifier@apparelflow.demo` | Count components, approve or reject, review verification history |
| Sewing Supervisor | `sewing@apparelflow.demo` | See verified batches only, inspect counts and attribution, start assembly |

The demo accounts are ordinary least-privilege users; the deployed demo password should be unique to the
deployment and is the only credential exposed by the panel.

## API reference

All endpoints return JSON; errors use `{ "error": { "code", "message", "details"? } }`.
`401` unauthenticated · `403` wrong role / cross-site · `400` invalid input · `404` not found or not visible ·
`409` conflict · `422` business-rule violation · `429` throttled.

| Method & path | Role | Notes |
|---|---|---|
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` | any | Session management |
| `GET /api/recipes` · `GET /api/recipes/:id` | all roles | Catalog |
| `GET /api/recipes/:id/breakdown?qty=N` | all roles | Server-side multiplier |
| `GET /api/orders?q=&status=&page=` · `GET /api/orders/:id` | supervisor, verifier | List / detail |
| `POST /api/orders` | supervisor | `{recipeId, targetQty, fabricRollId, actualFabricYds, idempotencyKey}` → 201 / 200 replay |
| `POST /api/orders/:id/recut` | supervisor | `{fabricRollId, actualFabricYds, note}`; REJECTED orders only |
| `GET /api/orders/:id/timeline` | supervisor, verifier; sewing for VERIFIED | Audit trail |
| `GET /api/verification` · `GET /api/verification/:id` | verifier | Pending queue / terminal data |
| `PUT /api/verification/:id/counts` | verifier | `{counts:[{itemId, actualQty|null}]}` |
| `POST /api/verification/:id/approve` | verifier | Optional `{counts}` saved atomically with the decision |
| `POST /api/verification/:id/reject` | verifier | `{reason, counts?}` |
| `GET /api/sewing` · `GET /api/sewing/:id` | sewing | VERIFIED only |
| `POST /api/sewing/:id/start` | sewing | 201 started / 200 already started |
| `GET /api/audit/summary` · `GET /api/audit/decisions?page=` | supervisor, verifier | Reporting |
| `GET /api/health` | public | Liveness + DB readiness |

## Known limitations

- Not yet deployed from this environment (no hosting credentials available); follow [Deployment](#deployment).
- Sewing has a single state (`IN_PROGRESS`); completing assembly is out of scope.
- The login throttle is per e-mail address; there is no IP-level rate limiting (would normally sit at the
  edge/WAF).
- There is no user-administration UI; users are managed via the seed script.
- Recipes are read-only in the UI (seeded); a recipe edit would not change existing orders because expected
  quantities are snapshotted per attempt.
