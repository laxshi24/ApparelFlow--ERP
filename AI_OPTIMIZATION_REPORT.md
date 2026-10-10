# AI Optimization Report — ApparelFlow ERP

## 1. Tools and Prompting Approach

I used Claude Code (Anthropic, Claude Opus 5.5) in VS Code on Windows to assist with developing ApparelFlow ERP. The coding agent had access to the project files, terminal, and a headless Chromium browser for automated UI testing.

I started with a detailed master prompt that defined the technology stack, the 12 development slices, the business requirements, security rules, and testing expectations. I asked the agent to work on one vertical slice at a time, implement the functionality, run the relevant checks, fix any failures, and I commit the completed work.

This approach helped keep the development process organized and made it easier to trace changes through the Git history.

After reviewing the initial implementation, I requested a more conventional `frontend/` and `backend/` structure. I also requested the removal of the demo-credential panel, separate credentials for individual users, and a fix for the login and logout behaviour that required a page refresh. The agent moved the relevant files using `git mv`, updated imports, and reran the test suites against the revised structure.

Because the project uses Next.js 16, I also ensured that the agent consulted the documentation installed with the framework instead of relying entirely on older examples. This was particularly important for routing, session handling, and the framework's rendering behaviour.

Testing was included throughout development rather than postponed until the end. The verification process included TypeScript checks, linting, unit and integration tests against PostgreSQL, and Playwright-based UI checks at desktop and mobile viewport sizes. An automated check was also used to detect horizontal overflow on small screens.

## 2. AI-Generated Defects and How They Were Fixed

AI-generated code required review and correction during development. The following examples describe defects identified in the implementation, their effects, and the corresponding fixes.

| No. | Defect identified | Impact | How it was detected | Fix applied |
|---|---|---|---|---|
| 1 | A demo password containing `#` was added to `.env.example`. | The password was parsed incorrectly, causing demo login attempts to return 401. | A manual login request using `curl`. | Changed the example password and added a warning about special characters. |
| 2 | Session expiry logic used `new Date()` during rendering. | Next.js 16 Cache Components raised a prerendering error. | Browser console and rendering errors. | Used the database clock as the authoritative time source. |
| 3 | A two-column layout lacked an explicit single-column mobile layout. | The recipe detail page overflowed horizontally on small screens. | Automated viewport-width check at 390 px. | Added a responsive single-column grid with appropriate minimum sizing. |
| 4 | Form validation errors remained after a field was corrected, and the wrong Zod issue could be displayed. | Users received misleading validation messages. | Manual review of invalid and corrected form submissions. | Added error clearing on edit and a helper to select the first issue for each field. |
| 5 | A verification autosave effect depended on a newly created array. | Re-rendering could abort an in-flight save and prevent counts from being persisted. | Code review before the first run. | Changed the effect to depend on a stable serialized payload. |
| 6 | Wastage calculations rounded intermediate values twice. | Certain values were rounded incorrectly, producing discrepancies with PostgreSQL. | An integration test and comparison against exact `BigInt` arithmetic. | Reworked the calculation to use a single integer-division rounding step and added regression and property tests. |
| 7 | Timeline events were ordered by timestamp and random UUID. | Events created within one transaction could appear in the wrong order. | Integration testing of the order timeline. | Added an identity-based sequence column and ordered events by that sequence. |
| 8 | The API error wrapper caught Next.js's internal prerendering signal. | Production builds generated unnecessary errors for GET endpoints. | Server logs from the first end-to-end run against the production build. | Added `unstable_rethrow(err)` before mapping application errors. |
| 9 | The Sewing Queue test did not independently verify the SQL status filter. | Removing the explicit filter did not cause the test to fail. | Mutation testing revealed that the test still passed after the filter was removed. | Added a case involving a pending order with a forged orphan approval log. |
| 10 | An end-to-end login helper matched role text already present on the login page. | Several tests became flaky or failed before login had completed. | The initial end-to-end test run. | Waited for navigation away from `/login` and used an exact header-caption match. |
| 11 | Shell-generated file edits corrupted a regular expression and a JavaScript replacement string. | The affected files failed to compile. | TypeScript and transformation errors. | Switched to direct file writes for code containing escape sequences and template literals. |
| 12 | Login and logout relied on client-side navigation and refresh calls. | Cached page content could remain visible after logout, and switching users could fail without reloading. | Manual testing followed by a browser test that kept the same tab open. | Reworked sign-in and sign-out as Server Actions, invalidated the relevant layout, redirected appropriately, and added an account-switching end-to-end test. |
| 13 | After moving the application into `frontend/`, the build workers did not consistently receive the root `DATABASE_URL`. | Production builds logged database configuration errors and attempted to prerender the health endpoint. | Production build output. | Added shared environment loading in `backend/config/env.ts` without overriding platform variables, and ensured the health handler was request-dependent. |

