# GoErudite

A responsive GoErudite academic sourcing website based on the supplied design PDF, with a role-based dashboard and a built-in Node.js API.

## Run locally

Requires Node.js 18 or newer. From this folder, run:

```powershell
node server.js
```

Open **http://localhost:3000**. The website and API use the same origin. Runtime dependencies include `fflate` and `fast-xml-parser` for bounded XLSX archive/XML handling, and `nodemailer` for optional SMTP invitation delivery.

The JSON data store is written to `data/store.json` by default. For a separate local data directory or port, set `GOERUDITE_DATA_DIR` or `PORT` before starting the server.

Organisation invitations can be delivered by SMTP. Configure `GOERUDITE_SMTP_HOST`, `GOERUDITE_SMTP_PORT`, `GOERUDITE_SMTP_FROM`, and `GOERUDITE_PUBLIC_URL` in the server environment. Optionally set both `GOERUDITE_SMTP_USER` and `GOERUDITE_SMTP_PASS`; set `GOERUDITE_SMTP_SECURE=true` for implicit TLS (normally port 465), and `GOERUDITE_SMTP_REQUIRE_TLS=true` to require STARTTLS. Do not commit SMTP secrets. If SMTP is not configured, owners receive an explicit manual-link fallback; delivery failures leave the one-time invitation active and report the failure rather than claiming email success.

`GOERUDITE_PUBLIC_URL` should be the public HTTP or HTTPS origin (scheme and host only, with no path). It is used for invitation links when SMTP is configured and as the canonical origin in `robots.txt` and `sitemap.xml`. If unset, SEO endpoints use the request origin; configure the public origin in production, especially behind a reverse proxy.

Public contact details are served by `GET /api/public/contact` and rendered in the site footer and Contact page. The support phone and WhatsApp link are `+91 8586032007`. To activate official social profiles, set `GOERUDITE_INSTAGRAM_URL` and/or `GOERUDITE_LINKEDIN_URL` to the full HTTPS profile URLs for the GoErudite accounts. The server accepts only URLs on `instagram.com` or `linkedin.com`; unset or invalid profiles appear as inactive icons without clickable links.

The floating Help Chat provides a no-paid-AI, bilingual English/Hindi knowledge-base assistant across public pages and dashboards. Answers are matched from verified local articles and filtered by the server-authenticated role. It does not store conversations or access private business records. Chat language defaults from the browser locale because the site does not currently have a global language selector. See `CHATBOT_IMPLEMENTATION.md`, `CHATBOT_KNOWLEDGE_BASE.md`, `CHATBOT_COVERAGE_REPORT.md`, and `CHATBOT_TEST_REPORT.md` for scope and evidence.

## Test suite

Run `npm.cmd test` from Windows PowerShell (or `npm test` in other shells). The Node.js built-in test-runner suite includes isolated inventory-validator unit tests and API integration tests; the server integration suite uses temporary storage and removes it after the run. It does not modify `data/store.json`.

Available verification commands:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run test:integration
npm.cmd run test:storage
npm.cmd run test:inventory
npm.cmd run test:e2e
```

The build command checks syntax and validates the feature matrix; this vanilla JavaScript application has no bundler or generated build artifact. Install the isolated Chromium browser once with `npx.cmd playwright install chromium` before running `test:e2e`. E2E runs use synthetic accounts and a temporary JSON store. Type-checking is not configured because the source has no TypeScript or JSDoc type-check contract.

See [FEATURE_REGISTRY.md](./FEATURE_REGISTRY.md) for the audited feature status, test evidence, and known limitations.

## Manual dashboard checks (isolated test data)

Use a separate PowerShell window and a separate data directory so manual tests cannot alter the normal `data/store.json`. Use synthetic organisations, book titles, addresses, and contact details only. Do not reuse production accounts or credentials.

```powershell
$env:GOERUDITE_DATA_DIR = Join-Path $PWD "data-manual-test"
$env:PORT = "3001"
$env:GOERUDITE_ADMIN_KEY = "replace-with-a-private-local-test-key"
node server.js
```

Open `http://localhost:3001`, register the first account as Admin using the configured local bootstrap key, then create one synthetic School, Distributor, Retailer, Publisher, and Other account. Sign in as Admin to verify each organisation; account and catalogue decisions now require a review reason of at least 10 characters. Use separate browser profiles or sign out between role checks.

Suggested manual checks:

