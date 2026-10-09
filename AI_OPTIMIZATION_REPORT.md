# AI Optimization Report

This report documents how AI was used to build ApparelFlow ERP, the genuine defects the AI produced and how
they were found, the refactoring performed, and the defensive architecture that limits the impact of any
remaining AI error. Everything below describes events that actually happened in this repository's history;
nothing is illustrative.

---

## 1. Tools & Prompting

**Tool:** Claude Code (Anthropic, model Claude Opus 5.5) running as a coding agent inside VS Code on Windows,
with shell access, the local filesystem and a headless Chromium (Playwright) for visual checks.

**Prompting approach**

- A single detailed *master prompt* defined the role, the stack, the 12 vertical slices with acceptance
  criteria, the 15 mandatory tests, the security rules and an execution protocol (inspect → plan → implement
  one slice → test → fix → commit → report honestly).
- The agent was instructed to work in **vertical slices** and to commit each slice atomically; the git
  history mirrors that order.
- Before writing Next.js code the agent read the documentation bundled with the installed framework
  (`node_modules/next/dist/docs`), because Next.js 16 changed APIs (`proxy.ts` replaces middleware,
  Cache Components require `<Suspense>` around session reads, `params` are Promises). This avoided writing
  Next 14/15-era code from training memory.
- Verification was built into the loop rather than requested afterwards: every slice ended with typecheck,
  lint, unit/integration tests against real PostgreSQL, and — for UI slices — scripted Playwright
  screenshots at 1366 px and 390 px with an automated horizontal-overflow check.
- **Mutation checks** were used to test the tests: the agent temporarily deleted a defence (row lock, shortage
  check, SQL status filter) and confirmed a test failed, then restored it.

## 2. Flawed / Broken AI Code

Each item below is a real defect produced by the AI during development, with how it was detected.

