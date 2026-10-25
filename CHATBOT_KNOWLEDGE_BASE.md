# GoErudite Help Chat — Knowledge Base

Assessment date: 2026-10-25

The code contains **26 structured bilingual help articles** in `help-knowledge.js`. Each article has a unique ID, English/Hindi title and answer fields, supported roles, aliases and keywords, an internal route, preconditions, ordered steps, expected result, known limitation and escalation guidance. The articles were checked against the current frontend/backend behavior and project feature registry; they describe limitations instead of presenting unavailable sections as working.

## Articles and role coverage

| Article ID | Supported roles | Related route |
|---|---|---|
| `account-login` | Public, School, Distributor, Retailer, Publisher, Admin, Other | `/dashboard` |
| `organisation-verification` | School, Distributor, Retailer, Publisher, Admin, Other | `/dashboard` |
| `password-recovery` | Public, School, Distributor, Retailer, Publisher, Admin, Other | `/forgot-password` |
| `profile-notifications-support` | Public, School, Distributor, Retailer, Publisher, Admin, Other | `/contact` |
| `catalogue-search` | Public, School, Distributor, Retailer, Publisher, Admin, Other | `/catalog` |
| `school-academics-students` | School | `/dashboard` |
| `school-requirements-import` | School | `/dashboard` |
| `school-rfq-publish` | School | `/dashboard` |
| `school-quotes-compare` | School | `/dashboard` |
| `school-approval-orders` | School | `/dashboard` |
| `orders-dispatch-receipt-dispute` | School, Distributor, Retailer, Admin | `/dashboard` |
| `school-reports-history` | School | `/dashboard` |
| `supplier-rfq-eligibility` | Distributor, Retailer | `/dashboard` |
| `supplier-quotes` | Distributor, Retailer | `/dashboard` |
| `supplier-inventory-fulfilment` | Distributor, Retailer | `/dashboard` |
| `retailer-alerts-offline` | Retailer | `/dashboard` |
| `publisher-catalogue` | Publisher | `/dashboard` |
| `publisher-review-demand` | Publisher | `/dashboard` |
| `other-user-help` | Other | `/dashboard` |
| `admin-accounts` | Admin | `/dashboard` |
| `admin-catalogue` | Admin | `/dashboard` |
| `admin-territories` | Admin | `/dashboard` |
| `admin-rfq-disputes` | Admin | `/dashboard` |
| `admin-support-blog-ads` | Admin | `/dashboard` |
| `admin-audit-backup-system` | Admin | `/dashboard` |
| `unavailable-features` | Public and all supported roles | `/contact` |

## Covered topics

- General: navigation/account access, organisation verification, password reset, profile, notifications, support, public catalogue search.
- School: academic setup, class strength, requirements and CSV/XLSX imports, RFQ validation and publication, supplier quote privacy/comparison, two-person PO approval, fulfilment, receipt, disputes, history and exports.
- Distributor: supplier verification/territory eligibility, RFQ inbox, quote drafts/submission/no-bid/revisions, inventory import/export, ISBN search and fulfilment.
- Retailer: nearby RFQs and quotations, inventory and alerts, browser-local offline drafts and their lack of automatic synchronization.
- Publisher: catalogue and dated MRP data, ISBN/edition, imports, corrections, Admin review, withdrawal requests and privacy-thresholded demand.
- Admin: organisation review, catalogue moderation, territory exceptions, RFQ/dispute oversight, support, blog/advertisement management, audit, local backup/restore and limited system health.
- Other: role-limited profile, catalogue suggestions and assigned access.
- Unavailable features: explicit guidance for fine-grained permissions, repeat lists, configurable academic master data, Publisher distributor-network controls, global site language, and automatic offline sync.

## Matching examples represented in article aliases

- English: “How do I publish an RFQ?”, “Forgot password”, “CSV upload error”, “How to submit quotation”.
- Hinglish: “RFQ publish nahi ho rahi”, “Quotation kaise bheje”, “Dashboard nahi khul raha”.
- Hindi script and Unicode normalization are supported by the matcher; current article answers are bilingual, with Hindi answers primarily in Romanized Hindi and common English product terms.

Suggestions are generated from localized article titles after filtering by the server-derived role. An unknown question receives a clarification prompt and Contact Support route rather than an invented answer.
