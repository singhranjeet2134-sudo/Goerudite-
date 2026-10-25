# GoErudite Feature Registry

Audit snapshot: 2026-10-24. This registry records the implementation found in
the current project. A menu item or documented intention is not proof that a
feature is operational.

## Status definitions

- `IMPLEMENTED AND TESTED`: implementation and relevant automated checks were
  found and passed.
- `IMPLEMENTED BUT NOT TESTED`: implementation exists, but relevant tests were
  not run or could not be established.
- `PARTIALLY IMPLEMENTED`: some behavior exists, with known limitations.
- `BROKEN`: a verified implementation defect prevents the intended workflow.
- `MISSING`: no implementation was found.
- `BLOCKED BY DEPENDENCY`: implementation depends on an unconfigured external
  service, approved policy, or infrastructure.
- `NOT APPLICABLE`: not part of the current platform behavior.

## Feature inventory

| Feature | Role | Existing page/component | Existing API | Data model / storage | Status | Changes made in this audit | Tests performed | Remaining issues |
|---|---|---|---|---|---|---|---|---|
| Public pages and navigation | Public | `app.js`, `index.html` | Static routes; catalogue, blog, ads, plans APIs | Public catalogue in code; other records in JSON store | IMPLEMENTED AND TESTED | Added sitemap and robots endpoints; applied noindex headers to dashboard and invitation pages; improved current-page and catalogue search accessibility | Integration suite checks sitemap/robots responses, sitemap content after blog publish/unpublish, noindex headers, public routes and assets; browser checked 12 public routes, internal link targets, 11 fragment links, and 48 viewports (320–1280px) | External destination behavior and every possible authenticated state are not covered by the public browser pass |
| Catalogue search, filters, sorting, pagination | Public | Catalogue page in `app.js` | `GET /api/catalog`, `GET /api/catalog/:id` | Built-in catalogue plus approved publisher records | PARTIALLY IMPLEMENTED | Added an explicit search label, live result announcements, an explicit unknown-freshness notice, and positive-integer pagination validation | Integration suite checks title search, price/title ordering, page boundaries and invalid page inputs; browser checked search, sort control, empty state, clear-filter recovery and result rendering | No authoritative last-updated timestamp exists for records; exhaustive filter combinations and pagination on large catalogues are not established |
| Book details and RFQ entry point | Public / School | Book detail page in `app.js` | `GET /api/catalog/:id`; School RFQ API | Catalogue and RFQ records | IMPLEMENTED AND TESTED | None | Catalogue/RFQ API journeys; book routes previously checked in browser | Not every detail-page control was independently tested |
| Public SEO metadata and indexing | Public | `index.html`, `updatePageMetadata` in `app.js`, `server.js` | `GET /robots.txt`, `GET /sitemap.xml` | Published catalogue/blog/advertisement records | PARTIALLY IMPLEMENTED | Added server-rendered route-specific title, description, canonical and Open Graph tags; added dynamic robots and sitemap responses with configured canonical origin; dashboard/invitation responses include noindex headers | Tests check home, book, blog and dashboard rendered metadata, sitemap origin/content and publish/unpublish updates; browser checked titles/canonical tags on public routes | Main page content is still client-rendered; deployed crawler rendering, reverse-proxy canonical configuration and production search indexing remain unverified |
| Catalogue freshness | Public | Catalogue and book detail pages in `app.js` | Catalogue APIs | Catalogue metadata | PARTIALLY IMPLEMENTED | Added explicit notice that per-record last-updated dates are unavailable; distinguished sample from reviewed listings | Browser checked catalogue and book detail pages render; source and API tests cover publication/moderation | No authoritative last-reviewed/updated timestamp exists; do not infer freshness from book publication date |
| Registration/RFQ conversion analytics | Public | Existing role journeys and sponsored listing events | Advertisement click/inquiry APIs | `adEvents`, `adInquiries`; no web analytics collection | PARTIALLY IMPLEMENTED | None | Source inspection and ad workflow tests | Ad activity metrics work, but registration/RFQ/supplier-onboarding conversions are not tracked; an analytics provider and privacy/consent policy are not configured |
| Help centre and legal information | Public | Help and Trust pages in `app.js` | None | Static website content | PARTIALLY IMPLEMENTED | None | Public route checks | FAQ/help content exists; Terms, Privacy Policy, and dispute rules require professional review against actual operations and applicable Indian law |
| Contact and support cases | Public / Admin | Contact form in `app.js`; Support section in `dashboard.js` | `POST /api/support`, Admin support API | `requests` collection | IMPLEMENTED AND TESTED | None | Integration workflow tests | Email delivery/retry and production support operations are not configured |
| Registration, login, logout, consent | All roles | Auth modal in `app.js` | `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` | `users`; sessions in process memory | IMPLEMENTED AND TESTED | Added regression coverage for invalid-credential session denial, password hash-at-rest format, frontend role-tampering rejection, and exact logout revocation | Integration suite verifies pending registration, required terms consent, hashed passwords, protected APIs, login throttling and logout | Email address ownership verification is not implemented |
| Password recovery | All roles | `/forgot-password`, `/reset-password/:token` in `app.js` | `/api/auth/password-reset/request`, `/api/auth/password-reset/confirm` | Hashed, expiring one-time `passwordResets` entries in JSON store | PARTIALLY IMPLEMENTED | Added 30-minute single-use reset tokens, SMTP delivery, generic account-enumeration-resistant request message, request throttling, reset session revocation, no-store/no-referrer/noindex reset pages and expiry/failure handling | Integration suite tests configured SMTP delivery, token not returned by API, unknown-account response equality, successful reset, prior session/password invalidation, token reuse/expiry denial, SMTP failure invalidation and SMTP-unconfigured response | Usable delivery requires production SMTP configuration; no password reset works when mail is unavailable, and support recovery remains manual |
| Email ownership verification | All roles | No verification step found | No email verification API | No email-verification token records | MISSING | None | Source and route inspection | Registration can begin before mailbox ownership is confirmed; requires verified email policy and configured SMTP |
| MFA | Admin and sensitive accounts | Auth modal and Account Security section | `/api/auth/mfa/enroll/start`, `/api/auth/mfa/enroll/verify`, `/api/auth/mfa/disable` | Encrypted TOTP secret and hashed recovery-code hashes in JSON; per-process enrollment/session state | PARTIALLY IMPLEMENTED | Added TOTP enrollment/challenge, server-side gate, replay protection, one-use recovery codes, rate limiting and optional-role setting | Isolated integration tests cover protected-route denial, challenge, replay, recovery-code reuse, enrollment rate limit and optional role; Playwright role login covers enrollment | Production encryption-key provisioning and authorized recovery when all recovery codes are lost remain unresolved; no production KMS/provider is approved |
| Session expiry, revocation and persistence | All roles | Auth state in `app.js` and dashboard | Login/logout/current-session APIs | In-memory `sessions` map | PARTIALLY IMPLEMENTED | Fixed stale suspended-session lookup; suspension revokes sessions for the suspended user and, when an organisation owner is suspended, all organisation staff sessions | Tests cover TTL expiry, logout revocation, suspension, restoration without reviving old sessions, owner-wide staff revocation, and restart invalidation | Sessions intentionally require re-login after restart; persistent sessions/shared session store are not configured or implemented |
| Organisation verification and suspension | All organisation roles / Admin | Verification and account sections in `dashboard.js` | `PATCH /api/admin/users/:id/verification` | `users`, notifications and audit events | IMPLEMENTED AND TESTED | Corrected suspended-session resolution and revoked affected sessions on suspension | Integration tests cover verification, correction, suspension, restoration and protected endpoint denial | Document-based KYC/evidence handling is absent and should not be introduced without a document privacy/retention policy |
| Staff invitations and permissions | School, Distributor, Retailer, Publisher / Admin | Team section in `dashboard.js`; invite page in `app.js` | `/api/team`, `/api/team/invites`, `/api/team/accept` | `users`, hashed `invitations` | IMPLEMENTED AND TESTED | Added explicit expired invitation test | Tests cover configured SMTP success/failure fallback, acceptance, reuse denial, expiry, revocation and role permissions | Custom permission editor and durable email-provider delivery monitoring are absent |
| Account closure and data requests | All users | No dedicated workflow found | No account closure/data request API | No request state or export/deletion workflow | MISSING | None | Source and route inspection | Requires identity verification, retention/legal rules, organisation-owner/member handling, audit and backup deletion policy |
| School profile and academic setup | School | Profile, Academic Session and Student Strength sections | `PATCH /api/profile`, `GET /api/dashboard` | Organisation fields in `users.profile` | IMPLEMENTED AND TESTED | None | Profile and demand-forecast assertions in integration suite | Multiple campuses, locations and configurable academic master data are absent |
| School requirements and RFQ lifecycle | School | Requirements and My RFQs sections | `/api/rfqs`, `/api/rfqs/:id`, import/export APIs | `rfqs`, audit records | IMPLEMENTED AND TESTED | Blocked unverified suppliers from RFQ inbox API and dashboard opportunities; added regression checks for missing academic fields, no PO on publish, RFQ edit audit, and post-login persistence | Integration suite covers draft/import, validation, publication, supplier visibility/privacy, edit/version history, close/cancel, archive, and persisted RFQ workflows | Every acceptance path is API/integration tested; not every path was manually exercised through the browser |
| Supplier quotations and privacy | Distributor, Retailer, School | Quote Builder, Quote History, Compare Quotations | `/api/rfqs/:id/quotes`, `/api/quotes/:id/decision` | `quotes`, revision history | IMPLEMENTED AND TESTED | None | Integration tests cover quote submission, access boundaries and evaluation | Quote quota/payment gate is not enforced; exhaustive idempotency/retry tests remain |
| PO approvals, fulfilment, receipt and disputes | School, Distributor, Retailer, Admin | Approval Workflow, Orders, Dispute Centre | `/api/purchase-requests/:id`, `/api/orders/:id/*`, `/api/disputes/:id` | `purchaseRequests`, `orders`, `disputes`, audit | IMPLEMENTED AND TESTED | Added post-login persistence assertions for orders and closed disputes | Integration suite exercises two distinct approvers, requester self-approval denial, fulfilment, over-dispatch/receipt rejection, partial/full receipts and dispute transitions | Configurable approval matrix, escalations and dispute attachments are absent |
| Distributor inventory and analytics | Distributor | Inventory, RFQ Inbox, Analytics | `/api/inventory`, `/api/inventory/import`, exports, dashboard | `inventory`, `quotes`, `orders` | IMPLEMENTED AND TESTED | Added explicit, Admin-configured territory eligibility to RFQ listing, detail and quote submission | Integration suite covers permissions, inventory, territory allow/deny, direct API restrictions and scoped exception lifecycle | Location data is manually configured; authoritative location validation and publisher territory authorization are absent |
| Retailer local quotations and offline drafts | Retailer | Local Quotations, Offline Drafts, Stock Alerts | Quote and inventory APIs | Submitted data in JSON; unsent drafts in browser storage | PARTIALLY IMPLEMENTED | None | Role/API tests and UI section inspection | Drafts are device-local, not conflict-safe server synchronization; POS, sales, credit and repeat lists are unavailable |
| Publisher catalogue and moderation | Publisher / Admin | Master Catalogue, Catalogue Moderation, Corrections | `/api/publisher/catalogue*`, Admin catalogue APIs | `publisherCatalog`, published catalogue | IMPLEMENTED AND TESTED | None | Tests cover XLSX import/export, draft and review behavior | Territory/network management, review SLAs and richer data-quality reporting are absent |
| Other authorised-user workspace | Other | Profile, Book Suggestions, Notifications, Activity | Dashboard, profile, catalogue submission and notification APIs | `users`, `publisherCatalog`, `notifications`, `audit` | IMPLEMENTED AND TESTED | None | Role separation and restricted-access API assertions | Permission-request and account-closure/data-request workflows are absent |
| Admin moderation and operations | Admin | Admin dashboard sections in `dashboard.js` | Admin verification, catalogue, RFQ, support, audit verification, territory, blog, ad and backup APIs | Shared JSON collections | PARTIALLY IMPLEMENTED | Added Supplier Territories and audit-chain verification controls | API integration tests cover territory creation/authorization, exception grant/revocation and persisted audit verification | UI controls are not individually browser-tested; fine-grained role policy controls and operational monitoring are unavailable |
| Sponsored campaigns and private inquiries | School / Advertiser roles / Admin | Public ad pages and dashboard sections | `/api/advertisements*`, `/api/ad-inquiries`, Admin ad APIs | `advertisements`, `adEvents`, `adInquiries` | IMPLEMENTED AND TESTED | None | Tests cover click/inquiry persistence, authorization and campaign states | Payment/reply workflow and real-time campaign telemetry are not provided |
| Blog publishing and scheduling | Admin / Public | Blog pages and Admin Blog Management | `/api/blog*`, `/api/admin/blog*` | `blogs` | IMPLEMENTED AND TESTED | None | Integration suite covers blog controls and public visibility | Scheduling is in-process; no publication job runs while the server is stopped |
| CSV/XLSX import and export | School, Distributor, Retailer, Publisher | Dashboard import controls | RFQ, inventory and publisher catalogue import/export APIs | Corresponding JSON collections | IMPLEMENTED AND TESTED | None | Integration tests cover valid/invalid XLSX and multi-sheet inventory | CSV/XLSX edge-case matrix and duplicate handling are not exhaustive |
| Image/document handling | Admin / relevant dashboard forms | Blog and advertisement image controls | Admin blog/advertisement APIs | Image data in JSON records | PARTIALLY IMPLEMENTED | None | Tests cover image validation and rejected SVG examples | PDF/general document/KYC/dispute evidence uploads are not implemented; not every allowed image encoding was tested |
| Audit trail and notifications | All roles / Admin | Audit, Notifications, dashboard alerts | Dashboard, notification, Admin audit search and integrity verification APIs | Hash-chained audit records in JSON; `notifications` | PARTIALLY IMPLEMENTED | Added immutable audit snapshots, SHA-256/HMAC chain verification, Admin verify API, and audit-aware backup restore | Unit tests detect tamper/reordering/deletion; integration verifies persisted chain after territory changes and backup restore | Local keys are not managed/rotated by KMS and logs are not sent to remote append-only storage; production tamper-evidence is not established; external delivery retry/monitoring is absent |
| Backup and restore | Admin | Backup & Recovery | `/api/admin/backups`, `/api/admin/backups/restore` | Local JSON backups under data directory | IMPLEMENTED AND TESTED | Added a successful isolated restore regression test | Integration tests cover creation, integrity, authorization, invalid restore input, successful restore, safety backup, restored data and audit event | Off-site backup, retention policy and production recovery drills are absent |
| Pricing and subscription enforcement | All roles | Pricing page in `app.js` | `GET /api/plans` | Plan definitions in `server.js` | PARTIALLY IMPLEMENTED | None | Plan API assertions pass | Payment, subscription gating and the first-three-quote allowance are explicitly unenforced |
| Production database and durable sessions | Platform | Local Node.js service | Current REST-style API | `data/store.json`; in-memory sessions | PARTIALLY IMPLEMENTED | No migration performed | Restart persistence is covered for JSON-backed records; session expiry is tested | Production database/session store requires an approved migration, backup, compatibility and rollback plan |
| Monitoring, alerts and operational recovery | Admin / Operations | Limited System Health section | `GET /api/health` | None | PARTIALLY IMPLEMENTED | None | Health endpoint asserted by integration suite | Production metrics, alerting, job-failure monitoring and incident response are absent |

