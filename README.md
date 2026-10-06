# ApparelFlow Cutting Gatekeeper

**Cutting Operations & Gatekeeper Verification Terminal** for the ApparelFlow ERP (Webtezza engineering challenge).

A full-stack module that stops defective or short cutting batches from ever reaching the sewing floor. A batch can only enter the **Sewing Queue** after a Cutting Verifier has counted every component and no component is short. That rule is enforced **on the server** (API and database), not just in the UI.

| | |
|---|---|
| **Live app** | https://apparelflow-cutting-gatekeeper.vercel.app |
| **Repository** | https://github.com/dewshan001/apparelflow-cutting-gatekeeper |
| **AI usage report** | [AI_OPTIMIZATION_REPORT.md](AI_OPTIMIZATION_REPORT.md) |

---

## 1. Demo credentials

Real authentication with three seeded factory roles. The login page also has a visible **Demo credentials & role switcher** panel with one-click sign-in for each persona.

| Role | Email | Password | Can do | Cannot do |
|---|---|---|---|---|
| **Cutting Supervisor** (`cutting_supervisor`) | `supervisor@demo.com` | `Demo@12345` | Create cutting orders from recipes, set quantities, log fabric yards, track progress, resubmit rejected batches | Verify batches. Access the Sewing Queue |
| **Cutting Verifier** (`cutting_verifier`) | `verifier@demo.com` | `Demo@12345` | Count pieces per component, see live traffic lights, approve or reject batches | Create orders or edit recipes. Access the Sewing Queue |
| **Sewing Supervisor** (`sewing_supervisor`) | `sewing@demo.com` | `Demo@12345` | See verified batches only, review the verifier's audit record, start sewing | See pending, rejected or unverified orders |

These credentials are public on purpose (the brief asks for an evaluator panel). They only unlock the seeded demo data.

### 5-minute walkthrough (mirrors the evaluator checklist)

1. **Contrast audit.** On the login page click both inputs and type. Sign in as the supervisor, click **Create Order**, open the recipe dropdown and type into every field. Text is dark on white in every state.
2. **RBAC.** As the **verifier** there is no *Create Order* button and no orders page. As **sewing** you only ever see verified batches.
3. **Shortage hard stop.** As the supervisor create a *Casual Blouse* order for 10 garments. Sign in as the verifier, type a count lower than *Expected* for any component: the badge turns red (*Shortage*) and **Approve Batch** is disabled. Then try to bypass the UI. With the verifier signed in, open the browser console and run:
   ```js
   await (await fetch('/api/verification/<ORDER_ID>/approve', { method: 'POST' })).json()
   ```
   The server answers **422** and lists the blocking components. The id is the number in the order number (`CO-00012` has id `12`), or run `(await (await fetch('/api/verification/orders')).json()).orders` to list the pending orders.
4. **Sewing handoff.** Enter exact counts for every component and click **Approve Batch**. Sign in as sewing: the batch is in the queue with the verifier's name, timestamp and wastage %. Click **Start Sewing Assembly**. Refresh the browser: everything persists.
5. **Direct API check with cURL** (no browser):
   ```bash
   BASE=https://apparelflow-cutting-gatekeeper.vercel.app
   curl -s -c jar.txt -H "Content-Type: application/json" \
     -d '{"email":"supervisor@demo.com","password":"Demo@12345"}' $BASE/api/auth/login
   curl -s -b jar.txt -X POST $BASE/api/verification/1/approve     # 403: a supervisor cannot verify
   curl -s $BASE/api/sewing/queue                                   # 401: not signed in
   ```

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16** (App Router), **JavaScript** + React 19 | One repo for UI and API route handlers; deploys to Vercel as-is |
| Database | **PostgreSQL** (Supabase) via **Drizzle ORM** | Real relational model, CHECK constraints, triggers, row locks |
| Auth | **jose** (signed JWT in an httpOnly cookie) + **bcryptjs** | Identity is derived server-side; nothing is trusted from the client |
| Validation | **zod** (v4) | One strict schema per endpoint |
| Styling | **Tailwind CSS 4** + a small global stylesheet for form contrast | |
| Tests | **Vitest** + **PGlite** (in-process Postgres) | `npm test` needs no credentials and runs the real migrations |

---

## 3. Architecture summary

