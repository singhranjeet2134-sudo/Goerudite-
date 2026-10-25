# GoErudite Frontend Architecture

The GoErudite frontend is a responsive, lightweight, single-page application (SPA) built with pure semantic HTML5, modern vanilla CSS, and vanilla JavaScript—free of heavy framework overhead or complex bundlers. It renders both the public marketplace portal and role-based operational dashboards.

---

## Directory Structure

```
frontend/
├── index.html        # Main HTML shell, SEO/meta tags, public layout, and modal mounts
├── styles.css        # Unified design system, responsive grid, theme variables, and component styles
├── app.js            # Public SPA router, auth forms, catalog explorer, and public workflows
├── dashboard.js      # Role-based workspace dashboards (School, Distributor, Retailer, Publisher, Admin, Other)
├── support-chat.js   # Floating bilingual (English/Hindi) knowledge-base help assistant widget
├── favicon.svg       # Platform SVG icon
└── README.md         # Frontend architecture documentation
```

---

## Core Components & Modules

### 1. [`index.html`](./index.html)
- Serves as the single-page application entry point.
- Dynamic server-side SEO metadata injection (canonical URLs, OpenGraph, Twitter cards) performed dynamically by the backend for routes like `/catalog`, `/book/:id`, `/blog/:slug`, and `/solutions`.
- Mount points for `#app-root`, `#auth-modal`, and `#support-chat-root`.

### 2. [`styles.css`](./styles.css)
- Zero-dependency design system using standard CSS custom properties (variables) for consistent colors, spacing, elevation, and typography.
- Mobile-first, fully responsive layouts supporting viewports from 320px mobile to ultra-wide displays.
- Accessibility-focused focus rings, high contrast states, and screen-reader utilities.

### 3. [`app.js`](./app.js)
- **Client-Side Routing**: Listens to `popstate` and anchor clicks to navigate between public views without full page reloads:
  - `/` — Homepage & featured academic catalogue
  - `/solutions` — Role-specific academic procurement workflows
  - `/pricing` — Platform fee tiers and transparency
  - `/about`, `/trust`, `/help` — Organization profile, platform rules, compliance, and FAQs
  - `/catalog` & `/book/:id` — Live book search, filters (board, medium, class), and RFQ entry
  - `/blog` & `/blog/:slug` — Published articles
  - `/advertisements` & `/advertisements/:id` — Sponsored listings and school inquiry workflow
  - `/contact` — Support ticket submission
  - `/forgot-password` & `/reset-password/:token` — Secure recovery flows
- **Authentication Modals**: Unified sign-in and registration forms with role selection, password strength requirements, and MFA challenge modals.
- **State Management**: Subscribes to `/api/auth/me` to determine user verification status, roles, and header navigation states.

### 4. [`dashboard.js`](./dashboard.js)
Provides dedicated workspace interfaces for the 6 authenticated roles:
- **School Dashboard**: Class-wise student strength, RFQ draft/publication, supplier quotation comparison, two-person purchase order (PO) approval flows, order dispatch & dispute tracking.
- **Distributor Dashboard**: Wholesale RFQ inbox, quotation builder with minimum order quantities and pack rules, inventory management with CSV/XLSX import/export, and PO fulfillment.
- **Retailer Dashboard**: Local/nearby RFQ opportunities, local delivery quotation builder, ISBN lookup, stock alerts, and browser-local draft quotes.
- **Publisher Dashboard**: Master book catalogue management, edition/session views, dated MRP revision history, and CSV/XLSX bulk imports.
- **Administrator Dashboard**: Account verification queue (with minimum 10-character review reasons), catalogue moderation, blog publishing suite, advertisement campaign management, cryptographic audit trail verification, and database backup/restore controls.
- **Other User Dashboard**: Scoped profile updates and book suggestion submissions.

### 5. [`support-chat.js`](./support-chat.js)
- Floating customer support widget offering instant answers in both **English** and **Hindi**.
- Connects directly to `GET/POST /api/help/chat`.
- Localized language auto-detection based on user browser locale.
- Strictly privacy-preserving: does not access private business databases or store user chats.

---

## Communication with Backend

All frontend requests connect to the same-origin backend (`/api/...`):
- **Authentication**: Stateful HTTP-only cookies (`SameSite=Lax`, `Secure` in production).
- **CSRF Protection**: All state-changing API requests (`POST`, `PUT`, `PATCH`, `DELETE`) pass strict origin and `Sec-Fetch-Site` checks.
- **Bulk Uploads**: Supports multipart/base64 XLSX and CSV files bounded at 240 KB and 5,000 rows.
