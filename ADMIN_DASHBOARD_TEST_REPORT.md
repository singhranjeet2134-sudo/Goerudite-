# Admin Dashboard Test Report

Date: 2026-10-24

## Status

**PARTIALLY TESTED** — Admin login with required MFA, all visible sections at ten emulated viewport sizes, organisation verification, and catalogue review were checked. Every administrative control was not manually tested.

## Evidence

The synthetic Admin account completed required MFA enrollment/sign-in through the UI, displayed the expected workspace identity, survived refresh, and opened all 14 visible sidebar sections. The Admin UI was used to verify the five synthetic organization accounts with review rationales. At the emulated 320×568 viewport, mobile navigation opened and no horizontal overflow was measured.

The Admin moderation UI approved the synthetic Publisher submission with a recorded rationale. The public catalogue API showed the title after approval. The dashboard responsive sweep covered all 13 Admin sections at all ten viewport sizes.

Automated API integration coverage includes moderation, support, audit search/chain verification, supplier territory configuration and scoped exception revocation, advertisements, access controls, and isolated backup/restore validation. A later isolated Playwright check submitted a synthetic service area through the Admin UI, checked invalid PIN validation and duplicate rejection, removed the area, and confirmed its absence through a fresh API read. The exception form and all territory UI states at every viewport remain untested.

## Gaps

The full Admin control and failure-state inventory was not browser-tested. MFA is implemented for privileged accounts but production key custody and administrator-assisted recovery are unresolved. Local audit-chain verification is covered, but no managed KMS or remote append-only sink is configured. Off-site recovery, fine-grained permission controls, and advanced monitoring remain absent or blocked.

## QA update — 2026-10-25

- `npm.cmd test`: **PASS**, 16 tests, 0 failures, 0 skipped.
- `npm.cmd run build`: **PASS**, syntax checks for 13 JavaScript files and valid 84-row feature matrix.
- `npm.cmd run lint`: **PASS with 4 non-blocking complexity warnings**.
- Focused territory UI Playwright check: **PASS**. It used only isolated synthetic accounts and values; no real geographic serviceability was asserted.
- Full `npm.cmd run test:e2e`: **PASS**, 5 specs. All 14 public routes were checked at ten emulated viewports; visible sections for six roles were navigated at ten emulated viewports; sampled axe checks found no critical/serious violations.

This update does not close `ADMIN-CONTROL-INVENTORY-001`; most Admin controls and failure states remain untested. It also does not verify production monitoring, KMS, remote audit storage, or off-site recovery.