```
 Browser (React)                    - UI only guides the user; it is NOT a security boundary
    |  fetch()
    v
 Route handler  src/app/api/**/route.js        (thin)
    1. requireRole(...)      -> 401 not signed in / 403 wrong role      (src/server/auth.js)
    2. parse + validate body -> 422 with per-field errors               (zod, orderService.parseBody)
    3. call a service
    v
 Service        src/server/{order,verification,sewing}Service.js
    - runs inside ONE database transaction
    - locks the order row (SELECT ... FOR UPDATE) so counts / approve / reject cannot interleave
    - uses the pure domain rules
    v
 Domain rules   src/server/domain/*.js          (pure functions, no I/O, unit-tested)
    traffic.js      evaluate() GREEN/YELLOW/RED, approvalBlockers(), canApprove()
    transitions.js  ALLOWED_TRANSITIONS (the state machine)
    orders.js       expectedComponents(), expectedFabric(), wastagePct()
    schemas.js      positiveInt / nonNegativeInt / positiveYards
    sewingQueue.js  QUEUE_STATUSES = VERIFIED, SEWING_STARTED
    v
 statusTransition.js   UPDATE cutting_orders SET status=... WHERE id=? AND status=<expected>  -> 409 if 0 rows
    v
 PostgreSQL     CHECK constraints, UNIQUE keys, FKs, append-only trigger on verification_logs
```

**Principle:** every rule is enforced in the layer that cannot be bypassed. The UI disables buttons as a convenience; the API rejects the request; the database refuses illegal data.

### Project structure

```
src/
  app/
    login/                 login page + demo panel
    (app)/                 authenticated shell (role-based navigation)
      orders/              supervisor: create + track orders
      verification/        verifier: Verification Terminal
      sewing/ , sewing/[id]/   sewing: queue + batch detail
    api/                   route handlers (auth, recipes, orders, verification, sewing, health)
  components/              UI (orders/, verification/, sewing/, shared badges)
  db/                      schema.js, index.js (client), seedData.js
  lib/                     shared limits, role config, client-side count validation
  server/                  auth, services, domain rules, http helpers
drizzle/                   SQL migrations (schema + append-only trigger)
scripts/seed.js            idempotent seed (3 users, 2 recipes)
tests/                     unit + API/database integration tests
```

---

## 4. Manufacturing state machine

```
 PENDING_VERIFICATION --approve (no RED, all counted)--> VERIFIED --start sewing--> SEWING_STARTED
        ^   |
        |   +--reject (mandatory reason)--> REJECTED
        +---------- supervisor resubmits (counts cleared) ----------+
```

| From | To | Triggered by | Rule |
|---|---|---|---|
| `PENDING_VERIFICATION` | `VERIFIED` | Verifier: approve | Every component counted, **none RED**, none missing. Writes the audit log |
| `PENDING_VERIFICATION` | `REJECTED` | Verifier: reject | Reason required (5 to 500 characters after trimming). Writes the audit log |
| `REJECTED` | `PENDING_VERIFICATION` | Supervisor: resubmit | Owner only. **All counts are cleared**, so stale counts can never carry an approval |
| `VERIFIED` | `SEWING_STARTED` | Sewing: start | Only from `VERIFIED` |

Everything else is illegal (for example `PENDING_VERIFICATION` straight to `SEWING_STARTED`, or any move out of `SEWING_STARTED`). The table lives in [`transitions.js`](src/server/domain/transitions.js), is frozen, and every change goes through one guarded `UPDATE ... WHERE status = <expected>` ([`statusTransition.js`](src/server/statusTransition.js)); if zero rows match the API returns **409**.

### Traffic lights

| Flag | Condition | Behaviour |
|---|---|---|
| GREEN | actual = expected | Match |
| YELLOW | actual > expected | Excess recorded; the batch may proceed |
| RED | actual < expected (a count of `0` is RED) | **Approve blocked** (UI disabled, API 422) |

Status is always **recomputed on the server** from the quantities; a status sent by a client is ignored. Fabric wastage is computed and stored on approval: `((actual yards - expected yards) / expected yards) x 100`, where `expected yards = target quantity x recipe standard yards`.

---

## 5. Access control

| Area | Supervisor | Verifier | Sewing |
|---|:--:|:--:|:--:|
| `/orders` page, `GET/POST /api/orders`, `GET /api/recipes`, resubmit | yes | 403 | 403 |
| `/verification` page, all `/api/verification/*` | 403 | yes | 403 |
| `/sewing` pages, all `/api/sewing/*` | 403 | 403 | yes |

Pages redirect other roles to their own home screen (a convenience). **The APIs are the real boundary** and return `403`.