- **School:** complete the profile and class counts; create a draft RFQ; attempt publication with missing academic fields; complete the required fields and publish; compare supplier quotations; create a PO request and obtain two approvals from different eligible people; record dispatch, receipt, and a test dispute; export a report.
- **Distributor:** view the RFQ inbox; save a quote draft and confirm it is private from the School; submit and revise a quote or submit a no-bid; import and adjust synthetic inventory; test fulfilment on an issued PO.
- **Retailer:** view eligible RFQs; create a quote draft and submit it; search and adjust inventory; inspect stock alerts and browser-local offline drafts. Offline drafts are device-local and are not a synchronized server queue.
- **Publisher:** create/import catalogue drafts; confirm they are not public; submit a title; review it as Admin; change MRP with an effective date and inspect its history; request a reviewed withdrawal.
- **Other:** update the organisation profile and submit a book suggestion; confirm it remains private until Admin review and that RFQ, quote, order, and Admin endpoints remain denied.
- **Admin:** review accounts and catalogue submissions with reasons; update a support case; exercise blog/advertisement controls; search/export audit records; create a local backup and perform any restore checks only in this isolated test directory.

For persistence checks, save a record, reload the page, sign out and back in, then confirm it appears in the correct role workspace. Stop the test server with Ctrl+C. Restart it with the same environment variables to verify JSON-backed record persistence; sessions are intentionally invalidated on restart. The configured automated suite uses its own temporary store and does not depend on this manual directory.

## Website routes

- `/` — Home and featured academic catalogue
- `/solutions` — Workflows for schools, distributors, retailers, and publishers
- `/pricing` — Role-based plans and subscription responsibility
- `/about` — Company story, principles, vision, and mission
- `/trust` — Privacy, platform rules, support guidance, and returns policy
- `/help` — Account guidance and frequently asked questions
- `/catalog` — Searchable, filterable catalogue
- `/advertisements` — Active, clearly labelled sponsored listings
- `/advertisements/:id` — Campaign details and a private, verified-school quote inquiry
- `/blog` — Public list of published administrator-managed articles
- `/blog/:slug` — Public article page (published articles only)
- `/book/mathematics-world` — Example title and school RFQ entry point
- `/contact` — Support request form
- `/dashboard` — Sign in and continue to the workspace for your account role
- `/invite/:token` — One-time organisation staff invitation acceptance
- `/forgot-password` — Request an account password reset link
- `/reset-password/:token` — Set a new password from a single-use, expiring reset link
- `/robots.txt` — Crawler guidance and sitemap location
- `/sitemap.xml` — Public pages and published catalogue, blog, and sponsored-listing URLs

## Roles and account verification

Schools, distributors, retailers, publishers, and other authorised users register through the website. New organisation accounts begin in `pending` verification. Users can save eligible drafts and edit their profiles while pending; publishing school RFQs, submitting supplier quotes, and publishing catalogue titles require an administrator-verified account.

Public static serving is allowlisted to the website entry point and its CSS/JavaScript assets; project files and persisted data are not web assets. State-changing API requests carrying a foreign `Origin` or `Sec-Fetch-Site: cross-site` header are rejected. Supplier quotation drafts remain private to their supplier until submitted. Registration consent is enforced and timestamped server-side. Login uses in-memory per-IP and per-IP/email throttles. Password-reset requests are throttled per IP, per IP/email, and per email. Password recovery uses a random single-use token whose hash is stored in the JSON data file, expires after 30 minutes, sends only through configured SMTP, and invalidates the account's active sessions after a successful password change. If SMTP is not configured or delivery fails, the application does not return a reset token; an operational identity-verified recovery procedure is not configured. Session cookies are HttpOnly and SameSite=Lax, and include Secure when `NODE_ENV=production`. Sessions expire on the server after seven days as well as in the browser cookie; sessions are intentionally in-memory and are invalidated when the server restarts or the account is suspended. `GOERUDITE_SESSION_TTL_MS` can set a shorter or longer positive session lifetime.

MFA is required for Admins and organisation owners/elevated staff with team-management permissions; other accounts may enable it. MFA uses TOTP, AES-256-GCM encrypted authenticator secrets, one-use hashed recovery codes, replay rejection and attempt throttling. Set `GOERUDITE_MFA_ENCRYPTION_KEY` to a private 32-byte hexadecimal key before enabling MFA; protect and back it up with an approved secret manager in production. Do not put the key in source control. An authorized process for account recovery after all recovery codes are lost has not been implemented.

