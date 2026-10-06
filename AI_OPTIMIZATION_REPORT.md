# AI Optimization Report

**Project:** ApparelFlow Cutting Gatekeeper (Webtezza engineering challenge)

## Read this first: how much of this was AI

Most of the code in this repository was **written by an AI assistant (Claude Code, model Claude Sonnet 5.5) under my direction**. I chose the stack, broke the work into the brief's steps, approved each plan before any code was written, tested the app in the browser, made the design calls, and committed the work myself. Claude wrote the code, the tests and the documentation, and ran the verification scripts.

I am not presenting this as hand-written code. The point of this report is to show what the AI got wrong, how that was caught, and how the design stops those mistakes from reaching users. Every item below happened in this project. Each one says **who found it**: *me* (browser testing or a design decision), or *Claude* (its own review, the test suite, mutation testing, or the measured browser audit).

---

## 1. Tools & Prompting

### Tools
| Tool | Used for |
|---|---|
| **Claude Code** (VS Code extension, Claude Sonnet 5.5) | Everything: scaffolding, schema, auth, APIs, UI, tests, accessibility audit, documentation |
| Tools Claude ran during the session | `drizzle-kit` (migrations), **Vitest** + **PGlite** (test suite), `curl` and small throwaway Node scripts against the live Supabase database (end-to-end checks, always cleaned up afterwards), **Playwright-core driving Microsoft Edge** (the Step 16 contrast / keyboard / responsive audit; installed outside the repo) |

### How I worked with it
1. I gave Claude the brief and asked for a **step-by-step plan**. I picked the stack from the options it offered (Next.js + Supabase Postgres + Vercel), and later asked for plain **JavaScript** instead of TypeScript.
2. Each step was a separate request: I pasted the step text and asked for it to be implemented. Claude had to **write a plan and get my approval first** (plan mode), then implement it.
3. After each step Claude verified its own work, then reported the results, including what it could *not* verify. I then checked the UI myself and asked "how do I check this in the UI?" whenever a step had no visible screen.
4. I set a standing rule mid-project: **"don't add unnecessary things again without asking me."** After that Claude listed any extras in the plan (for example the "Save counts" button and the result banner) so I could veto them.

### Task-by-task
| Task | AI role | My role |
|---|---|---|
| Scaffold, schema, migrations, seed | Wrote them | Chose the stack; created the Supabase project and supplied the connection string |
| Auth + RBAC, order/verifier/sewing APIs | Wrote them | Approved each plan |
| UI (login, orders, verifier terminal, sewing) | Wrote it | Tested in the browser; found two bugs (section 2); removed an extra feature |
| Test suite | Wrote it; ran mutation checks | Asked for the five required tests to be covered |
| Contrast / responsive audit | Built and ran the measured audit; fixed what it found | Asked for the audit |
| README and this report | Wrote them from the real history | Reviewed and owns them |

### Where I did *not* accept the AI's output
- Claude's first commits (docs and scaffold): I had them removed and made my own commits, so the history is mine.
- A header "Switch persona" dropdown it added beyond the brief: removed (section 3).
- Two auto-generated assistant config files (`AGENTS.md`, `CLAUDE.md`, created by `next dev`): I chose to git-ignore them rather than commit them.

---

## 2. Flawed / Broken AI Code

Each item: what Claude wrote, why it was wrong, who found it, the fix, and what now prevents a repeat.

### 2.1 The "Create Order" dialog closed the moment it opened  *(found by me)*
- **What:** `CreateOrderModal` opened a native `<dialog>` in an effect and closed it in the effect's cleanup. In development React runs effects twice (StrictMode): the cleanup closed the dialog, the dialog's `close` event told the page to unmount the modal, so it flashed open and vanished.
- **Found:** I clicked *Create Order* and reported "nothing happens". Claude had said it could not drive a browser to confirm the interaction.
- **In plain words:** in development mode React deliberately runs each effect twice to expose bugs. The AI's code said "when this component goes away, close the dialog". That cleanup also ran during React's extra test run, so the dialog was opened and then immediately closed, and closing it told the page to remove it.
- **Before (AI code) and after:**
  ```js
  // before: the cleanup closes the dialog, which fires "close" and unmounts the modal
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();   // <- the bug
    };
  }, []);

  // after: no cleanup (removing the element from the page already closes it)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  ```