## Part 4 — School Dashboard audit

| Requirement | Status | Evidence / remaining limitation |
|---|---|---|
| A1–A5: overview, profile, academic setup, class strength | IMPLEMENTED AND TESTED | School dashboard/profile integration checks cover academic session and class-wise demand; organisation profile fields are persisted. |
| A6–A10: book requirements, catalogue matching, manual entry, XLSX import, suggestions | IMPLEMENTED AND TESTED | RFQ/catalogue workflows and XLSX import are covered; imported RFQs are asserted to remain drafts until reviewed. |
| A11–A13: RFQ draft, edit, publish, close and cancel | IMPLEMENTED AND TESTED | Integration suite exercises RFQ transitions and version history; this audit added backend rejection of missing academic fields and verifies publishing alone creates no purchase request. |
| A14–A18: quotation comparison, approvals, two-person PO approval, acknowledgement/rejection | IMPLEMENTED AND TESTED | Quote decision and order tests verify the requester cannot approve, first approval does not issue an order, and two distinct approvers are required. |
| A19–A23: dispatch/tracking, receipts, disputes, archive, reports | IMPLEMENTED AND TESTED | Tests cover partial dispatch/receipts, rejection of receipt above dispatched quantity, dispute resolution/closure, RFQ lifecycle, and CSV export. |
| A24: team and permissions | IMPLEMENTED AND TESTED | Team role/permission and invitation checks exist. |
| A25: notifications | PARTIALLY IMPLEMENTED | In-app notification records and dashboard alerts exist; dedicated delivery/retry behavior and School notification journey tests are absent. |
| B1: school verification and evidence management | PARTIALLY IMPLEMENTED | Admin verification/correction/suspension exists and is tested; document evidence upload/review is missing and requires privacy/retention policy. |
| B2: multiple campuses and delivery locations | MISSING | Profile and RFQ delivery location are single-valued; no campus/location model exists. |
| B3: configurable approval limits/matrix | PARTIALLY IMPLEMENTED | A fixed two-distinct-approver policy exists; per-organisation configurable limits/matrix are absent. |
| B4: substitute approvers and escalation | MISSING | No delegation, substitute assignment, or escalation workflow exists. |
| B5: budget planning and limits | PARTIALLY IMPLEMENTED | RFQ budget and over-budget quotation override rationale are validated; budget plans and configurable policy limits are absent. |
| B6: quote expiry/outdated warnings | IMPLEMENTED AND TESTED | Expired quotes are rejected for evaluation/order; dashboard alerts warn for quotes expiring within seven days or already expired. |
| B7: alternative book/edition substitution approval | PARTIALLY IMPLEMENTED | Catalogue matching avoids title-only matching and RFQ revisions are versioned; a distinct substitution request/approval workflow is absent. |
| B8: dispute evidence attachments | MISSING | Dispute text and state transitions exist; attachment storage and evidence validation do not. |
| B9: repeat-order templates | MISSING | No saved/reusable RFQ template workflow was found. |
| B10: purchase reconciliation reports | PARTIALLY IMPLEMENTED | Role-scoped CSV reporting exists; a dedicated quoted-versus-ordered-versus-received reconciliation report is absent. |
| B11: reliable notification delivery/retries | PARTIALLY IMPLEMENTED | In-app notifications persist; delivery retries, provider monitoring and operational delivery evidence are absent. |
| B12: complete sensitive-action audit history | PARTIALLY IMPLEMENTED | RFQ material changes, quotations, approvals, fulfilment, receipts and disputes emit audit events; the JSON audit log is mutable and not tamper-evident. |
| C1–C7: academic validation, ISBN/edition matching, import draft, RFQ/PO separation, supplier eligibility/privacy | IMPLEMENTED AND TESTED | Tests cover academic validation, catalogue compatibility, draft imports, no PO on publication, private supplier-draft isolation and role/ownership denial. This audit fixed an eligibility gap: unverified suppliers can no longer list RFQs through either inbox or dashboard APIs. |
| C8–C11: distinct approvals, requester separation, receipt bounds, auditable changes | IMPLEMENTED AND TESTED | Regression suite verifies two distinct approvers, no requester self-approval, receipt quantity bounds and an audit event for material RFQ edits. |
| D1–D12: School acceptance journey | IMPLEMENTED AND TESTED | The integration suite covers registration/verification, profile setup, invalid and valid RFQs, supplier access, quotation decisions, two approvals, fulfilment, invalid/partial/full receipts, disputes, role-scoped export and access permissions. Added a fresh-login persistence check for RFQs, orders and closed disputes. The project does not include a full manual browser run of every workflow. |
| D13: reports, history, permissions and notifications | PARTIALLY IMPLEMENTED | CSV export, audit/history and permission checks are exercised; the School notification workflow is not directly asserted in tests, and external delivery/retries are absent. |