Supplier RFQ visibility and quotation APIs require a verified, active Distributor/Retailer organization with an explicitly configured exact-match delivery territory. Administrators manage service areas in the Supplier Territories dashboard. Missing delivery location fails closed. A territory exception is limited to one supplier and one RFQ, requires a reason and expiry, and may be revoked. Location entries are manually configured; they are not validated against an authoritative geography provider.

New audit events are SHA-256 hash-chained; when `GOERUDITE_AUDIT_HMAC_KEY` is configured they use HMAC-SHA256. The Admin audit page can verify the chain. A local unkeyed chain is not protection against an operator who can rewrite the store; production deployment requires an approved managed key lifecycle and restricted remote append-only log destination. No audit logs or backups are sent off-site by this application.

The first administrator must be bootstrapped by setting a private `GOERUDITE_ADMIN_KEY` on the server before registration. The key is entered only in the restricted administrator registration form. Administrator registration is disabled after an administrator already exists; do not publish or commit the bootstrap key.

Example PowerShell setup:

```powershell
$env:GOERUDITE_ADMIN_KEY = "replace-with-a-private-one-time-bootstrap-key"
node server.js
```

Administrators review organisation verification, publisher catalogue submissions, book suggestions from schools/distributors/retailers/other authorised users, and support cases. Returned accounts can update their organisation profile and request another review.

Security endpoints include `POST /api/auth/mfa/enroll/start`, `POST /api/auth/mfa/enroll/verify`, `POST /api/auth/mfa/disable`, `GET /api/admin/audit/verify`, `GET/POST /api/admin/supplier-territories`, and `POST/DELETE /api/admin/territory-exceptions`. These routes enforce server-side role/session checks. See the integration tests and Feature Registry for tested cases and current production limitations.

For isolated MFA/audit testing, provide generated throwaway keys in the environment; never reuse the examples below in production. Generate a random 32-byte hexadecimal value with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Production secret custody, audit destination, off-site backup destination, retention and recovery operations are not configured or approved.

## Role dashboards and RFQ forms

- **School:** school profile, academic session, class-wise student strength, book requirements/catalogue lookup, review-only book suggestions, owned RFQs, quote comparison, evaluation, separate two-step PO request/approval, orders, archive, team permissions and reports.
- **Distributor:** public RFQ inbox with text filters, wholesale quotation builder with minimum order/pack-size rules, quote history, account inventory with CSV/XLSX import/export and adjustment history, review-only book suggestions, partial dispatch tracking, team permissions and actual-response analytics.
- **Retailer:** nearby RFQs with filters, local quotation builder with pickup/local delivery terms, inventory ISBN/title search and CSV/XLSX import/export, review-only book suggestions, stock alerts, local fulfilment, team permissions and browser-local unsent quote drafts.
- **Publisher:** owned master catalogue with complete book details, ISBN/edition and session views, dated MRP history, row-validated CSV/XLSX bulk import/export, correction queue, reviewed withdrawal requests, team permissions and privacy-thresholded demand summaries.
- **Administrator:** account verification, catalogue moderation and withdrawal decisions, Blog Management (draft/edit/preview/publish/unpublish/schedule/delete), Advertisement Management (campaign drafts, advertiser assignment, active dates, manual campaign-fee records, pause/activate, click and inquiry counts), derived RFQ/quote/fulfilment exceptions, support cases, searchable audit events, audit exports, local backup creation/integrity status, explicit-confirmation restore and a limited service-status view.
- **Other authorised user:** own organisation profile, review-only book suggestions, notifications, and activity; no RFQ, quotation, order, or administrator access is granted by the generic role.

RFQ response submission is available only to verified distributors and retailers. Schools create RFQs and evaluate responses; publishers edit their own catalogue; administrators review accounts/titles and monitor exceptions. Those roles do not receive supplier quotation submission permissions. School, distributor, retailer, and publisher organisation owners can create one-time staff invitations with preset Owner, Manager, Buyer, Reviewer, or Read-only permission profiles. Invite links expire after 72 hours, are stored as token hashes, and are emailed through configured SMTP or offered as a one-time manual link when SMTP is unavailable; invitations can be revoked before use. A staff member shares the organisation's records but keeps their own authenticated actor identity and audit trail. A PO request requires two approvals by different, non-requester Managers or Owners; the PO is issued only after the second approval. Rejection at either step closes the request without issuing an order.

