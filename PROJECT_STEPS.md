# ApparelFlow Cutting Gatekeeper — Step-by-Step Build Guide

**Stack:** Next.js (App Router, JavaScript) · Tailwind · Postgres (Neon or Supabase) · Drizzle ORM · jose (JWT cookie) · bcryptjs · zod · Vitest · Vercel

**Golden rule:** every business rule is enforced on the server. Disabled buttons and hidden tabs are only for usability, never security.

---

## Day 1 — Setup, Database, Deploy Skeleton

### Step 1: Create the project
1. Run `npx create-next-app@latest` with Tailwind, ESLint, App Router, `src/` dir and the `@/*` alias.
2. Install dependencies:
   `npm i drizzle-orm postgres zod jose bcryptjs`
   `npm i -D drizzle-kit vitest`
3. Commit: `chore: scaffold next app`.

### Step 2: Create the cloud database
1. Create a free Neon or Supabase Postgres project.
2. Copy the connection string.
3. Create `.env.local` (never commit it) and `.env.example`:
   ```
   DATABASE_URL=
   JWT_SECRET=
   ```

### Step 3: Define the schema (`src/db/schema.js`)
| Table | Columns |
|---|---|
| users | id, email (unique), password_hash, role, full_name, created_at |
| recipes | id, recipe_code (unique), name, category, std_fabric_yards, wastage_cap |
| recipe_components | id, recipe_id, component_name, pieces_per_garment, image_url |
| cutting_orders | id, order_no (unique), recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, expected_fabric_yds, status, rejection_count, created_by, created_at, updated_at |
| verification_items | id, order_id, component_id, expected_qty, actual_qty (nullable), status (GREEN/YELLOW/RED); unique(order_id, component_id) |
| verification_logs | id, order_id, verifier_id, decision (APPROVED/REJECTED), rejection_note, wastage_pct, variance_json, created_at |

Order statuses: `PENDING_VERIFICATION`, `REJECTED`, `VERIFIED`, `SEWING_STARTED`.

Add a DB trigger (or no update/delete code path) so `verification_logs` is append-only.

### Step 4: Migrate and seed
1. Configure `drizzle.config.js`; run `npx drizzle-kit generate` then `migrate`.
2. Write `scripts/seed.js` (idempotent, safe to re-run):
   - Users: `supervisor@demo.com` (cutting_supervisor), `verifier@demo.com` (cutting_verifier), `sewing@demo.com` (sewing_supervisor), with bcrypt-hashed passwords.
   - **REC-BL01 Casual Blouse** (Blouse, 1.8 yds, cap 5.0%): Front Body 1, Back Body 1, Sleeves 2, Collar & Stand 1, Cuffs 2.
   - **REC-CT02 Crop Top** (Crop Top, 1.1 yds, cap 8.0%): Front Chest 1, Back Support 1, Neck Binding 1, Hem Elastic Casing 1, Side Strap Accents 2.
3. Add `npm run db:seed`.

### Step 5: Deploy the skeleton
1. Add `GET /api/health` that runs `select 1`.
2. Push to a **public** GitHub repo.
3. Import into Vercel, set `DATABASE_URL` and `JWT_SECRET`, deploy.
4. Confirm `/api/health` works on the live URL.

---

## Day 2 — Auth, RBAC, Supervisor Flow

### Step 6: Auth library (`src/server/auth.js`)
- `login(email, password)`: verify with bcrypt, sign a JWT with `{ sub, role }`, set an **httpOnly, secure, sameSite** cookie.
- `getSession()`: read and verify the cookie.
- `requireRole(...roles)`: throws **401** if not logged in, **403** if the role is not allowed.
- Routes: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.

### Step 7: Login page and demo panel
- Login form plus a visible **Demo Credentials / Role Switcher** panel with one-click login for all 3 personas.
- App shell with role-based navigation (UI-only hiding; the server is the real guard).
  - Supervisor: Orders. Verifier: Verification Terminal. Sewing: Sewing Queue.
  - Verifier must not see "Create Order". Sewing must not see cutting orders.

### Step 8: Domain helpers (`src/server/domain/`)
- `expectedComponents(recipeComponents, targetQty)` → pieces_per_garment × qty (50 × 2 cuffs = 100).
- `expectedFabric(targetQty, stdYards)` → qty × std_fabric_yards.
- `wastagePct(actual, expected)` → `((actual − expected) / expected) × 100`.
- Shared zod schemas: positive integers only (reject negative, decimals, strings, empty).

### Step 9: Order APIs (supervisor only)
- `GET /api/recipes`.
- `POST /api/orders`: validate (recipeId, targetQty int > 0, fabricRollId non-empty, actualFabricYds > 0). In **one transaction**: create order, create one `verification_items` row per component with `expected_qty` and null `actual_qty`, set status `PENDING_VERIFICATION`.
- `GET /api/orders`: supervisor sees own orders including rejection notes.
- `POST /api/orders/:id/resubmit`: `REJECTED → PENDING_VERIFICATION` after re-cut.

### Step 10: Supervisor UI
- Order creation modal: recipe dropdown, target qty, fabric roll ID, fabric yards.
- Live preview table of expected component counts.
- Inline error messages under each field; block submit on invalid input.
- Orders list with status badges; rejected orders show the reason and a Resubmit action.

