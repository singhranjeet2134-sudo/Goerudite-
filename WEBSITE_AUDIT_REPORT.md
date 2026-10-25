# GoErudite Website Audit Report

Audit date: 2026-10-24  
Workspace: `C:\Users\DELL\Desktop\Goerudite`

## Executive status

**NOT READY FOR RELEASE.** The existing application starts locally and its configured automated suite passes. Core role workflows have substantial API/integration coverage. This audit did not establish complete control-by-control coverage, production readiness, physical-device behavior, or all attachment acceptance criteria.

## Architecture discovered

- Frontend: static HTML, CSS, and browser JavaScript (`index.html`, `app.js`, `dashboard.js`, `styles.css`); no frontend framework or bundler is configured.
- Backend: Node.js native HTTP server in `server.js`.
- Persistence: local JSON store (`data/store.json` by default). This is not a production database and does not establish multi-process transactions or database-level concurrency guarantees.
- Sessions: in-memory, revoked on server restart.
- Dependencies: `fflate`, `fast-xml-parser`, and `nodemailer`.
- At the time of this baseline audit, package scripts were limited to `start`, `dev`, and `test`. The later QA addendum below records the configured scripts.
- Automated tests: Node's built-in test runner with an isolated temporary data directory.
- Repository state: this workspace is not a Git repository; branch/status and commit-based baseline comparisons are unavailable.
- Production configuration and third-party services were not tested.

## Discovered pages and roles

Public routes documented in `README.md` include home, solutions, pricing, about, trust, help, catalogue, advertisements and campaign detail, blog and article detail, book detail, contact, dashboard entry, staff invitation, password recovery, robots, and sitemap.

Role workspaces: School, Distributor, Retailer, Publisher, Other authorised user, and Admin. Their actual navigation and server capabilities are summarized in `FEATURE_REGISTRY.md`; visible navigation alone was not treated as proof that a feature works.

## Fixes completed in this workstream

1. Prevented unverified Distributors and Retailers from enumerating RFQs through the inbox API or dashboard opportunity data.
2. Required an audit reason (minimum 10 characters) for Admin account verification, correction, suspension, restoration, and catalogue review decisions; aligned the Admin form with backend enforcement.
3. Added regression checks for eligibility, academic-field validation, RFQ/PO separation, RFQ audit and persistence, quote revision uniqueness/history, inventory organization isolation, publisher draft privacy, and Admin decision reasons.
4. Added isolated manual test-data instructions to `README.md`.
5. Prior work in this workstream added password recovery, suspension session revocation, public sitemap/robots/metadata, and other fixes documented in `FEATURE_REGISTRY.md`.

No schema migration was performed. The normal JSON store was not edited by the test suite; tests use a temporary directory. No project/data backup was created during this report-only audit because no destructive operation or migration was performed. The previous project state is not available as a Git diff.

## Current evidence

- `node --check server.js` — PASS.
- `node --check dashboard.js` — PASS.
- `node --check test\workflows.test.js` — PASS.
- `npm.cmd test` — PASS: 11 tests (6 quality/unit tests and 5 integration groups), 0 failures, 0 skipped.
- Local `/api/health` on port 3000 — PASS at the time of the check (HTTP 200).
- Browser: 30 checks across `/`, `/catalog`, and `/dashboard` at widths 320, 360, 390, 430, 600, 768, 1024, 1280, 1440, and 1920 pixels; all returned HTTP 200, no measured horizontal overflow, no page errors, console errors, or failed requests.
- Previous documented public sweep: 12 routes, 11 fragment targets, and 48 route/viewport combinations at 320, 375, 768, and 1280 pixels; see `FEATURE_REGISTRY.md`.
- Browser visual checks used viewport emulation. No physical device was tested.
- Playwright verified six role logins, required MFA enrollment, all visible dashboard sections, logout, viewport layouts and sampled accessibility findings; role-specific form controls were not all exercised in the browser.

## Material limitations and risks

- The feature matrix is grouped by important workflow/control families; it is not a literal row for every UI control, hidden conditional action, or API request variation. A complete control-level inventory remains outstanding.
- The current `FEATURE_TEST_MATRIX.csv` has 84 rows: 43 `PASS`, 3 `FIXED - RETEST PASS`, 8 `PARTIAL`, 15 `MISSING`, 10 `NOT TESTED`, 5 `BLOCKED`, and 0 `FAIL`. The original 37 outstanding IDs are status-tracked in `RELEASE_READINESS.md`; matrix rows still do not enumerate every individual control.
- Build, lint, type-check, performance/load, accessibility audit, full endpoint fuzz/negative matrix, and all ten requested responsive sizes across every page/dashboard were not run.
- No production system, real users, real payments, production SMTP, or physical devices were tested.
- Local JSON persistence is unsuitable evidence for multi-instance production safety; durable sessions, transactions, recovery objectives, and concurrency guarantees are not established.
- Local audit records now use SHA-256/HMAC chain verification, but no managed key lifecycle or remote append-only destination is configured; this is not tamper-proof production logging.
- MFA is implemented for privileged accounts and tested locally, but production key custody and an identity-verified lost-code recovery process remain unresolved. Email ownership verification, document KYC, account closure/data access, dispute evidence uploads, fine-grained permission editing, academic configuration, publisher territories, repeat lists, multi-campus/multi-store workflows, and reliable notification retries are absent or incomplete.
- Supplier RFQ territory checks are enforced against explicit Admin-configured exact-match locations and covered by API tests; the entries are not validated against an authoritative geography source and Admin form controls were not browser-submitted.
- Local backups and isolated restores are tested; no off-site backup destination was approved or used. Multi-process JSON consistency and crash/fault recovery remain untested.
- Policy-dependent features (approval limits, supplier territory rules, paid quotas, POS/credit, evidence retention, and data retention) must not be invented without approved business rules.

## Readiness decision

**NOT READY FOR RELEASE.** The local integration suite and sampled browser checks pass, but core production dependencies and the required exhaustive release evidence are incomplete. Follow `RELEASE_READINESS.md` for next actions.

## QA addendum — 2026-10-24

The later verification pass configured syntax/build verification, Biome lint,
unit/integration/storage/inventory tests, and isolated Playwright/axe-core
checks. Final observed results are recorded in `RELEASE_READINESS.md`: the
full Node suite passed 11 tests; all 3 Playwright specs passed, with 140 public
route/viewport checks, 760 dashboard section/viewport checks, and sampled axe
scans; the matrix contains 84 entries. This does not establish production,
physical-device, full accessibility, legal, multi-process storage, or
control-by-control readiness.