| Status | Meaning in this API |
|---|---|
| `401` | Not signed in, or the session token is invalid / expired / forged |
| `403` | Signed in, but this role may not do this |
| `404` | Not found. For the sewing role an order that is not verified is **indistinguishable from a missing one** |
| `409` | The order is not in the state this action needs, or another request got there first |
| `422` | Validation failed (bad input, shortage / uncounted component, missing rejection reason). The body lists the problems per field |

---

## 6. API reference

All endpoints return JSON. Error bodies look like `{ "error": "...", "details": { ... } }`. Checks run in this order: **401, 403, then 404, 422, 409**.

| Method | Path | Role | Success | Errors |
|---|---|---|---|---|
| GET | `/api/health` | public | 200 | 503 |
| POST | `/api/auth/login` | public | 200 + session cookie | 401, 422 |
| POST | `/api/auth/logout` | public | 200 | |
| GET | `/api/auth/me` | any signed-in role | 200 | 401 |
| GET | `/api/recipes` | supervisor | 200 | 401, 403 |
| GET | `/api/orders` | supervisor (own orders) | 200 | 401, 403 |
| POST | `/api/orders` | supervisor | 201 | 401, 403, 404 unknown recipe, 422 |
| POST | `/api/orders/:id/resubmit` | supervisor (owner) | 200 | 401, 403, 404, 409 |
| GET | `/api/verification/orders` | verifier | 200 (pending only) | 401, 403 |
| PUT | `/api/verification/:id/counts` | verifier | 200 | 401, 403, 404, 409, 422 |
| POST | `/api/verification/:id/approve` | verifier | 200 | 401, 403, 404, 409, **422 hard stop** |
| POST | `/api/verification/:id/reject` | verifier | 200 | 401, 403, 404, 409, 422 |
| GET | `/api/sewing/queue` | sewing | 200 (verified / started only) | 401, 403 |
| GET | `/api/sewing/queue/:id` | sewing | 200 | 401, 403, 404 |
| POST | `/api/sewing/:id/start` | sewing | 200 | 401, 403, 404, 409 |

Request bodies:

```jsonc
POST /api/orders                       { "recipeId": 1, "targetQty": 50, "fabricRollId": "FAB-ROLL-882", "actualFabricYds": 94.5 }
PUT  /api/verification/:id/counts      { "counts": [ { "componentId": 5, "actualQty": 100 } ] }
POST /api/verification/:id/reject      { "note": "Collar pieces short by 6" }
POST /api/verification/:id/approve     (no body: the verifier identity comes from the session)
```

Input rules: piece quantities are **strictly whole numbers** (no negatives, decimals, numeric strings, `null` or empty values; counted pieces may be `0`). Fabric yards are positive with at most 2 decimals. Limits: quantity <= 100,000; yards <= 1,000,000; counted pieces <= 10,000,000; roll id <= 50 characters. Unknown body fields (`status`, `verifierId`, `createdBy`, timestamps ...) are ignored.

---

## 7. Database schema

PostgreSQL, created by the SQL in [`drizzle/`](drizzle/) (generated from [`src/db/schema.js`](src/db/schema.js)).

```
 users 1---* cutting_orders *---1 recipes 1---* recipe_components
   |               |  1                               ^
   |               +--* verification_items *-----------+
   +--------------------* verification_logs *---1 cutting_orders
        (verifier_id)
```

**`users`**: `id`, `email` (unique), `password_hash` (bcrypt), `role` (`cutting_supervisor | cutting_verifier | sewing_supervisor`), `full_name`, `created_at`.

**`recipes`**: `id`, `recipe_code` (unique), `name`, `category`, `std_fabric_yards numeric(6,2)`, `wastage_cap numeric(5,2)`.

**`recipe_components`**: `id`, `recipe_id` -> recipes (cascade), `component_name`, `pieces_per_garment` (CHECK > 0), `image_url` (nullable).

**`cutting_orders`**: `id`, `order_no` (unique, `CO-00001` style), `recipe_id` -> recipes, `target_qty` (CHECK > 0), `fabric_roll_id`, `actual_fabric_yds` (CHECK > 0), `expected_fabric_yds`, `status` (`PENDING_VERIFICATION | REJECTED | VERIFIED | SEWING_STARTED`), `rejection_count`, `created_by` -> users, `created_at`, `updated_at`. Indexes on `status` and `created_by`.

