# End-to-End Test Report

Date: 2026-10-24

## Environment and data safety

`npm.cmd test` runs Node's built-in test runner and starts the application against an isolated temporary data directory. Tests use synthetic accounts, catalogue records, local SMTP test server fixtures, and test-only requests. They do not write to the normal `data/store.json`. No production account, payment, email campaign, or real customer data was used.

`npm.cmd run test:e2e` now uses Playwright/Chromium with a separate isolated server and a temporary JSON store. It provisions synthetic accounts through the API and performs UI login/logout. axe-core is injected only in this test browser context; the application Content Security Policy is not changed.

## Executed automated scenarios

| Scenario | Coverage observed | Result |
|---|---|---|
| School registration/profile/RFQ | Registration, required MFA enrollment, verification, profile, academic validation, RFQ draft/edit/publish/close/cancel, supplier territory eligibility and persistence | PASS |
| Supplier quotation journey | Private draft, valid submission, invalid quotation data, revision history, no-bid, school comparison access | PASS |
| Two-person procurement | Requester self-approval denied, distinct approvers required, order issue, amendment/cancellation paths | PASS |
| Order fulfilment/dispute | Supplier acknowledgement/status, partial dispatch, over-receipt rejection, partial/full receipt, dispute response/resolution/closure | PASS |
| Publisher review | Draft/import privacy, submit, Admin moderation, public visibility after approval, correction, dated MRP history and withdrawal review | PASS |
| Inventory | Supplier-scoped records, adjustment history, stale-update conflict, XLSX import/export and invalid row rejection | PASS |
| Staff invitations | Acceptance, expiry, revocation, reuse denial, permission profile boundaries | PASS |
| Role/access security | API denials, cross-role/organization access checks, role tampering, suspension and session revocation | PASS |
| Admin/ads/support/audit/backup | Campaign inquiry scope, support status, audit search/chain verification, backup validation and isolated restore | PASS |
| Session expiry | In-memory session expiration test | PASS |

The API/integration portion reports five groups passed with 0 failures and 0
skipped. The complete `npm.cmd test` run includes these plus 6 quality/unit
tests: 11 tests passed, 0 failed, 0 skipped. These are automated API/integration
journeys, not full UI browser E2E coverage.

The suite also contains feature-matrix parser/validator tests plus utility tests
for TOTP replay/encryption, recovery-code hashes, and audit-chain tampering.

## Browser execution

Playwright checked 14 public and account-help routes at all ten requested viewport sizes (140 route/viewport checks): `/`, `/solutions`, `/pricing`, `/about`, `/trust`, `/help`, `/catalog`, `/advertisements`, `/blog`, `/book/mathematics-world`, `/contact`, `/dashboard`, `/forgot-password`, and an invalid reset-token page. All returned HTTP 200 with no measured horizontal overflow or page exceptions. This does not test every dynamic detail route or every route-specific content state.

An isolated test server and synthetic accounts were used to sign in to School, Distributor, Retailer, Publisher, Other, and Admin through the login UI. Required MFA enrollment and login challenges were exercised; each role's dashboard heading was asserted before and after a full page reload, then every visible sidebar section was opened: Admin 14, School 14, Distributor 13, Retailer 16, Publisher 13, Other 6. At 320×568, the mobile navigation opened for each role and no horizontal overflow was measured. No page exceptions were observed; current automation does not comprehensively classify browser console messages or failed network requests. Expected 401/403 responses were checked as authorization behavior, not treated as runtime failures.

The responsive browser sweep opened every visible dashboard section at each of ten requested viewport sizes for all six roles: 760 role-section/viewport combinations. No horizontal overflow or page exception was observed. This is browser viewport emulation, not physical-device or assistive-technology testing.

The Playwright+axe-core run scans `/`, `/catalog`, `/contact`, `/help`, and the
overview page for each of the six roles against WCAG 2.0/2.1 A/AA rules. A
recent run found insufficient contrast for audit timestamps and for a toast
sampled during its entrance animation. Timestamp color was changed to the
existing accessible muted text token, and the axe test now waits for entrance
animations to finish. The latest run found no serious or critical violations
in these sampled pages. This is not a complete WCAG conformance audit.