## Parts 5–9 — Role dashboard audit

| Dashboard / requirement group | Status | Evidence, fixes, and remaining limitations |
|---|---|---|
| Distributor A1–A5: overview, RFQ inbox, quote builder, private drafts, submission | IMPLEMENTED AND TESTED | Role API and procurement tests verify verified-supplier access, an unverified supplier cannot enumerate RFQs, a quote draft stays private from the School, and a submitted quote is visible. |
| Distributor A6–A8: revisions, no-bid, history | IMPLEMENTED AND TESTED | No-bid reasons and quote revision versions/history are validated; this audit added a repeat-submission regression proving a revision updates the same RFQ/supplier quote instead of duplicating it. |
| Distributor A9–A11: inventory, stock adjustments, CSV/XLSX import/export | IMPLEMENTED AND TESTED | Inventory row validation, optimistic stale-update rejection, movement history, valid XLSX import/export, and invalid/duplicate import rejection are integration tested. This audit added a cross-organisation inventory visibility assertion. |
| Distributor A12–A18: PO fulfilment, analytics, team, profile, notifications/audit, ad inquiries | IMPLEMENTED AND TESTED / PARTIALLY IMPLEMENTED | Fulfilment, organization team/access, profile, dashboard analytics, audit scope, and advertiser inquiry ownership are exercised. In-app notifications exist; delivery retries and an isolated Distributor notification-journey test are absent. |
| Distributor B1/B9/B10: publisher authorisation, territories, multiple warehouses | MISSING | The publisher network section explicitly states that authorization and territory controls are not configured; inventory has no multi-warehouse authorization model. |
| Distributor B2/B5/B6/B7/B8/B11/B12: freshness, quote charges/expiry/revisions, reservations, metrics, reconciliation, quotas, verification documents, reliable notifications, inventory/quote audit | PARTIALLY IMPLEMENTED | Quotes validate charges, terms, quantity and expiry; inventory records freshness and adjustment history; dashboards report completed-order metrics. No verified stock reservation, invoices/reconciliation, subscription quota, document KYC, or durable notification delivery exists. |
| Distributor C rules: eligibility, privacy, private drafts, validated terms, stock scope, duplicate prevention, backend dispatch validation | IMPLEMENTED AND TESTED | Server-side role/verification checks, supplier/RFQ quote uniqueness, private draft filtering, organisation-scoped inventory, quotation validation and dispatch tests are in place. Stock availability is a supplier-entered quote assertion, not a reservation or external stock verification. |
| Distributor D acceptance journey | IMPLEMENTED AND TESTED | Integration tests cover registration/verification, RFQ access, draft privacy, quote submit/revision/no-bid, inventory imports/adjustments, fulfilment, role permissions and inquiry scoping. There is no manual browser run of every listed journey. |
| Retailer A1–A9/A11/A13/A14: overview, RFQs, local quotes, inventory, alerts, offline drafts, fulfilment, reports/team/profile/ads | IMPLEMENTED AND TESTED / PARTIALLY IMPLEMENTED | API tests exercise RFQ and quote states, inventory ISBN/quantity validation, import/export, low-stock values, fulfilment, reports/team and private ad inquiries. Offline quote drafts are stored locally in the browser and resume only while the RFQ remains available; network-disconnect/reconnect and cross-device recovery are not tested or provided. |
| Retailer A10/B5: repeat lists and repeat ordering | MISSING | The navigation shows an explanatory unavailable state; no repeat-list model or workflow was found. |
| Retailer B1–B3/B6/B9/B11: POS, sales ledger, credit, store inventory, quota enforcement, local reconciliation | NOT APPLICABLE / MISSING / PARTIALLY IMPLEMENTED | POS, ledger, credit, and quota enforcement are not in the implemented commercial workflow and must not be implied by analytics. Multi-store stock and local fulfillment reconciliation are absent. |
| Retailer B4/B7/B8/B10: conflict-safe offline sync, freshness, supplier authorization, offline recovery/idempotency | PARTIALLY IMPLEMENTED | Browser-local quote draft save/resume, 30-day stock freshness alerts, server-side quote uniqueness and supplier verification checks exist; there is no conflict-safe synchronization, draft recovery after storage loss, or supplier territory authorization. |
| Retailer C/D acceptance | PARTIALLY IMPLEMENTED | RFQ access, local quote drafts/submission, inventory updates/import-export, stock alerts, fulfilment, reports and permissions have API coverage. The requested safe offline network-loss test and every UI action have not been exercised manually. |
| Publisher A1–A13: catalogue, ISBN/editions, session mapping, price history, import/export, review/correction/withdrawal, demand, team/profile/notifications | IMPLEMENTED AND TESTED / PARTIALLY IMPLEMENTED | Publisher catalogue draft/submit/moderation, duplicate ISBN rejection, row-level bulk import, draft status, public visibility after approval, correction/resubmission, price history, withdrawal review, privacy-filtered demand and team/profile APIs are tested. In-app notifications exist; durable delivery and complete engagement/turnaround reporting are absent. |
| Publisher B1/B3/B5/B8–B10: distributor territories, edition supersession, safe import preview/rollback, data quality, review turnaround, engagement reports | MISSING / PARTIALLY IMPLEMENTED | ISBN uniqueness, completeness validation and price history exist; no territory network, explicit supersession workflow, import preview/rollback, quality dashboard, review SLA, or engagement report exists. |
| Publisher C/D rules and acceptance | IMPLEMENTED AND TESTED / PARTIALLY IMPLEMENTED | Tests prove imported records stay drafts and are not public until approved; required metadata, ISBN uniqueness, effective-date history, withdrawal review, and aggregate demand thresholds are enforced. Publisher workflow has API tests, not a full manual browser acceptance run. |
| Other authorised user A1–A5: profile, book suggestions, notifications, activity, authorized inquiries | IMPLEMENTED AND TESTED / PARTIALLY IMPLEMENTED | Own profile, reviewed book suggestions, user-scoped audit and organization-scoped advertiser inquiries exist. Notifications are persisted in-app; delivery retries are absent. |
| Other user B1–B7: eligibility, permission request/status, organisation relationship, approved role change, closure/data requests, denied navigation | PARTIALLY IMPLEMENTED / MISSING | Generic role restrictions and organization ownership are enforced server-side and tested; no permission-request/status workflow, self-service role-change approval, account-closure, or personal-data request workflow exists. Access-denied API tests exist; all navigation/error states are not manually tested. |
| Admin A1–A13: overview, verification, moderation, exceptions, disputes, support, blog/ads, audit, academic config, health, backup | IMPLEMENTED AND TESTED / PARTIALLY IMPLEMENTED | Integration tests cover account decisions, catalogue moderation/withdrawal, RFQ/orders/disputes, support status, blog/advertisement flows, searchable audit, export, backup integrity and isolated restore. Academic configuration, fine-grained permission editing and advanced health monitoring deliberately display unavailable states. |
| Admin B/C/D: privileged authorization, decision rationale, recovery, evidence, monitoring and support operations | PARTIALLY IMPLEMENTED | Server-side Admin role checks and protection against user role tampering are tested. Admin decisions require a rationale of at least 10 characters. Required MFA, local audit-chain verification, and territory APIs are implemented with scoped tests; production MFA key custody, lost-code recovery, remote append-only logs, off-site backups, monitoring, support assignment/escalation and dispute evidence remain absent or blocked. Tests cover privileged denial and isolated restore; not every Admin action was manually exercised. |