**`verification_items`**: `id`, `order_id` -> cutting_orders (cascade), `component_id` -> recipe_components, `expected_qty` (CHECK >= 0), `actual_qty` (**nullable = not counted yet**, CHECK >= 0 when set), `status` (`GREEN | YELLOW | RED`, null until counted). `UNIQUE (order_id, component_id)`.

**`verification_logs`** (the audit trail): `id`, `order_id` -> cutting_orders, `verifier_id` -> users, `decision` (`APPROVED | REJECTED`), `rejection_note`, `wastage_pct numeric(8,2)`, `variance_json` (per-component expected / counted / variance / status snapshot), `created_at` (database `now()`).
- **CHECK:** a `REJECTED` row must have a non-blank `rejection_note`, even if the application were bypassed.
- **Append-only trigger** (`verification_logs_no_update_delete`): any `UPDATE` or `DELETE` raises `verification_logs is append-only`. When an order is approved, the verifier id, timestamp, per-component variance and wastage % are therefore permanent and travel with the batch into the sewing queue.

**Seed data** ([`src/db/seedData.js`](src/db/seedData.js)): 3 users, plus the two recipes from the brief:

| Recipe | Code | Std fabric | Wastage cap | Components (pieces per garment) |
|---|---|---|---|---|
| Casual Blouse | `REC-BL01` | 1.8 yds | 5.0% | Front Body Panel 1, Back Body Panel 1, Sleeves (Left & Right) 2, Collar & Stand 1, Sleeve Cuffs 2 |
| Crop Top | `REC-CT02` | 1.1 yds | 8.0% | Front Chest Panel 1, Back Support Panel 1, Neck Binding Strip 1, Hem Elastic Casing 1, Side Strap Accents 2 |

---

## 8. Security design

- **Server-side RBAC.** Every handler calls `requireRole()` first. Hidden buttons and page redirects are conveniences only.
- **Authenticated context.** The verifier id comes only from the signed session cookie and timestamps from the database clock. Any `verifierId`, `status`, `decision` or time in a request body is ignored.
- **Hard stop.** `approvalBlockers()` recomputes every status from the stored counts and refuses approval if any component is RED, uncounted or missing, returning **422** with the exact components. The check, the audit-log insert and the status change happen in one transaction on a locked row.
- **No lost updates.** Counts, approve and reject lock the order row (`FOR UPDATE`); the status change is also a guarded `WHERE status = <expected>` update. Concurrent approvals produce exactly one success and one audit row.
- **Query isolation.** The sewing queries filter `status IN ('VERIFIED','SEWING_STARTED')` in SQL from a frozen constant. No function takes a status argument and the queue endpoint never reads the query string, so `?status=...` tricks change nothing.
- **No information leaks.** Hidden orders look exactly like missing ones (same 404 body); the sewing role never receives emails, user ids or password data.
- **Immutable audit trail** and **database CHECK constraints** (see the schema section) back up the application rules.
- **Sessions.** HS256 JWT in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production), 8-hour lifetime. Forged, unsigned (`alg: none`), tampered, expired or wrong-secret tokens are rejected with 401. Login does the same password-hash work for an unknown email as for a wrong password, and gives the same error for both. Signing or verifying a session throws if `JWT_SECRET` is missing or shorter than 32 characters.

---

## 9. Testing

```bash
npm test
```

**306 tests in 13 files, about 8 seconds, no database credentials needed.** The suite boots an in-process Postgres (PGlite), applies the project's real migrations (including the audit trigger), seeds the real recipes, and calls the actual route handlers with real signed session cookies. So RBAC, validation, SQL, constraints and the trigger are all exercised for real. It never touches the cloud database.

The five tests required by the brief:

| # | Requirement | Where |
|---|---|---|
| 1 | All-GREEN order can be approved by a verifier | `tests/api/verification.test.js`, "Test 1" |
| 2 | An order with a RED component blocks approval (422) | same file, "Test 2" (also 0-count, uncounted, partial, missing component, body override attempts) |
| 3 | Rejecting without a reason is rejected by the backend | same file, "Test 3" (9 bad payloads) |
| 4 | Non-verifier roles get 403 on approve | same file, "Test 4" (supervisor and sewing, plus counts / reject / queue, plus a forged role claim) |
| 5 | Unapproved orders never appear in the sewing queue | `tests/api/sewing.test.js`, "Test 5" (orders in every state, 11 query-string tricks, hidden-order 404s) |