- **Fix:** removed the cleanup `close()`; the same pattern was deliberately avoided in the later `RejectDialog`. After the fix, an order created from the dialog (fabric roll `FAB-ROLL-11`) appeared in the database.
- **Guard:** the Step 16 browser audit opens and closes both dialogs by Esc, Cancel and Close.

### 2.2 The persona switcher got stuck, and was a design flaw  *(found by me)*
- **What:** Claude added a "Switch persona" dropdown in the app header (not required by the brief; the brief only asks for a demo panel). After one successful switch the dropdown stayed disabled forever: `busy` was set to true and never reset, and the header persists across page navigation.
- **Found:** I switched once and couldn't switch again, then asked whether it was in the document and whether a logged-in supervisor should be able to do that at all.
- **In plain words:** the button turned itself off while the login request was running, and only turned itself back on if the request *failed*. When it succeeded, the page changed but the header (which stays on screen) kept the "off" state, so the dropdown stayed locked.
- **Before (AI code):**
  ```js
  setBusy(true);
  const result = await loginRequest(account.email, account.password);
  if (!result.ok) {
    setError(result.error);
    setBusy(false);        // only reset when the request fails
    return;
  }
  router.replace(homeFor(result.user.role));
  router.refresh();         // success path never calls setBusy(false)
  ```
  The immediate fix was to reset `busy` on both paths; the later decision was to delete the dropdown entirely.
- **Resolution:** Claude fixed the bug, then agreed the feature undermines **separation of duties** (a supervisor could click into the verifier role). **I had it removed.** The login-page demo panel already satisfies the brief. It also cost me nothing server-side, because the server never trusted that dropdown, but it was the wrong thing to show an evaluator.

### 2.3 A regex lost its backslash to shell escaping  *(found by Claude on re-read)*
- **What:** `parseId` was written through a shell heredoc and the backslash in `\d` was dropped: `/^[1-9]d{0,9}$/`. It would have rejected every real order id (404 for everything) and accepted strings like `"1ddd"`.
- **Found:** Claude re-read the file immediately after writing it, before anything called it.
- **Fix:** corrected; the id parsing now has a single implementation (`idOrNull` / `parseId`) used by pages and APIs.
- **Guard:** API tests send `abc`, `0`, `-1`, `1.5`, `99999999999` and `1 OR 1=1` as ids and expect 404.

### 2.4 An empty batch would have enabled "Approve"  *(found by a unit test Claude wrote)*
- **What:** the verifier screen's `summarizeCounts` derived "can approve" from "no blockers". With zero components there are no blockers, so Approve would be enabled.
- **Why it mattered:** the server already refused it, but the button must never disagree with the server.
- **Fix:** `canApprove` now also requires at least one component, the same rule as the server's `canApprove`. **Guard:** a unit test for an empty batch.

### 2.5 Unbounded numbers would have crashed the database  *(found by Claude while writing the form)*
- **What:** the order API accepted any positive integer. `99999999999` overflows a Postgres `integer`, so the request would return **500** instead of a clean validation error.
- **Fix:** shared limits in `src/lib/limits.js` used by both the form and the API (quantity <= 100,000, yards <= 1,000,000, counted pieces <= 10,000,000, roll id <= 50, valid recipe id range).
- **Guard:** API tests send out-of-range values and expect 422.

