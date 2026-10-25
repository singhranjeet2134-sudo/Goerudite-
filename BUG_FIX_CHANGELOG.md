# Bug Fix and Audit Changelog

Date: 2026-10-24

## Changes already implemented and regression-tested

- Prevented unverified suppliers from listing RFQs through the opportunity/API surfaces; added regression coverage.
- Required meaningful review rationales for Admin organisation and catalogue decisions.
- Added regression coverage for backend academic RFQ validation, no purchase order on RFQ publication, RFQ audit/persistence, quote revision history, inventory tenant scope, and publisher draft privacy.
- Added public sitemap/robots/metadata and password recovery/suspension session invalidation in earlier implementation work.
- Fixed School/distributor/retailer/publisher profile state handling: role-specific duplicate `state` inputs were removed, the single field is labelled by role, and the existing profile form handler is now bound to the rendered dashboard form. A browser reproduction that previously navigated with profile values in the query string now sends `PATCH /api/profile`; the saved state was verified by a fresh dashboard read.
- Fixed shared organisation notification handling: dashboard reads are limited to the current user and organization-owner notifications, staff personal notices are no longer exposed to other staff, and read timestamps are recorded per user. Mark-read authorization is restricted to the current user or their organisation owner. API regression tests verify persistence, organization isolation, and independent owner/staff read state.
- Added a privacy-threshold regression for publisher demand analytics: repeated RFQs from one school do not satisfy the three-distinct-school minimum; a qualifying group contains no school or RFQ identifiers.
- Fixed a duplicate-account race: simultaneous registrations could all pass the email check before asynchronous password hashing. A final synchronous uniqueness check immediately before insertion now rejects competing requests. An isolated eight-request reproduction changed from eight 201 responses to one 201 and seven 409 responses, with one stored identity.
- Improved accessible color contrast after axe-core reported failures for orange brand text, footer headings, book metadata, and dashboard labels. Adjusted the palette and re-ran the automated sample scan across four public pages and six role dashboard overviews; no serious or critical violations remained.
- Added build/syntax verification, Biome lint, isolated Playwright browser checks, axe-core sampling, and feature-matrix validation scripts. The JavaScript source has no build artifacts or type-check contract; the build script verifies syntax/inventory, and type checking remains not applicable.
- Added mandatory TOTP MFA for Admin and organisation owners/elevated team managers, optional MFA for other roles, encrypted authenticator secrets, one-use hashed recovery codes, replay prevention, enrollment/login attempt limiting, server-side session gating, enrollment/disable APIs, and auth/dashboard UI. Regression tests cover pending-session protection, mandatory/optional scope, replay and recovery-code reuse denial, throttling, and optional MFA disable. Admin-assisted recovery after loss of all codes and production-managed key provisioning remain unavailable.
- Added Admin-managed exact-match supplier territories and fail-closed delivery-location checks across RFQ listing/dashboard, quote reads and quote submission. Added reasoned, expiring, single-supplier/single-RFQ exceptions with revocation. Integration tests cover invalid/duplicate areas, allowed/disallowed access, direct API attempts, exception grant/revocation and audit persistence. Location text is manually entered and not validated against an authoritative geography provider.
- Added cloned immutable audit snapshots, SHA-256 chaining with optional HMAC-SHA256, an Admin verification endpoint, tamper detection tests, and integrity-aware backup-restore audit records. A real integration failure exposed hash mismatches from mutable caller-owned snapshots; cloning the event before hashing fixed it and the persisted chain now verifies. Local key custody and local JSON storage are not production-grade append-only protection; managed KMS and remote logging remain blocked.
- Added a revocation action for active territory exceptions and made repeated revocation a visible conflict. Added the Admin Supplier Territories inventory row; its API is tested, while its UI forms have not been separately browser-submitted.
- Corrected an enrollment-session defect: protected API access used to delete pending MFA sessions before the enrollment endpoint could validate them. Pending sessions now receive a denial without being destroyed; regression tests verify this behavior.
- Corrected the MFA browser-test helper to wait for the asynchronous enrollment/challenge state and support subsequent authenticator challenges. Corrected a contrast finding for audit timestamps and stabilized axe sampling to run after toast entrance animations complete.
- Corrected the Solutions page login call-to-action overlap by removing its negative top margin; replaced the unreliable text-glyph login icon with a visible inline SVG icon in the navbar and Solutions CTA.
- Updated the support phone number to +91 8586032007 on the footer and Contact page, and added backend-served public contact details (`GET /api/public/contact`). WhatsApp links directly to the supplied number; Instagram and LinkedIn icons remain non-clickable until valid official profile URLs are configured, so no profile URLs are fabricated.
- Regression verification for the contact API, phone/WhatsApp rendering, navbar icon, and Solutions CTA layout: `npm.cmd test` passed 11/11, `npm.cmd run build` passed, and `npm.cmd run test:e2e` passed all 3 specs including the targeted UI assertions. Physical-device testing was not performed.

The relevant implementation detail and test references are recorded in `IMPLEMENTATION_CHANGELOG.md`, `API_TEST_REPORT.md`, and `FEATURE_REGISTRY.md`.

## Verification in this audit run

- `npm.cmd test`: PASS, 11 tests (6 unit/quality tests plus 5 integration groups), 0 failures, 0 skipped.
- All six role logins and every visible dashboard section were checked at ten requested viewport sizes (760 combinations).
- Fourteen public/help routes were checked at ten requested viewport sizes (140 combinations).
- Browser E2E verified School RFQ creation/publication, Retailer local offline draft save/delete without server persistence, Publisher submission → Admin review → public visibility, per-user staff notification read behavior, and profile form submission/persistence.
- `node --check server.js`, `node --check dashboard.js`, and `node --check test\workflows.test.js`: PASS.
- `npm.cmd run build`: PASS (syntax and matrix validation; no bundling step).
- `npm.cmd run test:unit`: PASS, 6 tests.
- `npm.cmd run test:integration`: PASS, 5 groups.
- `npm.cmd run test:inventory` via `npm.cmd run build`: PASS, 84 rows/16 columns/unique IDs and complete open-item metadata.
- `npm.cmd run test:storage`: PASS, isolated procurement/moderation persistence workflow.
- `npm.cmd run test:e2e`: PASS, all 3 Playwright specs; 140 public route/viewport checks, 760 dashboard section/viewport checks, and axe scans of 10 sampled pages.
- `npm.cmd run lint`: PASS; see the final release report for the verified warning count after the last cleanup.
- Tests used a temporary JSON data directory and synthetic identities; the normal store was not modified.

This log does not imply that every existing or possible defect has been found or fixed. Missing features, unresolved product decisions, and control-level test gaps remain documented in `RELEASE_READINESS.md` and `FEATURE_TEST_MATRIX.csv`.
