# GoErudite Help Chat — Implementation

Assessment date: 2026-10-25

## Purpose

The floating help assistant provides verified step-by-step help in English and Hindi using a local knowledge base and deterministic matching. Its core does not call a paid AI service, external model, or third-party chatbot API.

## Request flow

1. `support-chat.js` renders the floating, keyboard-accessible chat on public pages and all role dashboards.
2. The user selects English or Hindi, types a question, or chooses a suggested topic. The initial language follows the browser's Hindi locale when available; otherwise it defaults to English. There is no global website language selector in the current application.
3. The browser calls `GET /api/help/chat` to load localized, role-filtered suggestions and `POST /api/help/chat` to ask a question.
4. The API obtains the account role from the existing HTTP-only session. It does not trust a role supplied in the request body.
5. `help-engine.js` normalizes Unicode text, whitespace, punctuation and case, then scores aliases, keywords, titles and exact phrases from `help-knowledge.js`.
6. Only an article allowed for the session role (or public) can be returned. If no suitable article passes the confidence threshold, the API returns a localized fallback and the Contact Support route.
7. The browser renders all user and assistant text through DOM `textContent`/text nodes, not executable HTML.

## Files

- `support-chat.js` — chat launcher/panel, bilingual interface, session-only message history, suggestions, input handling, loading/error/retry states and safe DOM rendering.
- `help-knowledge.js` — structured bilingual help articles and their question aliases, keywords, roles, routes, steps, expected results, limitations and escalation notes.
- `help-engine.js` — deterministic Unicode normalization, role filtering, matching, localized answer formatting and suggestion selection.
- `server.js` — role-aware help API, input bounds, per-IP request throttle and public static asset allowlist.
- `index.html` — chatbot script and root element loaded across the website.
- `styles.css` — responsive floating panel and mobile layout.
- `test/help-chat.test.js` — knowledge completeness, matching, localization and role-filter tests.
- `test/workflows.test.js` — API validation, session role, fallback, privacy and rate-limit tests.
- `e2e/roles.spec.js` — browser UI, mobile, safe rendering and network-retry checks.

## API contract

- `GET /api/help/chat` returns the role derived from the current valid session and English/Hindi suggestions. It does not expose dashboard records.
- `POST /api/help/chat` accepts `{ "question": "...", "language": "en" | "hi" }`.
- Questions must contain 1–500 characters. The endpoint is limited to 20 requests per source IP per rolling minute in the current server process.
- A matched response contains only the selected article's localized answer. An unmatched question receives a localized clarification/support fallback.
- Requests and conversations are not added to the business JSON data store. Frontend conversation history exists in memory only and disappears when the page is reloaded or the user clears the chat.

## Privacy and security

- Passwords, MFA codes, recovery codes, private forms and organisation records are not needed by this help API. The UI warns users not to share them.
- The chatbot cannot run commands, query arbitrary data, edit records, bypass authorisation, or invoke an AI provider.
- Role-specific suggestions and answers are filtered using the server session role.
- Rate limiting is in-process and is not a shared, production-grade limiter for multiple server processes.
- No conversation analytics or durable chat history is collected.

## Known scope limits

- Language is selected inside the chat and defaults from the browser locale. No global site-language setting exists to synchronize with.
- The matcher is deterministic keyword/phrase matching, not semantic AI. It can miss unusual wording; unknown questions are not guessed.
- The knowledge base documents actual implemented behavior and explicit limitations. It cannot inspect a user's private account state or explain an arbitrary runtime error unless that exact issue has a verified article.
- Article routes are limited to the current same-origin dashboard, catalogue, password-help, and Contact pages.
- No multilingual translation of the entire website is implied by the chatbot.

## Verification

See `CHATBOT_TEST_REPORT.md` and `CHATBOT_COVERAGE_REPORT.md` for executed commands and measured coverage. Passing local tests is not production-service verification.