Final full browser command: `npm.cmd run test:e2e` — **PASS**, 3 specs, 0
failures: 140 public route/viewport checks, 760 role-section/viewport checks,
and sampled axe-core scans on four public pages and six role dashboard
overviews. All sizes are viewport emulation; physical-device and production
browser tests were not run.

The same run also asserted that the navbar login SVG renders, the footer shows
the updated `+91 8586032007` telephone link and WhatsApp link, and the Solutions
page login CTA begins below (not over) the hero banner. Instagram and LinkedIn
links are omitted unless valid official profile URLs are supplied through
server configuration.

A browser-driven School→Distributor journey was also completed on the isolated server:

1. School created and saved a draft RFQ, then published it using complete academic requirements. Both operations returned successful API responses.
2. Distributor saw the published RFQ in its opportunities and saved a quotation draft.
3. After School logged in, the draft quotation was not returned by the School quote API and the UI showed the empty quotation state.
4. Distributor submitted the quotation; School then saw the submitted quote in its comparison UI.
5. The quote and RFQ remained visible after page refresh and a fresh School login.

Additional isolated browser journeys in this audit:

- School saved and published an RFQ. A Retailer responded to the opportunity while network emulation was offline; its unsent draft appeared in the local Offline Drafts view, could be deleted, and did not create a server quotation.
- Publisher submitted a title from the dashboard UI. It remained pending review until Admin approved it with a documented reason; only then did the public catalogue API return it.
- An invited School reviewer saw an organisation-scoped notification, marked it read, and the School owner still saw their own unread copy after re-login.
- Distributor profile save submitted a PATCH request, persisted its state value, and did not navigate away. Before the fix, the profile form had two `state` controls and submitted as a GET with form values in the URL.
- MFA and territory business rules have API regression coverage; the role login sweep exercises MFA enrollment, but territory form actions were not submitted through the browser UI.

The browser checks covered these journeys only; they do not establish that every dashboard control, form field, validation state, or role/state combination works. Physical-device and production-browser tests were not run.

## QA update — 2026-10-25

The current Playwright suite contains five specs. `npm.cmd run test:e2e` completed with **5 passed, 0 failed** on an isolated server and temporary JSON store:

- The public-route test checked 14 routes across ten emulated viewport sizes: 140 route/viewport checks.
- The role-navigation test logged into all six roles, reloaded each dashboard, opened all visible sections, and logged out; it completed 760 role-section/viewport checks.
- The sampled axe-core scan reported no critical or serious violations on the tested public pages and role dashboard overviews.
- A new Admin Supplier Territories UI regression test added a synthetic service area, checked invalid PIN client validation, confirmed duplicate submission returned HTTP 409 with an error message, removed the area, and verified its absence through a fresh API read. The test also checked for page exceptions and HTTP 5xx responses.
- A full run exposed a test-helper issue: a repeat Admin sign-in reused the same TOTP counter and correctly triggered replay rejection. The E2E helper now generates a fresh allowed TOTP counter; the focused Admin+axe tests and subsequent full suite passed. The application's replay protection was not weakened.

The territory UI test did not exercise the scoped exception form, authoritative geographic validation, or every viewport. The all-role suite still navigates dashboard sections rather than exercising every form, filter, row action, upload/download, and failure state. Control-level test items therefore remain **NOT TESTED**. Viewports were emulated; physical devices and production were not tested.

## Not tested / blocked

- Network outage/reconnection and conflict resolution for browser-local retailer drafts.
- Real SMTP delivery, payment processing, webhooks, and supplier integrations.
- Storage failure injection against production-like data.
- Every file upload/import malformed/oversized/bomb case and every download permission variant.
- Exhaustive cross-product of roles, permissions, states, and all API endpoints.
- End-to-end physical device, accessibility assistive technology, and full dashboard viewport matrix.

## Regression status

Latest browser-only command: `npm.cmd run test:e2e` — **PASS**, 3 specs,
including all 140 public route/viewport checks, 760 dashboard section/viewport
checks, and 10 sampled axe-core page scans. See `RELEASE_READINESS.md` for the
complete final command results and remaining verification gaps.
