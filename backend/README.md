# GoErudite Backend Architecture

The GoErudite backend is built directly on native Node.js (`node:http`) without third-party web frameworks (such as Express or Fastify), ensuring high throughput, deterministic memory limits, and complete auditability.

---

## Directory Structure

```
backend/
├── server.js            # Monolith HTTP server, REST routing, auth, static serving, and data persistence
├── mfa.js               # Multi-Factor Authentication (TOTP), AES-256-GCM encryption & recovery codes
├── audit-integrity.js   # Cryptographic hash-chaining (SHA-256 / HMAC-SHA256) for tamper-evident audit logs
├── help-engine.js       # Query normalizer, keyword scoring, role filtering, and chatbot response engine
├── help-knowledge.js    # 26 verified bilingual (English & Hindi) help articles & metadata
└── README.md            # Backend architecture documentation
```

---

## Core Modules & Responsibilities

### 1. [`server.js`](./server.js)
The core monolith controller responsible for:
- **HTTP Server**: Serves API endpoints under `/api/*` and acts as the static asset server for the frontend (`frontend/index.html`, `frontend/styles.css`, `frontend/*.js`).
- **Dynamic SEO Prerendering**: Injects canonical tags, OpenGraph data, and title tags into `index.html` on public routes before delivery.
- **Session Lifecycle**: In-memory, cookie-backed sessions (`HttpOnly; SameSite=Lax; Secure`) expiring in 7 days by default (configurable via `GOERUDITE_SESSION_TTL_MS`).
- **Security Middleware**:
  - CSRF rejection on state-changing requests with mismatched origins or `Sec-Fetch-Site: cross-site`.
  - Comprehensive Content Security Policy (CSP), Referrer Policy, and clickjacking protection (`X-Frame-Options: DENY`).
  - Brute-force throttling per IP and email for login and password recovery.
- **Data Persistence**:
  - Thread-safe write queue committing state to `data/store.json`.
  - Atomic file writing via temporary files (`.tmp`) and `fs.rename` to prevent database corruption.
  - Automated blog publishing via in-process 15-second cron polling.

### 2. [`mfa.js`](./mfa.js)
- Implements RFC 6238 TOTP authenticator verification with 1-step window tolerance and replay rejection.
- Symmetrically encrypts TOTP secrets in database records using **AES-256-GCM** with 96-bit random initialization vectors (IVs) and authentication tags.
- Requires `GOERUDITE_MFA_ENCRYPTION_KEY` (a 64-character hexadecimal key / 32 bytes).
- Generates 10 single-use, cryptographically hashed SHA-256 recovery backup codes.

### 3. [`audit-integrity.js`](./audit-integrity.js)
- Implements a tamper-evident hash chain across all critical platform actions (account reviews, PO approvals, quote adjustments, role changes).
- Each new audit record seals the previous event hash.
- Uses **HMAC-SHA256** when `GOERUDITE_AUDIT_HMAC_KEY` is configured, preventing unauthorized modification by local operators.

### 4. [`help-engine.js`](./help-engine.js) & [`help-knowledge.js`](./help-knowledge.js)
- Powers the customer support chatbot without external paid AI dependencies.
- Normalizes Unicode text, removes diacritics, and handles Hinglish/Hindi transliterations.
- Scores questions against canonical aliases and keywords and returns localized, role-authorized solutions.

---

## Environment Variables

| Variable | Type | Description |
| :--- | :--- | :--- |
| `PORT` | Integer | HTTP listening port (Default: `3000`). |
| `NODE_ENV` | String | Set to `production` to enforce secure cookies. |
| `GOERUDITE_PUBLIC_URL` | URL | Canonical origin (e.g., `https://example.com`) without trailing slash. |
| `GOERUDITE_FRONTEND_DIR` | Path | Custom path to static frontend assets (Defaults to `../frontend`). |
| `GOERUDITE_DATA_DIR` | Path | Directory containing `store.json` and backups (Defaults to `../data`). |
| `GOERUDITE_ADMIN_KEY` | Secret | One-time bootstrap secret key for the first administrator account. |
| `GOERUDITE_MFA_ENCRYPTION_KEY` | 64-hex | 32-byte hexadecimal key for AES-256-GCM MFA encryption. |
| `GOERUDITE_AUDIT_HMAC_KEY` | 64-hex | 32-byte hexadecimal key for HMAC-SHA256 audit chaining. |
| `GOERUDITE_SESSION_TTL_MS` | Integer | In-memory session lifetime in ms (Default: `604800000`). |
| `GOERUDITE_SMTP_HOST` | Hostname | SMTP server hostname. |
| `GOERUDITE_SMTP_PORT` | Integer | SMTP port (Default: `587`). |
| `GOERUDITE_SMTP_USER` | String | SMTP account username. |
| `GOERUDITE_SMTP_PASS` | Secret | SMTP password / API key. |
| `GOERUDITE_SMTP_FROM` | String | Sender address header (e.g. `GoErudite <invites@example.com>`). |
| `GOERUDITE_SMTP_SECURE` | Boolean | Set `true` for port 465 (implicit TLS). |
| `GOERUDITE_SMTP_REQUIRE_TLS` | Boolean | Set `true` to require STARTTLS. |
| `GOERUDITE_INSTAGRAM_URL` | URL | Full HTTPS Instagram profile URL. |
| `GOERUDITE_LINKEDIN_URL` | URL | Full HTTPS LinkedIn company URL. |
