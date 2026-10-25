# API Test Report

Date: 2026-10-24  
Test environment: Node.js integration suite spawning the local server with isolated temporary JSON storage. Fixtures and fake SMTP are test-only; no real customer accounts or production services were used.

## Executed endpoint groups

The configured test suite has five integration groups; all five passed. The full test command also passed six unit/quality tests (11 total, no failures or skips). Tests use isolated temporary storage, generated test-only MFA/audit keys, and synthetic identities.

| Endpoint/workflow group | Authentication/role coverage | Validation/security/persistence evidence | Result |
|---|---|---|---|
| Registration, login, MFA, logout, session and recovery | All supported roles; Admin bootstrap fixture | Invalid credentials do not issue a session; required/optional MFA, enrollment, TOTP challenge/replay, recovery-code reuse, rate limiting, password hashes, reset-token expiration/reuse, SMTP failure, logout, suspension, expiry and restart behavior tested | PASS |
| RFQ, territory, quote, approval, fulfilment, receipts and disputes | School, Distributor, Retailer, managers, Admin, unauthorized roles | Academic validation, explicit territory allow/deny, missing-location fail-closed behavior, direct quote API denial, scoped exception grant/revocation, ownership checks, private drafts, two distinct approvers, self-approval denial, dispatch/receipt bounds and dispute transitions tested | PASS |
| Inventory, publisher catalogue, imports/exports, support, audit integrity and backups | Supplier, Publisher, School, Other, Admin | Tenant scoping, stale update conflict, import validation, publisher drafts private before approval, role restrictions, audit tamper detection/chain verification after territory changes and restore, isolated backup/restore tested | PASS |
| Advertisement and session scenarios | School, advertiser role, Admin | Private inquiry scoping, account suspension, campaign state, session expiration tested | PASS |

## Focused regression checks added

- `GET /api/rfqs` and `GET /api/dashboard`: unverified suppliers denied/receive no opportunities.
- `POST /api/rfqs`: required academic fields rejected; RFQ publication does not create a purchase request.
- `PATCH /api/rfqs/:id`: material change creates an audit event; RFQ persists after fresh login.
- `POST /api/rfqs/:id/quotes`: revision updates the existing supplier/RFQ record and preserves history.
- `GET /api/inventory`: another organization cannot see the retailer's inventory.
- `POST /api/publisher/catalogue/import`: imported record remains a private draft and is not in public catalogue.
- Admin verification and catalogue review routes reject decisions without a meaningful reason; successful decision paths include a reason.
- MFA regression tests verify protected APIs reject pending enrollment sessions without invalidating the enrollment, mandatory roles must enroll, optional roles can enroll/disable, TOTP counters cannot be replayed, recovery codes are single-use, and repeated enrollment failures are rate-limited.
- Territory regression tests verify Admin-only configuration, invalid and duplicate territory rejection, eligible RFQ visibility, missing/out-of-area denial, direct quote read/submission denial, expiring single-RFQ exception grant/revocation, and persisted audit verification.
- Audit-chain regression tests verify tampering, deletion, reordering, missing HMAC keys, mutable caller snapshot isolation, and chain verification after backup restore.
- `PATCH /api/profile`: Distributor, Retailer, and Publisher state values persist in their organization profiles.
- `GET /api/dashboard` and `POST /api/notifications`: organisation notifications are visible only to their owner and organisation members; marking a shared notification read stores a per-user timestamp and does not change the owner's state.
- Publisher demand analytics remain hidden with two distinct school organizations even when one school has multiple RFQs; the group appears at three distinct schools and exposes neither school nor RFQ identifiers.
- Concurrent same-email registration was reproduced on an isolated server: eight requests all passed the pre-hash uniqueness check and created eight accounts. The server now rechecks the email synchronously before insertion; regression test expects one 201, seven 409 responses, and one persisted account.
- Twelve concurrent independent support submissions on one isolated server all persisted and were read back from the JSON store. This validates the current single-process write queue only, not cross-process locking or crash recovery.

## Not covered exhaustively

- This is not a per-endpoint exhaustive request matrix. Not every malformed JSON, oversized payload, concurrent write, storage failure, HTTP retry, rate-limit boundary, database transaction, or response schema combination was executed.
- HTTP handler tests use isolated local JSON storage. They do not establish multi-process consistency, transactional guarantees, production database behavior, or external network reliability.
- Browser automation did not inspect every protected dashboard action, request payload, or failure state.
- Playwright now provides a repeatable isolated browser suite: 14 public/account-help routes at ten viewports; all six roles log in through the UI, navigate all visible dashboard sections and log out; axe-core scans four public pages and six dashboard overview screens. These checks are not every control or workflow.
- Browser-only profile form regression: the Distributor screen originally emitted two fields named `state` and performed a normal GET on submit. The screen now emits one state control, submits `PATCH /api/profile`, and the persisted profile value was verified. This UI check is documented in `E2E_TEST_REPORT.md`.
- Production SMTP, real payments/webhooks, external suppliers, and production deployment were not exercised.
- Build/syntax, Biome lint, matrix/unit, storage, and Playwright E2E scripts are now configured. Type-checking remains inapplicable to this plain JavaScript source because no type annotation/checkJs contract exists.

## Commands and observed results

- `node --check server.js` — PASS.
- `node --check dashboard.js` — PASS.
- `node --check test\workflows.test.js` — PASS.
- `npm.cmd test` — PASS, 11 tests total (6 unit/quality tests and 5 integration groups), 0 failures, 0 skipped.
- `npm.cmd run test:unit` — PASS, 6 matrix/security utility tests.
- `npm.cmd run test:integration` — PASS, 5 integration groups, 0 failures.
- `npm.cmd run test:storage` — PASS, isolated procurement/moderation persistence workflow.
- `npm.cmd run test:inventory` — PASS, 84 unique IDs, 16 columns, complete metadata on all original open rows and the new Admin territory row.
- `npm.cmd run build` — PASS; syntax and inventory verification only, no bundler/artifacts are configured.
- `npm.cmd run lint` — PASS; latest rerun after the MFA cleanup is recorded in `RELEASE_READINESS.md` (warnings are non-blocking complexity simplifications).
- `npm.cmd run test:e2e` — PASS, 3 Playwright specs; 140 public route/viewport checks, 760 role-section/viewport checks, and sampled axe-core checks completed.
- Local `GET http://localhost:3000/api/health` — HTTP 200 during the audit.