## Audit execution evidence

- `node --check app.js` — passed.
- `node --check server.js` — passed.
- `node --check dashboard.js` — passed.
- `node --check test/workflows.test.js` — passed.
- `npm.cmd test` — 11 tests passed (6 unit/quality tests plus 5 integration groups), 0 failed, 0 skipped.
- Current browser smoke check tested `/`, `/catalog`, and `/dashboard` at 10
  viewport widths from 320 to 1920 pixels (30 checks); all responses were 200,
  with no measured horizontal overflow, page exceptions, console errors, or
  failed requests. This was viewport emulation, not physical-device testing.
- School workflow regression coverage includes unverified supplier inbox/dashboard denial,
  missing academic-field rejection, RFQ publication/PO separation, material RFQ audit,
  and RFQ/order/dispute visibility after a fresh login.
- Cross-dashboard regression coverage includes quote revision uniqueness/history,
  organisation-scoped inventory, publisher draft visibility, and required rationale for
  privileged account/catalogue decisions.
- The configured suite uses Node's built-in test runner and an isolated temporary data directory.
- The restore regression test writes only to that temporary test directory, verifies
  the pre-restore safety backup, confirms a post-backup record is removed, and checks
  the persisted restore audit event.
- Catalogue tests verify search, ascending price/title sort order, page-size/page
  boundaries, and rejection of invalid page numbers.