### Additional verification

Mutation checks were used to evaluate whether critical tests could detect missing protections. The checks included temporarily removing selected safeguards, such as the shortage check and Sewing Queue status filter, and confirming that the relevant tests failed before restoring the code.

These checks are important because a passing test suite does not necessarily mean that every test would detect a regression.

## 3. Human Review and Refactoring


- **Business logic:** I reviewed the cutting verification and approval workflow to ensure that component quantities are checked before a batch can be approved.
- **Authorization:** I checked how user roles are validated by the backend and whether unauthorized requests are rejected independently of the frontend.
- **Validation and error handling:** I reviewed the handling of missing fields, invalid quantities, shortages, and rejection reasons to ensure that invalid requests cannot bypass server-side validation.
- **Code organization:** I reviewed how shared verification logic, validation helpers, UI components, and database operations are organized to reduce duplication and make the code easier to maintain.
- **Testing:** I examined the test cases for approval, rejection, role restrictions, and Sewing Queue visibility, including whether they would detect the removal of important safeguards.


## 4. Defensive Architecture

ApparelFlow ERP is designed with multiple layers of protection because application code, including AI-generated code, can contain mistakes.

### 4.1 Database-level integrity

The database provides an additional layer of protection for the verification workflow. The implementation uses database constraints and triggers to enforce state transitions, ensure that approval records and complete component counts exist, and prevent decided verification attempts from being modified.

Audit events and decision logs are append-only. A unique constraint limits each order to one decision per verification attempt, while sewing operations are restricted to verified orders.

This means the database can reject an invalid transition even if an application-level check is accidentally removed.

### 4.2 Transactional operations and row locking

Approval, rejection, counting, and recut operations use transactions and row-level locking on the relevant order.

This helps prevent concurrent requests from making conflicting decisions about the same batch. If a transaction fails, its database changes are rolled back rather than leaving the order in a partially updated state.

### 4.3 Server-side calculations and validation

Expected component quantities, traffic-light statuses, fabric wastage, verifier identity, timestamps, and order numbers are calculated or obtained on the server.

Client-provided values are not trusted for these decisions. Request schemas validate the submitted data and remove unsupported fields, reducing the risk of manipulated requests changing business outcomes.

### 4.4 Consistent role-based access control

The same permission rules are used by page-level and API-level guards, with authorization checked again inside the relevant use cases.

The frontend may hide or disable unavailable actions, but these UI controls are not considered a security boundary. The backend independently verifies the user's role before performing a protected operation.

### 4.5 Shared domain rules

Core business rules, including component quantity calculations, traffic-light status, and wastage calculations, are maintained in shared domain logic and covered by unit and property tests.

Keeping these rules separate from the UI helps prevent different parts of the application from calculating different results for the same input.

### 4.6 Tests that check the safeguards

The project includes unit, integration, and end-to-end tests. HTTP-level integration tests use PostgreSQL rather than relying entirely on mocked database behaviour.

Mutation checks are used for selected critical safeguards, while API-surface tests help detect unexpected changes to the available HTTP methods. End-to-end testing also covers the production build and accessibility checks.

### 4.7 Fail-safe error handling

The application validates identifiers and request payloads before processing them, maps known validation and integrity failures to appropriate HTTP responses, and returns generic responses for unexpected errors.

For example, invalid input should not reach SQL operations, integrity conflicts should not silently succeed, and users should not receive access to unverified orders through the Sewing Queue.

