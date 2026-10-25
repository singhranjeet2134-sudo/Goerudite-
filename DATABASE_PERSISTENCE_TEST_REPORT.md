# Database and Persistence Test Report

Date: 2026-10-24

## Storage design observed

The application persists business data as JSON in `data/store.json` by default. The isolated browser audit used a separate temporary data directory; the integration suite also uses temporary stores. Application sessions are held in memory and are invalidated when the server restarts.

## Persistence evidence

- Automated integration tests verify persistence across fresh reads/logins for RFQs and other business records, plus isolated backup/restore behavior.
- In the browser flow, the School-created RFQ remained visible after a page refresh and fresh login.
- A submitted Distributor quote remained visible in the School comparison page after refresh and fresh login.
- A private Distributor draft remained absent from the School quote API/UI before submission.
- A Distributor profile state value was saved through the profile PATCH and returned by a fresh dashboard read.
- A shared School notification marked read by an invited staff member retained a staff-specific `readBy` timestamp; the owner's notification remained unread. The integration test read back the persisted JSON-store record.
- A Retailer unsent quote draft created while browser network emulation was offline stayed in browser storage, appeared in Offline Drafts, and created no server quote. It was deleted and confirmed absent from browser storage.
- Concurrency regression: eight concurrent registrations for one synthetic email now produce one accepted account and seven conflict responses; the isolated JSON file contains exactly one user for that email.
- Twelve independent concurrent support writes on the same server all returned success and all record IDs were present after reading the isolated store from disk.
- The isolated audit integrity API verified the persisted HMAC chain after supplier territory changes and again after backup restore; a utility regression confirmed audit snapshots do not retain mutable caller-owned objects.

Latest `npm.cmd test`: **PASS**, 11 tests (six unit/quality tests plus five integration groups), zero failures, zero skipped. `npm.cmd run test:storage` also passed its isolated procurement/moderation persistence workflow. Tests use generated test-only HMAC/encryption keys and temporary stores.

## Limitations and risk

The JSON store is not a relational database. The tested in-process write queue and atomic rename do not guarantee multi-process transaction safety, crash recovery, disk-full handling or rollback of partially applied memory mutations. A concurrent duplicate-email bug was reproduced and fixed with a final synchronous uniqueness check; it was retested through HTTP and persisted data. Audit chaining detects modified local records when the required verification key is available, but local storage and a local key are not tamper-proof against a privileged operator; key management and remote append-only retention are not configured. No multi-process/fault-injection test was run. No destructive migration or off-site upload was performed. The normal `data/store.json` was not used for writes. Production storage selection, migration/rollback, approved off-site backup, retention and recovery objectives require approval and isolated testing before release.