- Authentication tests verify no session cookie on invalid credentials, password
  hashes (not plaintext passwords) in the isolated store, role-tampering resistance,
  password reset through the test SMTP server, reset expiry/reuse denial, session
  invalidation after reset/logout/suspension/restart, owner-wide staff session
  revocation, invitation expiry/revocation/reuse denial, SMTP failure handling, and
  no reset success claim when SMTP is unconfigured.
- Browser smoke check on `/catalog` verified the rendered title, canonical URL,
  accessible catalogue-search label, polite live-results region, nine rendered
  result cards, and no horizontal overflow at a 375px viewport.
- Public-site browser sweep checked 12 public routes, internal link destinations,
  11 in-page/cross-page fragment links, no browser page exceptions, and 48 viewport
  combinations across 320px, 375px, 768px, and 1280px with no horizontal overflow.
- Contact and registration browser checks verified required-field blocking,
  associated labels for required support fields, and a labelled modal dialog with
  all registration inputs labelled.
- Password recovery browser checks verified the login-modal link, labelled request
  and confirmation forms, explicit SMTP-unconfigured feedback, noindex/canonical
  metadata, and visible recovery guidance when a reset token is invalid.
- No production data migration or reset was performed.
- The VS Code test controller did not discover the test file; `npm.cmd test` was used as configured.