XLSX import/export is available for school RFQs, supplier inventory, and publisher catalogues alongside existing CSV workflows. Uploads are capped at 240 KB and 5,000 rows across all worksheets; school RFQs retain their stricter 250-line limit. Imports merge all worksheets only when normalized headers match, reject formulas, and return worksheet-and-row-qualified validation errors; imports do not publish catalogue records or RFQs. Administrators can create on-demand local JSON backups, inspect file size/integrity, and restore a valid backup only after typing its exact filename. Restore waits for in-flight API requests, creates a verified safety backup of current data, writes the restored store atomically, and records an audit event. Backups are never automatically deleted or pruned; no retention policy has been approved.

All non-admin role dashboards show a backend-calculated profile-completion checklist; it is separate from organisation verification. School RFQs also carry a backend completeness assessment for academic fields, book lines, delivery location and response deadline. Missing optional planning details are surfaced as warnings and do not silently change existing publication policy. Supplier no-bid responses use a validated standard reason code, with an explanatory note required for “Other.” Notifications link users to the relevant role section where one exists.

## Backend API

All write operations accept JSON unless noted. Authenticated routes use the same-origin, HTTP-only session cookie.

### Public site and authentication

- `GET /api/health` — Service status
- `GET /api/catalog?q=...` and `GET /api/catalog/:id` — Search and read published titles
- `POST /api/catalogue/submissions`, `PATCH /api/catalogue/submissions/:id` — Submit complete book metadata for human review, or revise an owner-submitted suggestion returned for correction (school, distributor, retailer, publisher, or other account); never publishes directly
- `POST /api/auth/register`, `POST /api/auth/login` — Register or sign in
- `GET /api/auth/me`, `POST /api/auth/logout` — Read or clear the current session
- `POST /api/support` — Submit a support case
- `GET /api/blog`, `GET /api/blog/:slug` — Return published articles only; drafts, scheduled, unpublished, and deleted posts are not publicly readable
- `GET /api/admin/blog`, `POST /api/admin/blog`, `PATCH /api/admin/blog/:id`, `DELETE /api/admin/blog/:id` — Admin-only, durable blog management. Writes validate unique slugs, required content/date, and PNG/JPEG/WebP image structure and dimensions; cover images are limited to 180 KB. Article text is plain text and escaped by public-page rendering. Due scheduled posts publish on startup, on public blog requests, and by a 15-second in-process poll while the server is running.
- `GET /api/advertisements`, `GET /api/advertisements/:id` — Read active campaigns only; paused, draft, expired, and future campaigns are private
- `POST /api/advertisements/:id/click` — Persist a campaign click event for a currently active ad
- `POST /api/ad-inquiries` — Active, verified schools can create a private quote inquiry assigned to the selected advertiser; it is not a public RFQ and does not disclose school contact details
- `GET /api/ad-inquiries` — Read only the signed-in verified advertiser's own inquiries
- `GET /api/admin/advertisements`, `POST /api/admin/advertisements`, `PATCH /api/admin/advertisements/:id`, `DELETE /api/admin/advertisements/:id` — Active Admin-only campaign controls, advertiser eligibility checks, validated dates/prices/images, campaign state, manually recorded offline billing status, and derived click/inquiry metrics. The Admin dashboard also shows advertisers' eligibility only, not their contact information.

### Shared account workspace

- `GET /api/dashboard` — Role-scoped dashboard data
- `PATCH /api/profile` — Update the signed-in organisation profile or request verification again when corrections were requested
- Notifications are included in `GET /api/dashboard`; `POST /api/notifications` with `{ "id": "..." }` marks one of the signed-in user's notifications as read
- `GET /api/reports/export.csv` — Download an export limited to the signed-in role

### School procurement

