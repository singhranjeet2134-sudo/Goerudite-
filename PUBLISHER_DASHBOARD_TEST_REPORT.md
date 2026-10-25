# Publisher Dashboard Test Report

Date: 2026-10-24

## Status

**PARTIALLY TESTED** — login, all visible sections at ten emulated viewport sizes, and a catalogue submission/moderation/public-visibility journey were browser-verified. Not every publisher form or error state was exercised.

## Evidence

The synthetic Publisher account logged in through the UI, displayed its role/workspace identity, survived refresh, and opened all 13 visible sidebar sections. At the emulated 320×568 viewport, mobile navigation opened and no horizontal overflow was measured.

The Publisher submitted a synthetic title through the dashboard UI. It remained `pending_review`; an Admin approved it with a review rationale, after which the public catalogue API returned the title. The demand analytics privacy threshold also has automated two-school/duplicate-RFQ and three-school boundary tests.

`npm.cmd test` passed all five integration groups. Backend integration coverage includes catalogue import drafts, privacy before moderation, Admin review, public visibility after approval, corrections, pricing history, and withdrawal review.

## Gaps

Every publisher upload/import, correction, moderation, and error state was not browser-tested. Territory management, edition supersession, preview/rollback, and SLA/reporting controls remain absent or incomplete.