## Audit deliverables

- [Website audit report](./WEBSITE_AUDIT_REPORT.md)
- [Feature test matrix](./FEATURE_TEST_MATRIX.csv)
- [API test report](./API_TEST_REPORT.md)
- [Responsive test report](./RESPONSIVE_TEST_REPORT.md)
- [E2E test report](./E2E_TEST_REPORT.md)
- [Implementation changelog](./IMPLEMENTATION_CHANGELOG.md)
- [Release readiness](./RELEASE_READINESS.md)

The CSV is a workflow-level matrix, not an exhaustive row for every UI control,
conditional action, or API validation permutation. That full inventory remains
not tested and is disclosed in the audit report.

## Known project-level limitations

The application uses a single-process Node.js HTTP server and local JSON persistence.
The documented production blockers include reliable SMTP delivery for password
recovery, email ownership verification, production MFA key custody and lost-code
recovery, durable sessions/shared session store, production database, document
KYC, account-closure/data-request workflows, multiple campuses/warehouses,
configurable multi-level approvals, payment processing, POS/credit, dispute
attachments, conflict-safe offline synchronization, robust monitoring, remote
append-only audit storage, and off-site backup.

## Audit retest update — 2026-10-24

This section supersedes earlier statements that profile/notification UI work
had not been exercised:

- **Profile form:** removed duplicate `state` controls for non-school profiles
  and bound the existing profile submit handler in the dashboard. The isolated
  Distributor browser form now sends `PATCH /api/profile`; the stored state was
  read back from `/api/dashboard`. Distributor, Retailer and Publisher profile
  state persistence also has integration coverage.
- **Notifications:** dashboard responses are scoped to the current user and
  shared organization-owner notices. Read state is persisted per user; marking
  the staff copy read does not mark the owner's copy read. API regression and
  browser UI journeys pass.
- **Publisher demand:** the integration suite now tests two distinct schools
  with repeated RFQs (hidden), followed by the third distinct school (shown
  without school or RFQ identifiers).
- **Retailer offline quote:** browser network emulation verified local draft
  storage, listing and deletion without a server-side quote. This does not add
  conflict-safe sync; drafts remain browser-local.
- **Publisher moderation:** a browser-submitted title remained private pending
  review, was approved by Admin with a rationale, and appeared through the
  public catalogue API afterward.
- **Responsive:** all visible sections for six roles were opened at ten
  requested viewport sizes (760 combinations); 14 public/account-help routes
  were checked at those sizes (140 combinations). These are viewport emulation
  results, not physical-device or accessibility certification.

The current workflow matrix has 84 unique feature records and 16 columns
(43 PASS, 8 PARTIAL, 15 MISSING, 3 FIXED - RETEST PASS, 10 NOT TESTED, and
5 BLOCKED). The original 37 non-pass records remain tracked; a separate new
Admin territory inventory row is also open. Each carries a classification, severity,
dependency/decision, and verification method. It remains grouped, not a test
row for every field, button, table action, modal, conditional workflow, or
malformed input. The control-level test inventory and release blockers remain
open.

## QA and security retest — 2026-10-24

- A concurrent-registration race was reproduced in isolated storage: eight
  same-email registration requests all returned success because uniqueness was
  checked before async password hashing. The server now checks again
  synchronously before insert. Regression evidence: one 201, seven 409
  responses, and exactly one persisted identity.
- Twelve simultaneous independent support writes on the single test server
  all persisted. This covers the in-process write queue and atomic replacement
  only; multi-process writes, crash recovery, and storage failure injection
  remain unverified.