- `GET /api/rfqs`, `POST /api/rfqs` — List the school's requirements or create a draft/published RFQ
- `PATCH /api/rfqs/:id` — Edit/version, publish, close, or cancel an owned RFQ
- `GET /api/rfqs/:id/quotes` — Compare submitted supplier responses to an owned RFQ; supplier drafts remain private
- `PATCH /api/quotes/:id/decision` — Record an auditable, internal evaluation decision
- `GET /api/rfqs/:id/split-plan` — Return an indicative line-price allocation and uncovered quantities; this does not select suppliers or create orders
- `POST /api/rfqs/:id/impact-preview` — Compare proposed book lines with a published RFQ before saving a versioned change
- `POST /api/rfqs/:id/orders` — Request a purchase order from a quote selected for evaluation; no PO exists until two independent Managers or Owners approve
- `PATCH /api/purchase-requests/:id` — Manager/Owner records one approval step or rejects an organisation-scoped PO request; approvers must be distinct and neither may be the requester
- `PATCH /api/orders/:id` — Amend or cancel an owned pre-dispatch purchase order; amendments are versioned and return to supplier acknowledgement
- `PATCH /api/orders/:id/fulfilment` — Record cumulative per-line dispatch quantities and shipment history; school receipts cannot exceed shipped quantities
- `POST /api/orders/:id/receipt` — Record partial or complete received quantities after the supplier reports delivery
- `POST /api/orders/:id/disputes`, `PATCH /api/disputes/:id` — Report wrong, damaged, or missing received books; supplier response, administrator resolution, and school closure are audited
- `GET /api/rfqs/template.csv`, `GET /api/rfqs/template.xlsx`, `GET /api/rfqs/export.xlsx`, `POST /api/rfqs/import` — Download templates/export work or import validated CSV/XLSX book lines as an RFQ draft

### Distributor and retailer supply

- `GET /api/rfqs` — View published school opportunities without the school's identity or contact details
- `POST /api/rfqs/:id/quotes` — Save a draft, submit/revise a quote, or record a no-bid response
- `GET /api/rfqs/:id/quotes` — Read the current supplier's own response
- `GET /api/inventory`, `POST /api/inventory` — Manage account-owned inventory
- `POST /api/inventory/import`, `GET /api/inventory/template.xlsx`, `GET /api/inventory/export.xlsx` — Validate CSV/XLSX inventory imports and download an XLSX template or organisation-scoped export
- `GET /api/orders` — View only orders belonging to the signed-in school or supplier
- `PATCH /api/orders/:id/fulfilment` — Advance a supplier-owned order through validated fulfilment states and record tracking details

### Publisher catalogue and administrator review

- `GET /api/publisher/catalogue`, `POST /api/publisher/catalogue`, `PATCH /api/publisher/catalogue/:id` — Manage publisher-owned title submissions and versioned corrections, including dated MRP history
- `POST /api/publisher/catalogue/import`, `GET /api/publisher/catalogue/template.xlsx`, `GET /api/publisher/catalogue/export.xlsx` — Import validated CSV/XLSX rows as drafts and return row-numbered errors; importing never auto-publishes titles
- `GET /api/team`, `POST /api/team/invites`, `DELETE /api/team/invites/:id`, `POST /api/team/accept` — Owner-managed organisation staff and one-time invitation workflows
- `GET /api/admin/backups`, `POST /api/admin/backups` — Admin-only local backup status and integrity-checked backup creation
- `POST /api/admin/backups/restore` — Admin-only restore requiring `{ "name": "<exact-backup-filename>", "confirmation": "<exact-backup-filename>" }`; validates the source, creates a safety backup, and records the restore
- `POST /api/publisher/catalogue/:id/withdrawal` — Request withdrawal of a published title for administrator review
- `GET /api/admin/overview` — Administrator workspace overview
- `GET /api/admin/audit?q=...&entity=...&actor=...&from=...&to=...` — Search role-restricted audit history (up to 500 matching records)
- `PATCH /api/admin/catalogue/:id/withdrawal` — Approve or reject a publisher withdrawal request with a reason
- `PATCH /api/admin/users/:id/verification` — Verify, return, suspend, or restore an organisation account with a required review reason
- `PATCH /api/admin/catalogue/:id/review` — Publish, return, or discontinue a publisher title with a required review reason
- `PATCH /api/admin/support/:id` — Assign, request information, resolve, or close a support case

## Data and platform scope

Accounts, hashed staff invitations, RFQs, quotations, inventory, publisher catalogue records, advertisements, campaign click events, private ad inquiries, pending PO approval requests with separate approval decisions, purchase orders, support cases, notifications, and audit events are persisted in the local JSON file under `data/`. On-demand administrator backups are separate JSON files under `GOERUDITE_DATA_DIR/backups` (or `data/backups` by default). Restore never runs automatically and creates a verified pre-restore safety backup; there is no automatic deletion or pruning. Passwords are stored as scrypt hashes. Role checks, permission-profile checks, and organisation ownership checks are enforced by the API, not only by dashboard visibility. Set `GOERUDITE_DATA_DIR` to isolate test data from the normal store.