Also covered: YELLOW still approvable; double approve 409; client-supplied `verifierId` / `status` / timestamps ignored; negative, zero, decimal, empty, text and `null` quantities rejected at the API and in unit tests; unauthenticated 401 everywhere; forged / expired / tampered tokens; order multipliers (50 blouses need 100 cuffs); owner-only resubmit; audit-log immutability and CHECK constraints; the traffic-light and state-machine logic; the verifier screen's client-side validation; and WCAG contrast of the stylesheet.

**Do the tests catch real bugs?** I broke the code on purpose and checked that named tests fail: 12 security/logic mutations (RED no longer blocks, role check removed, sewing filter widened, verifier id read from the body, status guard removed, ...) and 6 contrast mutations (white input text, dark-mode override, faded buttons, ...). All 18 were caught; each was reverted afterwards.

Other commands: `npm run lint`, `npm run build`. Limit: PGlite runs one transaction at a time, so the "concurrent approvals" tests check the locking logic rather than true parallelism. The true parallel race was verified separately against Supabase.

---

## 10. UI contrast and accessibility

The brief treats unreadable inputs as a zero-tolerance defect, so contrast was **measured**, not assumed. A browser audit (Microsoft Edge, scripted) read the real computed colours for every page and state:

- 12,229 text items and 895 form controls (typed text, placeholders, dropdown options, disabled and error states): **lowest ratio 4.83 : 1** (WCAG AA needs 4.5 : 1).
- Inputs, selects, textareas and options: `#111827` on `#ffffff`; placeholders `#6b7280`; `color-scheme: light` and **no dark-mode override**, so nothing can turn white-on-white.
- Visible 3px focus ring on every control; 96 keyboard Tab stops checked, no keyboard traps in dialogs, Esc / Cancel / Close return focus to the button that opened the dialog.
- Layout checked at 320, 360, 390, 768 and 1280 px: no horizontal scrolling, no clipping, tap targets at least 24 px.
- The audit found and fixed real defects (faded disabled buttons at 2.0 to 3.4 : 1, disabled placeholders at 3.9 : 1, a 20 px link, lost focus after closing a dialog); see the AI report.
- `tests/contrast.test.js` reads the actual colours from `src/app/globals.css` and fails `npm test` if they ever drop below AA.

Limits: tested in Edge only (not Safari or Firefox), and the OS-drawn dropdown popup cannot be pixel-measured, so option colours were checked through their styles.

---

## 11. Getting started

**Prerequisites:** Node.js 20 or newer (developed on Node 24) and a PostgreSQL database (a free Supabase or Neon project works).

```bash
git clone https://github.com/dewshan001/apparelflow-cutting-gatekeeper.git
cd apparelflow-cutting-gatekeeper
npm install

cp .env.example .env.local        # then fill in the two values below
npm run db:migrate                # creates the tables, constraints and the audit trigger
npm run db:seed                   # 3 demo users + 2 recipes (safe to re-run)

npm run dev                       # http://localhost:3000
npm test                          # unit + integration tests, no database needed
npm run build                     # production build
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signs session tokens. At least 32 characters. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

**Supabase tip:** the direct host (`db.<ref>.supabase.co`) is IPv6-only and fails on many networks. Use the **Session pooler** string (port 5432) for local `db:migrate` / `db:seed`.

### Deployment (Vercel)

1. Import the GitHub repository into Vercel (framework: Next.js, no build settings to change).
2. Add `DATABASE_URL` and `JWT_SECRET` under Environment Variables. For serverless use the Supabase **Transaction pooler** string (port **6543**); the database client already sets `prepare: false` for it.
3. Run the migrations and seed once (locally, against the same database).
4. Check `https://<your-app>.vercel.app/api/health` returns `{"status":"ok","database":"connected"}`.

---

## 12. Known limitations

Honest scope notes for a time-boxed challenge:

- No user management or password change screens; users come from the seed script.
- No recipe editing UI (recipes are seeded; the verifier role has no recipe permissions at all).
- No pagination or filtering on the order lists.
- No login rate limiting; no CSRF tokens (mitigated by `SameSite=Lax` cookies and JSON-only bodies).
- A session token cannot be revoked server-side before its 8-hour expiry (logout clears the cookie).
- Order numbers can have gaps (they come from a database sequence).
- Starting sewing records only the status change and its timestamp (`updated_at`), not who pressed the button.
- The concurrency tests run on a single-connection database (see Testing).
- The demo database is shared and its credentials are public by design.

---

## 13. How AI was used

See [AI_OPTIMIZATION_REPORT.md](AI_OPTIMIZATION_REPORT.md) for the tools used, the specific flawed AI output that was caught, the hardening work, and the defensive architecture.
