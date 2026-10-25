# GoErudite Help Chat — Test Report

Assessment date: 2026-10-25

## Test outcomes

| Check | Result | Evidence |
|---|---|---|
| `npm.cmd test` | PASS | 16 tests passed, 0 failed, 0 skipped. Includes chatbot knowledge/matching tests, API integration and role checks, input bounds, rate limiting, MFA/authentication, procurement journeys and session expiry. |
| `npm.cmd run build` | PASS | Syntax verification passed for 13 JavaScript files. Feature inventory validation passed with 84 data rows, 16 columns, unique IDs and complete open-item metadata. |
| `npm.cmd run lint` | PASS with warnings | Exit code 0. The chatbot modules are included. Biome reported 4 non-blocking complexity warnings in `server.js`; no chatbot-file lint warnings were reported. |
| `npx.cmd playwright test --grep "help chat|public and account-help routes"` | PASS | 2 focused browser tests passed, including bilingual interaction, safe text rendering, mobile bounds, keyboard dismissal and unavailable-API retry. |
| `npm.cmd run test:e2e` | PASS | 4 browser tests passed, 0 failed. This includes public routes, chat retry, all six role dashboards, and sampled axe accessibility checks. |

## Verified chatbot behavior

- Knowledge base has 26 unique, structured articles with localized fields and canonical questions.
- Unit tests retrieve every article by its canonical question and check Unicode normalization, English/Hindi/Hinglish matching, role filtering, localization and explicit unavailable-feature guidance.
- API tests cover anonymous access and all six supported roles. The server derives the role from the active session; role values supplied by the browser are not used.
- A Distributor cannot receive School-only suggestions or a School-only answer.
- Blank, over-limit, and unsupported-language requests are rejected. The in-process limit is exercised through the 429 response.
- An unmatched HTML-like question returns a fallback; the browser renders the submitted text without creating an image element or executing it.
- Browser tests exercise English and Hindi UI/answers, clearing the conversation, retry after the knowledge API is unavailable, keyboard Escape, and chat-panel bounds at 390×844.
- The integration test compares the isolated JSON store before and after help API requests and verifies the chat does not persist questions or suggestions there.
- Chat history is held in page memory only. Language preference is the only chat setting saved in browser local storage.

## Browser, role, and viewport evidence

- The public route test checked 14 routes at each of 10 emulated viewport sizes, for 140 route/viewport combinations. The tested sizes were 320×568, 360×800, 390×844, 430×932, 600×960, 768×1024, 1024×1366, 1280×800, 1440×900, and 1920×1080.
- The test checked for horizontal overflow, page errors, and selected navigation/contact behavior.
- The role test logged in, reloaded, navigated visible dashboard sections, checked responsive bounds, and logged out for Admin, School, Distributor, Retailer, Publisher, and Other.
- The axe test sampled public and role-dashboard pages and reported no critical or serious violations in those samples.
- These are automated browser and viewport-emulation results, not physical-device tests.

## Limitations and remaining verification

- Hindi article answers and labels are primarily Romanized Hindi/Hinglish, not Devanagari. The chat is bilingual in its current content, but native-script Hindi localization remains a content-quality improvement.
- Tests exercise every article through the matcher, but do not render every article in the browser for every role or verify every suggested link individually.
- Axe results are sampled automated checks, not a complete WCAG audit or assistive-technology evaluation.
- No physical devices, production deployment, production data, or production external services were tested. No real email, payment, or external notification was triggered for this chat feature.
- The API rate limiter is process-local; production use with multiple server processes would need a shared limiter.
- The chat documents implemented help behavior; it does not inspect user-specific records, infer arbitrary failures, or provide generative/semantic AI.

## Release assessment for this feature

**Local verification: PASS for the implemented and tested scope.** This is not a production-readiness or physical-device certification. Release decisions for the wider GoErudite application remain subject to its separate security, operational, legal, and release-readiness requirements.