Advertisement campaign fees are set and recorded by an administrator, but invoicing and payment collection/settlement happen manually outside GoErudite. A `paid_offline` status means an administrator recorded an external payment; it is not a payment-provider confirmation. Public listing prices are advertiser-provided references, not offers or guaranteed transaction prices. Public ad clicks and delivered inquiry records are persisted and their counts are derived from those records. Inquiries are visible only to the assigned advertiser; school identity/contact is not released. The inquiry workflow does not yet include an in-platform advertiser reply or payment workflow.

Phase coverage currently includes role-scoped RFQs and quotes, academic catalogue compatibility checks, API-triggered RFQ and quote expiry, immutable RFQ and quote revisions, CSV/XLSX import and export workflows, audit events, notifications, session-tagged profile class counts, explainable rule-based opportunity matching, indicative split-supply planning, RFQ change-impact preview, a budget override guardrail for quote evaluation, and separate evaluation, two-person sequential PO approval, fulfilment, receipt, and delivery-dispute workflows. Supplier quotes enforce minimum order quantities and pack-size multiples; purchase orders and amendments repeat those checks. Quote comparisons display total charges and an indicative all-in amount per offered copy; this evenly allocates quote-level charges for comparison only and is not an invoice calculation. Retailer quotation forms capture local delivery or pickup terms. Inventory adjustments preserve a bounded movement history with actor, reason and before/after quantities. Supplier dispatch can record cumulative quantities per PO line; school receipts cannot exceed what was dispatched and additional partial shipments can be recorded after partial receipt. Published RFQ changes require a reason and create a version only when requirements materially change; active purchase orders prevent edits to their RFQ. Supplier quotation drafts remain private until submitted; a draft may omit delivery estimate and validity, but submission requires both. Retailer quotation edits can be saved as browser-local drafts and are not submitted until the user explicitly resumes and saves/submits them. Publisher MRP changes are historied, CSV/XLSX imports create drafts with worksheet-and-row validation errors, and withdrawals require an administrator decision. Publisher demand summaries omit RFQ/school identifiers and are returned only for groups covering at least three distinct schools. A school evaluation decision alone still does not create an order: an authorised member requests a PO, and two different non-requester Managers or Owners must approve it in sequence before an order is issued. Purchase orders can be amended or cancelled before dispatch/receipt; amended orders return to the issued state for supplier acknowledgement, and suppliers can reject newly issued orders with a reason. Fulfilment supports partial receipts and recorded delivery disputes with supplier responses, administrator decisions, and school case closure. These records do not reserve inventory or process payment.

Catalogue submissions include title, subtitle, author, publisher/imprint, ISBN, subject, class/grade, board, state, medium, edition, academic session, page count, recommended age, publication date, format, publisher MRP and effective date, description, and highlights. Publisher submissions can be saved as drafts; book suggestions from other roles enter the administrator review queue directly. Only administrator-approved records become public catalogue entries. This catalogue metadata does not create stock or supplier/retailer pricing.

This is not full implementation of every item in the supplied phased dashboard specification. In particular, AI book matching, multi-level approval matrices beyond the one independent Manager/Owner decision, multiple campuses/warehouses, custom fine-grained permission configuration, authorized recovery when all MFA recovery codes are lost, email ownership verification, persistent sessions, document-based KYC, configurable academic master data, scheduled background RFQ/quote expiry jobs, offline conflict-safe server sync, POS/sales/credit, publisher-distributor network controls, dispute evidence attachments, downloadable comparison reports, invoice/payment processing (including online advertisement payments), production monitoring, and off-site backup/restore are not implemented. Local backup/restore is available but no off-site destination, retention policy, RPO/RTO or recovery operator is approved. Login throttling is process-local and is not a replacement for a shared production rate limiter. Audit hash verification is implemented for local records but remote append-only storage and managed key rotation are not configured. Blog scheduling is persisted and polled every 15 seconds while the Node server is running; overdue posts are also processed on startup and public blog requests. Publication cannot occur while the server is stopped. RFQ compatibility checks apply only where a linked catalogue record has academic metadata; free-text books require manual review. RFQ/quote expiry is applied and persisted when an API workspace request runs, not by a background scheduler. PO amendments are limited to quoted lines/quantities and are not permitted after dispatch or receipt. The split planner is a transparent line-price heuristic and excludes quote-level charges, MOQ, and delivery optimization; forecasts use a one-copy-per-student baseline rather than historical consumption. Supplier reliability is shown only after at least three recorded deliveries.

The built-in JSON store and in-memory sessions are intended for local demonstration/development; production use needs a durable database and persistent session store, HTTPS, deployment secret management, a shared production-grade rate limiter, and an operational verification process.
