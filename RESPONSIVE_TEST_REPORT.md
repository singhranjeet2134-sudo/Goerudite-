# Responsive Test Report

Date: 2026-10-24

## Current browser viewport run

The current run is repeatable via `npm.cmd run test:e2e` and launches an
isolated server with synthetic accounts and a temporary store. It is distinct
from physical-device testing.

Playwright viewport emulation checked 14 public and account-help routes (Home, Solutions, Pricing, About, Trust, Help, Catalogue, Sponsored Listings, Blog, a book detail route, Contact, Dashboard, Forgot Password, and an invalid reset-token page) at:

`320×568`, `360×800`, `390×844`, `430×932`, `600×960`, `768×1024`, `1024×1366`, `1280×800`, `1440×900`, and `1920×1080`.

| Measure | Result |
|---|---|
| Total public route/viewport checks | 140 |
| Non-200 responses | 0 |
| Measured horizontal overflow | 0 |
| Browser page exceptions | 0 |
| Page exceptions | 0 observed |
| Console/network errors | Not comprehensively captured or classified for the expanded run |
| Failed requests | Not independently counted for the expanded run |

The same ten viewports were used across all visible dashboard sections for six roles (Admin, School, Distributor, Retailer, Publisher, Other): 760 section/viewport checks. Admin now has a Supplier Territories section. No horizontal overflow or page exception was observed. Dashboard console and network failures were not comprehensively classified for every one of these snapshots.

Playwright test evidence: all 140 public route/viewport responses and all 760
dashboard section/viewport overflow checks passed. Each role logged in via the
browser UI, opened every visible sidebar section at the test viewports, and
logged out. The suite observes page exceptions but does not provide a complete
console-message or failed-network-request classification.

Final command result: `npm.cmd run test:e2e` — **PASS**, 3 specs, including all
140 public route/viewport checks, 760 dashboard section/viewport checks, and
sampled accessibility scans. All viewport sizes listed above were emulated;
no physical devices were used.

## Earlier recorded public checks

`FEATURE_REGISTRY.md` records a previous sweep of 12 public routes, internal links, 11 fragment links, and 48 route/viewport combinations at 320, 375, 768, and 1280 pixels. That prior result is historical evidence; it does not establish every possible state or control.

## Limitations

- Only viewport emulation was used; no physical phone, tablet, orientation change, or assistive technology device was tested.
- No dynamic blog-detail or sponsored-ad-detail route was available in the synthetic dataset for the 140-check sweep.
- Every attached viewport was not tested against every page, role, form, modal, error state, or data table.
- Touch target size, zoom, contrast, focus visibility, mobile sidebar interactions, and modal fit were not comprehensively audited.
- The earlier public sweep and current focused run use different viewport sets; results should not be combined into a claim of complete coverage.

## Status

Sampled public routes and all visible dashboard sections at the listed viewport widths: **PASS** for HTTP loading and measured horizontal overflow.  
Full responsive acceptance across all data states, modal/form error conditions, dynamic detail routes, and physical devices: **NOT TESTED**.
