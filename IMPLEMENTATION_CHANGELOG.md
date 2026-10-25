# Implementation Changelog

Audit/workstream date: 2026-10-24

## Current changes

- `server.js`
  - Restricts supplier RFQ inbox API and dashboard opportunities to verified supplier accounts.
  - Requires a minimum-length rationale on Admin account verification/suspension/restoration and catalogue review decisions.
- `dashboard.js`
  - Requires and explains the Admin decision rationale in the shared review form.
- `test/workflows.test.js`
  - Adds regression tests for supplier RFQ eligibility, required academic fields, no PO creation from RFQ publication, RFQ audit/persistence, quote revision uniqueness/history, inventory tenant isolation, publisher draft privacy, and Admin decision rationale.
- `FEATURE_REGISTRY.md`
  - Records Part 4 and Parts 5–9 requirements and status evidence.
- `README.md`
  - Documents an isolated manual dashboard environment and role-wise manual checks.
- New audit deliverables:
  - `WEBSITE_AUDIT_REPORT.md`
  - `FEATURE_TEST_MATRIX.csv`
  - `API_TEST_REPORT.md`
  - `RESPONSIVE_TEST_REPORT.md`
  - `E2E_TEST_REPORT.md`
  - `IMPLEMENTATION_CHANGELOG.md`
  - `RELEASE_READINESS.md`

## Previously implemented work in this ongoing audit

`FEATURE_REGISTRY.md` records earlier public-site SEO/sitemap/accessibility improvements, password recovery, session revocation on suspension, and extensive role workflow coverage. These are historical workstream changes, not all changes made in the current prompt.

## Preservation, data, and rollback

- No new page, API route, data model, schema, or database table was added in the current changes.
- No database/schema migration was performed.
- Automated tests use isolated temporary storage.
- The application uses JSON persistence; no production data migration or replacement was made.
- The workspace has no Git metadata, so there is no verified Git diff, branch, or automated rollback point.
- The normal JSON data store was not edited by tests. No backup was created in this documentation-focused pass because no destructive data operation was performed.

## Risks

Admin reason enforcement is an intentional backend behavior tightening. Any external Admin API client must now include a rationale of at least 10 characters for these decisions.

For rollback, review and revert the specific code edits only after evaluating audit requirements. Do not replace or restore `data/store.json` as a code rollback mechanism.

## Follow-up implementation — MFA, territories, audit chain

- Added TOTP MFA enrollment and sign-in challenge flows for Admin and elevated organisation accounts, optional setup/disable for other roles, encrypted secrets, hashed single-use recovery codes, replay prevention, rate limiting, and pending-session enforcement.
- Preserved an MFA enrollment session when unrelated protected API calls are denied; previously, authentication middleware removed the pending session before enrollment could proceed.
- Added Admin-managed exact-match supplier locations, fail-closed eligibility on RFQ discovery and quotation access/submission, and reasoned, expiring, revocable single-RFQ exceptions.
- Added hash-chained audit snapshots using SHA-256 or HMAC-SHA256 when configured, a server-side Admin verification API, and integrity-aware backup restore records. A test exposed mutable object references invalidating older hashes; events are now snapshotted before hashing.
- Added the Admin territory section, exception revocation action, and status rows for updated MFA/territory/audit evidence in the feature matrix. The newly added Admin territory row remains PARTIAL because its UI controls were not individually submitted through a browser.
- Added contrast regression coverage/update for audit timestamps and made axe sampling wait for the toast entrance animation to finish.
- Reconciled the reports and matrix to 84 rows, including all 37 original open IDs and one new Admin territory control inventory row.

Final local verification: `npm.cmd test` passed 11 tests; `npm.cmd run test:unit` passed 6; `npm.cmd run test:integration` passed 5 groups; `npm.cmd run test:storage` passed 1; `npm.cmd run build` validated syntax and all 84 matrix rows; `npm.cmd run lint` passed with four warnings and one informational suggestion; `npm.cmd run test:e2e` passed 3 Playwright specs (140 public route/viewport checks, 760 dashboard section/viewport checks, sampled axe scans). These are isolated local tests and viewport emulations only. No physical-device or production testing was performed.

Release remains **NOT READY FOR RELEASE** while managed MFA key custody and recovery, remote append-only audit storage, off-site backup/recovery, legal review, production authorization/rollback ownership, full control-level coverage, and production storage suitability remain unresolved.
