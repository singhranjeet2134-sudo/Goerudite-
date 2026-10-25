# School Dashboard Test Report

Date: 2026-10-24

## Status

**PARTIALLY TESTED** — role login, all visible sections at ten emulated viewport sizes, and RFQ/quotation workflows were exercised. The complete field/action/error-state inventory was not manually tested.

## Browser-verified workflow

On an isolated server, a verified synthetic School account:

1. Created and saved an RFQ draft through the dashboard UI.
2. Published the RFQ after providing academic requirements. The create and publish API responses succeeded.
3. Later saw the submitted Distributor quotation in the comparison page.
4. Still saw the RFQ/quotation after a page refresh and a fresh login.

The matching eligible Distributor could see the published RFQ. The School could not see the Distributor's saved private quotation draft; after the Distributor submitted the quote, it became visible to the School. This confirms the tested privacy transition for this workflow.

A second synthetic School created and published an RFQ that was visible to a verified Retailer. Profile API tests confirm academic session and class counts persist. The profile screen's state field is now unique and uses its existing PATCH handler; the Distributor UI path was used to reproduce and retest the same shared form.

## Additional automated coverage

`npm.cmd test` passed all five integration groups. The suite includes backend checks for academic-field validation, RFQ lifecycle and persistence, explicitly configured supplier territory eligibility and scoped exceptions, quotation privacy and revisions, distinct approvers/self-approval restrictions, PO and fulfilment transitions, receipt quantity bounds, and dispute workflows.

## Gaps

Every profile field, import variant, approval configuration, report/export, notification, permission, attachment, campus, and error state was not manually tested in the browser. Multiple campuses, evidence attachments, repeat-order templates, configurable approval matrices, and complete reconciliation remain absent or incomplete per `RELEASE_READINESS.md`.