| # | Defect (AI-written) | Impact | How it was caught | Fix |
|---|---|---|---|---|
| 1 | `DEMO_PASSWORD=ApparelFlow#Demo2026` in `.env.example`. dotenv treats `#` as a comment start, so the seeded password was silently `ApparelFlow`. | Every demo login returned 401; the demo panel displayed a password that did not work. | Manual `curl` login against the dev server. | Password without `#`; warning comment in `.env.example`. |
| 2 | Session expiry compared with `new Date()` inside code reached during rendering. | Next.js 16 Cache Components raised "unstable value `new Date()` while prerendering" on every page. | Browser console errors captured by the screenshot script. | Expiry compared with the database clock (`now()`) — also a single authoritative clock. |
| 3 | Two-column CSS grid without `grid-cols-1` on mobile: grid items' min-content width let a table push the page wider than the viewport. | Horizontal scroll on phones (recipe detail page). | Automated `scrollWidth > innerWidth` check at 390 px. | Explicit `grid-cols-1` (`minmax(0,1fr)`). |
| 4 | Create-order form kept field errors after the user corrected the field, and showed the *last* Zod issue per field (e.g. a regex message for an empty field instead of "required"). | Misleading validation feedback. | Visual review of a screenshot after an invalid-then-valid submission. | Clear a field's error on edit; `firstIssuePerField`. |
| 5 | Verification autosave `useEffect` depended on a freshly built array, so setting "Saving…" re-rendered, re-ran the effect and its cleanup **aborted the in-flight save**. | Counts could silently fail to persist. | Self-review before the code was first run. | Effect keyed on a stable serialised payload. |
| 6 | **Wastage rounding double-rounded**: `raw = (a−e)·100/e` then `round(raw·100)`. Exact halves such as −4.975 % became −4.97 %. | 902 of 14.2 million plausible inputs mis-rounded; reports disagreed with PostgreSQL's `round()`. | An audit integration test where JS and PostgreSQL averages disagreed (2.22 vs 2.23), then a brute-force comparison against exact `BigInt` arithmetic. | One integer division `(a−e)·10000/e` (correctly rounded by IEEE 754); 0 mismatches over 14.2 M inputs; regression + property tests added. |
| 7 | Order timeline ordered by `occurred_at, id`. Events written in one transaction share `now()`, and `id` is a random UUID. | Non-deterministic timeline (e.g. "Approved" before "Counts recorded"). | Integration test of the full timeline. | `audit_events.seq` identity column (migration 0002), ordered by `seq`. |
| 8 | The API wrapper caught **all** errors, including Next.js's internal "bail out of prerendering" signal raised when a GET handler reads `request.cookies` during `next build`. | Spurious 500 responses/logs for every GET API during the production build; risk of a prerendered error response. | Server logs of the first E2E run against `next build && next start`. | `unstable_rethrow(err)` before error mapping. |
| 9 | Sewing-queue test did not actually prove the `WHERE status = 'VERIFIED'` filter: the inner join on the APPROVED log filtered the same rows, so deleting the filter still passed. | A regression in the explicit filter would have gone unnoticed. | Mutation check (deleted the filter; test stayed green). | New test with a forged orphan APPROVED log on a pending order; fails without the filter. |
| 10 | E2E login helper waited for the role name to appear — but the login page already lists all role names, so it returned before the login completed. Then a selector matched both the header caption and the persona `<option>`. | 4 flaky/failing E2E tests (test bug, not app bug). | First E2E run. | Wait for navigation away from `/login`, then match the header caption exactly. |
| 11 | Shell-generated edits: a bash heredoc lost a regex backslash, and a JS `String.replace` replacement containing `` $` `` corrupted a file. | Broken files (caught immediately by the TypeScript compiler). | `tsc` / tsx transform errors. | Switched to direct file writes for code containing escapes/template literals. |

## 3. Human Refactoring

> **To be completed by the candidate.** This section must describe the refactoring *you* performed or
> reviewed by hand. Do not copy the AI's own fixes from section 2 into this section as human work.

Suggested structure:

- What you reviewed line by line (e.g. `src/features/verification/server/decide.ts`,
  `drizzle/0001_audit_immutability.sql`, `src/lib/auth/*`).
- What you changed and why (naming, decomposition, removing duplication, tightening types, etc.).
- What you deliberately kept from the AI and why.

For reference, refactoring done **by the AI agent** during the build (not human work):

- Extracted `lockOrder` / `assertPendingVerification` / `applyCounts` so counting, approval and rejection
  share one locking and validation path (`src/features/verification/server/order-lock.ts`).
- Moved `runMigrations` into a library module shared by the CLI, Vitest and Playwright set-up instead of a
  fragile "is this the main module" check.
- Introduced `firstIssuePerField`, a shared `Dialog`, `ComponentCountsTable`, `WastageValue` and status
  badges to remove per-page duplication.
- Reflowed the verification terminal table into per-row cards on small screens instead of duplicating markup.

## 4. Defensive Architecture

The design assumes any single layer — including AI-generated application code — can be wrong, and keeps
the business invariant intact anyway.

1. **Database as the final authority.** A trigger-implemented state machine refuses `→ VERIFIED` without an
   `APPROVED` log for the attempt and a complete, shortage-free count; `UNIQUE(order_id, attempt_no)` allows
   one decision per attempt; CHECK constraints tie each item's traffic-light status to its numbers and
   require a rejection note; decision logs and audit events are append-only; counts of a decided attempt
   are immutable; sewing operations can reference only VERIFIED orders. Verified by mutation: with the
   application's shortage check deleted, approval still returned 422.
2. **Single transactional use cases with row locks.** Approval, rejection, counting and re-cut each run in
   one transaction holding `SELECT … FOR UPDATE` on the order; failures roll back everything, including
   counts sent with a failed approval (tested).
3. **Server-derived facts only.** Expected quantities, traffic-light status, wastage, verifier identity,
   timestamps and order numbers are computed on the server; Zod schemas strip any client-supplied
   equivalents (tested with forged bodies).
4. **One permission matrix, enforced twice.** Route handlers and pages call the same guards; use cases
   re-check the role; the UI's hidden buttons are explicitly not a control.
5. **Pure, separately tested domain rules.** Multiplier, traffic light and wastage live in `src/domain` with
   unit and exact-arithmetic property tests, so UI previews and server decisions use identical logic.
6. **Tests that test the tests.** HTTP-level integration tests run on real PostgreSQL (no mocks); critical
   defences were mutation-checked; an API-surface test pins every route's HTTP methods so a new write
   endpoint (e.g. for audit data) cannot appear unnoticed; E2E runs against a production build with axe
   accessibility scans.
7. **Fail closed, leak nothing.** Unknown errors become generic 500s with a request id; integrity violations
   become 409/422; the sewing role gets 404 (not 403) for non-verified orders; non-UUID ids never reach SQL.
