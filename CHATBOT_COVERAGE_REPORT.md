# GoErudite Help Chat — Coverage Report

Assessment date: 2026-10-25

## Inventory summary

- Structured articles: **26**
- Supported authenticated roles: **6** (School, Distributor, Retailer, Publisher, Admin, Other)
- Anonymous/public help context: **supported**
- Languages: **English and Hindi** for interface, suggestions, fallbacks, and article response fields
- Core dependency on paid AI: **none**
- Durable conversation history: **none**

## Coverage by role

| Role | Included verified help modules | Important limitations called out |
|---|---|---|
| Public / unauthenticated | Login, password recovery, profile/support guidance, public catalogue search, unavailable-feature guidance | No private account inspection; password reset needs SMTP |
| School | Public/shared help plus academics, student strength, requirement imports, RFQ lifecycle, quote comparison, approvals/PO, fulfilment/receipt/disputes, reports/history | Multi-campus, configurable approval matrix, dispute attachments and accounting reconciliation are not presented as available |
| Distributor | Public/shared help plus territory eligibility, RFQ inbox, quotations/no-bid/revisions, inventory/import/export, orders/fulfilment | Inventory reservation, authoritative geography, payment and multi-warehouse operations are not implied |
| Retailer | Distributor supplier topics plus stock alerts, offline drafts and fulfilment | Offline drafts are browser-local and not synced; repeat lists, POS and credit are unavailable |
| Publisher | Public/shared help plus catalogue/ISBN/edition/MRP, imports, corrections, moderation, withdrawal and demand summaries | MRP is not an offer; full edition lifecycle and distributor network controls are unavailable |
| Admin | Public/shared help plus organisation review, catalogue moderation, territory configuration, exceptions/disputes, support, blog/ads, audit, backup/restore, limited health | Off-site backup, production monitoring/keys, remote append-only audit, permission editor, academic configuration and payment are unavailable/blocked |
| Other | Public/shared help plus role-limited profile, book suggestions and permissions | School RFQs, supplier quotes, POs, and Admin access are explicitly excluded |

## Known requirements not fully covered

- Error-specific troubleshooting exists for documented workflows and backend rules, not every possible application error code, browser/network failure, or malformed payload.
- Every inventory/control row and every field validation permutation is not represented as a separate article.
- No automated tests cover all article answers on the rendered UI for all six roles; backend role filtering and representative browser interactions are tested.
- No browser test asserts every article's navigation destination; destination choices are restricted by code to same-origin routes.
- The entire site is not translated. A global website-language selector does not currently exist.
- Physical devices, production SMTP/hosting, assistive-technology devices and production rate limiting were not tested.
- The knowledge base must be maintained when dashboard labels, API rules, or feature status changes.
