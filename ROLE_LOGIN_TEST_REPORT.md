# Role Login and Dashboard Navigation Report

Date: 2026-10-24

## Environment

Browser checks used an isolated local server and synthetic test accounts; the normal application data store was not used. Passwords, session tokens, and private bootstrap values are intentionally excluded from this report.

## Results

Each listed role was registered and verified in the isolated environment, logged in through the website UI, checked for the expected role/workspace identity, refreshed, and navigated through every visible sidebar section.

| Role | Visible sections opened | Login and role identity | Refresh/session | Mobile nav at 320×568 |
|---|---:|---|---|---|
| Admin | 14 | PASS | PASS | PASS |
| School | 14 | PASS | PASS | PASS |
| Distributor | 13 | PASS | PASS | PASS |
| Retailer | 16 | PASS | PASS | PASS |
| Publisher | 13 | PASS | PASS | PASS |
| Other | 6 | PASS | PASS | PASS |

All visible sections for the six roles were opened at each of the ten requested viewport sizes (760 role-section/viewport checks total). Admin's Supplier Territories section is included. Required MFA enrollment and subsequent sign-in challenge were exercised for privileged roles. No horizontal overflow was measured. Public and account-help routes were also checked at those sizes (140 route/viewport checks). No unexpected page exceptions were observed. The expanded sweep did not comprehensively export/classify all console messages or failed network requests.

School and Distributor profile state fields were checked for uniqueness and the Distributor profile was saved through the UI and persisted. School→Distributor quotation, Retailer offline draft, Publisher moderation, and staff notification workflows are separately evidenced in `E2E_TEST_REPORT.md`.

## Scope limits

This verifies the sampled login, role routing, section rendering, refresh, and responsive viewport rendering. It is not a test of every button, form, permission combination, dynamic data state, physical device, or production identity provider. See the individual dashboard reports and `E2E_TEST_REPORT.md`.
