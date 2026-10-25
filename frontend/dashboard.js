(() => {
  const ROLE_DETAILS = {
    school: { label: "School buyer", icon: "▥", title: "School procurement", sections: [["overview", "Overview"], ["profile", "School profile"], ["academic", "Academic session"], ["students", "Student strength"], ["requirements", "Book requirements"], ["book-submissions", "Suggest a book"], ["rfqs", "My RFQs"], ["quotes", "Compare quotations"], ["approvals", "Approval workflow"], ["orders", "Purchase orders"], ["archive", "History & archive"], ["team", "Team & permissions"], ["reports", "Reports"], ["notifications", "Notifications"]] },
    distributor: { label: "Wholesale supply", icon: "▤", title: "Distributor workspace", sections: [["overview", "Overview"], ["opportunities", "RFQ inbox"], ["quote-builder", "Quotation builder"], ["quotes", "Quote history"], ["inventory", "Inventory & stock import"], ["book-submissions", "Suggest a catalogue book"], ["ad-inquiries", "Ad quote inquiries"], ["orders", "Fulfilment readiness"], ["analytics", "Business analytics"], ["team", "Team & permissions"], ["profile", "Business profile"], ["notifications", "Notifications"], ["audit", "History & audit"]] },
    retailer: { label: "Local supply", icon: "▰", title: "Retailer workspace", sections: [["overview", "Overview"], ["opportunities", "Nearby RFQs"], ["quote-builder", "Local quotations"], ["quotes", "Quote history"], ["inventory", "Inventory & ISBN search"], ["book-submissions", "Suggest a catalogue book"], ["ad-inquiries", "Ad quote inquiries"], ["stock-alerts", "Stock alerts"], ["offline-drafts", "Offline drafts"], ["orders", "Local fulfilment"], ["analytics", "Stock & purchase reports"], ["repeat-lists", "Enquiries & repeat lists"], ["team", "Team & permissions"], ["profile", "Business profile"], ["notifications", "Notifications"], ["audit", "History & audit"]] },
    publisher: { label: "Catalogue owner", icon: "▤", title: "Publisher workspace", sections: [["overview", "Overview"], ["catalogue", "Master catalogue"], ["editions", "Editions & ISBNs"], ["sessions", "Session mapping"], ["price-lists", "Price lists"], ["network", "Distributor network"], ["corrections", "Catalogue review"], ["ad-inquiries", "Ad quote inquiries"], ["demand", "Demand analytics"], ["team", "Team & permissions"], ["profile", "Publisher profile"], ["notifications", "Notifications"], ["audit", "Change history"]] },
    admin: { label: "Platform administration", icon: "◈", title: "Platform control centre", sections: [["overview", "Platform overview"], ["verification", "Account verification"], ["permissions", "Roles & permissions"], ["territories", "Supplier territories"], ["catalogue-review", "Catalogue moderation"], ["rfq-monitor", "RFQ exceptions"], ["disputes", "Dispute centre"], ["support", "Support cases"], ["blogs", "Blog management"], ["advertisements", "Advertisement management"], ["audit", "Audit & exports"], ["academic-config", "Academic configuration"], ["system-health", "System health"], ["backup", "Backup & recovery"]] },
    other: { label: "Platform member", icon: "♙", title: "Account workspace", sections: [["overview", "Overview"], ["book-submissions", "Suggest a book"], ["ad-inquiries", "Ad quote inquiries"], ["profile", "Organisation profile"], ["notifications", "Notifications"], ["audit", "Activity"]] }
  };
  const TITLES = {
    school: "Create a school RFQ",
    distributor: "Submit wholesale quotation",
    retailer: "Submit local supply quotation",
    publisher: "Add a catalogue title"
  };
  const state = { data: null, section: "overview", loading: false, profileOpen: false, auditSearch: null, auditVerification: null, blogPreviewDraft: null, ads: [], advertisers: [], backups: null, territories: null, mfaEnrollment: null, recoveryCodes: null };
  const esc = value => escapeHtml(value ?? "");
  const currency = value => value == null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
  const date = value => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not set";
  const timestamp = value => value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
  const localDateTime = value => {
    const parsed = value ? new Date(value) : new Date();
    return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const statusClass = value => String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const status = value => `<span class="status-pill status-${statusClass(value)}">${esc(String(value || "Unknown").replace(/_/g, " "))}</span>`;
  const fmt = value => Number(value || 0).toLocaleString("en-IN");
  const activeRole = () => ROLE_DETAILS[currentUser?.role] || ROLE_DETAILS.school;
  const can = permission => state.data?.user?.permissions?.includes(permission) === true;

  function dashboardShell(content) {
    const role = activeRole();
    const user = state.data?.user || currentUser;
    const unread = (state.data?.notifications || []).filter(item => !item.readAt).length;
    return `<div class="workspace-shell">
      <aside class="workspace-sidebar">
        <a class="workspace-logo brand" href="/"><span class="brand-mark">≡</span><span><b>Go</b>Erudite</span></a>
        <div class="workspace-identity"><span class="workspace-role-mark">${role.icon}</span><span><b>${esc(user?.organizationName || `${user?.firstName || ""} ${user?.lastName || ""}`)}</b><small>${esc(role.label)}</small></span></div>
        <nav class="workspace-nav" id="workspace-navigation" aria-label="Dashboard">${role.sections.filter(([key]) => key !== "team" || user?.permissions?.includes("team.manage")).map(([key, label]) => `<button type="button" class="${state.section === key ? "selected" : ""}" data-dash-section="${key}"><span>${sectionIcon(key)}</span>${label}${key === "notifications" && unread ? `<i>${unread}</i>` : ""}</button>`).join("")}</nav>
        <a class="workspace-back" href="/">← &nbsp;Return to GoErudite</a>
      </aside>
      <section class="workspace-main">
        <header class="workspace-topbar"><button class="workspace-menu" data-workspace-menu aria-label="Open dashboard navigation" aria-controls="workspace-navigation" aria-expanded="false">☰</button><div><small>${esc(role.label)} / GoErudite</small><h1>${esc(role.title)}</h1></div><div class="workspace-top-actions"><span class="connection-indicator"><i></i> Live workspace</span><a href="/" aria-label="Visit website">Website ↗</a><button data-logout>Log out</button></div></header>
        <div class="workspace-content">${state.loading ? `<div class="workspace-loading">Loading your role workspace…</div>` : `${profileCompletionPanel()}${content}`}</div>
      </section>
    </div>`;
  }

  function openDispatchForm(orderId, note = "", trackingReference = "") {
    const order = state.data?.orders?.find(item => item.id === orderId);
    if (!order) return toast("Purchase order is not available in this dashboard.", "error");
    const fields = order.lines.map(line => {
      const shipped = line.dispatchedQuantity || 0;
      const firstShipment = Math.max(line.minimumOrderQuantity || 0, line.packSize || 1);
      const suggestedCumulative = Math.min(line.quantity, shipped ? shipped + (line.packSize || 1) : firstShipment);
      return `<label>${esc(line.title)} · ${shipped} shipped / ${fmt(line.quantity)} ordered<input data-dispatch-line="${esc(line.rfqLineId)}" type="number" min="${shipped}" max="${fmt(line.quantity)}" step="1" value="${fmt(suggestedCumulative)}" required></label>`;
    }).join("");
    openModal("Record shipment quantities", "Enter cumulative quantities shipped on this dispatch. Leave unchanged any line not included in the shipment.", `<form class="dashboard-form" data-dashboard-form="dispatch" data-order-id="${esc(order.id)}" data-note="${esc(note)}" data-tracking="${esc(trackingReference)}">${fields}<div class="dashboard-form-actions"><button class="button" type="submit">Record dispatch</button></div></form>`);
  }

  function catalogueSubmissionTable(items) {
    if (!items.length) return emptyState("No book suggestions submitted", "Your review-only book suggestions will appear here. Approved books are added to the public catalogue.");
    return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Academic title / publisher</th><th>ISBN / edition</th><th>Class / subject</th><th>Submitted</th><th>Review status</th><th>Action</th></tr></thead><tbody>${items.map(item => `<tr><td><b>${esc(item.title)}</b><small>${esc(item.publisher)} · ${esc(item.submitterRole || "publisher")} submission</small></td><td>${esc(item.isbn)}<small>${esc(item.edition || "—")}</small></td><td>${esc(item.level || "—")}<small>${esc(item.subject || "—")} · ${esc(item.board || "—")}</small></td><td>${date(item.createdAt)}</td><td>${status(item.status)}${item.reviewReason ? `<small>${esc(item.reviewReason)}</small>` : ""}</td><td>${item.status === "needs_correction" ? `<button data-edit-submission="${esc(item.id)}">Edit / resubmit</button>` : "—"}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function sectionIcon(section) {
    return ({ overview: "◫", rfqs: "▤", requirements: "▤", quotes: "▧", approvals: "✓", opportunities: "⌕", inventory: "▦", orders: "▧", catalogue: "▤", "book-submissions": "▤", profile: "♙", notifications: "♧", audit: "▧", verification: "◈", "catalogue-review": "▤", "rfq-monitor": "▧", support: "✉", academic: "▦", students: "♙", archive: "◷", reports: "▧", "quote-builder": "₹", analytics: "◫", "stock-alerts": "⚑", "offline-drafts": "▧", editions: "▤", sessions: "▦", "price-lists": "₹", corrections: "⚑", demand: "◫", "academic-config": "⚙", "system-health": "◈", team: "♙", "repeat-lists": "▤", network: "⇄", permissions: "⚙", backup: "▧", advertisements: "▣", "ad-inquiries": "₹" })[section] || "•";
  }

  function metric(title, value, note, icon = "◫", color = "blue") {
    return `<article class="workspace-metric metric-${color}"><span>${icon}</span><div><small>${esc(title)}</small><strong>${esc(value)}</strong><p>${esc(note)}</p></div></article>`;
  }

  function sectionHeader(title, description, actions = "") {
    return `<div class="workspace-section-heading"><div><span class="workspace-overline">GoErudite / ${esc(activeRole().label)}</span><h2>${esc(title)}</h2><p>${esc(description)}</p></div><div class="workspace-actions">${actions}</div></div>`;
  }

  function profileNotice() {
    const user = state.data?.user || currentUser;
    if (user?.accountStatus === "suspended") return `<div class="workspace-banner banner-danger"><b>Account suspended</b><span>Workspace access has been suspended. Contact GoErudite support to request a review.</span></div>`;
    if (user?.verificationStatus === "pending") return `<div class="workspace-banner banner-warning"><b>Verification pending</b><span>Your organisation is under verification. You can save work in drafts; publishing RFQs, submitting quotes, and publishing titles are disabled until an administrator completes review.</span><button data-section-link="profile">Complete business profile</button></div>`;
    if (user?.verificationStatus === "rejected") return `<div class="workspace-banner banner-danger"><b>More information required</b><span>${esc(user.verificationReason || "Review the administrator's note and contact support to resubmit your verification.")}</span><button data-section-link="profile">Review business profile</button></div>`;
    return "";
  }

  function onboardingCard() {
    const user = state.data?.user || currentUser;
    if (user?.organizationName) return "";
    return `<div class="workspace-banner banner-warning"><b>Finish setting up your organisation</b><span>Add your verified organisation name and academic or service-area details to make your account ready for review.</span><button data-section-link="profile">Set up profile</button></div>`;
  }

  function alertsPanel(items = []) {
    if (!items.length) return "";
    return `<section class="workspace-card workspace-alerts"><h3>Operational reminders</h3><ul>${items.map(item => `<li>${esc(item.message)}</li>`).join("")}</ul></section>`;
  }

  function demandForecast(items = []) {
    if (!items.length) return `<section class="workspace-card"><h3>Indicative demand forecast</h3><p>Add class-wise student counts in your profile to estimate a baseline book quantity. Historical consumption is not yet available.</p></section>`;
    return `<section class="workspace-card"><div class="card-title-row"><div><h3>Indicative class-wise demand</h3><p>Session ${esc(items[0]?.session || "not set")} · Baseline only: one copy per enrolled student. Adjust for repeaters, new admissions, and extra copies before creating an RFQ.</p></div></div><div class="control-list">${items.map(item => `<div><span>${esc(item.className)} · ${fmt(item.students)} students</span><b>${fmt(item.indicativeCopies)} indicative copies</b></div>`).join("")}</div></section>`;
  }

  function overviewContent() {
    const data = state.data || {};
    const summary = data.summary || {};
    const role = currentUser.role;
    if (role === "school") return `${sectionHeader("Procurement overview", "Create structured academic requirements, review supplier responses, and keep every evaluation under your institution's control.", `<button class="button" data-open-form="rfq">＋ Create school RFQ</button>`)}${profileNotice()}${onboardingCard()}${alertsPanel(data.alerts)}<div class="workspace-metrics">${metric("All RFQs", fmt(summary.totalRfqs), "Your organisation's requirements", "▤")}${metric("Drafts", fmt(summary.drafts), "Saved, not yet published", "▧", "orange")}${metric("Open requirements", fmt(summary.openRfqs), "Accepting or reviewing responses", "⌕", "green")}${metric("Supplier quotations", fmt(summary.quotations), "Submitted for your review", "▦", "purple")}${metric("Pending evaluation", fmt(summary.pendingDecisions), "No decisions made automatically", "◷", "orange")}${metric("Student strength", fmt(summary.studentStrength), "Set in the school profile", "♙")}</div>${demandForecast(data.demandForecast)}<div class="workspace-panels"><section class="workspace-card workspace-card-wide"><div class="card-title-row"><div><h3>Recent school RFQs</h3><p>Draft → Published → Responses received → Under review → Closed</p></div><button class="text-action" data-section-link="rfqs">View all →</button></div>${rfqTable((data.rfqs || []).slice(0, 5), true)}</section><section class="workspace-card"><div class="card-title-row"><div><h3>Academic controls</h3><p>Required fields for publication</p></div></div><div class="control-list">${[["Academic session", data.profile?.academicSession], ["Education board", data.profile?.board], ["State / region", data.profile?.state], ["Primary medium", data.profile?.medium]].map(([name, value]) => `<div><span>${esc(name)}</span><b>${value ? esc(value) : "Set in profile"}</b></div>`).join("")}</div><button class="button button-outline button-compact" data-section-link="profile">Update school profile</button></section></div><section class="workspace-card"><div class="card-title-row"><div><h3>Latest supplier quotations</h3><p>Evaluation is an internal decision; an authorised purchase order is a separate action.</p></div><button class="text-action" data-section-link="quotes">Compare quotes →</button></div>${quoteTable((data.quotations || []).slice(0, 5))}</section>`;
    if (role === "distributor" || role === "retailer") return `${sectionHeader(role === "retailer" ? "Local supply overview" : "Wholesale supply overview", "Review verified institutional requirements, report actual stock freshness, and send a clear quotation. Purchase orders and delivery tracking are available; payments are not processed.", `<button class="button" data-open-form="inventory">＋ Update inventory</button>`)}${profileNotice()}${onboardingCard()}${alertsPanel(data.alerts)}<div class="workspace-metrics">${metric(role === "retailer" ? "Nearby RFQs" : "Open opportunities", fmt(summary.opportunities), "Published by verified schools", "⌕")}${metric("Quotes submitted", fmt(summary.submittedQuotes), "Your sent supplier responses", "▤", "green")}${metric("Quotation drafts", fmt(summary.drafts), "Saved, not yet submitted", "▧", "orange")}${metric(role === "retailer" ? "Shop stock lines" : "Warehouse stock lines", fmt(summary.activeStockLines), "Your own inventory records", "▦", "purple")}${metric("Low stock alerts", fmt(summary.lowStock), "Review quantities before quoting", "⚑", "orange")}${metric("Response rate", `${fmt(summary.responseRate)}%`, "Submitted responses ÷ open RFQs", "◷")}${metric("Supplier reliability", data.reliability?.available ? `${fmt(data.reliability.onTimeDeliveryRate)}%` : "Not enough data", data.reliability?.available ? `${fmt(data.reliability.completedOrders)} completed orders` : data.reliability?.reason || "No confirmed fulfilment history", "◈")}</div><div class="workspace-panels"><section class="workspace-card workspace-card-wide"><div class="card-title-row"><div><h3>Matched RFQ opportunities</h3><p>Explainable title, service-area, session and inventory-freshness signals; the score does not choose or quote automatically.</p></div><button class="text-action" data-section-link="opportunities">Open opportunities →</button></div>${opportunityCards((data.opportunities || []).slice(0, 3), true)}</section><section class="workspace-card"><div class="card-title-row"><div><h3>Inventory freshness</h3><p>Stale stock is flagged; update availability before making a supply commitment.</p></div></div>${inventoryPreview((data.inventory || []).slice(0, 4))}</section></div><section class="workspace-card"><div class="card-title-row"><div><h3>Your quotation activity</h3><button class="text-action" data-section-link="quotes">View all →</button></div></div>${supplierQuoteTable((data.quotes || []).slice(0, 5))}</section>`;
    if (role === "publisher") return `${sectionHeader("Publisher catalogue overview", "Maintain accurate, edition-aware title records. Publisher list price (MRP), supplier quotations, and retailer pricing are separate records.", `<button class="button" data-open-form="catalogue">＋ Add a title</button>`)}${profileNotice()}${onboardingCard()}<div class="workspace-metrics">${metric("Titles submitted", fmt(summary.titles), "Owned catalogue records", "▤")}${metric("Published titles", fmt(summary.published), "Visible in academic discovery", "◈", "green")}${metric("Under review", fmt(summary.pendingReview), "Awaiting administrator decision", "◷", "orange")}${metric("Corrections requested", fmt(summary.needsCorrection), "Update and resubmit the record", "⚑", "purple")}</div><section class="workspace-card"><div class="card-title-row"><div><h3>Catalogue quality queue</h3><p>Every ISBN and edition is reviewed before a title enters the public catalogue.</p></div><button class="text-action" data-section-link="catalogue">Manage titles →</button></div>${publisherTable(data.catalogue || [])}</section><div class="workspace-note"><b>Price separation</b><p>Your publisher MRP is a dated publisher catalogue reference. Distributor quotations and retailer prices are captured separately when a supplier responds to a school RFQ.</p></div>`;
    if (role === "admin") return adminOverview(data);
    return `${sectionHeader("Account overview", "Manage your organisation details and review platform notifications. Role-restricted sourcing workflows are reserved for approved education organisations and supply partners.")}${profileNotice()}${onboardingCard()}<div class="workspace-panels"><section class="workspace-card"><h3>Organisation access</h3><p>Your account and profile changes are saved in GoErudite. Access to procurement and supplier workflows is limited to approved organisation roles.</p><button class="button button-outline button-compact" data-section-link="profile">Review your profile</button></section><section class="workspace-card"><h3>Need help?</h3><p>Use the support form on the main website for account-access questions.</p><a class="button button-outline button-compact" href="/contact">Contact support</a></section></div>`;
  }

  function adminOverview(data) {
    const summary = data.summary || {};
    return `${sectionHeader("Platform control centre", "Operational counts are calculated from persisted user, RFQ, quote, catalogue, and support records.", `<a class="button button-outline" href="/api/reports/export.csv">Export audit CSV ↓</a>`)}<div class="workspace-metrics">${metric("Registered accounts", fmt(summary.users), "All platform user records", "♙")}${metric("Pending verification", fmt(summary.pendingVerification), "Human review required", "◷", "orange")}${metric("Active RFQs", fmt(summary.activeRfqs), "Published or under evaluation", "▤", "green")}${metric("Submitted quotations", fmt(summary.pendingQuotes), "Supplier responses received", "▦", "purple")}${metric("Catalogue review", fmt(summary.catalogueReview), "Book submissions awaiting review", "◈", "orange")}${metric("Open support cases", fmt(summary.openSupport), "Support requests not resolved", "✉")}</div><div class="workspace-panels"><section class="workspace-card"><div class="card-title-row"><div><h3>Verification queue</h3><p>Approve only after checking the organisation details.</p></div><button class="text-action" data-section-link="verification">Review queue →</button></div>${verificationTable((data.users || []).filter(item => item.verificationStatus === "pending").slice(0, 5))}</section><section class="workspace-card"><div class="card-title-row"><div><h3>Catalogue moderation</h3><p>Book submissions from authorised roles require human review.</p></div><button class="text-action" data-section-link="catalogue-review">Review titles →</button></div>${publisherTable((data.publisherCatalog || []).filter(item => item.status === "pending_review").slice(0, 3))}</section></div><div class="workspace-card"><div class="card-title-row"><div><h3>Latest platform activity</h3><p>Before/after snapshots are preserved for audited actions.</p></div><button class="text-action" data-section-link="audit">Open audit →</button></div>${auditTable((data.audit || []).slice(0, 6))}</div>`;
  }

  function rfqTable(items, compact = false) {
    if (!items.length) return emptyState("No school requirements yet", "Create a draft, add the academic context and book lines, then publish after account verification.", `<button class="button button-compact" data-open-form="rfq">＋ Create RFQ</button>`);
    return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>RFQ / requirement</th><th>Academic session</th><th>Book lines</th><th>Status / checks</th><th>Updated</th><th>Actions</th></tr></thead><tbody>${items.map(rfq => `<tr><td><b>${esc(rfq.title)}</b><small>${esc(rfq.id)} · v${rfq.version || 1}</small></td><td>${esc([rfq.board, rfq.state, rfq.medium, rfq.session].filter(Boolean).join(" · ") || "Complete school details")}</td><td>${(rfq.lines || []).length} titles</td><td>${status(rfq.status)}${rfq.completeness && !rfq.completeness.complete ? `<small class="completeness-warning">Add: ${esc(rfq.completeness.missing.join(", "))}</small>` : `<small>Completeness checked</small>`}${rfq.academicCompatibility?.conflicts?.length ? `<small class="completeness-warning">Catalogue mismatch: ${esc(rfq.academicCompatibility.conflicts.map(item => `${item.title} · ${item.field}`).join(", "))}</small>` : rfq.academicCompatibility?.unverified?.length ? `<small class="completeness-warning">Manual academic review: ${esc(rfq.academicCompatibility.unverified.join(", "))}</small>` : `<small>Catalogue mapping compatible</small>`}</td><td>${date(rfq.updatedAt || rfq.createdAt)}</td><td><div class="table-actions">${rfq.status === "draft" && can("rfq.publish") ? `<button data-rfq-action="publish" data-rfq-id="${esc(rfq.id)}">Publish</button>` : ""}${!compact && can("rfq.manage") && ["draft", "published", "responses_received", "under_review"].includes(rfq.status) ? `<button data-edit-rfq="${esc(rfq.id)}">Edit</button>` : ""}${can("rfq.manage") && ["published", "responses_received", "under_review"].includes(rfq.status) ? `<button data-rfq-action="close" data-rfq-id="${esc(rfq.id)}">Close</button>` : ""}${can("rfq.manage") && ["draft", "published", "responses_received", "under_review"].includes(rfq.status) ? `<button data-rfq-action="cancel" data-rfq-id="${esc(rfq.id)}">Cancel</button>` : ""}${!compact ? `<button data-rfq-detail="${esc(rfq.id)}">Details</button>` : ""}<button data-compare-rfq="${esc(rfq.id)}">Quotes</button></div></td></tr>`).join("")}</tbody></table></div>`;
  }

  function opportunityCards(items, compact = false) {
    if (!items.length) return emptyState("No open opportunities", "Verified school RFQs will appear here when they match your role.");
    return `<div class="opportunity-grid">${items.map(rfq => `<article class="opportunity-card"><div class="opportunity-card-head"><span>${esc(rfq.id)}</span>${status(rfq.status)}</div><h3>${esc(rfq.title)}</h3><p>${esc([rfq.board, rfq.state, rfq.medium, rfq.session].filter(Boolean).join(" · ") || "Academic details available in requirements")}</p><div class="opportunity-school">♙ &nbsp;Verified school <span>${esc(rfq.deliveryCity || "Region shared on approval")}</span></div><div class="opportunity-lines">${(rfq.lines || []).map(line => `<div><span>${esc(line.title)}${line.className ? ` · ${esc(line.className)}` : ""}</span><b>${fmt(line.quantity)} copies</b></div>`).join("")}</div>${rfq.matchScore != null ? `<details class="match-explanation"><summary>Rule-based match · ${fmt(rfq.matchScore)} / 100</summary><ul>${(rfq.matchBasis || []).map(reason => `<li>${esc(reason)}</li>`).join("")}</ul><small>This is a transparent suggestion, not an AI decision or ranking guarantee.</small></details>` : ""}<div class="opportunity-bottom"><span>Deadline: ${date(rfq.responseDeadline)}</span>${compact ? "" : `<button class="button button-compact" data-quote-rfq="${esc(rfq.id)}">Respond to RFQ</button>`}</div>${compact ? `<button class="button button-outline button-compact button-full" data-quote-rfq="${esc(rfq.id)}">Respond to RFQ →</button>` : ""}</article>`).join("")}</div>`;
  }

  function quoteTable(items) {
    if (!items.length) return emptyState("No quotations to compare", "Submitted quotations from verified supply partners appear here.");
    return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Supply partner</th><th>Quotation</th><th>Availability</th><th>Estimated total</th><th>Delivery / validity</th><th>Evaluation status</th><th></th></tr></thead><tbody>${items.map(quote => {
      const hasOrder = (state.data?.orders || []).some(order => order.quoteId === quote.id && order.status !== "cancelled") ||
        (state.data?.purchaseRequests || []).some(request => request.quoteId === quote.id && ["pending_approval", "pending_second_approval", "approved"].includes(request.status));
      const rfq = (state.data?.rfqs || []).find(item => item.id === quote.rfqId);
      const overBudget = rfq?.budget != null && Number.isFinite(Number(rfq.budget)) && quote.total != null && quote.total > Number(rfq.budget);
      const offeredCopies = quote.lines?.reduce((total, line) => total + (Number(line.offeredQuantity) || 0), 0) || 0;
      const landedPerCopy = Number.isFinite(Number(quote.total)) && offeredCopies ? Number(quote.total) / offeredCopies : null;
      return `<tr><td><b>${esc(quote.supplier)}</b><small>${esc(quote.supplierRole || "Verified partner")}</small></td><td>${esc(quote.id)} · v${quote.version || 1}<small>RFQ v${quote.rfqVersion || 1}</small><details class="quote-breakdown"><summary>Line and charge detail</summary>${quote.reason ? `<p>No-bid reason: ${esc(quote.reason)}</p>` : ""}${quote.lines?.length ? `<ul>${quote.lines.map(line => `<li>${esc(line.title)} · ${fmt(line.offeredQuantity)} of ${fmt(line.quantity)} · ${esc(line.availability)} · ${currency(line.unitPrice)} each${line.note ? ` · ${esc(line.note)}` : ""}</li>`).join("")}</ul>` : ""}${quote.charges ? `<p>Subtotal ${currency(quote.subtotal || 0)} · Discount ${currency(quote.charges.discount || 0)} · Tax ${currency(quote.charges.tax || 0)} · Freight ${currency(quote.charges.freight || 0)} · Packing ${currency(quote.charges.packing || 0)}</p>` : ""}</details></td><td>${quote.lines?.filter(line => line.offeredQuantity > 0).length || 0}/${quote.lines?.length || 0} lines</td><td>${quote.total == null ? "No bid" : currency(quote.total)}${landedPerCopy == null ? "" : `<small>All-in estimate ${currency(landedPerCopy)} per offered copy · charges allocated evenly for comparison</small>`}${overBudget ? `<small class="budget-warning">Over RFQ budget ${currency(rfq.budget)}</small>` : ""}</td><td>${esc(quote.deliveryMode || "delivery").replace(/_/g, " ")} · ${esc(quote.deliveryEstimate || "—")}<small>Valid through ${date(quote.validThrough)}</small></td><td>${status(quote.status)}</td><td>${quote.status === "submitted" && state.data?.user?.permissions?.includes("quote.evaluate") ? `<button class="button button-compact" data-evaluate-quote="${esc(quote.id)}">Evaluate</button>` : ""}${quote.status === "selected_for_evaluation" && !hasOrder && state.data?.user?.permissions?.includes("po.request") ? `<button class="button button-compact" data-create-order="${esc(quote.rfqId)}" data-quote-id="${esc(quote.id)}">Request PO approval</button>` : ""}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function orderTable(items) {
    if (!items.length) return emptyState("No purchase orders", "A school must explicitly create a purchase order from an evaluated quotation. GoErudite does not process payments.");
    const transitions = {
      issued: ["accepted", "rejected", "exception"],
      accepted: ["picking", "exception"],
      picking: ["packed", "exception"],
      packed: ["dispatched", "exception"],
      dispatched: ["delivery_reported", "exception"],
      partially_received: ["dispatched", "exception"]
    };
    return `<div class="order-list">${items.map(order => {
      const organization = currentUser.organizationId || currentUser.id;
      const isSupplier = order.supplierId === organization;
      const options = transitions[order.status] || [];
      const editable = !isSupplier && ["issued", "accepted"].includes(order.status) && !order.lines.some(line => line.receivedQuantity > 0);
      return `<article class="workspace-card order-card"><div class="card-title-row"><div><h3>${esc(order.id)} · v${order.version || 1}</h3><p>${esc(order.rfqId)} · Quote ${esc(order.quoteId)} · ${isSupplier ? `School: ${esc(order.schoolName)}` : `Supplier: ${esc(order.supplierName)}`}</p></div>${status(order.status)}</div><div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Title</th><th>Ordered</th><th>Received</th><th>Unit price</th></tr></thead><tbody>${order.lines.map(line => `<tr><td>${esc(line.title)}</td><td>${fmt(line.quantity)}</td><td>${fmt(line.receivedQuantity || 0)}</td><td>${currency(line.unitPrice)}</td></tr>`).join("")}</tbody></table></div><p>Expected delivery: ${date(order.expectedDeliveryDate)} · Updated ${timestamp(order.updatedAt)}</p>${isSupplier && options.length ? `<div class="order-actions"><label>Update fulfilment<select data-order-status>${options.map(value => `<option value="${value}">${value.replace(/_/g, " ")}</option>`).join("")}</select></label><input data-order-note maxlength="500" placeholder="Reason required for rejection or exception"><input data-order-tracking maxlength="120" placeholder="Tracking reference (optional)"><button class="button button-compact" data-update-order="${esc(order.id)}">Save fulfilment update</button></div>` : ""}${!isSupplier && order.status === "delivery_reported" ? `<button class="button button-compact" data-order-receipt="${esc(order.id)}">Confirm received quantities</button>` : ""}${editable ? `<div class="table-actions"><button data-amend-order="${esc(order.id)}">Amend PO</button><button data-cancel-order="${esc(order.id)}">Cancel PO</button></div>` : ""}${!isSupplier && ["partially_received", "delivered"].includes(order.status) ? `<button class="button button-outline button-compact" data-report-dispute="${esc(order.id)}">Report wrong, damaged or missing books</button>` : ""}${order.amendmentHistory?.length ? `<details><summary>Amendments (${order.amendmentHistory.length})</summary>${order.amendmentHistory.map(item => `<p>v${item.version} · ${esc(item.reason)} · ${timestamp(item.createdAt)}</p>`).join("")}</details>` : ""}<details><summary>Fulfilment history (${order.fulfilmentHistory?.length || 0})</summary><ul>${(order.fulfilmentHistory || []).map(event => `<li>${esc(event.status.replace(/_/g, " "))} · ${timestamp(event.createdAt)}${event.note ? ` · ${esc(event.note)}` : ""}${event.trackingReference ? ` · Tracking: ${esc(event.trackingReference)}` : ""}</li>`).join("")}</ul></details><small class="form-legal">PO and delivery status only. No payment, invoice settlement, or stock reservation is processed by GoErudite.</small></article>`;
    }).join("")}</div>`;
  }

  function disputeTable(items) {
    if (!items.length) return `<section class="workspace-card"><h3>Delivery disputes</h3>${emptyState("No delivery disputes", "Wrong, damaged or missing book reports will be tracked here.")}</section>`;
    return `<section class="workspace-card"><h3>Delivery disputes</h3><div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Case / order</th><th>Book / issue</th><th>Parties</th><th>Status</th><th>History / action</th></tr></thead><tbody>${items.map(item => {
      const isAdmin = currentUser.role === "admin";
      const organization = currentUser.organizationId || currentUser.id;
      const isSupplier = item.supplierId === organization;
      const isSchool = item.ownerId === organization;
      const actions = isAdmin && ["open", "responded", "needs_information"].includes(item.status)
        ? `<button data-dispute-action="resolve" data-dispute-id="${esc(item.id)}">Resolve</button><button data-dispute-action="request_information" data-dispute-id="${esc(item.id)}">Request info</button>`
        : isSupplier && ["open", "needs_information"].includes(item.status)
          ? `<button data-dispute-action="respond" data-dispute-id="${esc(item.id)}">Respond</button>`
          : isSchool && item.status === "resolved"
            ? `<button data-dispute-action="close" data-dispute-id="${esc(item.id)}">Close case</button>` : "";
      return `<tr><td><b>${esc(item.id)}</b><small>${esc(item.orderId)}</small></td><td>${esc(item.title)}<small>${esc(item.type)} · ${fmt(item.quantity)} copy/copies</small></td><td>${isAdmin ? `${esc(item.schoolName)} → ${esc(item.supplierName)}` : isSupplier ? esc(item.schoolName) : esc(item.supplierName)}</td><td>${status(item.status)}${item.decision ? `<small>${esc(item.decision)}</small>` : ""}</td><td>${esc(item.description)}${item.supplierResponse ? `<small>Supplier: ${esc(item.supplierResponse)}</small>` : ""}${item.resolution ? `<small>Resolution: ${esc(item.resolution)}</small>` : ""}<div class="table-actions">${actions}</div></td></tr>`;
    }).join("")}</tbody></table></div></section>`;
  }

  function supplierQuoteTable(items) {
    if (!items.length) return emptyState("No quotations submitted", "Select an open RFQ to prepare a quote or submit a documented no-bid response.");
    return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>RFQ</th><th>Version</th><th>Lines offered</th><th>Your estimate</th><th>Validity</th><th>Status</th></tr></thead><tbody>${items.map(quote => `<tr><td><b>${esc(quote.rfq?.title || quote.rfqId)}</b><small>${esc(quote.rfqId)}</small></td><td>${quote.version || 1} / RFQ v${quote.rfqVersion || quote.rfq?.version || 1}</td><td>${quote.lines?.filter(line => line.offeredQuantity > 0).length || 0}/${quote.lines?.length || 0}</td><td>${quote.total == null ? "No bid" : currency(quote.total)}</td><td>${date(quote.validThrough)}</td><td>${status(quote.status)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function inventoryPreview(items) {
    if (!items.length) return emptyState("Your stock list is empty", "Add a stock line or import an inventory CSV.");
    return `<div class="compact-list">${items.map(item => `<div><span><b>${esc(item.title)}</b><small>${esc(item.isbn || "No ISBN")} · updated ${timestamp(item.updatedAt)}</small></span><span>${status(item.availableQuantity <= (item.lowStockThreshold ?? 5) ? "low_stock" : "available")}<b>${fmt(item.availableQuantity)} available</b></span></div>`).join("")}</div>`;
  }

  function publisherRevisionDiff(item, revision) {
    const snapshot = revision.snapshot || {};
    const fields = ["title", "author", "publisher", "isbn", "edition", "session", "subject", "level", "board", "state", "medium", "publisherMrp", "publisherMrpEffectiveDate"];
    const changed = fields.filter(key => JSON.stringify(snapshot[key]) !== JSON.stringify(item[key]));
    return `<p>v${revision.version} · ${timestamp(revision.changedAt)}${changed.length ? ` · changed: ${changed.map(key => `${esc(key)} (${esc(snapshot[key] ?? "—")} → ${esc(item[key] ?? "—")})`).join(", ")}` : " · no listed metadata change"}</p>`;
  }

  function publisherTable(items) {
    if (!items.length) return emptyState("No catalogue records in this queue", "ISBNs, editions, session mapping and publisher MRP remain versioned independently.");
    return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Academic title</th><th>ISBN / edition</th><th>Session / subject</th><th>Publisher MRP</th><th>Status</th><th>Action / history</th></tr></thead><tbody>${items.map(item => `<tr><td><b>${esc(item.title)}</b><small>${esc(item.publisher || item.author || "")}</small></td><td>${esc(item.isbn)}<small>${esc(item.edition || "Edition not set")}</small></td><td>${esc(item.session || "—")}<small>${esc(item.subject || "—")} · ${esc(item.medium || "—")}</small></td><td>${currency(item.publisherMrp ?? item.price)}</td><td>${status(item.status)}${item.withdrawalRequest ? `<small>Withdrawal: ${esc(item.withdrawalRequest.status)}</small>` : ""}</td><td>${item.status === "draft" || item.status === "needs_correction" ? `<button data-edit-catalogue="${esc(item.id)}">Edit / submit</button>` : item.status === "published" && item.withdrawalRequest?.status !== "pending" ? `<button data-request-withdrawal="${esc(item.id)}">Request withdrawal</button>` : item.reviewReason ? esc(item.reviewReason) : "Versioned"}<details><summary>Versions / MRP history</summary>${(item.priceHistory || []).map(price => `<p>${currency(price.price)} · effective ${esc(price.effectiveDate || "not dated")} · ${timestamp(price.recordedAt)}</p>`).join("") || "<p>No MRP history is recorded.</p>"}${(item.revisions || []).map(revision => publisherRevisionDiff(item, revision)).join("")}</details></td></tr>`).join("")}</tbody></table></div>`;
  }

  function verificationTable(items) {
    if (!items.length) return emptyState("No accounts awaiting review", "New organisation registrations appear here with a pending status.");
    return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Organisation / user</th><th>Role</th><th>Registered</th><th>Verification</th><th>Decision</th></tr></thead><tbody>${items.map(item => `<tr><td><b>${esc(item.organizationName || "Organisation profile incomplete")}</b><small>${esc(item.firstName)} ${esc(item.lastName)} · ${esc(item.email)}</small></td><td>${esc(item.role)}</td><td>${date(item.createdAt)}</td><td>${status(item.verificationStatus)}</td><td><div class="table-actions"><button data-admin-review="verified" data-user-id="${esc(item.id)}">Verify</button><button data-admin-review="rejected" data-user-id="${esc(item.id)}">Return for correction</button></div></td></tr>`).join("")}</tbody></table></div>`;
  }

  function usersTable(items) {
    if (!items.length) return emptyState("No user accounts yet", "Registered education organisations will be listed here.");
    return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Organisation / contact</th><th>Role</th><th>Verification</th><th>Account</th><th>Review / account action</th></tr></thead><tbody>${items.map(item => `<tr><td><b>${esc(item.organizationName || "Organisation profile incomplete")}</b><small>${esc(item.firstName)} ${esc(item.lastName)} · ${esc(item.email)}</small></td><td>${esc(item.role)}</td><td>${status(item.verificationStatus)}</td><td>${status(item.accountStatus)}</td><td><div class="table-actions">${item.role === "admin" ? "Protected account" : item.accountStatus === "suspended" ? `<button data-admin-review="active" data-user-id="${esc(item.id)}">Restore</button>` : item.verificationStatus === "verified" ? `<button data-admin-review="suspended" data-user-id="${esc(item.id)}">Suspend</button>` : "No account action"}</div>${item.verificationReason ? `<small>${esc(item.verificationReason)}</small>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function auditTable(items) {
    if (!items.length) return emptyState("No audit events yet", "Record changes and privileged actions will be logged here.");
    return `<div class="audit-list">${items.map(item => `<details class="audit-row"><summary><span class="audit-action">${esc(item.action)}</span><span>${esc(item.entity)} · ${esc(item.entityId)}</span><span>${esc(item.actorName)} (${esc(item.actorRole)})</span><time>${timestamp(item.createdAt)}</time></summary><div class="audit-snapshot"><div><b>Before</b><pre>${esc(JSON.stringify(item.before, null, 2))}</pre></div><div><b>After</b><pre>${esc(JSON.stringify(item.after, null, 2))}</pre></div></div></details>`).join("")}</div>`;
  }

  function notificationsContent(items) {
    if (!items.length) return emptyState("You're all caught up", "RFQ responses, due dates, verification decisions, and catalogue changes will appear here.");
    const targetSection = item => {
      if (["rfq", "rfq_closed", "quote", "decision"].includes(item.type)) {
        if (currentUser.role === "school") return item.type === "rfq" ? "rfqs" : "quotes";
        if (["distributor", "retailer"].includes(currentUser.role)) return item.type === "order" ? "orders" : "opportunities";
      }
      if (item.type === "catalogue") return currentUser.role === "publisher" ? "catalogue" : "book-submissions";
      if (item.type === "verification") return "profile";
      if (item.type === "order") return "orders";
      return "";
    };
    return `<div class="notification-list">${items.map(item => {
      const destination = targetSection(item);
      const canNavigate = activeRole().sections.some(([key]) => key === destination);
      return `<article class="notification-row ${item.readAt ? "is-read" : ""}"><span>${sectionIcon(item.type === "quote" ? "quotes" : item.type === "verification" ? "profile" : item.type === "catalogue" ? "catalogue" : "notifications")}</span><div><h3>${esc(item.title)}</h3><p>${esc(item.message)}</p><small>${timestamp(item.createdAt)}</small></div>${canNavigate ? `<button data-section-link="${destination}">Open related ${destination.replace(/-/g, " ")} →</button>` : ""}${item.readAt ? status("read") : `<button data-read-notification="${esc(item.id)}">Mark read</button>`}</article>`;
    }).join("")}</div>`;
  }

  function profileCompletionPanel(completion = state.data?.profileCompletion) {
    if (!completion || currentUser.role === "admin") return "";
    const missing = completion.missing || [];
    return `<section class="workspace-card profile-completion"><div class="card-title-row"><div><h3>Profile completion · ${fmt(completion.percentage)}%</h3><p>${fmt(completion.completed)} of ${fmt(completion.total)} account details are recorded. This is a profile checklist, not identity verification.</p></div><button class="button button-outline button-compact" data-section-link="profile">Complete profile</button></div><div class="completion-track" role="progressbar" aria-label="Profile completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${fmt(completion.percentage)}"><span style="width:${fmt(completion.percentage)}%"></span></div>${missing.length ? `<small>Missing: ${esc(missing.join(", "))}</small>` : `<small>Required profile details are complete.</small>`}</section>`;
  }

  function profileContent() {
    const user = state.data?.user || currentUser;
    const profile = user.profile || {};
    return `${sectionHeader("Organisation profile & verification", "Keep your organisation identity and academic or service-area details current. Verification is reviewed by an administrator; registration alone does not verify an organisation.")}${profileNotice()}<section class="workspace-card profile-card"><div class="card-title-row"><div><h3>Organisation details</h3><p>${esc(user.email)} · ${esc(user.role)} · ${status(user.verificationStatus)}</p></div></div><form class="dashboard-form dashboard-profile-form" data-dashboard-form="profile"><label>Organisation / business name <b>*</b><input name="organizationName" value="${esc(user.organizationName)}" required minlength="2" maxlength="160"></label>    ${user.role === "school" ? `<label>UDISE code<input name="udiseCode" value="${esc(profile.udiseCode)}" maxlength="20" placeholder="Optional"></label><label>School type<select name="schoolType"><option value="">Select</option>${["Government", "Government-aided", "Private", "Other"].map(value => `<option ${profile.schoolType === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Academic session<input name="academicSession" value="${esc(profile.academicSession || "2025–2026")}" required maxlength="30" placeholder="2026–2027"></label><label>Education board<input name="board" value="${esc(profile.board)}" required maxlength="80" placeholder="CBSE"></label><label>Medium<input name="medium" value="${esc(profile.medium)}" required maxlength="80" placeholder="English"></label><label>Total student strength<input name="students" type="number" min="0" step="1" value="${esc(profile.students || "")}" placeholder="Optional"></label><details class="class-count-editor"><summary>Class-wise student counts for indicative demand</summary><p>Forecast baseline is one copy per student. It does not replace school review or adjustments.</p><div class="workspace-form-grid">${Array.from({ length: 12 }, (_, index) => { const name = `Class ${index + 1}`; return `<label>${name}<input name="classCount:${name}" type="number" min="0" max="100000" step="1" value="${esc(profile.classCounts?.[name] ?? "")}"></label>`; }).join("")}</div></details>` : user.role === "publisher" ? `<label>Primary website<input name="website" type="url" value="${esc(profile.website)}" placeholder="https://"></label>` : `<label>Service area<input name="serviceArea" value="${esc(profile.serviceArea)}" maxlength="200" placeholder="Cities, districts, or service PIN codes"></label><label>Academic session<input name="academicSession" value="${esc(profile.academicSession || "2025–2026")}" maxlength="30"></label>`}<label>Address<input name="address" value="${esc(profile.address)}" maxlength="300"></label><label>City<input name="city" value="${esc(profile.city)}" maxlength="100"></label><label>${user.role === "school" ? "State / region" : "Primary service state / region"}<input name="state" value="${esc(profile.state)}" maxlength="100"></label><label>Service postal code<input name="postalCode" value="${esc(profile.postalCode)}" maxlength="12"></label>${user.verificationStatus === "rejected" ? `<label class="workspace-check"><input name="requestVerification" type="checkbox" value="true" required> I have updated the organisation information; please return my account to the administrator verification queue.</label>` : ""}<div class="dashboard-form-actions"><button class="button" type="submit">Save organisation profile</button><small>Changes are recorded in your organisation audit trail.</small></div></form><div class="verification-info"><b>Account verification: ${esc(String(user.verificationStatus || "pending").replace(/_/g, " "))}</b><p>Administrator reviewers validate organisation identity through your approved verification process. Do not share passwords or sensitive personal documents in public catalogue or RFQ fields.</p>${user.verificationReason ? `<p><b>Review note:</b> ${esc(user.verificationReason)}</p>` : ""}</div></section>`;
  }

  function mfaSettingsContent() {
    const user = state.data?.user || currentUser;
    if (!user) return "";
    if (state.recoveryCodes) {
      return `<section class="workspace-card"><h3>Save one-time recovery codes</h3><p>These are shown once. Store them privately and separately from your authenticator.</p><code>${state.recoveryCodes.map(esc).join(" · ")}</code><div class="dashboard-form-actions"><button class="button" data-mfa-recovery-ack>I saved these codes</button></div></section>`;
    }
    if (state.mfaEnrollment) {
      return `<section class="workspace-card"><h3>Verify authenticator setup</h3><p>Enter this private key in a TOTP authenticator app. Enrollment expires soon.</p><code>${esc(state.mfaEnrollment.secret)}</code><p><small>${esc(state.mfaEnrollment.otpauthUrl)}</small></p><form class="dashboard-form" data-dashboard-form="mfa-verify"><label>Six-digit authenticator code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code"></label><button class="button" type="submit">Verify and enable MFA</button></form></section>`;
    }
    if (user.mfaEnabled && user.mfaRequired) {
      return `<section class="workspace-card"><h3>Account security</h3><p>MFA is enabled and required for this account. Administrators and accounts with privileged organisation permissions cannot disable MFA.</p></section>`;
    }
    if (user.mfaEnabled) {
      return `<section class="workspace-card"><h3>Account security · MFA enabled</h3><p>This account requires an authenticator or one-time recovery code at sign-in.</p><form class="dashboard-form" data-dashboard-form="mfa-disable"><label>Current password<input name="password" type="password" required autocomplete="current-password"></label><label>Authenticator code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"></label><label>Recovery code, if needed<input name="recoveryCode" maxlength="40" autocomplete="off"></label><button class="button button-outline" type="submit">Disable optional MFA</button></form></section>`;
    }
    return `<section class="workspace-card"><h3>Account security · MFA optional</h3><p>Use a TOTP authenticator app and one-time recovery codes to add sign-in protection.</p><form class="dashboard-form" data-dashboard-form="mfa-start"><label>Current password<input name="password" type="password" required autocomplete="current-password"></label><button class="button" type="submit">Set up authenticator MFA</button></form></section>`;
  }

  function supplierTerritoriesContent() {
    const config = state.territories;
    if (!config) return `${sectionHeader("Supplier territories", "Territory rules are enforced on the server for RFQ visibility and quotation access.")}<section class="workspace-card">Loading supplier territory configuration…</section>`;
    const suppliers = config.suppliers || [];
    const territories = config.territories || [];
    const exceptions = config.exceptions || [];
    const supplierOptions = suppliers.map(item => `<option value="${esc(item.id)}">${esc(item.organizationName)} · ${esc(item.role)} · ${esc(item.verificationStatus)}</option>`).join("");
    const rfqOptions = (state.data?.rfqs || []).filter(item => ["published", "responses_received"].includes(item.status))
      .map(item => `<option value="${esc(item.id)}">${esc(item.id)} · ${esc(item.title)}</option>`).join("");
    return `${sectionHeader("Supplier territories", "Only verified, active Distributors and Retailers with an explicitly matching service area can see or quote on an RFQ. Missing delivery location is not eligible. Exceptions are limited to one supplier and one RFQ, require a reason and expiry, and are audited.")}<section class="workspace-card"><h3>Add an explicit supplier service area</h3>${suppliers.length ? `<form class="dashboard-form" data-dashboard-form="supplier-territory"><div class="workspace-form-grid"><label>Supplier organisation<select name="supplierOrganizationId" required>${supplierOptions}</select></label><label>State <b>*</b><input name="state" maxlength="100" required></label><label>District<input name="district" maxlength="100"></label><label>City<input name="city" maxlength="100"></label><label>PIN code<input name="postalCode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="Six digits"></label></div><button class="button" type="submit">Add service area</button></form>` : emptyState("No supplier organisations", "Verified or pending Distributor and Retailer organisations appear here for explicit configuration.")}</section><section class="workspace-card"><h3>Configured service areas (${territories.length})</h3>${territories.length ? `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Supplier</th><th>Role</th><th>State</th><th>District</th><th>City</th><th>PIN code</th><th>Action</th></tr></thead><tbody>${territories.map(area => { const supplier = suppliers.find(item => item.id === area.supplierOrganizationId); return `<tr><td>${esc(supplier?.organizationName || area.supplierOrganizationId)}</td><td>${esc(supplier?.role || "Unknown")}</td><td>${esc(area.state)}</td><td>${esc(area.district || "—")}</td><td>${esc(area.city || "—")}</td><td>${esc(area.postalCode || "—")}</td><td><button class="button button-outline button-compact" data-remove-territory="${esc(area.id)}">Remove</button></td></tr>`; }).join("")}</tbody></table></div>` : emptyState("No service areas configured", "A supplier is not eligible for RFQs until an administrator assigns a service area.")}</section><section class="workspace-card"><h3>Approve a scoped territory exception</h3>${suppliers.length && rfqOptions ? `<form class="dashboard-form" data-dashboard-form="territory-exception"><div class="workspace-form-grid"><label>Supplier<select name="supplierOrganizationId" required>${supplierOptions}</select></label><label>RFQ<select name="rfqId" required>${rfqOptions}</select></label><label>Expires at<input name="expiresAt" type="datetime-local" required value="${esc(localDateTime(new Date(Date.now() + 30 * 86400000).toISOString()))}"></label><label class="workspace-form-full">Reason <b>*</b><textarea name="reason" required minlength="10" maxlength="500"></textarea></label></div><button class="button" type="submit">Approve single-RFQ exception</button></form>` : emptyState("No published RFQs available", "A scoped exception can only target an existing RFQ and supplier.")}${exceptions.length ? `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Supplier</th><th>RFQ</th><th>Scope</th><th>Reason</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead><tbody>${exceptions.map(item => { const supplier = suppliers.find(entry => entry.id === item.supplierOrganizationId); const revoked = Boolean(item.revokedAt); const active = !revoked && Date.parse(item.expiresAt) > Date.now(); return `<tr><td>${esc(supplier?.organizationName || item.supplierOrganizationId)}</td><td>${esc(item.rfqId)}</td><td>Single RFQ</td><td>${esc(item.reason)}</td><td>${timestamp(item.expiresAt)}</td><td>${status(revoked ? "revoked" : active ? "active" : "expired")}</td><td>${active ? `<button class="button button-outline button-compact" data-revoke-territory-exception="${esc(item.id)}">Revoke</button>` : "—"}</td></tr>`; }).join("")}</tbody></table></div>` : ""}</section>`;
  }

  function loadTerritories() {
    state.territories = null;
    api("/api/admin/supplier-territories").then(result => {
      state.territories = result;
      if (state.section === "territories") paint();
    }).catch(error => {
      state.territories = { suppliers: [], territories: [], exceptions: [], error: error.message };
      toast(error.message, "error");
      if (state.section === "territories") paint();
    });
  }

  function auditContent() {
    const csvLink = ["school", "distributor", "retailer", "publisher", "admin"].includes(currentUser.role) ? `<a class="button button-outline button-compact" href="/api/reports/export.csv">Download permitted CSV ↓</a>` : "";
    const verifyButton = currentUser.role === "admin" ? `<button class="button button-outline button-compact" data-audit-verify>Verify integrity chain</button>` : "";
    const search = currentUser.role === "admin" ? `<form class="workspace-form-grid" data-audit-search-form><label>Search action / record / ID<input name="q" maxlength="120" value="${esc(state.auditSearch?.filters?.q || "")}"></label><label>Entity type<input name="entity" maxlength="80" value="${esc(state.auditSearch?.filters?.entity || "")}"></label><label>Actor / role<input name="actor" maxlength="120" value="${esc(state.auditSearch?.filters?.actor || "")}"></label><label>From<input name="from" type="date" value="${esc(state.auditSearch?.filters?.from || "")}"></label><label>To<input name="to" type="date" value="${esc(state.auditSearch?.filters?.to || "")}"></label><button class="button" type="submit">Search audit trail</button></form>` : "";
    const auditItems = currentUser.role === "admin" && state.auditSearch ? state.auditSearch.items : state.data?.audit || [];
    return `${sectionHeader("Reports, archive & audit trail", "Review records belonging to your role, preserve RFQ and catalogue snapshots, and export only the data your account is authorised to access.", `${csvLink}${verifyButton}`)}${state.auditVerification ? `<section class="workspace-card"><h3>Audit integrity verification</h3><p>${status(state.auditVerification.valid ? "verified" : "failed")} · ${fmt(state.auditVerification.checked)} chained records checked · ${fmt(state.auditVerification.legacyUnsealed)} legacy records not sealed by the new chain.</p><p>${esc(state.auditVerification.reason)}</p></section>` : ""}<section class="workspace-card"><div class="card-title-row"><div><h3>${currentUser.role === "admin" ? "Platform audit trail" : "Your recent activity"}</h3><p>Each entry records the actor, timestamp, action, record ID, and before/after snapshot.</p></div></div>${search}${state.auditSearch?.truncated ? `<p>Showing the first 500 matching records; narrow the filters for more focused results.</p>` : ""}${auditTable(auditItems)}</section>${currentUser.role === "admin" ? `<section class="workspace-card"><h3>User access register</h3><p>Verification, suspension, and restoration are role-restricted and audited.</p>${usersTable(state.data?.users || [])}</section>` : ""}${["school", "distributor", "retailer"].includes(currentUser.role) ? `<div class="workspace-note"><b>Commercial scope</b><p>Purchase-order and fulfilment records are available in the Orders workspace. Payments and invoice settlement are not processed by GoErudite.</p></div>` : ""}`;
  }

  function schoolQuotesContent() {
    const items = state.data?.quotations || [];
    const byRfq = new Map();
    items.forEach(quote => {
      const values = byRfq.get(quote.rfqId) || [];
      values.push(quote);
      byRfq.set(quote.rfqId, values);
    });
    return `${sectionHeader("Quotation comparison & evaluation", "Compare full and partial supply, price components, quote revisions, and validity. Split plans are indicative; only an authorised school action creates a purchase order.")}${[...byRfq.entries()].length ? [...byRfq.entries()].map(([rfqId, quotes]) => `<section class="workspace-card"><div class="card-title-row"><div><h3>${esc(state.data.rfqs.find(item => item.id === rfqId)?.title || rfqId)}</h3><p>${esc(rfqId)} · ${quotes.length} supplier response(s)</p></div><div>${status(state.data.rfqs.find(item => item.id === rfqId)?.status)}<button class="button button-outline button-compact" data-split-plan="${esc(rfqId)}">Plan split supply</button></div></div>${quoteTable(quotes)}</section>`).join("") : emptyState("No supplier quotations yet", "When verified suppliers respond to your published RFQs, side-by-side comparisons will appear here.")}${items.some(item => item.status === "submitted") ? `<div class="workspace-note"><b>School retains final control</b><p>Evaluation is not an order. Create a PO only after explicit confirmation; GoErudite does not process payment.</p></div>` : ""}`;
  }

  function schoolApprovalsContent() {
    const quotations = state.data?.quotations || [];
    const pending = quotations.filter(item => item.status === "submitted");
    const decided = quotations.filter(item => ["selected_for_evaluation", "not_selected"].includes(item.status));
    const requests = state.data?.purchaseRequests || [];
    const canApprove = state.data?.user?.permissions?.includes("po.approve");
    const requestRows = requests.length ? `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Request</th><th>Requested by</th><th>Quote</th><th>Status / decisions</th><th>Decision</th></tr></thead><tbody>${requests.map(item => {
      const active = ["pending_approval", "pending_second_approval"].includes(item.status);
      const alreadyDecided = (item.decisions || []).some(decision => decision.actorId === currentUser.id);
      const canDecide = active && canApprove && item.requestedBy !== currentUser.id && !alreadyDecided;
      const step = item.status === "pending_second_approval" ? 2 : 1;
      const decisions = (item.decisions || []).map(decision => `${esc(decision.profile || "Manager/Owner")} ${esc(decision.decision)} · ${timestamp(decision.decidedAt)}`).join("<br>");
      const decisionCell = canDecide
        ? `<button class="button button-compact" data-approve-request="${esc(item.id)}" data-decision="approve">Approve step ${step}/2</button><button class="button button-outline button-compact" data-approve-request="${esc(item.id)}" data-decision="reject">Reject</button>`
        : active && alreadyDecided ? "Your decision is recorded; waiting for another approver"
          : active && item.requestedBy === currentUser.id ? "Requester cannot approve; waiting for independent managers"
            : active ? `Waiting for step ${step} approval` : item.approvedBy ? "Both approvals recorded" : "—";
      return `<tr><td><b>${esc(item.id)}</b><small>${esc(item.rfqId)} · ${timestamp(item.createdAt)}</small></td><td>${esc(item.requestedByName || item.requestedByProfile || "Organisation staff")}</td><td>${esc(item.quoteId)}</td><td>${status(item.status)}${decisions ? `<small>${decisions}</small>` : ""}</td><td>${decisionCell}</td></tr>`;
    }).join("")}</tbody></table></div>` : emptyState("No purchase order approvals", "A PO request requires two decisions from different Managers or Owners. The requester cannot approve it.");
    const waitingCount = requests.filter(item => ["pending_approval", "pending_second_approval"].includes(item.status)).length;
    return `${sectionHeader("School approval workflow", "Evaluation is separate from PO issuance. Two different, non-requester Owners or Managers must approve; the PO is issued only after the second approval.")}<section class="workspace-card"><h3>Two independent purchase-order approvals (${waitingCount} awaiting decision)</h3>${requestRows}</section><section class="workspace-card"><h3>Quotation evaluation awaiting school decision (${pending.length})</h3>${quoteTable(pending)}</section><section class="workspace-card"><h3>Recorded evaluation decisions (${decided.length})</h3>${quoteTable(decided)}</section>`;
  }

  function teamContent() {
    const team = state.data?.team;
    if (!team) return emptyState("Team management is restricted", "Only organisation owners can create staff invitations.");
    const profiles = [
      ["manager", "Manager — full operations and independent PO approvals"],
      ["buyer", "Buyer — create and publish RFQs, evaluate quotes, request POs"],
      ["reviewer", "Reviewer — read and evaluate, cannot request or approve POs"],
      ["read_only", "Read-only — view dashboards and reports"]
    ];
    const members = team.members || [];
    const invites = team.invitations || [];
    const lastInvite = state.lastInvite;
    const emailStatus = lastInvite?.emailDelivery?.status === "sent"
      ? "Invitation email was sent."
      : lastInvite?.emailDelivery?.status === "failed"
        ? "Email delivery failed; manually share the still-active link."
        : "SMTP is not configured; manually share the link.";
    return `${sectionHeader("Team accounts & permissions", "Owner invitations are emailed through configured SMTP, expire in 72 hours, and are single-use. If SMTP is unavailable, the response states that and the owner can share the one-time link manually.")}<section class="workspace-card"><h3>Create a staff invitation</h3><form class="dashboard-form" data-team-invite-form><div class="workspace-form-grid"><label>Email address <b>*</b><input name="email" type="email" maxlength="254" required></label><label>Permission profile <b>*</b><select name="staffProfile" required>${profiles.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join("")}</select></label></div><div class="dashboard-form-actions"><button class="button" type="submit">Email invitation / generate link</button></div></form>${lastInvite ? `<div class="workspace-note"><b>${esc(emailStatus)}</b><p>${esc(lastInvite.emailDelivery?.message || "")} For ${esc(lastInvite.email)} · expires ${timestamp(lastInvite.expiresAt)}. This raw token is shown once and is not retrievable after you leave this page.</p><input readonly value="${esc(lastInvite.url)}" aria-label="One-time staff invitation link"><button class="button button-outline button-compact" data-copy-created-invite>Copy invitation link</button></div>` : ""}</section><section class="workspace-card"><h3>Organisation staff (${members.length})</h3>${members.length ? `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Name</th><th>Email</th><th>Preset permissions</th><th>Joined</th></tr></thead><tbody>${members.map(member => `<tr><td>${esc(member.firstName)} ${esc(member.lastName)}${member.id === currentUser.organizationId ? " · Organisation owner" : ""}</td><td>${esc(member.email)}</td><td>${esc(member.staffProfile.replace(/_/g, " "))}</td><td>${date(member.createdAt)}</td></tr>`).join("")}</tbody></table></div>` : emptyState("No staff accounts yet", "Create an invitation above.")}</section><section class="workspace-card"><h3>Live invitations (${invites.length})</h3>${invites.length ? `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Email</th><th>Profile</th><th>Expires</th><th>Action</th></tr></thead><tbody>${invites.map(invite => `<tr><td>${esc(invite.email)}</td><td>${esc(invite.staffProfile.replace(/_/g, " "))}</td><td>${timestamp(invite.expiresAt)}</td><td><button class="button button-outline button-compact" data-revoke-invite="${esc(invite.id)}">Revoke</button></td></tr>`).join("")}</tbody></table></div>` : emptyState("No live invitations", "Only hashed tokens are retained; each raw link is displayed once when generated.")}</section>`;
  }

  function backupContent() {
    const items = state.backups;
    return `${sectionHeader("Local data backups", "Create verified local JSON backups or start a protected restore. Restore requires typing the exact filename and creates a safety backup first. No automatic backup deletion or pruning occurs.")}<section class="workspace-card"><div class="card-title-row"><div><h3>Backup status</h3><p>Backups are stored under the configured local data directory and are not publicly served.</p></div><button class="button" data-create-backup>Create local backup</button></div>${items === null ? `<p>Loading local backup status…</p>` : items?.length ? `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Backup</th><th>Created</th><th>Size</th><th>Integrity</th><th>Action</th></tr></thead><tbody>${items.map(item => `<tr><td>${esc(item.name)}</td><td>${timestamp(item.createdAt)}</td><td>${fmt(item.sizeBytes)} bytes</td><td>${status(item.integrity)}</td><td>${item.integrity === "valid" ? `<button class="button button-outline button-compact" data-restore-backup="${esc(item.name)}">Restore…</button>` : "Not restorable"}</td></tr>`).join("")}</tbody></table></div>` : emptyState("No local backups found", "Create a backup to capture and validate the current JSON data.")}<div class="workspace-note"><b>Protected restore</b><p>A restore replaces current application data and may remove records created after the selected backup. The server validates the file, creates and checks a current-data safety backup, records an audit event, and only then replaces the store. Restore itself is never automatic.</p></div></section>`;
  }

  function loadBackupStatus() {
    state.backups = null;
    api("/api/admin/backups").then(result => {
      state.backups = result.items;
      if (state.section === "backup") paint();
    }).catch(error => {
      state.backups = [];
      toast(error.message, "error");
      if (state.section === "backup") paint();
    });
  }

  function schoolArchiveContent() {
    const rfqs = (state.data?.rfqs || []).filter(item => ["closed", "cancelled", "expired"].includes(item.status));
    return `${sectionHeader("History & RFQ archive", "Closed, cancelled, and deadline-expired RFQs are shown read-only with their saved versions and quotations.")}${rfqs.length ? rfqTable(rfqs) : emptyState("No archived RFQs", "Closed, cancelled, or expired school requirements will be listed here.")}`;
  }

  function schoolAcademicContent() {
    const profile = state.data?.profile || {};
    return `${sectionHeader("Academic session", "Academic context is saved to your school profile and copied into new RFQs. Existing published RFQs retain their own versioned values.")}<section class="workspace-card"><div class="control-list">${[["Current academic session", profile.academicSession], ["Education board", profile.board], ["State / region", profile.state], ["Medium", profile.medium]].map(([label, value]) => `<div><span>${esc(label)}</span><b>${esc(value || "Not set")}</b></div>`).join("")}</div><button class="button button-outline" data-section-link="profile">Edit school profile →</button></section>`;
  }

  function schoolStudentsContent() {
    const profile = state.data?.profile || {};
    const counts = Object.entries(profile.classCounts || {});
    return `${sectionHeader("Student strength", `Session-specific class counts provide an indicative one-copy-per-student baseline for ${profile.classCountsSession || profile.academicSession || "the current session"}. They do not automatically change an RFQ.`)}<section class="workspace-card"><div class="workspace-metrics">${metric("Total student strength", fmt(profile.students), "School-wide profile value", "♙")}${metric("Classes with counts", fmt(counts.length), "Class-wise values recorded", "▤")}</div>${counts.length ? `<div class="control-list">${counts.map(([name, value]) => `<div><span>${esc(name)} students</span><b>${fmt(value)} indicative copies</b></div>`).join("")}</div>` : emptyState("No class counts saved", "Add class-wise student numbers to your school profile.")}<button class="button button-outline" data-section-link="profile">Update student strength →</button></section>`;
  }

  function supplierAnalyticsContent() {
    const quotes = state.data?.quotes || [];
    const submitted = quotes.filter(item => item.status !== "draft");
    const noBids = submitted.filter(item => item.status === "no_bid").length;
    const completedOrders = (state.data?.orders || []).filter(item => item.status === "delivered").length;
    return `${sectionHeader("Business analytics", "Metrics below are calculated from your saved RFQ responses and confirmed order records. No revenue or win rate is inferred.")}<div class="workspace-metrics">${metric("Open RFQ inbox", fmt(state.data?.summary?.opportunities), "Currently available opportunities", "⌕")}${metric("Responses recorded", fmt(submitted.length), "Submitted quotes and no-bids", "▤")}${metric("No-bid rate", submitted.length ? `${Math.round(noBids / submitted.length * 100)}%` : "—", `${noBids} no-bid responses`, "◷")}${metric("Confirmed deliveries", fmt(completedOrders), "School-confirmed completed orders", "▧")}${metric("On-time delivery", state.data?.reliability?.available ? `${fmt(state.data.reliability.onTimeDeliveryRate)}%` : "Not enough data", state.data?.reliability?.reason || "Based on completed delivery records", "◈")}</div>${currentUser.role === "retailer" ? `<div class="workspace-note"><b>Retail sales and purchases</b><p>POS, sales, supplier purchase receipts and customer credit are not recorded, so those totals are not available here.</p></div>` : ""}`;
  }

  function retailerOfflineDraftsContent() {
    let drafts = [];
    try {
      const prefix = `goerudite-quote-draft:${currentUser.id}:`;
      drafts = Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => {
        try { return { key, ...JSON.parse(localStorage.getItem(key)) }; } catch { return { key, invalid: true }; }
      });
    } catch (_error) {
      return `${sectionHeader("Offline quotation drafts", "Unsent browser-local drafts are not transmitted until you explicitly save or submit them.")}${emptyState("Browser storage is unavailable", "Enable local browser storage to keep drafts on this device.")}`;
    }
    if (!drafts.length) return `${sectionHeader("Offline quotation drafts", "Unsent browser-local drafts are not transmitted until you explicitly save or submit them.")}${emptyState("No local quotation drafts", "Open a nearby RFQ and begin a response. Your unsent edits will be saved on this device.")}`;
    return `${sectionHeader("Offline quotation drafts", "These records are stored only in this browser. They are not submitted until you reopen and explicitly save or send them.")}<div class="workspace-card">${drafts.map(draft => {
      const opportunity = (state.data?.opportunities || []).find(item => item.id === draft.rfqId);
      return `<article class="offline-draft-row"><div><b>${esc(draft.title || draft.rfqId || "Unidentified RFQ")}</b><p>${esc(draft.rfqId || "Missing RFQ reference")} · Saved ${timestamp(draft.savedAt)} · ${draft.lines?.length || 0} line(s)</p><small>${opportunity ? "RFQ remains open; you can resume." : "RFQ is no longer available; this draft cannot be submitted."}</small></div><div>${opportunity ? `<button class="button button-compact" data-resume-quote="${esc(draft.rfqId)}">Resume draft</button>` : ""}<button class="button button-outline button-compact" data-delete-offline-draft="${esc(draft.key)}">Delete local draft</button></div></article>`;
    }).join("")}</div>`;
  }

  function publisherSubsection(section) {
    const items = state.data?.catalogue || [];
    const titles = section === "corrections" ? items.filter(item => item.status === "needs_correction") : items;
    const title = { editions: "Editions & ISBNs", sessions: "Academic session mappings", "price-lists": "Publisher price lists", corrections: "Catalogue review" }[section];
    const description = {
      editions: "Review publisher-owned ISBN and edition records. Distributor quotations and retailer prices remain separate.",
      sessions: "Review session, board, state, medium and class mappings saved on your catalogue titles.",
      "price-lists": "Publisher MRP is a dated catalogue reference only; it is not a distributor offer or retailer selling price.",
      corrections: "Review returned records, update the title and resubmit it for human moderation."
    }[section];
    return `${sectionHeader(title, description)}<section class="workspace-card">${publisherTable(titles)}</section>`;
  }

  function publisherDemandContent() {
    const items = state.data?.demandAnalytics || [];
    return `${sectionHeader("Demand analytics", "Only academic demand patterns with at least three distinct school organisations are returned. School identities and RFQ IDs are excluded.")}${items.length ? `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Session</th><th>Class</th><th>Subject</th><th>Requested copies</th><th>Contributing schools</th></tr></thead><tbody>${items.map(item => `<tr><td>${esc(item.session || "—")}</td><td>${esc(item.className)}</td><td>${esc(item.subject)}</td><td>${fmt(item.requestedCopies)}</td><td>${fmt(item.contributingSchools)}</td></tr>`).join("")}</tbody></table></div>` : emptyState("Insufficient anonymised demand data", "Demand signals appear only when at least three distinct schools share the same session, class and subject grouping.")}`;
  }

  function adminExceptionContent(items = []) {
    if (!items.length) return emptyState("No tracked RFQ or fulfilment exceptions", "Expired RFQ deadlines, requested quote revisions and reported order fulfilment exceptions appear here.");
    return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Exception</th><th>Record</th><th>Related RFQ</th><th>State</th></tr></thead><tbody>${items.map(item => `<tr><td>${esc(item.type.replace(/_/g, " "))}</td><td><b>${esc(item.id)}</b></td><td>${esc(item.rfqId || "—")}</td><td>${status(item.status || "needs_review")}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function adminUnavailableSection(title, feature) {
    return `${sectionHeader(title, "This control is not configured in the current GoErudite implementation.")}<section class="workspace-card"><div class="workspace-note"><b>${esc(feature)} is not enabled</b><p>No editable settings or operational controls are exposed here. This avoids presenting a non-functional control as if it changed platform policy.</p></div></section>`;
  }

  function blogManagementContent() {
    const items = state.blogs || [];
    const cards = items.length ? `<div class="blog-admin-list">${items.map(item => `<article class="blog-admin-card">
      <img src="${esc(item.coverImage)}" alt="" loading="lazy">
      <div class="blog-admin-details"><div class="blog-admin-meta">${status(item.status)}<span>${date(item.publicationDate || item.publishedAt || item.createdAt)}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.author)} · /blog/${esc(item.slug)}</p><div class="blog-admin-actions"><button type="button" data-blog-edit="${esc(item.id)}">Edit</button><button type="button" data-blog-preview="${esc(item.id)}">Preview</button>${item.status === "published" ? `<button type="button" data-blog-action="unpublish" data-blog-id="${esc(item.id)}">Unpublish</button>` : `<button type="button" data-blog-action="publish" data-blog-id="${esc(item.id)}">Publish</button>`}<button type="button" class="blog-delete" data-blog-delete="${esc(item.id)}">Delete</button></div></div>
    </article>`).join("")}</div>` : emptyState("No blog posts yet", "Create a draft, preview it, then publish it when ready.");
    return `${sectionHeader("Blog management", "Write and manage public articles. Drafts and scheduled posts are private; publication is handled by the server.", `<button class="button" data-blog-new>＋ Add New Blog</button>`)}${cards}`;
  }

  function advertisementManagementContent() {
    const items = state.ads || [];
    const cards = items.length ? `<div class="ad-admin-list">${items.map(item => `<article class="workspace-card ad-admin-card">
      ${item.coverImage ? `<img src="${esc(item.coverImage)}" alt="" loading="lazy">` : `<div class="ad-admin-placeholder">Sponsored listing</div>`}
      <div><div class="blog-admin-meta">${status(item.status)}${status(item.billingStatus)}<span>${date(item.startDate)} – ${date(item.endDate)}</span></div>
      <h3>${esc(item.title)}</h3><p>${esc(item.productTitle || "General advertisement")} · ${esc(item.advertiserName)}</p>
      <p>Campaign fee ${currency(item.campaignFee)} · ${fmt(item.clicks)} tracked clicks · ${fmt(item.inquiries)} inquiries</p>
      <p>Billing is recorded manually; no invoice or payment is processed by GoErudite.</p>
      <div class="blog-admin-actions"><button type="button" data-ad-edit="${esc(item.id)}">Edit</button><button type="button" data-ad-delete="${esc(item.id)}">Delete</button>${item.status === "active" ? `<a class="button button-outline button-compact" href="/advertisements/${encodeURIComponent(item.id)}" target="_blank" rel="noopener">View public page</a>` : ""}</div></div>
    </article>`).join("")}</div>` : emptyState("No advertisements yet", "Create a draft, assign a verified supply partner, then activate it for the public advertisement page.");
    return `${sectionHeader("Advertisement management", "Create sponsored listings for verified suppliers. Campaign fees are manually invoiced and reconciled outside the platform; online payment is not available.", `<button class="button" data-ad-new>＋ Add advertisement</button>`)}<div class="workspace-note"><b>Private inquiry routing</b><p>A verified school can request a quote from the advertisement. The inquiry is delivered only to the selected advertiser; it is not broadcast as a marketplace RFQ. School contact details are not disclosed.</p></div>${cards}`;
  }

  function advertisementEditor(item = null) {
    const today = new Date().toISOString().slice(0, 10);
    const inThirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const advertisers = state.advertisers || [];
    if (!advertisers.length) return toast("No active, verified supply partners are available. Verify an advertiser account before creating a campaign.", "error");
    const values = item || {};
    const image = values.coverImage || "";
    openModal(item ? "Edit advertisement" : "Add advertisement", "Create a sponsored book or education-supply listing. Use a PNG, JPEG, or WebP image up to 180 KB. Campaign fees and payment status are manually handled outside GoErudite.", `<form class="dashboard-form ad-editor-form" data-dashboard-form="advertisement" data-ad-id="${esc(item?.id || "")}" data-cover-image="${esc(image)}">
      <label>Advertisement title <b>*</b><input name="title" required minlength="3" maxlength="140" value="${esc(values.title || "")}"></label>
      <label>Verified advertiser <b>*</b><select name="advertiserId" required>${advertisers.map(person => `<option value="${esc(person.id)}" ${person.id === values.advertiserId ? "selected" : ""}>${esc(person.name)} · ${esc(person.role)}</option>`).join("")}</select></label>
      <label>Book / product title<input name="productTitle" maxlength="180" value="${esc(values.productTitle || "")}"></label>
      <label>Advertisement details <b>*</b><textarea name="description" required minlength="20" maxlength="2000" rows="5">${esc(values.description || "")}</textarea></label>
      <div class="workspace-form-grid"><label>ISBN<input name="isbn" maxlength="30" value="${esc(values.isbn || "")}"></label><label>Subject<input name="subject" maxlength="100" value="${esc(values.subject || "")}"></label>
      <label>Class / grade<input name="className" maxlength="60" value="${esc(values.className || "")}"></label><label>Board<input name="board" maxlength="80" value="${esc(values.board || "")}"></label>
      <label>Medium<input name="medium" maxlength="80" value="${esc(values.medium || "")}"></label><label>Academic session<input name="academicSession" maxlength="30" value="${esc(values.academicSession || "")}"></label>
      <label>Reference price (₹)<input name="referencePrice" type="number" min="0" max="10000000" step="0.01" value="${values.referencePrice == null ? "" : esc(values.referencePrice)}"></label><label>Campaign fee (₹) <b>*</b><input name="campaignFee" type="number" min="0" max="10000000" step="0.01" required value="${esc(values.campaignFee ?? "0")}"></label>
      <label>Campaign starts <b>*</b><input name="startDate" type="date" required value="${esc(values.startDate || today)}"></label><label>Campaign ends <b>*</b><input name="endDate" type="date" required value="${esc(values.endDate || inThirtyDays)}"></label></div>
      <label>Advertisement image<input name="cover" type="file" accept="image/png,image/jpeg,image/webp"></label><div class="ad-cover-preview">${image ? `<img src="${esc(image)}" alt="Advertisement image preview">` : `<span>Optional image preview</span>`}</div>
      <div class="workspace-form-grid"><label>Campaign state<select name="action"><option value="draft" ${values.status === "draft" || !item ? "selected" : ""}>Draft</option><option value="active" ${values.status === "active" ? "selected" : ""}>Active</option><option value="paused" ${values.status === "paused" ? "selected" : ""}>Paused</option></select></label>
      ${item ? `<label>Manual billing record<select name="billingStatus"><option value="unbilled" ${values.billingStatus === "unbilled" ? "selected" : ""}>Unbilled</option><option value="invoiced_offline" ${values.billingStatus === "invoiced_offline" ? "selected" : ""}>Invoiced outside platform</option><option value="paid_offline" ${values.billingStatus === "paid_offline" ? "selected" : ""}>Payment recorded offline</option></select></label>` : ""}</div>
      <small>Reference price is advertiser-provided and is not a quote or guaranteed selling price. The campaign fee is not collected online.</small>
      <div class="dashboard-form-actions"><button class="button" type="submit">Save campaign</button></div></form>`, "ad-editor-modal");
  }

  function advertisementInquiryContent() {
    const items = state.data?.adInquiries || [];
    if (!items.length) return `${sectionHeader("Advertisement quote inquiries", "Private requests from verified school accounts for advertisements assigned to your organisation.")}${emptyState("No ad inquiries yet", "New school quote requests for your advertisements will appear here.")}`;
    return `${sectionHeader("Advertisement quote inquiries", "These inquiries are private to your organisation. School contact information is not shared; agree contact details through authorised platform procedures.")}<div class="ad-inquiry-list">${items.map(item => `<article class="workspace-card"><div class="card-title-row"><div><h3>${esc(item.advertisementTitle)}</h3><p>${esc(item.id)} · ${esc(item.requesterLabel)} · ${timestamp(item.createdAt)}</p></div>${status(item.status)}</div><p><b>Requested quantity:</b> ${fmt(item.quantity)}</p><p>${esc(item.message || "No additional message was provided.")}</p></article>`).join("")}</div>`;
  }

  function blogEditor(item = null, draft = null) {
    const values = draft || item || {};
    const currentDate = new Date().toISOString().slice(0, 10);
    const initialCover = values.coverImage || "";
    const itemId = item?.id || draft?.id || "";
    openModal(itemId ? "Edit blog post" : "Add new blog", "Blog text is plain text and will be safely escaped on public pages. PNG, JPEG, or WebP covers up to 180 KB are accepted.", `<form class="dashboard-form blog-editor-form" data-dashboard-form="blog" data-blog-id="${esc(itemId)}" data-cover-image="${esc(initialCover)}">
      <label>Title <b>*</b><input name="title" required minlength="3" maxlength="160" value="${esc(values.title || "")}" placeholder="A useful title for readers"></label>
      <label>URL slug<input name="slug" maxlength="180" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value="${esc(values.slug || "")}" placeholder="leave blank to create from title"></label>
      <div class="workspace-form-grid"><label>Author <b>*</b><input name="author" required minlength="2" maxlength="100" value="${esc(values.author || `${currentUser.firstName} ${currentUser.lastName}`.trim())}"></label><label>Publication date <b>*</b><input name="publicationDate" type="date" required value="${esc(values.publicationDate || currentDate)}"></label></div>
      <label>Cover image <b>*</b><input name="cover" type="file" accept="image/png,image/jpeg,image/webp" ${initialCover ? "" : "required"}></label>
      <div class="blog-cover-preview">${initialCover ? `<img src="${esc(initialCover)}" alt="Current blog cover preview">` : `<span>Cover preview</span>`}</div>
      <label>Blog text <b>*</b><textarea name="content" required minlength="30" maxlength="100000" rows="12" placeholder="Write the article as plain text.">${esc(values.content || "")}</textarea></label>
      <label class="blog-schedule-field">Schedule publication<input name="scheduledAt" type="datetime-local" min="${localDateTime(Date.now() + 60000)}" value="${values.scheduledAt ? esc(localDateTime(values.scheduledAt)) : ""}"></label>
      <div class="dashboard-form-actions"><button class="button button-outline" type="button" data-blog-preview-form>Preview</button><button class="button button-outline" type="submit" data-blog-submit="draft">Save Draft</button><button class="button" type="submit" data-blog-submit="publish">Publish</button><button class="button button-outline" type="submit" data-blog-submit="schedule">Schedule</button></div>
      <small>While the server is running, scheduled posts are checked every 15 seconds and overdue posts are also published on startup or a public blog request.</small>
    </form>`, "blog-editor-modal");
  }

  function showBlogPreview(item, returnToEditor = false) {
    state.blogPreviewDraft = returnToEditor ? item : null;
    const image = item.coverImage ? `<img class="blog-preview-cover" src="${esc(item.coverImage)}" alt="">` : "";
    openModal("Blog preview", "Preview of the public article layout.", `<article class="blog-preview-article">${image}<p class="blog-public-meta">${esc(item.author)} · ${date(item.publicationDate || item.publishedAt || new Date().toISOString())}</p><h2>${esc(item.title || "Untitled blog")}</h2><div class="blog-public-content">${esc(item.content || "Start writing to preview your article.")}</div>${returnToEditor ? `<div class="dashboard-form-actions"><button class="button" type="button" data-blog-return>Continue editing</button></div>` : ""}</article>`, "blog-preview-modal");
  }

  async function previewBlogForm(form) {
    const values = Object.fromEntries(new FormData(form));
    let coverImage = form.dataset.coverImage || "";
    const file = form.elements.cover.files[0];
    if (file) {
      if (file.size > 180 * 1024) return toast("Cover image must be no larger than 180 KB.", "error");
      coverImage = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read the selected cover image."));
        reader.readAsDataURL(file);
      });
    }
    showBlogPreview({ ...values, id: form.dataset.blogId, coverImage }, true);
  }

  function sectionContent() {
    const data = state.data || {};
    if (state.section === "overview") return overviewContent();
    if (state.section === "academic") return schoolAcademicContent();
    if (state.section === "students") return schoolStudentsContent();
    if (state.section === "requirements") return `${sectionHeader("Book requirements", "Create requirements manually or import a CSV/XLSX book list. ISBN/edition matches are validated by the server; ambiguous matches still require school review.", `<a class="button button-outline button-compact" href="/api/rfqs/template.csv">CSV template ↓</a><a class="button button-outline button-compact" href="/api/rfqs/template.xlsx">XLSX template ↓</a><a class="button button-outline button-compact" href="/api/rfqs/export.xlsx">Export XLSX ↓</a><button class="button button-outline button-compact" data-import-rfq>Import CSV / XLSX</button><input id="rfq-import-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><button class="button" data-open-form="rfq">＋ Build book list</button>`)}${profileNotice()}<div class="workspace-note"><b>Catalogue matching</b><p>ISBN matches are checked against available catalogue records. Suggestions do not auto-confirm a book or edition; the school remains responsible for reviewing every requirement.</p></div>`;
    if (state.section === "rfqs") return `${sectionHeader("Academic RFQ management", "Save drafts, validate session / board / state / medium and ISBNs, then publish versioned book requirements.", `<a class="button button-outline button-compact" href="/api/rfqs/template.csv">CSV template ↓</a><a class="button button-outline button-compact" href="/api/rfqs/template.xlsx">XLSX template ↓</a><a class="button button-outline button-compact" href="/api/rfqs/export.xlsx">Export XLSX ↓</a><button class="button button-outline button-compact" data-import-rfq>Import CSV / XLSX</button><input id="rfq-import-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><button class="button" data-open-form="rfq">＋ Create RFQ</button>`)}${profileNotice()}${rfqTable(data.rfqs || [])}`;
    if (state.section === "quotes" && currentUser.role === "school") return schoolQuotesContent();
    if (state.section === "approvals" && currentUser.role === "school") return schoolApprovalsContent();
    if (state.section === "archive" && currentUser.role === "school") return schoolArchiveContent();
    if (state.section === "reports" && currentUser.role === "school") return auditContent();
    if (state.section === "quote-builder") return `${sectionHeader(currentUser.role === "retailer" ? "Local quotation builder" : "Wholesale quotation builder", "Choose a live RFQ to respond. Filter opportunities by academic details, area or deadline. The response form supports MOQ, pack size, delivery choice, pricing, validity and no-bid.", `<label class="inventory-search-label">Filter opportunities<input type="search" data-opportunity-filter placeholder="Board, session, city or title"></label>`)}${profileNotice()}${opportunityCards(data.opportunities || [])}`;
    if (state.section === "quotes") return `${sectionHeader("Your quotations", "Track quotation drafts, submitted revisions, partial and unavailable lines, and quote validity.", `<button class="button button-outline button-compact" data-section-link="opportunities">Find an RFQ →</button>`)}${supplierQuoteTable(data.quotes || [])}`;
    if (state.section === "blogs" && currentUser.role === "admin") return blogManagementContent();
    if (state.section === "advertisements" && currentUser.role === "admin") return advertisementManagementContent();
    if (state.section === "ad-inquiries") return advertisementInquiryContent();
    if (state.section === "analytics") return supplierAnalyticsContent();
    if (state.section === "team") return teamContent();
    if (state.section === "repeat-lists") return adminUnavailableSection("Enquiries & repeat lists", "School enquiry tracking and saved repeat book lists");
    if (state.section === "stock-alerts") {
      const alertItems = (data.inventory || []).filter(item => item.availableQuantity <= (item.lowStockThreshold ?? 5) || !item.updatedAt || Date.now() - new Date(item.updatedAt).getTime() > 30 * 86400000);
      return `${sectionHeader("Stock alerts", "Low-stock thresholds and 30-day freshness warnings are based on your own saved inventory records.")}${alertsPanel((data.alerts || []).filter(item => /stock|inventory/i.test(item.message)))}${alertItems.length ? inventoryTable(alertItems) : emptyState("No stock alerts", "No low-stock or stale inventory records need attention.")}`;
    }
    if (state.section === "offline-drafts") return retailerOfflineDraftsContent();
    if (state.section === "orders") return `${sectionHeader(currentUser.role === "school" ? "Purchase orders" : "Orders & fulfilment", "Track authorised purchase orders, supplier fulfilment updates, school-confirmed receipt quantities, and separately recorded delivery disputes. No payment is processed.")}${orderTable(data.orders || [])}${disputeTable(data.disputes || [])}`;
    if (state.section === "opportunities") return `${sectionHeader(currentUser.role === "retailer" ? "Nearby institutional RFQs" : "Verified institutional opportunities", "Only published school requirements are shown. School contacts remain private; no bid, draft, or pricing decisions are shared with competing suppliers.", `<label class="inventory-search-label">Filter by board / session / location<input type="search" data-opportunity-filter placeholder="Search visible opportunities"></label>`)}${profileNotice()}${opportunityCards(data.opportunities || [])}`;
    if (state.section === "inventory") return `${sectionHeader(currentUser.role === "retailer" ? "Local shop inventory & ISBN search" : "Inventory & stock import", "Track available, reserved, damaged, and low stock. Stock is private to your organisation; updates are time-stamped and do not reserve or commit items.", `<a class="button button-outline button-compact" href="/api/inventory/template.xlsx">XLSX template ↓</a><a class="button button-outline button-compact" href="/api/inventory/export.xlsx">Export XLSX ↓</a><button class="button button-outline button-compact" data-import-inventory>Import CSV / XLSX</button><input id="inventory-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><button class="button" data-open-form="inventory">＋ Add / adjust stock</button>`)}<section class="workspace-card"><div class="card-title-row"><div><h3>Current stock records</h3><p>Stale stock: not updated within 30 days. Refresh stock before a quotation.</p><label class="inventory-search-label">Search title / ISBN<input type="search" data-inventory-search placeholder="ISBN or book title" aria-label="Search inventory by ISBN or title"></label></div></div>${inventoryTable(data.inventory || [])}</section>`;
    if (state.section === "catalogue") return `${sectionHeader("Master book catalogue", "Maintain publisher-owned, ISBN and edition-aware academic titles. Price changes are versioned; publisher MRP is not a distributor quote or retailer selling price.", `<a class="button button-outline button-compact" href="/api/publisher/catalogue/template.xlsx">XLSX template ↓</a><a class="button button-outline button-compact" href="/api/publisher/catalogue/export.xlsx">Export XLSX ↓</a><button class="button button-outline button-compact" data-import-publisher>Bulk import CSV / XLSX</button><input id="publisher-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><button class="button" data-open-form="catalogue">＋ Add title</button>`)}<section class="workspace-card"><div class="card-title-row"><div><h3>Publisher title records</h3><p>Draft → Pending review → Published / Needs correction / Discontinued. Bulk import creates drafts and reports rejected row numbers.</p></div></div>${publisherTable(data.catalogue || [])}</section>`;
    if (["editions", "sessions", "price-lists", "corrections"].includes(state.section)) return publisherSubsection(state.section);
    if (state.section === "network") return adminUnavailableSection("Distributor network", "Publisher-to-distributor authorisation and territory relationships");
    if (state.section === "demand" && currentUser.role === "publisher") return publisherDemandContent();
    if (state.section === "profile") return `${profileContent()}${mfaSettingsContent()}`;
    if (state.section === "book-submissions") return `${sectionHeader("Suggest a book for the catalogue", "Submit bibliographic details for human review. A suggestion is private to the review queue and will not appear in the public catalogue unless an administrator approves it.", `<button class="button" data-open-form="catalogue-submission">＋ Suggest a book</button>`)}<div class="workspace-note"><b>Catalogue metadata is not stock</b><p>Publisher reference MRP is catalogue information only. Distributor offers, retailer selling prices and inventory remain separate records and must not be entered here.</p></div>${catalogueSubmissionTable(data.catalogueSubmissions || [])}`;
    if (state.section === "notifications") return `${sectionHeader("Notification centre", "Notifications are scoped to your account and linked to the relevant RFQ, quote, verification, or catalogue record.")}${notificationsContent(data.notifications || [])}`;
    if (state.section === "audit") return auditContent();
    if (state.section === "verification") return `${sectionHeader("Organisation verification queue", "Review user-submitted organisation details. Every decision needs a human review note, is recorded in the audit trail, and notifies the account owner.")}<section class="workspace-card"><div class="card-title-row"><div><h3>Waiting for verification</h3><p>Account approval is an explicit administrator decision.</p></div></div>${verificationTable((data.users || []).filter(item => item.verificationStatus === "pending"))}</section><section class="workspace-card"><h3>All organisation accounts</h3>${usersTable((data.users || []).filter(item => item.role !== "admin"))}</section>`;
    if (state.section === "catalogue-review") return `${sectionHeader("Catalogue submission moderation", "Review book suggestions from publishers and other authorised roles. Check bibliographic details, ISBN uniqueness, academic mapping and the dated publisher reference price before publication.")}<section class="workspace-card"><div class="card-title-row"><div><h3>Awaiting catalogue review</h3><p>Only human-approved submissions are added to public discovery.</p></div></div>${publisherReviewTable((data.publisherCatalog || []).filter(item => item.status === "pending_review"))}</section><section class="workspace-card"><h3>Withdrawal requests</h3>${withdrawalReviewTable((data.publisherCatalog || []).filter(item => item.withdrawalRequest?.status === "pending"))}</section>`;
    if (state.section === "rfq-monitor") return `${sectionHeader("Platform RFQ exceptions", "Review expired response deadlines, requested supplier quote revisions, and reported fulfilment exceptions. This view does not modify school-owned RFQs.")}<section class="workspace-card"><h3>Open exceptions (${data.exceptions?.length || 0})</h3>${adminExceptionContent(data.exceptions || [])}</section><section class="workspace-card"><div class="card-title-row"><div><h3>RFQ lifecycle</h3><p>Draft → Published → Responses received → Under review → Closed</p></div></div>${adminRfqTable(data.rfqs || [])}</section>`;
    if (state.section === "disputes" && currentUser.role === "admin") return `${sectionHeader("Delivery dispute centre", "Review school reports for wrong, damaged, or missing books. Supplier responses and administrator decisions are recorded in an auditable case history.")}${disputeTable(data.disputes || [])}`;
    if (state.section === "academic-config") return adminUnavailableSection("Academic configuration", "Central academic master-data configuration");
    if (state.section === "permissions") return adminUnavailableSection("Roles & permissions", "Fine-grained staff roles, reviewer capabilities and permission policies");
    if (state.section === "backup") return backupContent();
    if (state.section === "territories" && currentUser.role === "admin") return supplierTerritoriesContent();
    if (state.section === "system-health") return `${sectionHeader("System health", "The API is responding because this workspace loaded successfully. Advanced health checks and backup monitoring are not configured.")}<section class="workspace-card">${metric("Dashboard API", "Available", "Current authenticated request succeeded", "◈", "green")}<div class="workspace-note"><b>Local persistence mode</b><p>This project currently persists JSON records locally. Automated backup status, restore tests, background-job monitoring and incident alerts are not available.</p></div></section>`;
    if (state.section === "support") return `${sectionHeader("Platform support & exception cases", "Support submissions are persisted for administrator follow-up. Order delivery status is managed by the school and supplier; payment settlement and commercial disputes are not handled here.")}<section class="workspace-card"><div class="card-title-row"><div><h3>Support requests</h3><p>${(data.requests || []).filter(item => !["resolved", "closed"].includes(item.status)).length} open case(s)</p></div></div>${supportTable(data.requests || [])}</section>`;
    return adminOverview(data);
  }

  function inventoryTable(items) {
    if (!items.length) return emptyState("No inventory has been added", "Add stock manually or import a CSV with title, ISBN, availableQuantity, reservedQuantity, damagedQuantity, edition, session, location.");
    return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Title / ISBN</th><th>Edition / session</th><th>Available</th><th>Reserved</th><th>Damaged</th><th>Warehouse / freshness</th><th>Status</th><th>Action</th></tr></thead><tbody>${items.map(item => {
      const stale = !item.updatedAt || Date.now() - new Date(item.updatedAt).getTime() > 30 * 86400000;
      const low = item.availableQuantity <= (item.lowStockThreshold ?? 5);
      return `<tr><td><b>${esc(item.title)}</b><small>${esc(item.isbn || "ISBN not supplied")}</small></td><td>${esc(item.edition || "—")}<small>${esc(item.session || "—")}</small></td><td>${fmt(item.availableQuantity)}</td><td>${fmt(item.reservedQuantity)}</td><td>${fmt(item.damagedQuantity)}</td><td>${esc(item.location || item.source)}<small>${stale ? "Stock needs refreshing" : `Updated ${timestamp(item.updatedAt)}`}</small></td><td>${status(stale ? "stale_stock" : low ? "low_stock" : "available")}</td><td><button data-edit-inventory="${esc(item.id)}">Edit</button>${item.movementHistory?.length ? `<details><summary>Movements (${item.movementHistory.length})</summary>${item.movementHistory.slice().reverse().map(change => `<small>${timestamp(change.createdAt)} · ${fmt(change.before?.availableQuantity || 0)} → ${fmt(change.after?.availableQuantity || 0)} available · ${esc(change.reason || "No reason")}</small>`).join("")}</details>` : ""}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function publisherReviewTable(items) {
    if (!items.length) return emptyState("No publisher titles await review", "Submitted ISBN and edition records will appear here.");
    return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Submitted by / title publisher</th><th>ISBN / edition</th><th>Academic mapping</th><th>Publisher MRP</th><th>Submitted</th><th>Human review</th></tr></thead><tbody>${items.map(item => `<tr><td><b>${esc(item.submitterOrganization || item.publisher)}</b><small>${esc(item.submitterRole || "publisher")} submission · ${esc(item.title)} · ${esc(item.publisher)}</small></td><td>${esc(item.isbn)}<small>${esc(item.edition)}</small></td><td>${esc([item.board, item.state, item.medium, item.level, item.session].filter(Boolean).join(" · "))}</td><td>${currency(item.publisherMrp)}<small>Effective ${date(item.publisherMrpEffectiveDate)}</small></td><td>${date(item.createdAt)}</td><td><div class="table-actions"><button data-catalogue-review="published" data-catalogue-id="${esc(item.id)}">Approve</button><button data-catalogue-review="needs_correction" data-catalogue-id="${esc(item.id)}">Return</button></div></td></tr>`).join("")}</tbody></table></div>`;
  }

  function withdrawalReviewTable(items) {
    if (!items.length) return emptyState("No withdrawal requests", "Publisher withdrawal requests will be held for a recorded administrator decision.");
    return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Title / publisher</th><th>ISBN</th><th>Reason</th><th>Requested</th><th>Decision</th></tr></thead><tbody>${items.map(item => `<tr><td>${esc(item.title)}<small>${esc(item.publisher)}</small></td><td>${esc(item.isbn)}</td><td>${esc(item.withdrawalRequest.reason)}</td><td>${timestamp(item.withdrawalRequest.requestedAt)}</td><td><button data-withdrawal-decision="approve" data-catalogue-id="${esc(item.id)}">Approve</button><button data-withdrawal-decision="reject" data-catalogue-id="${esc(item.id)}">Reject</button></td></tr>`).join("")}</tbody></table></div>`;
  }

  function adminRfqTable(items) {
    if (!items.length) return emptyState("No RFQ records", "School requirements will appear here for administrator lifecycle monitoring.");
    return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>RFQ / school</th><th>Academic context</th><th>Lines / version</th><th>Lifecycle status</th><th>Created / updated</th></tr></thead><tbody>${items.map(rfq => `<tr><td><b>${esc(rfq.title)}</b><small>${esc(rfq.id)} · ${esc(rfq.organizationName || "School record")}</small></td><td>${esc([rfq.session, rfq.board, rfq.state, rfq.medium].filter(Boolean).join(" · "))}</td><td>${rfq.lines?.length || 0} · v${rfq.version || 1}</td><td>${status(rfq.status)}</td><td>${date(rfq.createdAt)}<small>${timestamp(rfq.updatedAt)}</small></td></tr>`).join("")}</tbody></table></div>`;
  }

  function supportTable(items) {
    if (!items.length) return emptyState("No support cases submitted", "Support forms are recorded for administrator follow-up.");
    return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Case</th><th>Requester</th><th>Role</th><th>Support request</th><th>Created</th><th>Status</th><th>Update status</th></tr></thead><tbody>${items.map(item => `<tr><td><b>${esc(item.id)}</b></td><td>${esc(item.firstName)} ${esc(item.lastName)}<small>${esc(item.email)}</small></td><td>${esc(item.role)}</td><td>${esc(item.message)}</td><td>${timestamp(item.createdAt)}</td><td>${status(item.status)}</td><td><select data-support-status aria-label="Status for ${esc(item.id)}"><option value="assigned" ${item.status === "assigned" ? "selected" : ""}>Assigned</option><option value="waiting_for_information" ${item.status === "waiting_for_information" ? "selected" : ""}>Waiting for information</option><option value="resolved" ${item.status === "resolved" ? "selected" : ""}>Resolved</option><option value="closed" ${item.status === "closed" ? "selected" : ""}>Closed</option></select><button data-support-update="${esc(item.id)}">Save</button></td></tr>`).join("")}</tbody></table></div>`;
  }

  function emptyState(title, message, action = "") {
    return `<div class="workspace-empty"><span>▤</span><h3>${esc(title)}</h3><p>${esc(message)}</p>${action}</div>`;
  }

  function openModal(title, message, formContent, className = "") {
    modalRoot.innerHTML = `<div class="modal-backdrop" data-work-modal-close><section class="auth-modal workspace-modal ${className}" role="dialog" aria-modal="true" aria-labelledby="workspace-modal-title"><button class="modal-close" aria-label="Close" data-work-modal-close>×</button><span class="eyebrow">${esc(activeRole().label)}</span><h2 id="workspace-modal-title">${esc(title)}</h2><p>${esc(message)}</p>${formContent}</section></div>`;
    modalRoot.querySelectorAll("[data-work-modal-close]").forEach(button => button.addEventListener("click", event => {
      if (event.target === button || button.classList.contains("modal-close")) modalRoot.innerHTML = "";
    }));
    modalRoot.querySelector("input, select, textarea")?.focus();
    bindModal();
  }

  function _optionList(values, selected = "") {
    return `<option value="">Select</option>${values.map(value => `<option value="${esc(value)}" ${selected === value ? "selected" : ""}>${esc(value)}</option>`).join("")}`;
  }

  function openRfqForm(existing = null) {
    const profile = state.data?.profile || {};
    let recovered = null;
    if (!existing) {
      try {
        recovered = JSON.parse(localStorage.getItem(`goerudite-rfq-draft-${currentUser.id}`) || "null");
      } catch (_error) {
        toast("An older browser-saved draft could not be restored.", "error");
      }
      if (recovered) toast("Recovered the unfinished RFQ draft from this browser.");
    }
    const lines = existing?.lines || recovered?.lines || [{ title: "", isbn: "", edition: "", className: "", subject: "", quantity: 1 }];
    const rfq = existing || recovered || {};
    openModal(existing ? "Update academic RFQ" : TITLES.school, "Academic fields and a verifiable delivery State plus City, District, or PIN code are required before publication. Material delivery changes are versioned and shared with responding suppliers.", `<form class="dashboard-form" data-dashboard-form="rfq" ${existing ? `data-rfq-id="${esc(existing.id)}"` : ""}>
      <label>RFQ name<input name="title" maxlength="160" placeholder="e.g. Class 9 science books · 2026–2027" value="${esc(rfq.title)}"></label>
      <div class="workspace-form-grid"><label>Academic session <b>*</b><input name="session" required maxlength="30" placeholder="2026–2027" value="${esc(rfq.session || profile.academicSession)}"></label><label>Education board <b>*</b><input name="board" required maxlength="80" placeholder="CBSE" value="${esc(rfq.board || profile.board)}"></label><label>Academic state <b>*</b><input name="state" required maxlength="100" placeholder="Delhi" value="${esc(rfq.state || profile.state)}"></label><label>Medium <b>*</b><input name="medium" required maxlength="80" placeholder="English" value="${esc(rfq.medium || profile.medium)}"></label><label>Delivery state<input name="deliveryState" maxlength="100" value="${esc(rfq.deliveryState || profile.state)}"></label><label>Delivery district<input name="deliveryDistrict" maxlength="100" value="${esc(rfq.deliveryDistrict || profile.district)}"></label><label>Delivery city<input name="deliveryCity" maxlength="100" value="${esc(rfq.deliveryCity || profile.city)}"></label><label>Delivery PIN code<input name="deliveryPostalCode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" value="${esc(rfq.deliveryPostalCode || profile.postalCode)}"></label><label>Quotation deadline<input name="responseDeadline" type="date" value="${esc(rfq.responseDeadline)}"></label><label>Indicative institution budget (optional)<input name="budget" type="number" min="0" step="0.01" value="${esc(rfq.budget ?? "")}"></label></div>
      <div class="rfq-line-form-header"><h3>Book requirements</h3><button type="button" class="text-action" data-add-rfq-line>＋ Add book</button></div><div class="rfq-line-builder">${lines.map((line, index) => rfqLineForm(line, index)).join("")}</div>
      ${existing?.status !== "draft" && existing ? `<label>Reason for material change <b>*</b><textarea name="changeReason" required minlength="10" maxlength="300" placeholder="Explain the requirement change so suppliers can review a new RFQ version."></textarea></label>` : ""}
      ${existing && existing.status !== "draft" ? `<button class="button button-outline" type="button" data-preview-rfq-impact="${esc(existing.id)}">Preview change impact</button><div class="rfq-impact-preview" aria-live="polite"></div>` : ""}<div class="dashboard-form-actions"><button class="button button-outline" type="submit" name="status" value="draft">Save draft</button><button class="button" type="submit" name="status" value="published">${existing?.status === "draft" ? "Publish requirement" : "Save changes"} →</button></div><small class="form-legal">Publication is blocked until organisation verification and academic fields are complete.</small></form>`);
  }

  function rfqLineForm(line = {}, index = 0) {
    return `<fieldset class="rfq-line-fields"><legend>Requirement ${index + 1}${index ? ` <button type="button" data-remove-line aria-label="Remove requirement ${index + 1}">Remove</button>` : ""}</legend><label class="catalogue-line-search">Search catalogue title / ISBN<input type="search" data-book-search autocomplete="off" placeholder="Search to link a verified catalogue record"><div class="catalogue-search-results" aria-live="polite"></div></label><input type="hidden" data-line-field="id" value="${esc(line.id || "")}"><input type="hidden" data-line-field="bookId" value="${esc(line.bookId || "")}"><div class="workspace-form-grid"><label>Book title <b>*</b><input data-line-field="title" required maxlength="180" value="${esc(line.title)}" placeholder="Book title"></label><label>ISBN-10 / ISBN-13<input data-line-field="isbn" maxlength="30" value="${esc(line.isbn)}" placeholder="13-digit ISBN"></label><label>Edition<input data-line-field="edition" maxlength="80" value="${esc(line.edition)}"></label><label>Class / grade<input data-line-field="className" maxlength="60" value="${esc(line.className)}"></label><label>Subject<input data-line-field="subject" maxlength="100" value="${esc(line.subject)}"></label><label>Required quantity <b>*</b><input data-line-field="quantity" type="number" required min="1" max="100000" step="1" value="${esc(line.quantity || 1)}"></label></div></fieldset>`;
  }

  function openQuoteForm(rfq) {
    if (currentUser.verificationStatus !== "verified") {
      toast("Your supplier account must be verified before you submit a quotation.", "error");
      return;
    }
    const existing = state.data?.quotes?.find(item => item.rfqId === rfq.id && ["draft", "submitted", "needs_revision", "no_bid"].includes(item.status));
    const localDraft = readLocalQuoteDraft(rfq.id);
    const source = localDraft || existing;
    const previousLines = source?.lines || [];
    openModal(existing || localDraft ? "Review or revise your quotation" : TITLES[currentUser.role], `${rfq.id} · ${rfq.board} · ${rfq.state} · ${rfq.medium} · Session ${rfq.session}. ${localDraft ? "A browser-local unsent draft was recovered." : existing ? `Current response: ${existing.status.replace(/_/g, " ")}.` : "Respond to every book line."}`, `<form class="dashboard-form" data-dashboard-form="quote" data-rfq-id="${esc(rfq.id)}"><div class="workspace-quote-lines">${rfq.lines.map((line, index) => {
      const previous = previousLines.find(item => item.rfqLineId === line.id) || previousLines[index];
      const availability = previous?.availability || "full";
      return `<fieldset class="quote-line"><legend>${esc(line.title)} · ${esc(line.className || "Academic book")} · ${fmt(line.quantity)} requested</legend><input type="hidden" data-quote-line-id value="${esc(line.id)}"><div class="workspace-form-grid"><label>Availability<select data-quote-availability required><option value="full" ${availability === "full" ? "selected" : ""}>Full supply</option><option value="partial" ${availability === "partial" ? "selected" : ""}>Partial supply</option><option value="unavailable" ${availability === "unavailable" ? "selected" : ""}>Unavailable</option></select></label><label>Available quantity<input data-quote-quantity type="number" min="0" max="${fmt(line.quantity)}" value="${esc(previous?.offeredQuantity ?? line.quantity)}" required></label><label>Unit price (₹)<input data-quote-price type="number" min="0" max="10000000" step="0.01" value="${esc(previous?.unitPrice ?? "")}" required placeholder="0.00"></label><label>Line note<input data-quote-note maxlength="300" value="${esc(previous?.note || "")}" placeholder="Optional edition / availability note"></label></div></fieldset>`;
    }).join("")}</div><div class="workspace-form-grid"><label>Discount amount (₹)<input name="discount" type="number" min="0" step="0.01" value="${esc(source?.charges?.discount ?? 0)}"></label><label>Tax amount (₹)<input name="tax" type="number" min="0" step="0.01" value="${esc(source?.charges?.tax ?? 0)}"></label><label>Freight / delivery charge (₹)<input name="freight" type="number" min="0" step="0.01" value="${esc(source?.charges?.freight ?? 0)}"></label><label>Packing charge (₹)<input name="packing" type="number" min="0" step="0.01" value="${esc(source?.charges?.packing ?? 0)}"></label><label>Expected delivery window <b>*</b><input name="deliveryEstimate" required maxlength="100" value="${esc(source?.deliveryEstimate || "")}" placeholder="e.g. 7–10 working days"></label><label>Quote valid through <b>*</b><input name="validThrough" type="date" required value="${esc(source?.validThrough || "")}"></label></div><label>Fulfilment notes<textarea name="fulfillmentNotes" maxlength="500" placeholder="Partial supply / delivery terms (no payment commitment is created).">${esc(source?.fulfillmentNotes || "")}</textarea></label><label>Standard no-bid reason<select name="noBidReasonCode"><option value="stock_unavailable" ${source?.reasonCode === "stock_unavailable" ? "selected" : ""}>Requested books unavailable</option><option value="outside_territory" ${source?.reasonCode === "outside_territory" ? "selected" : ""}>Outside service territory</option><option value="price_mismatch" ${source?.reasonCode === "price_mismatch" ? "selected" : ""}>Unable to meet pricing requirement</option><option value="deadline_unavailable" ${source?.reasonCode === "deadline_unavailable" ? "selected" : ""}>Cannot meet response or delivery deadline</option><option value="other" ${!source?.reasonCode || source?.reasonCode === "other" ? "selected" : ""}>Other reason</option></select></label><label>Additional no-bid note<textarea name="noBidReason" maxlength="500" placeholder="Optional context; required when selecting Other.">${esc(source?.reason || "")}</textarea></label><div class="dashboard-form-actions">${existing?.status !== "submitted" ? `<button class="button button-outline" type="submit" name="status" value="draft">Save quote draft</button>` : ""}<button class="button" type="submit" name="status" value="submitted">Submit or revise quotation →</button><button class="button button-outline" type="submit" name="submit" value="no_bid" formnovalidate>Submit no-bid response</button></div><small class="form-legal">Submitted quote revisions are versioned. No purchase, order, payment, or reservation is created. Browser-local drafts remain unsent until you explicitly save or submit.</small></form>`, "workspace-modal-wide");
    const form = modalRoot.querySelector('[data-dashboard-form="quote"]');
    form.querySelectorAll(".quote-line").forEach((fieldset, index) => {
      const grid = fieldset.querySelector(".workspace-form-grid");
      for (const [name, labelText, value] of [
        ["minimumOrderQuantity", "Minimum order quantity", previousLines[index]?.minimumOrderQuantity ?? 0],
        ["packSize", "Pack size", previousLines[index]?.packSize ?? 1]
      ]) {
        const label = document.createElement("label");
        label.textContent = labelText;
        const input = document.createElement("input");
        input.type = "number";
        input.min = name === "packSize" ? "1" : "0";
        input.step = "1";
        input.value = String(value);
        input.dataset[name === "packSize" ? "quotePack" : "quoteMoq"] = "";
        label.append(input);
        grid.append(label);
      }
    });
    form.elements.deliveryEstimate.required = false;
    form.elements.validThrough.required = false;
    const chargesGrid = form.querySelector(".workspace-quote-lines + .workspace-form-grid");
    const deliveryLabel = document.createElement("label");
    deliveryLabel.textContent = "Delivery option";
    const deliverySelect = document.createElement("select");
    deliverySelect.name = "deliveryMode";
    for (const [value, text] of [["delivery", "Deliver to school"], ["local_delivery", "Local delivery"], ["pickup", "School pickup"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      option.selected = (source?.deliveryMode || "delivery") === value;
      deliverySelect.append(option);
    }
    deliveryLabel.append(deliverySelect);
    chargesGrid.append(deliveryLabel);
    if (!form.elements.validThrough.value) {
      const validDate = new Date();
      validDate.setDate(validDate.getDate() + 14);
      form.elements.validThrough.value = validDate.toISOString().slice(0, 10);
    }
    form.querySelectorAll("[data-quote-availability]").forEach(select => select.addEventListener("change", () => {
      const row = select.closest(".quote-line");
      const quantity = row.querySelector("[data-quote-quantity]");
      if (select.value === "unavailable") quantity.value = "0";
      else if (select.value === "full") quantity.value = quantity.max;
      else quantity.value = Math.max(1, Math.floor(Number(quantity.max) / 2));
    }));
    const saveLocalDraft = () => {
      try {
        localStorage.setItem(quoteDraftKey(rfq.id), JSON.stringify({
          rfqId: rfq.id,
          title: rfq.title,
          savedAt: new Date().toISOString(),
          lines: [...form.querySelectorAll(".quote-line")].map(row => ({
            rfqLineId: row.querySelector("[data-quote-line-id]").value,
            offeredQuantity: row.querySelector("[data-quote-quantity]").value,
            unitPrice: row.querySelector("[data-quote-price]").value,
            availability: row.querySelector("[data-quote-availability]").value,
            note: row.querySelector("[data-quote-note]").value
          })),
          charges: {
            discount: form.elements.discount.value,
            tax: form.elements.tax.value,
            freight: form.elements.freight.value,
            packing: form.elements.packing.value
          },
          deliveryEstimate: form.elements.deliveryEstimate.value,
          validThrough: form.elements.validThrough.value,
          fulfillmentNotes: form.elements.fulfillmentNotes.value,
          reason: form.elements.noBidReason.value,
          reasonCode: form.elements.noBidReasonCode.value
        }));
      } catch (_error) {
        toast("Could not save this unsent quote to browser storage. Use Save quote draft to persist it to your account.", "error");
      }
    };
    form.addEventListener("input", saveLocalDraft);
    form.addEventListener("change", saveLocalDraft);
  }

  function quoteDraftKey(rfqId) {
    return `goerudite-quote-draft:${currentUser.id}:${rfqId}`;
  }

  function readLocalQuoteDraft(rfqId) {
    try {
      return JSON.parse(localStorage.getItem(quoteDraftKey(rfqId)) || "null");
    } catch (_error) {
      toast("A browser-local quote draft could not be read.", "error");
      return null;
    }
  }

  function openInventoryForm(item = null) {
    openModal(item ? "Edit stock availability" : "Update stock availability", "Record your own stock by title and ISBN. This changes only your inventory record; it does not reserve stock or promise fulfilment.", `<form class="dashboard-form" data-dashboard-form="inventory"><input type="hidden" name="expectedUpdatedAt" value="${esc(item?.updatedAt || "")}"><div class="workspace-form-grid"><label>Book title <b>*</b><input name="title" required maxlength="180" value="${esc(item?.title || "")}"></label><label>ISBN-10 / ISBN-13<input name="isbn" maxlength="30" value="${esc(item?.isbn || "")}"></label><label>Edition<input name="edition" maxlength="80" value="${esc(item?.edition || "")}"></label><label>Academic session<input name="session" maxlength="30" value="${esc(item?.session || "")}"></label><label>Available copies <b>*</b><input name="availableQuantity" type="number" required min="0" step="1" value="${esc(item?.availableQuantity ?? 0)}"></label><label>Reserved copies<input name="reservedQuantity" type="number" min="0" step="1" value="${esc(item?.reservedQuantity ?? 0)}"></label><label>Damaged copies<input name="damagedQuantity" type="number" min="0" step="1" value="${esc(item?.damagedQuantity ?? 0)}"></label><label>Low-stock alert threshold<input name="lowStockThreshold" type="number" min="0" step="1" value="${esc(item?.lowStockThreshold ?? 5)}"></label><label>Branch / warehouse<input name="location" maxlength="120" placeholder="Optional" value="${esc(item?.location || "")}"></label><label>Adjustment reason<input name="reason" required minlength="3" maxlength="300" placeholder="Stock count update" value="${item ? "Inventory count correction" : "Stock count update"}"></label></div><div class="dashboard-form-actions"><button class="button" type="submit">Save inventory update</button></div></form>`);
  }

  const publisherFields = [
    ["title", "Book title", "text", true],
    ["subtitle", "Subtitle", "text", false],
    ["author", "Author(s)", "text", false],
    ["publisher", "Publisher / imprint", "text", true],
    ["isbn", "ISBN-10 / ISBN-13", "text", true],
    ["subject", "Subject", "text", true],
    ["level", "Class / grade", "text", true],
    ["board", "Applicable board", "text", true],
    ["state", "Applicable state", "text", false],
    ["medium", "Academic medium", "text", true],
    ["edition", "Edition", "text", true],
    ["session", "Academic session", "text", true],
    ["pages", "Page count", "number", true],
    ["age", "Recommended age group", "text", true],
    ["publicationDate", "Published on", "date", true],
    ["format", "Book format", "text", true],
    ["publisherMrp", "Publisher list price / MRP (₹)", "number", true],
    ["priceEffectiveDate", "MRP effective date", "date", true],
    ["description", "Academic overview / description", "textarea", true],
    ["highlights", "Book highlights (one per line)", "textarea", true]
  ];

  function catalogueFieldsMarkup(values = {}) {
    return publisherFields.map(([key, label, type, required]) => {
      const storedValue = values[key] ?? (key === "publisher" ? currentUser.organizationName : key === "priceEffectiveDate" ? new Date().toISOString().slice(0, 10) : "");
      const value = Array.isArray(storedValue) ? storedValue.join("\n") : storedValue;
      const requiredAttribute = required ? "required" : "";
      if (type === "textarea") {
        const isHighlights = key === "highlights";
        return `<label class="${isHighlights ? "field-full" : ""}">${label}${required ? " *" : ""}<textarea name="${key}" ${requiredAttribute} ${key === "description" ? 'minlength="20" maxlength="5000"' : 'maxlength="3000"'} rows="${isHighlights ? 4 : 5}">${esc(value)}</textarea></label>`;
      }
      const max = type === "number" || type === "date" ? "" : key === "isbn" ? 'maxlength="30"' : 'maxlength="180"';
      const numeric = key === "pages" ? 'min="1" max="50000" step="1"' : type === "number" ? 'min="0" max="10000000" step="0.01"' : "";
      return `<label>${label}${required ? " *" : ""}<input name="${key}" type="${type}" ${requiredAttribute} ${max} ${numeric} value="${esc(value)}"></label>`;
    }).join("");
  }

  function openPublisherForm(item = null) {
    const values = item || {};
    openModal(item ? "Revise title submission" : TITLES.publisher, "Complete the book identity, academic mapping, publication details, description, highlights and dated MRP. Trade quotes and inventory are stored separately.", `<form class="dashboard-form" data-dashboard-form="catalogue" data-catalogue-id="${esc(item?.id || "")}"><div class="workspace-form-grid">${catalogueFieldsMarkup(values)}</div><div class="dashboard-form-actions"><button class="button button-outline" type="submit" name="submit" value="false">Save title draft</button><button class="button" type="submit" name="submit" value="true">Submit for human review →</button></div></form>`);
  }

  function openBookSuggestionForm(item = null) {
    openModal(item ? "Correct and resubmit book suggestion" : "Suggest a catalogue book", item ? `Administrator feedback: ${item.reviewReason || "Review the submitted details and correct any inaccurate fields."}` : "Fill in the book details. Your suggestion enters the administrator review queue and remains private until approved; it does not create inventory or a supplier price.", `<form class="dashboard-form" data-dashboard-form="catalogue-submission" ${item ? `data-submission-id="${esc(item.id)}"` : ""}><div class="workspace-form-grid">${catalogueFieldsMarkup(item || {})}</div><div class="dashboard-form-actions"><button class="button" type="submit">Submit book suggestion for review →</button></div></form>`);
  }

  function openReviewForm(type, id, decision) {
    const isCatalogue = type === "catalogue";
    const isSuspension = decision === "suspended";
    const title = isCatalogue ? decision === "published" ? "Approve academic title" : "Return title for correction" :
      isSuspension ? "Suspend organisation access" : decision === "active" ? "Restore organisation access" : decision === "verified" ? "Verify organisation account" : "Return account for correction";
    openModal(title, "Administrator decisions require a documented reason, are human-reviewed, notify the account owner, and are included in the audit history.", `<form class="dashboard-form" data-dashboard-form="admin-review" data-review-type="${type}" data-review-id="${esc(id)}" data-review-decision="${decision}"><label>Review reason <b>*</b><textarea name="reason" required minlength="10" maxlength="300" placeholder="Explain what you reviewed and why this decision is appropriate."></textarea></label><label class="workspace-check"><input name="confirmed" type="checkbox" required> I personally reviewed the submitted organisation or catalogue details.</label><div class="dashboard-form-actions"><button class="button" type="submit">Confirm ${esc(decision.replace(/_/g, " "))}</button></div></form>`);
  }

  function openEvaluationForm(id) {
    const quote = (state.data?.quotations || []).find(item => item.id === id);
    const rfq = (state.data?.rfqs || []).find(item => item.id === quote?.rfqId);
    const overBudget = rfq?.budget != null && Number.isFinite(Number(rfq.budget)) && quote?.total != null && quote.total > Number(rfq.budget);
    openModal("Record internal quotation evaluation", "This decision is for the school’s comparison workflow only. It does not accept an order or create a commercial commitment.", `<form class="dashboard-form" data-dashboard-form="evaluation" data-quote-id="${esc(id)}">${overBudget ? `<div class="workspace-note budget-warning-note"><b>Budget guardrail</b><p>Quoted total ${currency(quote.total)} exceeds the RFQ budget ${currency(rfq.budget)}. An authorised reviewer must document an override to select this quote.</p></div><label>Authorised budget override reason <b>*</b><textarea name="budgetOverrideReason" required minlength="10" maxlength="300" placeholder="Explain the authority and reason for exceeding the budget."></textarea></label>` : ""}<label>Evaluation decision<select name="decision" required><option value="selected_for_evaluation">Preferred for further evaluation</option><option value="not_selected">Not selected for further evaluation</option></select></label><label>Decision reason <b>*</b><textarea name="reason" required minlength="5" maxlength="500" placeholder="Record the academic, availability, budget, and approval rationale."></textarea></label><div class="dashboard-form-actions"><button class="button" type="submit">Save evaluation decision</button></div></form>`);
  }

  function rfqVersionComparison(rfq, version) {
    const previous = version.snapshot || {};
    const changes = [];
    for (const [key, label] of [["session", "Session"], ["board", "Board"], ["state", "State"], ["medium", "Medium"], ["deliveryCity", "Delivery location"], ["responseDeadline", "Response deadline"], ["budget", "Budget"]]) {
      const oldValue = previous[key] ?? "";
      const currentValue = rfq[key] ?? "";
      if (String(oldValue) !== String(currentValue)) changes.push(`<li>${label}: ${esc(oldValue || "Not set")} → ${esc(currentValue || "Not set")}</li>`);
    }
    const currentLines = new Map((rfq.lines || []).map(line => [line.id, line]));
    const previousIds = new Set();
    for (const line of previous.lines || []) {
      previousIds.add(line.id);
      const current = currentLines.get(line.id);
      if (!current) changes.push(`<li>Removed: ${esc(line.title)} · ${fmt(line.quantity)} copies</li>`);
      else if (line.title !== current.title || Number(line.quantity) !== Number(current.quantity) || line.isbn !== current.isbn || line.edition !== current.edition) {
        changes.push(`<li>${esc(line.title)} → ${esc(current.title)} · ${fmt(line.quantity)} → ${fmt(current.quantity)} copies${line.isbn !== current.isbn ? ` · ISBN ${esc(line.isbn || "—")} → ${esc(current.isbn || "—")}` : ""}${line.edition !== current.edition ? ` · edition ${esc(line.edition || "—")} → ${esc(current.edition || "—")}` : ""}</li>`);
      }
    }
    for (const line of rfq.lines || []) if (!previousIds.has(line.id)) changes.push(`<li>Added: ${esc(line.title)} · ${fmt(line.quantity)} copies</li>`);
    return `<article><b>Version ${version.version} → ${Number(version.version) + 1}</b><small>${esc(version.changeReason)} · ${timestamp(version.createdAt)}</small>${changes.length ? `<ul>${changes.join("")}</ul>` : "<p>No material field differences recorded.</p>"}</article>`;
  }

  function rfqDetail(rfq) {
    const quotes = (state.data?.quotations || []).filter(item => item.rfqId === rfq.id);
    openModal(rfq.title, `${rfq.id} · Version ${rfq.version || 1} · ${rfq.session} · ${rfq.board} · ${rfq.state} · ${rfq.medium}`, `<div class="workspace-detail-lines">${rfq.lines.map(line => `<article><b>${esc(line.title)}</b><span>${fmt(line.quantity)} copies · ${esc(line.className || "Class not set")} · ${esc(line.subject || "Subject not set")}</span><small>${line.isbn ? `ISBN ${esc(line.isbn)}` : "ISBN not provided"} · ${esc(line.edition || "Edition not specified")}</small></article>`).join("")}</div>${status(rfq.status)}<h3 class="workspace-modal-subtitle">Supplier response snapshot</h3>${quoteTable(quotes)}${rfq.versions?.length ? `<details class="workspace-version-history"><summary>Compare ${rfq.versions.length} previous RFQ version(s)</summary>${rfq.versions.map(item => rfqVersionComparison(rfq, item)).join("")}</details>` : ""}`);
  }

  async function reloadDashboard() {
    state.loading = true;
    paint();
    try {
      state.data = await api("/api/dashboard");
      state.blogs = currentUser.role === "admin" ? (await api("/api/admin/blog")).items : [];
      if (currentUser.role === "admin") {
        const adResult = await api("/api/admin/advertisements");
        state.ads = adResult.items;
        state.advertisers = adResult.advertisers;
      }
      if (!activeRole().sections.some(([key]) => key === state.section)) state.section = "overview";
    } catch (error) {
      toast(error.message, "error");
      state.data = null;
    } finally {
      state.loading = false;
      paint();
    }
  }

  function paint() {
    if (!currentUser) {
      layout(`<section class="workspace-gate"><span class="eyebrow">GoErudite role workspaces</span><h1>Sign in to your role dashboard</h1><p>School buyers, distributors, retailers, publishers, and authorised administrators receive separate, permission-checked dashboards.</p><button class="button" data-auth="login">Log in ${arrow}</button><button class="button button-outline" data-auth="register">Create an account</button></section>`, "workspace-page");
      return;
    }
    layout(dashboardShell(sectionContent()), "workspace-page");
    bindWorkspace();
  }

  function bindWorkspace() {
    document.querySelectorAll("[data-dash-section]").forEach(button => button.addEventListener("click", () => {
      state.section = button.dataset.dashSection;
      document.querySelector(".workspace-sidebar")?.classList.remove("workspace-sidebar-open");
      document.querySelector("[data-workspace-menu]")?.setAttribute("aria-expanded", "false");
      paint();
      if (state.section === "backup") loadBackupStatus();
      if (state.section === "territories") loadTerritories();
    }));
    document.querySelector('[data-dashboard-form="profile"]')?.addEventListener("submit", submitDashboardForm);
    document.querySelectorAll('[data-dashboard-form="mfa-start"], [data-dashboard-form="mfa-verify"], [data-dashboard-form="mfa-disable"], [data-dashboard-form="supplier-territory"], [data-dashboard-form="territory-exception"]').forEach(form => form.addEventListener("submit", submitDashboardForm));
    document.querySelector("[data-mfa-recovery-ack]")?.addEventListener("click", () => {
      state.recoveryCodes = null;
      paint();
    });
    document.querySelector("[data-audit-verify]")?.addEventListener("click", async () => {
      try {
        state.auditVerification = (await api("/api/admin/audit/verify")).verification;
        paint();
      } catch (error) {
        toast(error.message, "error");
      }
    });
    document.querySelectorAll("[data-remove-territory]").forEach(button => button.addEventListener("click", async () => {
      try {
        await api(`/api/admin/supplier-territories/${encodeURIComponent(button.dataset.removeTerritory)}`, { method: "DELETE" });
        loadTerritories();
        toast("Supplier service area removed and audit logged.");
      } catch (error) {
        toast(error.message, "error");
      }
    }));
    document.querySelectorAll("[data-revoke-territory-exception]").forEach(button => button.addEventListener("click", async () => {
      try {
        await api(`/api/admin/territory-exceptions/${encodeURIComponent(button.dataset.revokeTerritoryException)}`, { method: "DELETE" });
        loadTerritories();
        toast("Territory exception revoked and audit logged.");
      } catch (error) {
        toast(error.message, "error");
      }
    }));
    document.querySelectorAll("[data-section-link]").forEach(button => button.addEventListener("click", () => {
      state.section = button.dataset.sectionLink;
      document.querySelector(".workspace-sidebar")?.classList.remove("workspace-sidebar-open");
      document.querySelector("[data-workspace-menu]")?.setAttribute("aria-expanded", "false");
      paint();
      if (state.section === "backup") loadBackupStatus();
      if (state.section === "territories") loadTerritories();
    }));
    document.querySelector("[data-team-invite-form]")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form));
        const result = await api("/api/team/invites", { method: "POST", body: JSON.stringify(values) });
        state.lastInvite = {
          email: result.invitation.email,
          expiresAt: result.invitation.expiresAt,
          url: new URL(result.invitePath, location.origin).href,
          emailDelivery: result.emailDelivery
        };
        await reloadDashboard();
        toast(result.emailDelivery?.message || "One-time invitation created.");
      } catch (error) {
        toast(error.message, "error");
        submit.disabled = false;
      }
    });
    document.querySelectorAll("[data-revoke-invite]").forEach(button => button.addEventListener("click", async () => {
      if (!window.confirm("Revoke this unused invitation? The invite link will stop working immediately.")) return;
      try {
        await api(`/api/team/invites/${encodeURIComponent(button.dataset.revokeInvite)}`, { method: "DELETE" });
        toast("Invitation revoked.");
        await reloadDashboard();
      } catch (error) { toast(error.message, "error"); }
    }));
    document.querySelector("[data-copy-created-invite]")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(state.lastInvite.url);
        toast("Invitation link copied.");
      } catch (_error) {
        toast("Clipboard access was denied. Copy the visible invitation URL manually.", "error");
      }
    });
    document.querySelector("[data-create-backup]")?.addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      try {
        const result = await api("/api/admin/backups", { method: "POST", body: JSON.stringify({}) });
        state.backups = result.items;
        toast(`Local backup created and integrity checked (${fmt(result.backup.sizeBytes)} bytes).`);
        paint();
      } catch (error) {
        toast(error.message, "error");
        event.currentTarget.disabled = false;
      }
    });
    document.querySelectorAll("[data-restore-backup]").forEach(button => button.addEventListener("click", () => {
      const name = button.dataset.restoreBackup;
      openModal("Restore local backup", `This will replace the current store with ${name}. A verified safety backup of current data will be created first. Type the exact filename to continue.`, `<form class="dashboard-form" data-backup-restore-form data-backup-name="${esc(name)}"><label>Type backup filename <b>*</b><input name="confirmation" required autocomplete="off" spellcheck="false"></label><div class="dashboard-form-actions"><button class="button" type="submit">Restore backup</button></div></form>`);
      document.querySelector("[data-backup-restore-form]")?.addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
          const confirmation = form.elements.confirmation.value;
          await api("/api/admin/backups/restore", {
            method: "POST",
            body: JSON.stringify({ name: form.dataset.backupName, confirmation })
          });
          modalRoot.innerHTML = "";
          toast("Backup restored. A safety backup of the previous data was created.");
          await reloadDashboard();
          loadBackupStatus();
        } catch (error) {
          toast(error.message, "error");
          submit.disabled = false;
        }
      });
    }));
    document.querySelectorAll("[data-approve-request]").forEach(button => button.addEventListener("click", () =>
      openPurchaseDecisionForm(button.dataset.approveRequest, button.dataset.decision)));
    document.querySelector("[data-workspace-menu]")?.addEventListener("click", event => {
      const isOpen = document.querySelector(".workspace-sidebar")?.classList.toggle("workspace-sidebar-open") || false;
      event.currentTarget.setAttribute("aria-expanded", String(isOpen));
    });
    document.querySelectorAll("[data-open-form]").forEach(button => button.addEventListener("click", () => {
      const type = button.dataset.openForm;
      if (type === "rfq") openRfqForm();
      if (type === "inventory") openInventoryForm();
      if (type === "catalogue") openPublisherForm();
      if (type === "catalogue-submission") openBookSuggestionForm();
    }));
    document.querySelector("[data-blog-new]")?.addEventListener("click", () => blogEditor());
    document.querySelector("[data-ad-new]")?.addEventListener("click", () => advertisementEditor());
    document.querySelectorAll("[data-ad-edit]").forEach(button => button.addEventListener("click", () => {
      const item = state.ads?.find(ad => ad.id === button.dataset.adEdit);
      if (item) advertisementEditor(item);
    }));
    document.querySelectorAll("[data-ad-delete]").forEach(button => button.addEventListener("click", async () => {
      const item = state.ads?.find(ad => ad.id === button.dataset.adDelete);
      if (!item || !window.confirm(`Delete advertisement “${item.title}”? Its public page will be removed.`)) return;
      try {
        await api(`/api/admin/advertisements/${encodeURIComponent(item.id)}`, { method: "DELETE" });
        toast("Advertisement deleted.");
        await reloadDashboard();
      } catch (error) { toast(error.message, "error"); }
    }));
    document.querySelectorAll("[data-blog-edit]").forEach(button => button.addEventListener("click", () => {
      const item = state.blogs?.find(post => post.id === button.dataset.blogEdit);
      if (item) blogEditor(item);
    }));
    document.querySelectorAll("[data-blog-preview]").forEach(button => button.addEventListener("click", () => {
      const item = state.blogs?.find(post => post.id === button.dataset.blogPreview);
      if (item) showBlogPreview(item);
    }));
    document.querySelectorAll("[data-blog-action]").forEach(button => button.addEventListener("click", async () => {
      const item = state.blogs?.find(post => post.id === button.dataset.blogId);
      if (!item) return toast("Blog post is no longer available. Refresh and try again.", "error");
      try {
        await api(`/api/admin/blog/${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ ...item, action: button.dataset.blogAction })
        });
        toast(button.dataset.blogAction === "publish" ? "Blog post published." : "Blog post unpublished and saved as a draft.");
        await reloadDashboard();
      } catch (error) { toast(error.message, "error"); }
    }));
    document.querySelectorAll("[data-blog-delete]").forEach(button => button.addEventListener("click", async () => {
      const item = state.blogs?.find(post => post.id === button.dataset.blogDelete);
      if (!item || !window.confirm(`Delete “${item.title}”? This permanently removes it from public pages.`)) return;
      try {
        await api(`/api/admin/blog/${encodeURIComponent(item.id)}`, { method: "DELETE" });
        toast("Blog post deleted.");
        await reloadDashboard();
      } catch (error) { toast(error.message, "error"); }
    }));
    document.querySelectorAll("[data-compare-rfq]").forEach(button => button.addEventListener("click", async () => {
      try {
        const { items } = await api(`/api/rfqs/${encodeURIComponent(button.dataset.compareRfq)}/quotes`);
        const rfq = state.data.rfqs.find(item => item.id === button.dataset.compareRfq);
        openModal("Quotation comparison", `${rfq?.title || button.dataset.compareRfq} · Comparison only. This is not a purchase order.`, quoteTable(items.map(item => ({ ...item, supplier: item.supplier || "Verified supply partner" }))));
      } catch (error) { toast(error.message, "error"); }
    }));
    document.querySelectorAll("[data-split-plan]").forEach(button => button.addEventListener("click", async () => {
      try {
        const { plan } = await api(`/api/rfqs/${encodeURIComponent(button.dataset.splitPlan)}/split-plan`);
        const allocationRows = plan.allocations.map(item => `<li>${esc(item.title)} · ${fmt(item.quantity)} copies from ${esc(item.quoteId)} · ${currency(item.estimatedLineTotal)}</li>`).join("");
        const gaps = plan.gaps.map(item => `<li>${esc(item.title)} · ${fmt(item.quantity)} copies not covered</li>`).join("");
        openModal("Indicative split-supply plan", plan.note, `<h3>Suggested allocation</h3>${allocationRows ? `<ul>${allocationRows}</ul>` : "<p>No eligible submitted quotes are available.</p>"}${gaps ? `<h3>Uncovered demand</h3><ul>${gaps}</ul>` : "<p>Submitted offers cover the requested line quantities.</p>"}<p>Estimated line total (quote-level charges excluded): ${currency(plan.estimatedLineTotal)}</p>`);
      } catch (error) { toast(error.message, "error"); }
    }));
    document.querySelectorAll("[data-rfq-detail]").forEach(button => button.addEventListener("click", () => {
      const rfq = state.data.rfqs.find(item => item.id === button.dataset.rfqDetail);
      if (rfq) rfqDetail(rfq);
    }));
    document.querySelectorAll("[data-rfq-action]").forEach(button => button.addEventListener("click", () => updateRfq(button.dataset.rfqId, button.dataset.rfqAction)));
    document.querySelectorAll("[data-edit-rfq]").forEach(button => button.addEventListener("click", () => {
      const rfq = state.data.rfqs.find(item => item.id === button.dataset.editRfq);
      if (rfq) openRfqForm(rfq);
    }));
    document.querySelectorAll("[data-quote-rfq]").forEach(button => button.addEventListener("click", () => {
      const rfq = state.data.opportunities.find(item => item.id === button.dataset.quoteRfq);
      if (rfq) openQuoteForm(rfq);
    }));
    document.querySelectorAll("[data-resume-quote]").forEach(button => button.addEventListener("click", () => {
      const rfq = state.data.opportunities.find(item => item.id === button.dataset.resumeQuote);
      if (rfq) openQuoteForm(rfq);
    }));
    document.querySelectorAll("[data-delete-offline-draft]").forEach(button => button.addEventListener("click", () => {
      try {
        localStorage.removeItem(button.dataset.deleteOfflineDraft);
        toast("Browser-local quotation draft deleted.");
        paint();
      } catch (_error) {
        toast("Could not delete the browser-local quotation draft.", "error");
      }
    }));
    document.querySelectorAll("[data-evaluate-quote]").forEach(button => button.addEventListener("click", () => openEvaluationForm(button.dataset.evaluateQuote)));
    document.querySelectorAll("[data-admin-review]").forEach(button => button.addEventListener("click", () => openReviewForm("user", button.dataset.userId, button.dataset.adminReview)));
    document.querySelectorAll("[data-catalogue-review]").forEach(button => button.addEventListener("click", () => openReviewForm("catalogue", button.dataset.catalogueId, button.dataset.catalogueReview)));
    document.querySelector("[data-audit-search-form]")?.addEventListener("submit", async event => {
      event.preventDefault();
      const filters = Object.fromEntries(new FormData(event.currentTarget));
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      try {
        const result = await api(`/api/admin/audit?${query.toString()}`);
        state.auditSearch = { ...result, filters };
        paint();
      } catch (error) {
        toast(error.message, "error");
      }
    });
    document.querySelectorAll("[data-withdrawal-decision]").forEach(button => button.addEventListener("click", () => {
      openModal("Review withdrawal request", "Record the reason for approving or rejecting this publisher request.", `<form class="dashboard-form" data-dashboard-form="withdrawal-review" data-catalogue-id="${esc(button.dataset.catalogueId)}" data-decision="${esc(button.dataset.withdrawalDecision)}"><label>Decision note <b>*</b><textarea name="note" required minlength="10" maxlength="500"></textarea></label><div class="dashboard-form-actions"><button class="button" type="submit">Save decision</button></div></form>`);
      bindModal();
    }));
    document.querySelectorAll("[data-edit-catalogue]").forEach(button => button.addEventListener("click", () => {
      const item = state.data.catalogue.find(record => record.id === button.dataset.editCatalogue);
      if (item) openPublisherForm(item);
    }));
    document.querySelectorAll("[data-edit-submission]").forEach(button => button.addEventListener("click", () => {
      const item = state.data.catalogueSubmissions.find(record => record.id === button.dataset.editSubmission);
      if (item) openBookSuggestionForm(item);
    }));
    document.querySelectorAll("[data-edit-inventory]").forEach(button => button.addEventListener("click", () => {
      const item = state.data.inventory.find(record => record.id === button.dataset.editInventory);
      if (item) openInventoryForm(item);
    }));
    document.querySelectorAll("[data-read-notification]").forEach(button => button.addEventListener("click", async () => {
      try {
        await api("/api/notifications", { method: "POST", body: JSON.stringify({ id: button.dataset.readNotification }) });
        await reloadDashboard();
      } catch (error) { toast(error.message, "error"); }
    }));
    document.querySelector("[data-import-inventory]")?.addEventListener("click", () => document.querySelector("#inventory-file")?.click());
    document.querySelector("#inventory-file")?.addEventListener("change", importInventory);
    document.querySelector("[data-inventory-search]")?.addEventListener("input", event => {
      const query = event.target.value.trim().toLocaleLowerCase();
      document.querySelectorAll(".workspace-table tbody tr").forEach(row => {
        row.hidden = query !== "" && !row.textContent.toLocaleLowerCase().includes(query);
      });
    });
    document.querySelector("[data-opportunity-filter]")?.addEventListener("input", event => {
      const query = event.target.value.trim().toLocaleLowerCase();
      document.querySelectorAll(".opportunity-card").forEach(card => {
        card.hidden = query !== "" && !card.textContent.toLocaleLowerCase().includes(query);
      });
    });
    document.querySelector("[data-import-rfq]")?.addEventListener("click", () => document.querySelector("#rfq-import-file")?.click());
    document.querySelector("#rfq-import-file")?.addEventListener("change", importRfqs);
    document.querySelector("[data-import-publisher]")?.addEventListener("click", () => document.querySelector("#publisher-file")?.click());
    document.querySelector("#publisher-file")?.addEventListener("change", importPublisherCatalogue);
    document.querySelectorAll("[data-request-withdrawal]").forEach(button => button.addEventListener("click", () => {
      openModal("Request catalogue withdrawal", "This remains listed until an administrator reviews the request.", `<form class="dashboard-form" data-dashboard-form="publisher-withdrawal" data-catalogue-id="${esc(button.dataset.requestWithdrawal)}"><label>Reason for withdrawal <b>*</b><textarea name="reason" required minlength="10" maxlength="500"></textarea></label><div class="dashboard-form-actions"><button class="button" type="submit">Submit withdrawal request</button></div></form>`);
      bindModal();
    }));
    document.querySelectorAll("[data-support-update]").forEach(button => button.addEventListener("click", () => {
      const selectedStatus = button.closest("tr")?.querySelector("[data-support-status]")?.value;
      if (selectedStatus) updateSupportStatus(button.dataset.supportUpdate, selectedStatus);
    }));
    document.querySelectorAll("[data-create-order]").forEach(button => button.addEventListener("click", () => openOrderForm(button.dataset.createOrder, button.dataset.quoteId)));
    document.querySelectorAll("[data-update-order]").forEach(button => button.addEventListener("click", () => {
      const card = button.closest(".order-card");
      const selectedStatus = card?.querySelector("[data-order-status]")?.value;
      const note = card?.querySelector("[data-order-note]")?.value;
      const tracking = card?.querySelector("[data-order-tracking]")?.value;
      if (selectedStatus === "dispatched") openDispatchForm(button.dataset.updateOrder, note, tracking);
      else updateOrderFulfilment(button.dataset.updateOrder, selectedStatus, note, tracking);
    }));
    document.querySelectorAll("[data-order-receipt]").forEach(button => button.addEventListener("click", () => openReceiptForm(button.dataset.orderReceipt)));
    document.querySelectorAll("[data-amend-order]").forEach(button => button.addEventListener("click", () => openOrderAmendmentForm(button.dataset.amendOrder)));
    document.querySelectorAll("[data-cancel-order]").forEach(button => button.addEventListener("click", () => openOrderCancellationForm(button.dataset.cancelOrder)));
    document.querySelectorAll("[data-report-dispute]").forEach(button => button.addEventListener("click", () => openDisputeForm(button.dataset.reportDispute)));
    document.querySelectorAll("[data-dispute-action]").forEach(button => button.addEventListener("click", () =>
      openDisputeActionForm(button.dataset.disputeId, button.dataset.disputeAction)));
  }

  function bindModal() {
    const rfqBuilder = modalRoot.querySelector(".rfq-line-builder");
    const rfqForm = modalRoot.querySelector('[data-dashboard-form="rfq"]:not([data-rfq-id])');
    modalRoot.querySelector("[data-preview-rfq-impact]")?.addEventListener("click", async event => {
      const form = event.currentTarget.closest("form");
      const preview = form.querySelector(".rfq-impact-preview");
      const lines = [...form.querySelectorAll(".rfq-line-fields")].map(fieldset =>
        Object.fromEntries([...fieldset.querySelectorAll("[data-line-field]")].map(input => [input.dataset.lineField, input.value]))
      );
      try {
        const result = await api(`/api/rfqs/${encodeURIComponent(event.currentTarget.dataset.previewRfqImpact)}/impact-preview`, {
          method: "POST",
          body: JSON.stringify({ lines })
        });
        preview.innerHTML = `<h3>Change impact</h3>${result.changes.length ? `<ul>${result.changes.map(change => `<li>${esc(change.type)} · ${esc(change.title)}${change.newTitle ? ` → ${esc(change.newTitle)}` : ""}${change.oldQuantity != null || change.newQuantity != null ? ` · ${change.oldQuantity ?? "—"} → ${change.newQuantity ?? "—"} copies` : ""}</li>`).join("")}</ul>` : "<p>No material book-line changes detected.</p>"}<p>${fmt(result.affectedQuoteCount)} existing quotation(s) may require revision.</p><p>${esc(result.warning)}</p>`;
      } catch (error) {
        preview.textContent = error.message;
        toast(error.message, "error");
      }
    });
    rfqBuilder?.addEventListener("input", event => {
      const input = event.target.closest("[data-book-search]");
      if (!input) return;
      const query = input.value.trim();
      const resultPanel = input.parentElement.querySelector(".catalogue-search-results");
      const requestId = String(Number(input.dataset.searchRequestId || 0) + 1);
      input.dataset.searchRequestId = requestId;
      if (query.length < 2) {
        resultPanel.innerHTML = "";
        return;
      }
      clearTimeout(input.searchTimer);
      input.searchTimer = setTimeout(async () => {
        try {
          const result = await api(`/api/catalog?q=${encodeURIComponent(query)}`);
          if (input.dataset.searchRequestId !== requestId) return;
          resultPanel.innerHTML = result.items.length ? result.items.map(book => `<button type="button" class="catalogue-search-result" data-book-id="${esc(book.id)}" data-book-title="${esc(book.title)}" data-book-isbn="${esc(book.isbn)}" data-book-edition="${esc(book.edition)}" data-book-class="${esc(book.level)}" data-book-subject="${esc(book.subject)}">${esc(book.title)} · ${esc(book.edition || "edition not listed")} · ${esc(book.isbn || "ISBN not listed")}</button>`).join("") : "<p>No catalogue titles matched. You can still enter and review the book manually.</p>";
        } catch (error) {
          if (input.dataset.searchRequestId === requestId) resultPanel.textContent = `Catalogue search failed: ${error.message}`;
        }
      }, 250);
    });
    rfqBuilder?.addEventListener("click", event => {
      const button = event.target.closest("[data-book-id]");
      if (!button) return;
      const row = button.closest(".rfq-line-fields");
      const set = (field, value) => { row.querySelector(`[data-line-field="${field}"]`).value = value || ""; };
      set("bookId", button.dataset.bookId);
      set("title", button.dataset.bookTitle);
      set("isbn", /^(?:\d{9}[\dX]|\d{13})$/i.test(button.dataset.bookIsbn || "") ? button.dataset.bookIsbn : "");
      set("edition", button.dataset.bookEdition);
      set("className", button.dataset.bookClass);
      set("subject", button.dataset.bookSubject);
      row.querySelector(".catalogue-search-results").innerHTML = `<p>Selected catalogue record: ${esc(button.dataset.bookTitle)}. Review edition and academic fit before publishing.</p>`;
      row.querySelector("[data-book-search]").value = button.dataset.bookTitle;
    });
    modalRoot.querySelectorAll("[data-create-order]").forEach(button => button.addEventListener("click", () => openOrderForm(button.dataset.createOrder, button.dataset.quoteId)));
    modalRoot.querySelectorAll("[data-order-receipt]").forEach(button => button.addEventListener("click", () => openReceiptForm(button.dataset.orderReceipt)));
    rfqForm?.addEventListener("input", () => {
      try {
        const values = Object.fromEntries(new FormData(rfqForm));
        values.lines = [...rfqForm.querySelectorAll(".rfq-line-fields")].map(fieldset =>
          Object.fromEntries([...fieldset.querySelectorAll("[data-line-field]")].map(input => [input.dataset.lineField, input.value]))
        );
        localStorage.setItem(`goerudite-rfq-draft-${currentUser.id}`, JSON.stringify(values));
      } catch (_error) {
        toast("Browser draft recovery is unavailable. Save the RFQ draft before leaving this page.", "error");
      }
    });
    modalRoot.querySelector("[data-add-rfq-line]")?.addEventListener("click", () => {
      const index = rfqBuilder.querySelectorAll(".rfq-line-fields").length;
      rfqBuilder.insertAdjacentHTML("beforeend", rfqLineForm({}, index));
      rfqBuilder.lastElementChild.querySelector("input")?.focus();
      bindRemoveLines();
    });
    bindRemoveLines();
    modalRoot.querySelectorAll('button[type="submit"][name="status"],button[type="submit"][name="submit"]').forEach(button => button.addEventListener("click", () => {
      button.form.dataset.submitAction = button.value;
    }));
    modalRoot.querySelectorAll('[data-dashboard-form]').forEach(form => form.addEventListener("submit", submitDashboardForm));
    modalRoot.querySelectorAll("[data-blog-submit]").forEach(button => button.addEventListener("click", () => {
      button.form.dataset.blogAction = button.dataset.blogSubmit;
    }));
    modalRoot.querySelector('[data-dashboard-form="advertisement"] input[name="cover"]')?.addEventListener("change", event => {
      const file = event.currentTarget.files[0];
      if (!file) return;
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 180 * 1024) {
        event.currentTarget.value = "";
        toast("Choose a PNG, JPEG, or WebP advertisement image no larger than 180 KB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const preview = modalRoot.querySelector(".ad-cover-preview");
        preview.innerHTML = `<img src="${esc(reader.result)}" alt="Selected advertisement image preview">`;
      };
      reader.onerror = () => toast("Could not read the selected advertisement image.", "error");
      reader.readAsDataURL(file);
    });
    modalRoot.querySelector("[data-blog-preview-form]")?.addEventListener("click", async () => {
      const form = modalRoot.querySelector('[data-dashboard-form="blog"]');
      try { await previewBlogForm(form); } catch (error) { toast(error.message, "error"); }
    });
    modalRoot.querySelector("[data-blog-return]")?.addEventListener("click", () => {
      const draft = state.blogPreviewDraft;
      if (!draft) return;
      const existing = draft.id ? state.blogs?.find(item => item.id === draft.id) : null;
      state.blogPreviewDraft = null;
      blogEditor(existing, draft);
    });
    modalRoot.querySelector('[data-dashboard-form="blog"] input[name="cover"]')?.addEventListener("change", event => {
      const file = event.currentTarget.files[0];
      if (!file) return;
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 180 * 1024) {
        event.currentTarget.value = "";
        toast("Choose a PNG, JPEG, or WebP cover image no larger than 180 KB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const preview = modalRoot.querySelector(".blog-cover-preview");
        preview.innerHTML = `<img src="${esc(reader.result)}" alt="Selected blog cover preview">`;
      };
      reader.onerror = () => toast("Could not read the selected cover image.", "error");
      reader.readAsDataURL(file);
    });
  }

  function bindRemoveLines() {
    modalRoot.querySelectorAll("[data-remove-line]").forEach(button => {
      button.onclick = () => button.closest(".rfq-line-fields").remove();
    });
  }

  async function submitDashboardForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]:focus') || form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      if (form.dataset.dashboardForm === "mfa-start") {
        const values = Object.fromEntries(new FormData(form));
        state.mfaEnrollment = await api("/api/auth/mfa/enroll/start", {
          method: "POST",
          body: JSON.stringify({ password: values.password })
        });
        paint();
      } else if (form.dataset.dashboardForm === "mfa-verify") {
        const values = Object.fromEntries(new FormData(form));
        const result = await api("/api/auth/mfa/enroll/verify", { method: "POST", body: JSON.stringify(values) });
        currentUser = result.user;
        state.data.user = result.user;
        state.mfaEnrollment = null;
        state.recoveryCodes = result.recoveryCodes;
        paint();
      } else if (form.dataset.dashboardForm === "mfa-disable") {
        const values = Object.fromEntries(new FormData(form));
        const result = await api("/api/auth/mfa/disable", { method: "POST", body: JSON.stringify(values) });
        currentUser = result.user;
        await reloadDashboard();
        toast("Optional MFA disabled. The action was audit logged.");
      } else if (form.dataset.dashboardForm === "supplier-territory") {
        const values = Object.fromEntries(new FormData(form));
        await api("/api/admin/supplier-territories", { method: "POST", body: JSON.stringify(values) });
        loadTerritories();
        toast("Supplier service area saved and audit logged.");
      } else if (form.dataset.dashboardForm === "territory-exception") {
        const values = Object.fromEntries(new FormData(form));
        const expiry = new Date(values.expiresAt);
        if (!Number.isFinite(expiry.getTime())) throw new Error("Choose a valid exception expiry date and time.");
        values.expiresAt = expiry.toISOString();
        await api("/api/admin/territory-exceptions", { method: "POST", body: JSON.stringify(values) });
        loadTerritories();
        toast("Single-RFQ territory exception approved and audit logged.");
      } else if (form.dataset.dashboardForm === "advertisement") {
        const values = Object.fromEntries(new FormData(form));
        const file = form.elements.cover.files[0];
        let coverImage = form.dataset.coverImage || "";
        if (file) {
          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 180 * 1024) {
            throw new Error("Choose a PNG, JPEG, or WebP advertisement image no larger than 180 KB.");
          }
          coverImage = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Could not read the selected advertisement image."));
            reader.readAsDataURL(file);
          });
        }
        const body = { ...values, coverImage };
        delete body.cover;
        const itemId = form.dataset.adId;
        await api(itemId ? `/api/admin/advertisements/${encodeURIComponent(itemId)}` : "/api/admin/advertisements", {
          method: itemId ? "PATCH" : "POST",
          body: JSON.stringify(body)
        });
        modalRoot.innerHTML = "";
        toast(body.action === "active" ? "Advertisement campaign activated." : "Advertisement campaign saved.");
        await reloadDashboard();
      } else if (form.dataset.dashboardForm === "blog") {
        const values = Object.fromEntries(new FormData(form));
        const action = form.dataset.blogAction || "draft";
        const file = form.elements.cover.files[0];
        let coverImage = form.dataset.coverImage || "";
        if (file) {
          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 180 * 1024) {
            throw new Error("Choose a PNG, JPEG, or WebP cover image no larger than 180 KB.");
          }
          coverImage = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Could not read the selected cover image."));
            reader.readAsDataURL(file);
          });
        }
        if (!coverImage) throw new Error("A cover image is required.");
        if (action === "schedule") {
          if (!values.scheduledAt) throw new Error("Choose a future publication date and time.");
          const schedule = new Date(values.scheduledAt);
          if (!Number.isFinite(schedule.getTime()) || schedule.getTime() <= Date.now()) throw new Error("Publication schedule must be in the future.");
          values.scheduledAt = schedule.toISOString();
        }
        const body = { ...values, coverImage, action };
        delete body.cover;
        delete body.scheduledAt;
        if (action === "schedule") body.scheduledAt = new Date(values.scheduledAt).toISOString();
        const existingId = form.dataset.blogId;
        await api(existingId ? `/api/admin/blog/${encodeURIComponent(existingId)}` : "/api/admin/blog", {
          method: existingId ? "PATCH" : "POST",
          body: JSON.stringify(body)
        });
        modalRoot.innerHTML = "";
        toast(action === "publish" ? "Blog post published." : action === "schedule" ? "Blog publication scheduled." : "Blog draft saved.");
      } else if (form.dataset.dashboardForm === "rfq") {
        const values = Object.fromEntries(new FormData(form));
        const lines = [...form.querySelectorAll(".rfq-line-fields")].map(fieldset => ({
          ...Object.fromEntries([...fieldset.querySelectorAll("[data-line-field]")].map(input => [input.dataset.lineField, input.value]))
        }));
        lines.forEach(line => { line.quantity = Number(line.quantity); });
        const body = { ...values, lines, budget: values.budget === "" ? null : Number(values.budget) };
        const submitStatus = form.dataset.submitAction || "draft";
        if (form.dataset.rfqId) {
          const rfq = state.data.rfqs.find(item => item.id === form.dataset.rfqId);
          const action = rfq?.status === "draft" && submitStatus === "published" ? "edit" : "edit";
          body.action = action;
          body.publish = submitStatus === "published";
          body.changeReason = values.changeReason || "";
          await api(`/api/rfqs/${encodeURIComponent(form.dataset.rfqId)}`, { method: "PATCH", body: JSON.stringify(body) });
          try { localStorage.removeItem(`goerudite-rfq-draft-${currentUser.id}`); } catch {}
        } else {
          body.status = submitStatus;
          await api("/api/rfqs", { method: "POST", body: JSON.stringify(body) });
          try { localStorage.removeItem(`goerudite-rfq-draft-${currentUser.id}`); } catch {}
        }
        modalRoot.innerHTML = "";
        toast(submitStatus === "published" ? "Academic RFQ published. Suppliers can submit versioned quotations." : "RFQ draft saved. Your academic details and book lines are recoverable.");
      } else if (form.dataset.dashboardForm === "quote") {
        const values = Object.fromEntries(new FormData(form));
        const submitAction = form.dataset.submitAction || "draft";
        if (submitAction === "submitted") {
          const missing = ["deliveryEstimate", "validThrough"].find(name => !values[name]);
          if (missing) {
            form.elements[missing].setCustomValidity("Required to submit a quotation; drafts may omit this.");
            form.elements[missing].reportValidity();
            form.elements[missing].addEventListener("input", () => form.elements[missing].setCustomValidity(""), { once: true });
            if (submit) submit.disabled = false;
            return;
          }
        }
        const body = submitAction === "no_bid" ? { noBid: true, reason: values.noBidReason, reasonCode: values.noBidReasonCode } : {
          ...values,
          status: submitAction,
          lines: [...form.querySelectorAll(".quote-line")].map(fieldset => ({
            unitPrice: Number(fieldset.querySelector("[data-quote-price]").value),
            offeredQuantity: Number(fieldset.querySelector("[data-quote-quantity]").value),
            minimumOrderQuantity: Number(fieldset.querySelector("[data-quote-moq]")?.value || 0),
            packSize: Number(fieldset.querySelector("[data-quote-pack]")?.value || 1),
            availability: fieldset.querySelector("[data-quote-availability]").value,
            note: fieldset.querySelector("[data-quote-note]").value
          }))
        };
        const result = await api(`/api/rfqs/${encodeURIComponent(form.dataset.rfqId)}/quotes`, { method: "POST", body: JSON.stringify(body) });
        try { localStorage.removeItem(quoteDraftKey(form.dataset.rfqId)); } catch (_error) { toast("Quotation was saved, but its browser-local copy could not be cleared.", "error"); }
        modalRoot.innerHTML = "";
        toast(result.quote.status === "submitted" ? `Quotation ${result.quote.id} submitted as revision ${result.quote.version}.` :
          result.quote.status === "no_bid" ? "No-bid response recorded for this RFQ." : "Quotation draft saved; it has not been sent to the school.");
      } else if (form.dataset.dashboardForm === "inventory") {
        const values = Object.fromEntries(new FormData(form));
        for (const key of ["availableQuantity", "reservedQuantity", "damagedQuantity", "lowStockThreshold"]) values[key] = Number(values[key] || 0);
        const result = await api("/api/inventory", { method: "POST", body: JSON.stringify({ items: [values] }) });
        modalRoot.innerHTML = "";
        toast(`Inventory updated for ${result.items[0].title}.`);
      } else if (form.dataset.dashboardForm === "profile") {
        const profile = Object.fromEntries(new FormData(form));
        profile.requestVerification = profile.requestVerification === "true";
        const result = await api("/api/profile", { method: "PATCH", body: JSON.stringify(profile) });
        currentUser = result.user;
        toast("Organisation profile saved and audit logged.");
      } else if (form.dataset.dashboardForm === "receipt") {
        const lines = [...form.querySelectorAll("[data-received-line]")].map(input => ({
          rfqLineId: input.dataset.receivedLine,
          receivedQuantity: Number(input.value)
        }));
        const result = await api(`/api/orders/${encodeURIComponent(form.dataset.orderId)}/receipt`, {
          method: "POST",
          body: JSON.stringify({ lines, note: form.elements.note.value })
        });
        modalRoot.innerHTML = "";
        toast(`Receipt recorded: ${result.order.status.replace(/_/g, " ")}. No payment was processed.`);
      } else if (form.dataset.dashboardForm === "order-create") {
        const lines = [...form.querySelectorAll("[data-order-line]")].map(input => ({
          rfqLineId: input.dataset.orderLine,
          quantity: Number(input.value)
        }));
        const result = await api(`/api/rfqs/${encodeURIComponent(form.dataset.rfqId)}/orders`, {
          method: "POST",
          body: JSON.stringify({
            quoteId: form.dataset.quoteId,
            lines,
            expectedDeliveryDate: form.elements.expectedDeliveryDate.value,
            confirmed: form.elements.authorizeOrder.checked
          })
        });
        modalRoot.innerHTML = "";
        toast(`PO request ${result.purchaseRequest.id} needs two independent Manager/Owner approvals.`);
        state.section = "approvals";
      } else if (form.dataset.dashboardForm === "purchase-decision") {
        const values = Object.fromEntries(new FormData(form));
        const result = await api(`/api/purchase-requests/${encodeURIComponent(form.dataset.requestId)}`, {
          method: "PATCH",
          body: JSON.stringify({ decision: form.dataset.decision, note: values.note })
        });
        modalRoot.innerHTML = "";
        toast(form.dataset.decision === "approve"
          ? result.order
            ? `Purchase order ${result.order.id} issued after both approvals.`
            : `First approval recorded for ${result.purchaseRequest.id}; a different Manager or Owner must decide next.`
          : `Purchase-order request ${result.purchaseRequest.id} rejected.`);
        await reloadDashboard();
      } else if (form.dataset.dashboardForm === "dispatch") {
        const lines = [...form.querySelectorAll("[data-dispatch-line]")].map(input => ({
          rfqLineId: input.dataset.dispatchLine,
          dispatchedQuantity: Number(input.value)
        }));
        await updateOrderFulfilment(form.dataset.orderId, "dispatched", form.dataset.note, form.dataset.tracking, lines);
        modalRoot.innerHTML = "";
      } else if (form.dataset.dashboardForm === "publisher-withdrawal") {
        const values = Object.fromEntries(new FormData(form));
        await api(`/api/publisher/catalogue/${encodeURIComponent(form.dataset.catalogueId)}/withdrawal`, { method: "POST", body: JSON.stringify(values) });
        modalRoot.innerHTML = "";
        toast("Withdrawal request sent to the administrator review queue.");
        await reloadDashboard();
      } else if (form.dataset.dashboardForm === "withdrawal-review") {
        const values = Object.fromEntries(new FormData(form));
        await api(`/api/admin/catalogue/${encodeURIComponent(form.dataset.catalogueId)}/withdrawal`, {
          method: "PATCH",
          body: JSON.stringify({ decision: form.dataset.decision, note: values.note })
        });
        modalRoot.innerHTML = "";
        toast("Catalogue withdrawal decision recorded.");
        await reloadDashboard();
      } else if (form.dataset.dashboardForm === "order-amend") {
        const lines = [...form.querySelectorAll("[data-amend-line]")].map(input => ({
          rfqLineId: input.dataset.amendLine,
          quantity: Number(input.value)
        }));
        const result = await api(`/api/orders/${encodeURIComponent(form.dataset.orderId)}`, {
          method: "PATCH",
          body: JSON.stringify({
            action: "amend",
            reason: form.elements.reason.value,
            expectedDeliveryDate: form.elements.expectedDeliveryDate.value,
            lines
          })
        });
        modalRoot.innerHTML = "";
        toast(`Purchase order amended to version ${result.order.version}; supplier acknowledgement is required.`);
      } else if (form.dataset.dashboardForm === "order-cancel") {
        await api(`/api/orders/${encodeURIComponent(form.dataset.orderId)}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "cancel", reason: form.elements.reason.value })
        });
        modalRoot.innerHTML = "";
        toast("Purchase order cancelled and supplier notified.");
      } else if (form.dataset.dashboardForm === "dispute-create") {
        const body = Object.fromEntries(new FormData(form));
        body.quantity = Number(body.quantity);
        const result = await api(`/api/orders/${encodeURIComponent(form.dataset.orderId)}/disputes`, {
          method: "POST",
          body: JSON.stringify(body)
        });
        modalRoot.innerHTML = "";
        toast(`Delivery dispute ${result.dispute.id} opened and supplier notified.`);
      } else if (form.dataset.dashboardForm === "dispute-action") {
        const body = Object.fromEntries(new FormData(form));
        body.action = form.dataset.action;
        const result = await api(`/api/disputes/${encodeURIComponent(form.dataset.disputeId)}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        });
        modalRoot.innerHTML = "";
        toast(`Delivery dispute updated: ${result.dispute.status.replace(/_/g, " ")}.`);
      } else if (form.dataset.dashboardForm === "catalogue-submission") {
        const values = Object.fromEntries(new FormData(form));
        const editing = Boolean(form.dataset.submissionId);
        const endpoint = editing
          ? `/api/catalogue/submissions/${encodeURIComponent(form.dataset.submissionId)}`
          : "/api/catalogue/submissions";
        const result = await api(endpoint, { method: editing ? "PATCH" : "POST", body: JSON.stringify(values) });
        modalRoot.innerHTML = "";
        state.section = "book-submissions";
        toast(`${result.message} Reference: ${result.item.id}.`);
      } else if (form.dataset.dashboardForm === "catalogue") {
        const values = Object.fromEntries(new FormData(form));
        const submit = form.dataset.submitAction === "true";
        values.submit = submit;
        if (form.dataset.catalogueId) {
          await api(`/api/publisher/catalogue/${encodeURIComponent(form.dataset.catalogueId)}`, { method: "PATCH", body: JSON.stringify(values) });
        } else {
          await api("/api/publisher/catalogue", { method: "POST", body: JSON.stringify(values) });
        }
        modalRoot.innerHTML = "";
        toast(submit ? "Title submitted to the administrator's catalogue review queue." : "Publisher catalogue draft saved.");
      } else if (form.dataset.dashboardForm === "admin-review") {
        if (!form.elements.confirmed.checked) throw new Error("Confirm that you personally reviewed the submitted record.");
        const body = Object.fromEntries(new FormData(form));
        delete body.confirmed;
        let endpoint;
        let requestBody;
        if (form.dataset.reviewType === "user") {
          endpoint = `/api/admin/users/${encodeURIComponent(form.dataset.reviewId)}/verification`;
          requestBody = { decision: form.dataset.reviewDecision, reason: body.reason };
        } else {
          endpoint = `/api/admin/catalogue/${encodeURIComponent(form.dataset.reviewId)}/review`;
          requestBody = { decision: form.dataset.reviewDecision, reason: body.reason };
        }
        await api(endpoint, { method: "PATCH", body: JSON.stringify(requestBody) });
        modalRoot.innerHTML = "";
        toast("Review decision recorded and relevant account notified.");
      } else if (form.dataset.dashboardForm === "evaluation") {
        const body = Object.fromEntries(new FormData(form));
        const result = await api(`/api/quotes/${encodeURIComponent(form.dataset.quoteId)}/decision`, { method: "PATCH", body: JSON.stringify(body) });
        modalRoot.innerHTML = "";
        toast(`School evaluation recorded (${result.quote.status.replace(/_/g, " ")}). No order was created.`);
      }
      await reloadDashboard();
    } catch (error) {
      toast(error.message, "error");
      if (submit?.isConnected) submit.disabled = false;
    }
  }

  function openOrderForm(rfqId, quoteId) {
    const quote = state.data?.quotations?.find(item => item.id === quoteId);
    if (!quote) {
      toast("The selected quotation is no longer available. Refresh the dashboard and try again.", "error");
      return;
    }
    const lines = (quote.lines || []).filter(line => line.offeredQuantity > 0);
    if (!lines.length) {
      toast("This quotation has no available quantities to order.", "error");
      return;
    }
    const fields = lines.map(line => `<label>${esc(line.title)} · offered ${fmt(line.offeredQuantity)}<input data-order-line="${esc(line.rfqLineId)}" type="number" min="1" max="${fmt(line.offeredQuantity)}" step="1" value="${fmt(line.offeredQuantity)}" required></label>`).join("");
    openModal("Request purchase-order approval", `${quote.supplier || "This supplier"} · ${quote.id} · quoted amount ${currency(quote.total)}. This creates a pending request; two different, non-requester Managers or Owners must approve before a PO is issued. GoErudite does not process payment.`, `<form class="dashboard-form" data-dashboard-form="order-create" data-rfq-id="${esc(rfqId)}" data-quote-id="${esc(quoteId)}">${fields}<label>Expected delivery date<input name="expectedDeliveryDate" type="date"></label><label class="workspace-check"><input name="authorizeOrder" type="checkbox" required> I am authorised to request this purchase order for approval.</label><div class="dashboard-form-actions"><button class="button" type="submit">Request approval</button></div></form>`);
  }

  function openPurchaseDecisionForm(requestId, decision) {
    const title = decision === "approve" ? "Record independent PO approval" : "Reject PO request";
    openModal(title, "Add an auditable reason. A first approval only advances the request; a second, different Owner or Manager is required before a PO is issued. Rejection at either step creates no PO.", `<form class="dashboard-form" data-dashboard-form="purchase-decision" data-request-id="${esc(requestId)}" data-decision="${esc(decision)}"><label>Decision note <b>*</b><textarea name="note" required minlength="10" maxlength="500"></textarea></label><div class="dashboard-form-actions"><button class="button" type="submit">Confirm ${esc(decision)}</button></div></form>`);
  }

  function openReceiptForm(orderId) {
    const order = state.data?.orders?.find(item => item.id === orderId);
    if (!order) {
      toast("Purchase order is not available in this dashboard.", "error");
      return;
    }
    const fields = order.lines.map(line => `<label>${esc(line.title)} · ${fmt(line.dispatchedQuantity ?? line.quantity)} shipped<input data-received-line="${esc(line.rfqLineId)}" type="number" min="${fmt(line.receivedQuantity || 0)}" max="${fmt(line.dispatchedQuantity ?? line.quantity)}" step="1" value="${fmt(line.receivedQuantity || 0)}" required></label>`).join("");
    openModal("Confirm delivered quantities", "Enter total quantities received for every order line. This records a receipt only; it does not settle an invoice or payment.", `<form class="dashboard-form" data-dashboard-form="receipt" data-order-id="${esc(order.id)}">${fields}<label>Receipt note<textarea name="note" maxlength="500" placeholder="Optional condition or discrepancy note"></textarea></label><div class="dashboard-form-actions"><button class="button" type="submit">Record receipt</button></div></form>`);
  }

  function openOrderAmendmentForm(orderId) {
    const order = state.data?.orders?.find(item => item.id === orderId);
    const quote = order && state.data?.quotations?.find(item => item.id === order.quoteId);
    if (!order || !quote) {
      toast("The source purchase order or quotation is unavailable.", "error");
      return;
    }
    const fields = order.lines.map(line => {
      const quoted = quote.lines?.find(item => item.rfqLineId === line.rfqLineId);
      const offered = quoted?.offeredQuantity || line.quantity;
      const minimum = quoted?.minimumOrderQuantity || 1;
      const packSize = quoted?.packSize || 1;
      return `<label>${esc(line.title)} · current ${fmt(line.quantity)} / offered ${fmt(offered)} · MOQ ${fmt(minimum)}, pack ${fmt(packSize)}<input data-amend-line="${esc(line.rfqLineId)}" type="number" min="${fmt(minimum)}" max="${fmt(offered)}" step="${fmt(packSize)}" value="${fmt(line.quantity)}" required></label>`;
    }).join("");
    openModal("Amend purchase order", "The amendment is versioned and must be acknowledged by the supplier before fulfilment continues.", `<form class="dashboard-form" data-dashboard-form="order-amend" data-order-id="${esc(order.id)}">${fields}<label>Expected delivery date<input name="expectedDeliveryDate" type="date" value="${esc(order.expectedDeliveryDate || "")}"></label><label>Reason for amendment <b>*</b><textarea name="reason" required minlength="10" maxlength="500"></textarea></label><div class="dashboard-form-actions"><button class="button" type="submit">Send amended PO to supplier</button></div></form>`);
  }

  function openOrderCancellationForm(orderId) {
    openModal("Cancel purchase order", "Cancellation is allowed only before dispatch and receipt. The supplier will be notified.", `<form class="dashboard-form" data-dashboard-form="order-cancel" data-order-id="${esc(orderId)}"><label>Cancellation reason <b>*</b><textarea name="reason" required minlength="10" maxlength="500"></textarea></label><div class="dashboard-form-actions"><button class="button" type="submit">Confirm cancellation</button></div></form>`);
  }

  function openDisputeForm(orderId) {
    const order = state.data?.orders?.find(item => item.id === orderId);
    if (!order) return toast("Purchase order is not available in this dashboard.", "error");
    const options = order.lines.map(line => `<option value="${esc(line.rfqLineId)}">${esc(line.title)} · ${fmt(line.receivedQuantity || 0)} received / ${fmt(line.quantity)} ordered</option>`).join("");
    openModal("Report a delivery dispute", "Report wrong, damaged or missing quantities after a receipt has been recorded. A separate case is created; this does not silently alter the receipt.", `<form class="dashboard-form" data-dashboard-form="dispute-create" data-order-id="${esc(order.id)}"><label>Book line<select name="rfqLineId" required>${options}</select></label><label>Issue type<select name="type" required><option value="wrong">Wrong book / edition</option><option value="damaged">Damaged books</option><option value="missing">Missing quantity</option></select></label><label>Quantity <b>*</b><input name="quantity" type="number" min="1" step="1" required></label><label>Issue details <b>*</b><textarea name="description" required minlength="10" maxlength="1000"></textarea></label><div class="dashboard-form-actions"><button class="button" type="submit">Open delivery dispute</button></div></form>`);
  }

  function openDisputeActionForm(disputeId, action) {
    const dispute = state.data?.disputes?.find(item => item.id === disputeId);
    if (!dispute) return toast("Delivery dispute is not available in this dashboard.", "error");
    if (action === "close") {
      openModal("Close resolved dispute", "Confirm that your organisation accepts the recorded resolution.", `<form class="dashboard-form" data-dashboard-form="dispute-action" data-dispute-id="${esc(disputeId)}" data-action="close"><label class="workspace-check"><input name="confirmed" type="checkbox" required> I reviewed the resolution and want to close this case.</label><div class="dashboard-form-actions"><button class="button" type="submit">Close dispute</button></div></form>`);
      return;
    }
    const admin = currentUser.role === "admin";
    const isResolve = action === "resolve";
    const label = action === "request_information" ? "Information requested" : isResolve ? "Resolution" : "Supplier response";
    openModal(isResolve ? "Resolve delivery dispute" : action === "request_information" ? "Request more information" : "Respond to delivery dispute", `${dispute.id} · ${dispute.title} · ${dispute.type} · ${fmt(dispute.quantity)} copies`, `<form class="dashboard-form" data-dashboard-form="dispute-action" data-dispute-id="${esc(disputeId)}" data-action="${esc(action)}">${isResolve ? `<label>Decision<select name="decision" required><option value="upheld">Uphold school report</option><option value="rejected">Reject school report</option></select></label>` : ""}<label>${label} <b>*</b><textarea name="note" required minlength="10" maxlength="1000"></textarea></label><div class="dashboard-form-actions"><button class="button" type="submit">${admin ? "Save administrator decision" : "Send supplier response"}</button></div></form>`);
  }

  async function updateOrderFulfilment(orderId, status, note, trackingReference, lines) {
    if (!status) {
      toast("Choose a fulfilment status.", "error");
      return;
    }
    try {
      await api(`/api/orders/${encodeURIComponent(orderId)}/fulfilment`, {
        method: "PATCH",
        body: JSON.stringify({ status, note, trackingReference, lines })
      });
      toast(`Purchase order updated to ${status.replace(/_/g, " ")}.`);
      await reloadDashboard();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function updateRfq(id, action) {
    if (action === "cancel" && !window.confirm("Cancel this RFQ? Suppliers will be notified and cannot submit further responses.")) return;
    try {
      await api(`/api/rfqs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action }) });
      const messages = { publish: "RFQ published to verified supply partners.", close: "RFQ closed.", cancel: "RFQ cancelled." };
      toast(messages[action] || `RFQ ${action} updated.`);
      await reloadDashboard();
    } catch (error) { toast(error.message, "error"); }
  }

  async function fileImportPayload(file) {
    if (file.size > 240000) throw new Error("CSV and XLSX imports must be smaller than 240 KB.");
    if (!/\.xlsx$/i.test(file.name)) return { filename: file.name, csv: await file.text() };
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
    }
    return { filename: file.name, xlsx: btoa(binary) };
  }

  async function importInventory(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await api("/api/inventory/import", { method: "POST", body: JSON.stringify(await fileImportPayload(file)) });
      toast(`${result.imported} inventory line(s) imported and audited.`);
      await reloadDashboard();
    } catch (error) { toast(error.message, "error"); }
    finally { event.target.value = ""; }
  }

  async function importPublisherCatalogue(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await api("/api/publisher/catalogue/import", { method: "POST", body: JSON.stringify(await fileImportPayload(file)) });
      const rowErrors = (result.errors || []).map(item => `Row ${item.row}: ${item.error}`).join("\n");
      toast(`${result.imported} draft title(s) imported.${rowErrors ? ` ${rowErrors}` : ""}`, rowErrors ? "error" : "success");
      await reloadDashboard();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      event.target.value = "";
    }
  }

  async function importRfqs(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const fileContent = await fileImportPayload(file);
      const result = await api("/api/rfqs/import", {
        method: "POST",
        body: JSON.stringify({ ...fileContent, title: file.name.replace(/\.(csv|xlsx)$/i, "") })
      });
      toast(`${result.imported} book line(s) were imported into ${result.rfq.id} as a draft. Add academic filters before publishing.`);
      state.section = "rfqs";
      await reloadDashboard();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      event.target.value = "";
    }
  }

  async function updateSupportStatus(id, nextStatus) {
    try {
      await api(`/api/admin/support/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      toast(`Support case marked ${nextStatus.replace(/_/g, " ")} and audit logged.`);
      await reloadDashboard();
    } catch (error) { toast(error.message, "error"); }
  }

  window.renderDashboard = function renderDashboard() {
    state.section = "overview";
    if (!currentUser) {
      paint();
      return;
    }
    if (!ROLE_DETAILS[currentUser.role]) {
      layout(`<section class="container not-found"><h1>No workspace is available for this account role.</h1><p>Contact GoErudite support if you believe this is an error.</p></section>`, "workspace-page");
      return;
    }
    state.data = null;
    state.loading = true;
    paint();
    reloadDashboard();
  };
})();