### 2.6 The contrast problem the brief warns about, in a place Claude had not checked  *(found by the measured browser audit)*
- **What:** Claude's global CSS made *inputs* dark-on-white from the start and removed the template's dark-mode override, so the classic white-on-white input defect was avoided. But it had styled **disabled and busy buttons** with `disabled:opacity-60`, which fades white-on-blue and white-on-grey text. Measured in Edge: "Signing in..." 2.0 : 1, "Creating..." 2.2 : 1, "Resubmitting..." 3.4 : 1, "Rejecting..." 2.3 : 1 (WCAG AA needs 4.5 : 1). Disabled-input placeholders measured 3.9 : 1, and a link was only 20 px tall (minimum 24 px).
- **Why it was missed:** until Step 16 no browser was available, so earlier steps were verified through server-rendered HTML and request-level tests only. Claude's earlier statements about contrast covered the *inputs*; the buttons' disabled state was simply never measured.
- **Fix:** one global disabled-button rule (dark text on light grey, no opacity), a darker disabled placeholder, a taller link; the faded styles were removed from 7 components. After the fix the **lowest measured ratio across 12,229 text items and 895 form controls is 4.83 : 1**.
- **Guard:** `tests/contrast.test.js` reads the real colours from `globals.css` and fails if they drop below AA, or if a faded-text class or dark-mode override returns. I reintroduced 6 defects to prove it catches them.

### 2.7 Keyboard focus was lost after closing a dialog with Cancel  *(found by the browser audit)*
- **What:** Esc returned focus to the button that opened the dialog (native behaviour), but Cancel / Close unmounted the dialog without closing it, so focus dropped to the page body and a keyboard user lost their place.
- **Fix:** `OrdersView` and `BatchPanel` now return focus to the opening button whenever the dialog closes. **Guard:** the audit checks Esc, Cancel and Close for both dialogs.

### 2.8 A test gap around the "last line of defence" against double approval  *(found by Claude's own review)*
- **What:** the status-change `UPDATE ... WHERE status = <expected>` is the final guard against a double approval. The unit test written with it (Step 11) used a **fake database that never looks at the WHERE clause**, so deleting the guard would not have failed any test. Claude noticed this at the time and proved the guard separately with a throwaway script against the real database: with the guard, 8 simultaneous calls gave exactly one winner; with the guard removed, all 8 "won".
- **Second look (Step 15):** in the API tests the row lock plus an earlier status check make the guard redundant, so API-level tests alone would not catch its removal either. Claude added `tests/api/transition.test.js`, which calls `transitionStatus` directly on a real database and proves it returns 409 for the wrong state.
- **Result:** the later mutation run confirmed it: removing the guard now fails two named tests (12 of 12 security mutations caught).

### 2.9 A database-driver assumption would have broken portability and tests  *(found when the tests ran)*
- **What:** order-number generation read `tx.execute(...)` as an array of rows. That is the postgres-js shape; the test database (PGlite) returns `{ rows }`.
- **Fix:** a tiny `rowsOf()` accepts both, with a comment explaining why.

### 2.10 The scaffold carried two risks  *(found by Claude during setup)*
- `create-next-app` loaded fonts from Google at build time, which failed the build offline, and its stylesheet had a **dark-mode override** that is exactly how white-on-white inputs appear. Both were removed while scaffolding, before any form existed.

### 2.11 Files I didn't ask for appeared in the repository  *(found by me)*
- **What:** after Claude ran the dev server, `git status` showed two new files, `AGENTS.md` and `CLAUDE.md`. I asked why Claude had created them.
- **Cause:** they were not written by Claude as part of the task: `next dev` regenerates them automatically (they hold assistant instructions for this Next.js version). It is an AI-tooling side effect rather than a logic bug, but it would have put assistant configuration into my submission.
- **Fix:** I had both added to `.gitignore` and deleted. They are re-created locally by `next dev` but git ignores them.

### Patterns I specifically watched for (and the evidence they did not reach production)
The brief lists typical AI flaws. How each was handled, with the proof:

| Typical AI flaw | What happened here |
|---|---|
| Client-side-only RBAC | Never relied on. Every handler calls `requireRole()` first; tests assert 401/403 on every endpoint for every wrong role, including a forged role claim |
| Trusting client-sent status or verifier id | Claude was told to ignore them from the start; tests send `verifierId`, `status`, `decision`, timestamps and `wastagePct` in bodies and check the audit log still has the session user and server values. Mutation test: reading the verifier id from the body is caught |
| `Number("")` becoming 0 / decimal coercion | `z.coerce` is banned in the codebase; number fields are text inputs with strict parsers; schemas accept only real numbers. Tests cover `""`, `"50"`, `null`, `2.5`, `-5`, `0`, `NaN`, huge values at every layer |
| Re-render loops / state sync bugs | The only state bugs found were 2.1 and 2.2 (both found by me in the browser) |
| Poor contrast defaults | See 2.6 |

---

## 3. Human Refactoring

I want to be exact about this section: the refactors below were **performed by Claude at my direction**. What I contributed was the decisions, the testing that found bugs, and the standing rules that shaped the code.

### Decisions that were mine
| Decision | Effect |
|---|---|
| Stack: Next.js + Supabase Postgres + Vercel; **JavaScript, not TypeScript** | Claude converted the TypeScript scaffold it had already made |
| **Plan-and-approve before every step** | No code was written without a reviewed plan |
| Delete Claude's early commits and commit myself | The git history is mine |
| Remove the header persona switcher | Section 2.2 |
| "Don't add unnecessary things without asking" | Extras are flagged in plans for approval |
| Git-ignore the generated `AGENTS.md` / `CLAUDE.md` | Repo stays free of assistant config |
| Test each step in the UI and report what I see | Found 2.1 and 2.2 |

### Hardening and optimisation refactors (executed by Claude, each with a reason and a test)
| Refactor | Why | Proof |
|---|---|---|
| One `QUEUE_STATUSES` constant is the only sewing status filter; no function takes a status argument | A request parameter must never be able to widen the sewing query | `tests/sewingQueue.test.js`, 11 query-string attack tests, mutation (widened filter) caught |
| `transitionStatus`: a single guarded `UPDATE ... WHERE id=? AND status=<expected>` for every status change | Atomic check-and-set; 409 on a lost race | `tests/api/transition.test.js` |
| `approvalBlockers()` became the **single source of truth**; `canApprove` is built on it; the verifier screen reuses the same code | The 422 can name exact components, and the button can never disagree with the server | `tests/traffic.test.js`, `tests/verifierCounts.test.js` |
| Row locking (`FOR UPDATE`) in counts / approve / reject | An approval can never validate counts that change underneath it | Concurrent-approval tests: one 200, one audit row |
| Resubmit clears all counts | Stale counts from a rejected batch can never carry an approval | API test: approve after resubmit returns 422 "uncounted" |
| Shared `limits.js` for form and API | One definition of valid input; no 500s from overflows | Section 2.5 |
| 422 errors keyed by field path (`counts.0.actualQty`) | The UI can show the exact failing field | `tests/schemas.test.js` |
| Demo users and recipes moved to `src/db/seedData.js`, shared by the seed script and the tests | The tests use the exact production recipes | Test suite runs on them |
| `idOrNull` / `parseId` shared by pages and APIs | One id-parsing implementation (see 2.3) | Id tests |
| Global disabled-button style, focus return, darker disabled placeholder | Section 2.6 and 2.7 | Audit + contrast test |
| Hidden orders return the same 404 as missing ones for the sewing role | No information leak about which orders exist | Test compares the 404 bodies |
| Test suite moved to an in-process Postgres with the real migrations | `npm test` works for any evaluator with no credentials, yet still exercises the real SQL, constraints and trigger | 306 tests, ~8 s |

---

## 4. Defensive Architecture

### State machine
```
 PENDING_VERIFICATION --approve--> VERIFIED --start sewing--> SEWING_STARTED
   ^        |
   |        +--reject (reason required)--> REJECTED
   +------------ resubmit (counts cleared) ------------+
```
Only these four moves are legal (`ALLOWED_TRANSITIONS`, frozen, in `src/server/domain/transitions.js`). Every status change goes through `transitionStatus()`, which refuses an illegal move before touching the database and otherwise runs one guarded `UPDATE ... WHERE id = ? AND status = <expected>`; zero rows updated means **409**. A client can never name the target status: each endpoint hard-codes its own transition, and status in a request body is ignored.