- MFA regression tests cover privileged enrollment, server-side gating,
  recovery-code single use, replay denial, rate limiting, and optional MFA
  enrollment/disable. The browser role sweep completed required MFA enrollment.
- Supplier-territory API regression tests cover explicit exact matching,
  fail-closed missing locations, direct RFQ/quotation denials, and
  reasoned expiring single-RFQ exception grant/revocation.
- Local audit hash-chain/HMAC verification detects tested alterations. Tests
  also verify stored chains after territory actions and backup restore; the
  JSON store/key are not a remotely protected or tamper-proof production sink.
- Playwright scripts now test 14 public/account-help routes at ten viewport
  sizes, all six supported role logins/section navigation/logout, and 760
  dashboard section/viewport combinations using isolated synthetic accounts.
  These are viewport emulations, not physical-device testing.
- axe-core WCAG 2.0/2.1 A/AA sampling covers four public pages and six role
  dashboard overview pages. Initial serious contrast findings were fixed in
  the theme and retested with no serious/critical findings. Keyboard,
  screen-reader, zoom, other component states, and physical assistive
  technology remain untested.
- `npm run build` is syntax and matrix verification, not a compiled artifact.
  Biome lint is configured; the final run passed with four complexity warnings
  and one informational suggestion. Six unit tests cover CSV, MFA and audit
  utilities; five integration groups cover role/API workflows.
- Type-checking is not applicable to this JavaScript project as currently
  authored; no nominal-success placeholder command was added.
- Production MFA recovery/key custody, authoritative territory data,
  remote signed/append-only audit infrastructure, off-site
  recovery, legal review, and production verification remain dependent on
  owner-approved policy or external infrastructure. See the 37 matrix records.

## Follow-up retest — MFA, territory and audit integrity

- Privileged accounts now require MFA. Isolated tests cover TOTP enrollment,
  session gating, replay and recovery-code reuse rejection, rate limiting,
  optional MFA enrollment/disable, and role UI login. Production key management
  and authorized recovery after loss of all codes remain blockers.
- Supplier RFQ eligibility now requires explicit exact-match configured
  territories. API tests cover allowed/denied listings, direct quote access and
  submission, missing locations, scoped exception grant/revocation, and audit
  verification. The Admin form itself has not been submitted through the
  browser; manually configured locations are not authoritative geography data.
- Audit events are SHA-256 chained, or HMAC-SHA256 when a key is supplied.
  Event snapshots are cloned before hashing; tests verify tampering detection
  and persisted chains after territory actions and backup restore. No managed
  KMS or remote append-only destination is approved. This is not a claim of
  tamper-proof production logging.
- Off-site backup was not configured or exercised; local backup/restore remains
  the only tested recovery path. Production, physical-device, and legal review
  checks remain not performed.

## Follow-up retest — MFA, territory and audit integrity

The implementation was extended after the owner supplied the policy decisions.
This is local isolated-test evidence; it does not supersede production blockers.

- **MFA:** Admin and organisation owners/elevated permission holders must enroll
  TOTP before protected access. The enrollment secret is AES-256-GCM encrypted
  using `GOERUDITE_MFA_ENCRYPTION_KEY`; recovery-code hashes are stored, codes
  are single-use, accepted TOTP counters cannot be replayed, and verification
  attempts are rate-limited. Integration tests verify required/optional roles,
  protected API denial, replay denial, code reuse denial and enrollment rate
  limiting. Playwright exercised enrollment/login for the six supported roles.
  A managed production secret provider and authorized process for users who
  lose every recovery code are not implemented.
- **Supplier territory:** only verified, active Distributor/Retailer
  organizations with an exact explicitly configured service area can discover
  or quote on an RFQ. Missing delivery location fails closed. Tests cover
  allowed/disallowed locations, direct quote access/submission, Admin-only
  configuration, scoped exception grant/revocation and audit verification.
  Admin-entered location strings are not validated against an authoritative
  geography provider. A manually configured exact-match system does not itself
  establish real-world serviceability.
- **Audit integrity:** new audit records use SHA-256 chaining or HMAC-SHA256 when
  `GOERUDITE_AUDIT_HMAC_KEY` is configured. Event snapshots are cloned before
  hashing, and backup restore also appends an integrity record. Unit tests
  verify tamper detection; integration tests verify the persisted chain after
  territory operations and restore. Local-only keys do not protect against an
  operator able to rewrite both store and key, and integrity failures fail
  verification rather than repairing history. No managed key lifecycle or
  remote restricted/append-only log destination is approved.
- **Local recovery:** the existing local backup/restore path is regression-tested
  with an integrity-chain check after restore. No backup was sent off-site.
  Retention, encryption policy, RPO/RTO, destination and recovery operator
  still require approval.
- **Tests:** latest integration results must be read from
  `API_BACKEND_TEST_REPORT.md` and the top-level feature matrix. Browser
  viewport emulation is not physical-device testing; no production service or
  production data was used.