---

## Day 3 — Verifier Terminal and Server Hard Stop

### Step 11: Traffic-light and state machine
- `evaluate(expected, actual)`: equal → GREEN, greater → YELLOW, less → RED.
- `canApprove(items)`: false if any item is missing, uncounted (null) or RED.
- `ALLOWED_TRANSITIONS` table. Status changes use a guarded update:
  `UPDATE cutting_orders SET status=… WHERE id=? AND status=<expected current>`.
  Zero rows updated → **409**. This also prevents double approval races.
- Write unit tests for these as you go.

### Step 12: Verifier APIs (verifier only)
- `GET /api/verification/orders`: only `PENDING_VERIFICATION`.
- `PUT /api/verification/:id/counts`: save counts; the **server recomputes** each status (ignore any status sent by the client).
- `POST /api/verification/:id/approve`:
  1. `requireRole('cutting_verifier')` → else **403**.
  2. Load items; if any RED, missing or uncounted → **422**.
  3. In one transaction: set `VERIFIED`, insert a `verification_logs` row with `verifier_id` **from the session**, server timestamp, variances and wastage %.
- `POST /api/verification/:id/reject`: mandatory trimmed note (min length) else **422**; log it, set `REJECTED`.
- Never accept verifier ID, timestamp or status from the request body.

### Step 13: Verifier UI
- Count input per component with a live GREEN/YELLOW/RED badge.
- **Approve Batch** disabled while any component is RED or uncounted.
- **Reject Batch** opens a required reason textarea with inline validation.
- Show server errors clearly (the server still blocks even if the button is bypassed).

---

## Day 4 — Sewing Queue, Tests, Docs

### Step 14: Sewing queue
- `GET /api/sewing/queue`: sewing_supervisor only; SQL hard-coded `WHERE status IN ('VERIFIED','SEWING_STARTED')`. Ignore any `status` query param.
- `GET /api/sewing/queue/:id`: same filter; returns piece counts, verifier name, timestamp, wastage %, audit notes.
- `POST /api/sewing/:id/start`: sewing only; `VERIFIED → SEWING_STARTED`.
- UI: list plus detail view with a "Start Sewing Assembly" button.

### Step 15: Automated tests (`npm test`)
Use Vitest against a test Postgres schema (or PGlite). Required:
1. All-GREEN order can be approved by a verifier.
2. Order with ≥1 RED component → approval blocked, error returned (422).
3. Reject without a reason note → backend validation error.
4. Supervisor and sewing roles get **403** on approve.
5. Unapproved orders never appear in the sewing queue query.

Extra edge cases: YELLOW still approvable; double approve → 409; client-supplied `verifier_id` ignored; negative, decimal, empty and non-numeric quantities rejected; unauthenticated → 401.

### Step 16: Contrast and responsive audit
- Global CSS: inputs, selects, textareas and `option` use dark text (`#111827`) on white, placeholder `#6b7280`, `color-scheme: light`, visible focus ring.
- Click every input and dropdown in every state; check WCAG AA (≥ 4.5:1).
- Check mobile width and keyboard navigation.

### Step 17: Documentation
- **README.md**: architecture summary, schema docs, demo credentials for all 3 roles, run and test commands, live URL.
- **AI_OPTIMIZATION_REPORT.md** with four sections:
  1. Tools & Prompting
  2. Flawed / Broken AI Code (≥ 2 real examples, e.g. client-only RBAC, trusting client-sent status/verifier ID, white-on-white inputs, `Number("")` becoming 0, decimal coercion)
  3. Human Refactoring
  4. Defensive Architecture (state machine, guarded updates, role checks, query isolation)
  Be honest; document only what actually happened.

### Step 18: Final checks and submission
- Production deploy; run the evaluator checklist on the live URL:
  - Contrast on every input and dropdown.
  - Verifier has no order-creation button; sewing sees no unverified orders.
  - Enter a shortage: Approve disabled and the API returns 422.
  - Approve a GREEN batch: it appears in the Sewing Queue and survives a refresh.
- cURL checks: supervisor approve → 403; shortage approve → 422; reject without note → 422; unauthenticated → 401; `GET /api/sewing/queue?status=PENDING_VERIFICATION` returns only verified orders.
- Keep commits atomic and descriptive (`feat:`, `test:`, `docs:`, `fix:`).
- Submit: live URL, public GitHub repo, `AI_OPTIMIZATION_REPORT.md`, README, passing `npm test`.

---

## Quick Checklist
- [ ] Repo public, atomic commits
- [ ] Cloud DB + seed data (2 recipes, 3 users)
- [ ] Login + role switcher panel
- [ ] Order creation with multiplier preview
- [ ] Verifier terminal with traffic lights
- [ ] Server 403 / 422 / 409 enforcement
- [ ] Immutable audit log (verifier ID, timestamp, variances, wastage %)
- [ ] Sewing queue filtered by status at SQL level
- [ ] Input validation with inline errors
- [ ] High-contrast inputs and dropdowns
- [ ] 5 required tests passing
- [ ] README.md and AI_OPTIMIZATION_REPORT.md
- [ ] Live Vercel URL verified