### Defence in depth: each rule is enforced where it cannot be bypassed
| Rule | UI (convenience) | API / service | Database |
|---|---|---|---|
| Only a verifier can approve | Approve button only on the verifier screen | `requireRole(cutting_verifier)` runs first: 401 / 403 | n/a |
| No approval with a RED, uncounted or missing component | Approve disabled, reason shown | `approvalBlockers()` recomputes status from counts: **422**; ignores any client status | `actual_qty` is NULL until counted, so "uncounted" cannot be faked as zero |
| Verifier identity and timestamp | n/a | Verifier id from the signed session only; body ignored | `created_at` defaults to `now()` |
| Rejection needs a reason | Required textarea | zod: trimmed, 5 to 500 characters: 422 | CHECK: a `REJECTED` log needs a non-blank note |
| Audit record is permanent | n/a | No code path updates or deletes logs | **Trigger** blocks `UPDATE` / `DELETE` on `verification_logs` |
| Sewing sees only verified batches | Sewing screen lists the queue | SQL filter from a frozen constant; query string never read; hidden orders give the same 404 as missing ones | Indexed `status` column |
| Quantities are valid | Inline errors | Strict zod schemas with upper bounds | CHECK constraints (`> 0`, `>= 0`), integer columns |
| No double approval / lost update | Buttons disable while busy | Row lock (`FOR UPDATE`) plus the guarded status update: **409** | Transactions: log and status change commit together |
| Stale counts can't carry an approval | n/a | Resubmit clears counts in the same transaction | n/a |

### Order of checks (so errors never reveal more than they should)
`401` (no valid session) -> `403` (wrong role) -> `404` (no such order) -> `422` (bad input / blocked by the rules) -> `409` (wrong state or lost race). A wrong-role caller never learns whether an order exists.

### Session and tamper protection
Identity lives in a signed HS256 JWT in an `httpOnly`, `SameSite=Lax` (`Secure` in production) cookie. Forged, unsigned (`alg: none`), tampered, expired and wrong-secret tokens all return 401; a token whose role claim doesn't match is 403. Passwords are bcrypt-hashed, and an unknown email costs the same hashing work as a wrong password.

### How I know it works (not just that it looks right)
| Evidence | Result |
|---|---|
| Automated tests | **306 passing in 13 files**, no credentials needed; includes the five required tests |
| Security / logic mutation checks | **12 of 12** deliberate bugs caught by named tests (RED no longer blocks, role check removed, sewing filter widened, verifier id from body, status guard removed, note length removed, negatives accepted, supervisor sees all orders, resubmit keeps counts, client status trusted, uncounted ignored, sewing start open to other roles) |
| Contrast mutation checks | **6 of 6** (white input text, dark-mode override, faded placeholder, faded disabled button, `disabled:opacity` class, removed focus ring) |
| Real-database checks (throwaway scripts against Supabase, cleaned up) | Concurrent approvals and sewing starts: exactly one success, one audit row; the append-only trigger blocked `UPDATE` / `DELETE`; negative quantities and note-less rejections blocked by CHECK constraints |
| Measured browser audit (Edge) | 12,229 text items + 895 form controls, lowest 4.83 : 1; 96 keyboard stops with a visible focus ring; no horizontal scroll or clipping at 320 / 360 / 390 / 768 / 1280 px; 0 findings after the fixes in 2.6 and 2.7 |
| Live deployment | `/api/health` reports the database connected; protected endpoints return 401 without a session |

### Honest limits
- The audit ran in **Edge only**; the OS-drawn dropdown popup can't be pixel-measured, so option colours were verified through computed styles.
- The concurrency tests in the committed suite run on a single-connection database, so they prove the locking logic, not true parallelism. True parallel races were verified separately against the cloud database, with throwaway scripts that are not in the repo.
- Early steps (before Step 16) had no browser verification; the issues that gap hid are listed in 2.6 and 2.7.
- Sewing "start" records the status change and `updated_at` but not which sewing supervisor pressed it (the brief did not ask for it).
