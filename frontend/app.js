const app = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
const toastRoot = document.querySelector("#toast-root");
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

const icon = (symbol, extra = "") => `<span class="icon ${extra}" aria-hidden="true">${symbol}</span>`;
const socialIcons = {
  instagram: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle class="social-icon-fill" cx="18" cy="6" r="1"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v10M5 5v.01M10 19v-6a4 4 0 0 1 8 0v6M10 10v9"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 11.7a8.4 8.4 0 0 1-12.5 7.4L3 20l1-4.7a8.4 8.4 0 1 1 16.4-3.6Z"/><path d="M9 8.5c.4 2.7 2.1 4.5 4.8 5.3l1.2-1.1 2 .9c-.2 1.5-1.2 2.3-2.6 2.2-3.7-.5-6.7-3.4-7.2-7.1-.1-1.4.7-2.4 2.2-2.6l.9 2Z"/></svg>`
};
const socialLabel = name => ({ instagram: "Instagram", linkedin: "LinkedIn", whatsapp: "WhatsApp" })[name] || name;
const arrow = "→";
const footerNote = "GoErudite provides catalogue discovery and workflow tools. Commercial transactions, payments, invoice settlement, and delivery arrangements are handled directly by the relevant parties outside the platform. Users should independently verify information and terms before entering a transaction. Nothing on this website overrides rights or obligations under applicable law.";
const nav = [
  ["Home", "/"], ["Solutions", "/solutions"], ["Platform Pricing", "/pricing"],
  ["About Us", "/about"], ["Contact Support", "/contact"], ["Explore Catalogue", "/catalog"], ["Sponsored Listings", "/advertisements"], ["Blog", "/blog"]
];
const PAGE_METADATA = {
  "/": ["GoErudite | Academic Book Catalogue and RFQ Workflows", "Explore academic book information, prepare institutional requirements, request quotations, and compare supplier responses with GoErudite."],
  "/solutions": ["GoErudite Solutions | School RFQs and Supplier Quotations", "Explore catalogue, RFQ, quotation, approval, and publishing workflows for schools and education suppliers."],
  "/pricing": ["GoErudite Monthly Plans | School, Distributor, Retailer and Publisher", "Compare GoErudite monthly platform plans: free school and authorised-user access, distributor and retailer plans at ₹1,000, and publisher access at ₹1,500."],
  "/about": ["About GoErudite | Education Catalogue and Workflow Platform", "Learn about GoErudite's catalogue discovery, institutional RFQ, quotation comparison, and role-based workflow platform."],
  "/trust": ["Trust, Privacy and Platform Terms | GoErudite", "Read GoErudite's platform information about privacy, user responsibilities, RFQs, quotations, sponsored listings, and dispute records."],
  "/help": ["GoErudite Help | FAQs on RFQs and Quotations", "Find answers about accounts, academic catalogues, school RFQs, supplier quotations, purchase-order approvals, and sponsored listings."],
  "/forgot-password": ["Reset Your GoErudite Password | Account Help", "Request a secure, time-limited password reset link for your GoErudite account."],
  "/contact": ["Contact GoErudite Support | Platform and Account Help", "Contact GoErudite about platform access, account verification, support requests, and workflow guidance."],
  "/catalog": ["Explore Academic Book Catalogue | GoErudite", "Search academic book and publisher catalogue information by title, ISBN, subject, board, medium, and academic session."],
  "/advertisements": ["View Sponsored Education Listings | GoErudite", "Browse clearly labelled sponsored listings and send an eligible private quote inquiry to an advertiser."],
  "/blog": ["Education Sourcing Articles and Updates | GoErudite", "Read published GoErudite articles about academic catalogues, institutional RFQs, supplier quotations, and education sourcing workflows."],
  "/dashboard": ["Role-Based Account Dashboard | GoErudite", "Sign in to your GoErudite account to access role-authorised catalogue, RFQ, quotation, and workflow tools."]
};
const TEAM_MEMBERS = [
  ["Ranjeet Singh", "Founder & CEO"],
  ["Ranjana Kumari", "Human Resources (HR)"],
  ["Goldi Kumari", "Team Leader"],
  ["Pooja Kumari", "Content Writer"],
  ["Ravi Prasad", "Technical Head - HOD"],
  ["Sachin Kumar", "Sales & Marketing"],
  ["Shubham Patel", "Office Administrative"],
  ["Sudhir Singh", "Graphic Designer - HOD"]
];

let currentUser = null;
let publicContact = null;
let catalogItems = [];
let catalogTotal = 0;
let catalogQuery = new URLSearchParams(location.search);

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const rowErrorMessages = Array.isArray(payload.errors) ? payload.errors.map(item => item.row ? `Row ${item.row}: ${item.message || item.error || "Invalid data."}` : item).join(" ") : "";
    const error = new Error([payload.error || `Request failed (${response.status}).`, rowErrorMessages].filter(Boolean).join(" "));
    error.status = response.status;
    throw error;
  }
  return payload;
}

function toast(message, type = "success") {
  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.textContent = message;
  toastRoot.append(item);
  window.setTimeout(() => item.remove(), 4600);
}

function header() {
  const active = location.pathname === "/" ? "/" : location.pathname;
  return `<header class="site-header">
    <a class="brand" href="/" aria-label="GoErudite home"><span class="brand-mark">≡</span><span><b>Go</b>Erudite</span></a>
    <form class="global-search" id="global-search"><input name="q" aria-label="Search books, publishers, or ISBNs" placeholder="Search for books, publishers, or ISBNs..." value="${escapeHtml(new URLSearchParams(location.search).get("q") || "")}"><button aria-label="Search">⌕</button></form>
    <button class="mobile-menu" aria-label="Open navigation" aria-controls="main-nav" aria-expanded="false" data-menu>☰</button>
    <nav class="main-nav" id="main-nav">${nav.map(([name, href]) => `<a href="${href}" class="${active === href ? "active" : ""}" ${active === href ? 'aria-current="page"' : ""}>${name}</a>`).join("")}
      ${currentUser ? `<a class="nav-action nav-user" href="/dashboard">◉ ${escapeHtml(currentUser.firstName)} · Dashboard</a><button class="nav-action" data-logout>Log out</button>` : `<button class="nav-action nav-login" data-auth="login"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/></svg><span>Login</span></button><button class="button button-small" data-auth="register">Get Started</button>`}
    </nav>
  </header>`;
}

function footer() {
  const contact = publicContact || { phone: "+91 8586032007", phoneHref: "+918586032007", email: "support@goerudite.com", social: [] };
  const socialLinks = contact.social.map(({ name, url }) => url
    ? `<a class="social-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="GoErudite on ${socialLabel(name)}" title="${socialLabel(name)}">${socialIcons[name]}</a>`
    : `<span class="social-link social-link-pending" role="img" aria-label="${socialLabel(name)} profile link not configured" title="${socialLabel(name)} profile link not configured">${socialIcons[name]}</span>`).join("");
  return `<footer class="site-footer"><div class="footer-grid">
    <div class="footer-brand"><a class="brand brand-light" href="/"><span class="brand-mark">≡</span><span><b>Go</b>Erudite</span></a><p>A role-based catalogue and workflow platform for schools and education suppliers.</p><div class="footer-rule"></div><p class="footer-promise">${icon("◇")} Explore catalogue information and manage sourcing workflows.</p></div>
    <div><h3>Company</h3><a href="/about">About Us <span>›</span></a><a href="/about#story">Brand Story <span>›</span></a><a href="/about#values">Why GoErudite <span>›</span></a><a href="/about#mission">Our Mission <span>›</span></a><a href="/contact">Contact Us <span>›</span></a></div>
    <div><h3>Platform</h3><a href="/solutions">Solutions <span>›</span></a><a href="/solutions#rfq">RFQ Workflow <span>›</span></a><a href="/catalog">Explore Catalogue <span>›</span></a><a href="/advertisements">Sponsored Listings <span>›</span></a><a href="/blog">Blog <span>›</span></a><a href="/trust">Trust &amp; Transparency <span>›</span></a><a href="/help">Help Center <span>›</span></a></div>
    <div><h3>Legal</h3><a href="/trust#privacy">Privacy Policy <span>›</span></a><a href="/trust#terms">Terms &amp; Conditions <span>›</span></a><a href="/trust#returns">Return Policy <span>›</span></a><a href="/trust#guidelines">Platform Guidelines <span>›</span></a><a href="/trust#compliance">Compliance Notice <span>›</span></a></div>
    <div class="footer-contact"><h3>Contact Info</h3><p>${icon("⌖")} Shadipur, West Patel Nagar,<br> New Delhi — 110008</p><a href="tel:${escapeHtml(contact.phoneHref)}">${icon("⌕")} ${escapeHtml(contact.phone)}</a><a href="mailto:${escapeHtml(contact.email)}">${icon("✉")} ${escapeHtml(contact.email)}</a><a href="/contact">Contact Support</a><div class="social-row" aria-label="Social media links">${socialLinks}</div></div>
  </div><div class="footer-bottom"><span>♙ &nbsp;© ${new Date().getFullYear()} GoErudite. All rights reserved.</span><p>${footerNote}</p></div></footer>`;
}

function updatePageMetadata(path = location.pathname, custom = {}) {
  const resetPageMetadata = path.startsWith("/reset-password/")
    ? ["Set a New GoErudite Password | Account Help", "Choose a new password using your secure, time-limited GoErudite account recovery link."]
    : null;
  const [defaultTitle, defaultDescription] = PAGE_METADATA[path] || resetPageMetadata ||
    ["GoErudite | Academic Catalogue and Sourcing Workflows", PAGE_METADATA["/"]];
  const title = custom.title || defaultTitle;
  const description = custom.description || defaultDescription;
  document.title = title;
  let descriptionTag = document.querySelector('meta[name="description"]');
  if (!descriptionTag) {
    descriptionTag = document.createElement("meta");
    descriptionTag.name = "description";
    document.head.append(descriptionTag);
  }
  descriptionTag.content = description;
  let robots = document.querySelector('meta[name="robots"]');
  if (!robots) {
    robots = document.createElement("meta");
    robots.name = "robots";
    document.head.append(robots);
  }
  robots.content = path === "/dashboard" || path === "/forgot-password" ||
    path.startsWith("/invite/") || path.startsWith("/reset-password/")
    ? "noindex, nofollow"
    : "index, follow";
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  const canonicalOrigin = document.querySelector('meta[name="goerudite-canonical-origin"]')?.content || location.origin;
  const canonicalPath = path.startsWith("/reset-password/") ? "/forgot-password" :
    path.startsWith("/invite/") ? "/dashboard" : path;
  canonical.href = new URL(canonicalPath, `${canonicalOrigin}/`).href;
  for (const [property, content] of [["og:title", title], ["og:description", description], ["og:type", "website"], ["og:url", canonical.href]]) {
    let tag = document.querySelector(`meta[property="${property}"]`);
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("property", property);
      document.head.append(tag);
    }
    tag.content = content;
  }
}

function layout(content, className = "", metadata = {}) {
  updatePageMetadata(location.pathname, metadata);
  app.innerHTML = `${header()}<main class="${className}">${content}</main>${footer()}`;
  wireGlobalEvents();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function pageHero(title, accent, subtitle, badge = "") {
  return `<section class="inner-hero"><div class="container">${badge ? `<span class="eyebrow">${badge}</span>` : ""}<h1>${title} <em>${accent}</em></h1><p>${subtitle}</p></div></section>`;
}

function teamSection() {
  return `<section class="team-strip section" id="team"><div class="container"><h2>Meet Our Team</h2><p>The people and roles provided by GoErudite.</p><div class="team-grid">${TEAM_MEMBERS.map(([name, role]) => {
    const initials = name.split(/\s+/).map(part => part[0]).join("").slice(0, 2);
    return `<article><span class="team-avatar" aria-hidden="true">${initials}</span><b>${escapeHtml(name)}</b><small>${escapeHtml(role)}</small></article>`;
  }).join("")}</div><a class="button button-light" href="/contact">Join GoErudite ${arrow}</a></div></section>`;
}

function notice(text, kind = "blue") {
  return `<div class="notice notice-${kind}">${icon(kind === "orange" ? "◇" : "◈")}<span>${text}</span></div>`;
}

function homePage() {
  const featured = [
    ["science-explorer", "Science Explorer", "For the Curious Mind", "teal", "Class 9", 520],
    ["english-grammar-core", "English Grammar Core", "Building Strong Foundations", "navy", "Class 8", 390],
    ["physics-core", "Physics Core", "Concepts | Numericals | Applications", "blue", "Class 12", 680],
    ["mathematics-world", "Mathematics World", "Think | Practice | Excel", "green", "Class 10", 450]
  ];
  return `<section class="home-hero"><div class="hero-overlay"></div><div class="container hero-inner"><span class="eyebrow eyebrow-light">Academic catalogue discovery and sourcing workflows</span><h1>Explore Academic Books.<br><em>Request Quotations.</em></h1><p>GoErudite helps schools explore academic book information, prepare institutional requirements, request quotations, and compare supplier responses. Distributors, retailers, publishers, and other authorised users access tools according to their roles and permissions.</p><div class="hero-pills"><span>${icon("▤")} School RFQ workflows</span><span>${icon("♟")} Supplier quotation responses</span><span>${icon("◇")} School-led review and approvals</span><span>${icon("⇄")} Sponsored listings and inquiries</span></div><a class="button" href="/solutions">Explore Platform ${arrow}</a><a class="button button-outline" href="/catalog">Explore Catalogue ${arrow}</a></div></section>
  <section class="stat-strip container"><div><b>School</b><span>Academic requirements and RFQs</span></div><div><b>Distributor</b><span>Wholesale response workflows</span></div><div><b>Retailer</b><span>Local supply and stock tools</span></div><div><b>Publisher</b><span>ISBN-aware catalogue submissions</span></div></section>
  <section class="section container"><div class="section-heading row-heading"><div><span class="eyebrow">Academic discovery</span><h2>Explore the Academic Book Catalogue</h2><p>Browse available sample records and publisher catalogue entries by title, ISBN, subject, board, medium, or academic session.</p></div><a class="button button-outline" href="/catalog">Explore Catalogue ${arrow}</a></div><div class="notice notice-sand">${icon("ⓘ")} Catalogue details and MRP are for reference. They do not confirm current stock, supplier availability, a final price, or a sale.</div><div class="book-grid featured-grid">${featured.map((book, index) => bookCard({ id: book[0], title: book[1], publisher: index === 2 ? "BrightPath Learning" : "GoErudite Press", subject: ["Science", "English", "Science", "Mathematics"][index], level: book[4], price: book[5], source: "sample", cover: book[3], category: book[1] }, true)).join("")}</div></section>
  <section class="section soft-section"><div class="container home-columns"><div><span class="eyebrow">How it works</span><h2>Education Supply Ecosystem</h2>${[
    ["01", "School RFQ Creation", "Schools create structured textbook requirements using board, class, medium, and session filters."],
    ["02", "Supplier Quotation Responses", "Eligible distributors and retailers respond with their stated availability, pricing, and supply terms."],
    ["03", "Compare Submitted Quotations", "Schools review supplier responses and make their own evaluation; comparison does not create an order."],
    ["04", "Use Authorised Approval Workflows", "Where enabled, two different school Managers or Owners approve a purchase-order request before a PO is issued. Commercial arrangements remain between the parties."]
  ].map(row => `<article class="step-card"><b>${row[0]}</b><div><h3>${row[1]}</h3><p>${row[2]}</p></div></article>`).join("")}</div>
  <div><span class="eyebrow">Built for academic procurement</span><h2>How GoErudite Supports Sourcing</h2>${[
    ["◈", "Session-Locked RFQ Workflows", "Academic requirements remain structured by board, class, and institutional rules."],
    ["▧", "Recorded Workflow Activity", "RFQs, quotations, approvals, and fulfilment updates are recorded as platform workflow events."],
    ["♙", "Role-Based Access", "Users see and manage records according to their account role, organisation, and permissions."]
  ].map(row => `<article class="feature-row"><span class="feature-icon">${row[0]}</span><div><h3>${row[1]}</h3><p>${row[2]}</p></div></article>`).join("")}</div>
  <div class="feature-list"><span class="eyebrow">Platform features</span><h2>Tools for Academic Sourcing Workflows</h2>${["Role-based registration and account review", "Board, class, medium, and session fields", "RFQ drafts, publishing, and quotation comparison", "Two-person school PO approval where enabled", "Account-scoped notifications and activity records", "Clearly labelled sponsored listings and inquiries"].map((item, i) => `<div class="check-row"><b>${["◇", "▤", "▣", "◈", "♧", "▧"][i]}</b>${item}</div>`).join("")}</div></div></section>
  <section class="testimonials"><div class="container"><span class="eyebrow eyebrow-light">Platform principles</span><h2>Clear responsibilities at every step</h2><p>GoErudite provides workflow records without claiming to complete transactions that happen outside the platform.</p><div class="quote-grid">${[
    ["Academic requirements keep the session, board, medium, book lines, and quantities together.", "School RFQs", "Versioned requirements"],
    ["Supplier responses distinguish full, partial, unavailable, and no-bid outcomes.", "Supplier quotations", "Availability and pricing"],
    ["Evaluation decisions are auditable and do not create purchase orders, payments, or delivery commitments.", "School review", "Human decision"]
  ].map(([quote, name, role]) => `<blockquote><span class="quote-mark">◇</span><p>${quote}</p><footer><span class="avatar">${name[0]}</span><span><b>${name}</b><small>${role}</small></span></footer></blockquote>`).join("")}</div></div></section>
  ${teamSection()}
  <section class="cta-band container"><span class="cta-symbol">♙</span><div><span class="eyebrow eyebrow-light">Explore the platform</span><h2>Structured Academic Sourcing Workflows</h2><p>Explore catalogue information, learn how RFQs and quotations work, or view clearly labelled sponsored listings.</p><a class="button button-light" href="/solutions">View Solutions ${arrow}</a><a class="button button-outline" href="/advertisements">View Sponsored Listings ${arrow}</a></div><div class="cta-points"><span>◈ Role-based tools</span><span>▣ School-led approvals</span><span>▤ Catalogue discovery</span><span>♧ Clear supplier responses</span></div></section>`;
}

const roles = [
  { id: "schools", registerRole: "school", role: "For Schools", color: "blue", symbol: "▥", title: "Prepare School Book Requirements and Request Quotations", intro: "Maintain academic and student-strength information, prepare book requirements, and publish RFQs when your account and permissions allow.", overview: "Schools review catalogue metadata, create RFQ drafts, publish requirements, compare submitted supplier quotations, and use the enabled evaluation, two-person PO approval, receipt, and dispute-record workflows.", features: [["▤", "Academic Requirements", "Build book lists with quantities, session, board, class, and medium."], ["⚖", "Compare Quotations", "Review supplier-stated availability, prices, charges, validity, and terms."], ["◈", "Two-Person PO Approval", "Where enabled, two different non-requester Managers or Owners must approve before a PO is issued."], ["▧", "Workflow Records", "Track versions, purchase orders, receipts, and delivery dispute records."]] },
  { id: "distributors", registerRole: "distributor", role: "For Distributors", color: "green", symbol: "▣", title: "Review Institutional RFQs and Submit Supplier Quotations", intro: "Review eligible published school RFQs, maintain your own inventory information, and respond with availability, quantity, price, validity, and fulfilment terms.", overview: "Distributor tools include an RFQ inbox, quote drafting and revisions, inventory import/export, and applicable order dispatch records. A quotation is your stated offer, not a confirmed order.", features: [["▤", "Eligible RFQ Inbox", "Review published opportunities available to your role."], ["➤", "Quotation Builder", "State quantities, MOQ, pack size, delivery terms, charges, and quote validity."], ["▥", "Inventory Records", "Maintain and export your own stock records; refresh availability before quoting."], ["▣", "Dispatch Tracking", "Record fulfilment and dispatch information for applicable purchase orders."]] },
  { id: "retailers", registerRole: "retailer", role: "For Retailers", color: "purple", symbol: "▰", title: "Respond to Nearby Institutional Book Requirements", intro: "Review eligible school RFQs, maintain local stock information, and submit quotations with applicable availability and pickup or delivery terms.", overview: "Retailer tools include opportunity filters, local quotations, own-inventory management, stock-freshness alerts, browser-local unsent drafts, and applicable fulfilment records.", features: [["◎", "Eligible Opportunities", "Filter published RFQs by academic information, location, or deadline."], ["▣", "Local Stock Records", "Search and update your own ISBN/title inventory and freshness."], ["▤", "Local Quotations", "State real availability, pack constraints, validity, and pickup or delivery terms."], ["▧", "Fulfilment Records", "Update dispatch information only for applicable authorised orders."]] },
  { id: "publishers", registerRole: "publisher", role: "For Publishers", color: "orange", symbol: "▤", title: "Manage ISBN-Aware Academic Catalogue Records", intro: "Maintain book, edition, ISBN, academic mapping, and dated publisher MRP information; submit catalogue titles for review.", overview: "Publisher tools include owned catalogue records, bulk-imported drafts, corrections, withdrawal requests, and privacy-thresholded demand summaries. A catalogue MRP is not a supplier quotation or selling price.", features: [["◫", "Catalogue Management", "Maintain bibliographic details, ISBNs, editions, and academic fields."], ["▥", "Human Review", "Submitted titles and withdrawal requests follow administrator review."], ["▧", "MRP History", "Record dated publisher reference prices separately from supplier quotes."], ["♙", "Aggregated Demand", "View limited, anonymised patterns only where the school-count threshold is met."]] },
  { id: "other", registerRole: "other", role: "For Other Authorised Users", color: "blue", symbol: "♙", title: "Use the Platform Within Your Assigned Permissions", intro: "Other authorised users can access permitted profile, activity, catalogue-suggestion, notification, and eligible advertisement-inquiry workflows.", overview: "The Other role does not provide School RFQ, supplier quotation, purchase order, or administrator privileges.", features: [["♙", "Limited Profile", "View or update the profile fields available to your account."], ["▤", "Catalogue Suggestions", "Submit book information for human review where permitted."], ["♧", "Notifications", "Review account notifications and permitted activity."], ["◈", "Role Boundaries", "Dashboard and API access follow your assigned role and permissions."]] }
];

function solutionsPage() {
  return `${pageHero("Role-Based Education Sourcing", "Workflows", "Explore how schools, distributors, retailers, publishers, and other authorised users prepare academic information and use role-scoped catalogue, RFQ, quotation, and record-keeping tools.")}<div class="hero-login"><button class="button" data-auth="login"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/></svg> Log in ${arrow}</button></div>
    <section class="container role-sections">${roles.map(role => `<article class="role-section role-${role.color}" id="${role.id}">${role.id === "schools" ? `<span id="rfq"></span>` : ""}<div class="role-intro"><span class="role-badge">${role.symbol} &nbsp; ${role.role}</span><h2>${role.title}</h2><p>${role.intro}</p><button class="button button-${role.color}" data-auth="register" data-role="${role.registerRole}">Register as ${role.role.replace("For ", "")} ${arrow}</button></div><div class="role-detail"><div class="role-overview"><h3>Overview</h3><p>${role.overview}</p></div><h3 class="feature-heading">Available Workflow Tools</h3><div class="role-feature-grid">${role.features.map(feature => `<div class="role-feature"><span class="feature-icon">${feature[0]}</span><h4>${feature[1]}</h4><p>${feature[2]}</p></div>`).join("")}</div></div></article>`).join("")}</section>`;
}

function pricingPage(plans = []) {
  const planIcons = { school: "▥", other: "♙", distributor: "▤", retailer: "▰", publisher: "▣" };
  const planColors = { school: "blue", other: "blue", distributor: "green", retailer: "orange", publisher: "purple" };
  const card = plan => `<article class="plan-card plan-${planColors[plan.id] || "blue"} ${plan.id === "retailer" ? "popular" : ""}"><span class="plan-icon">${planIcons[plan.id] || "G"}</span>${plan.id === "retailer" ? `<span class="popular-label">For bookshops</span>` : ""}<h2>${escapeHtml(plan.name)}</h2><p>${escapeHtml(plan.audience)}</p><div class="plan-price">${plan.monthlyPrice === 0 ? "Free" : `₹${Number(plan.monthlyPrice).toLocaleString("en-IN")}`}<small>${plan.monthlyPrice === 0 ? "no monthly platform fee" : "per month"}</small></div>${plan.freeQuoteSubmissions ? `<p class="plan-allowance">Planned free allowance: first ${plan.freeQuoteSubmissions} submitted supplier quotations. Quota and payment enforcement are not active yet.</p>` : ""}<ul>${plan.features.map(feature => `<li>${icon("✓")} ${escapeHtml(feature)}</li>`).join("")}</ul><div class="plan-actions">${plan.monthlyPrice === 0
    ? `<button class="button button-${planColors[plan.id]}" data-auth="register" data-role="school">Register as School ${arrow}</button>${plan.id === "school" ? `<button class="button button-outline" data-auth="register" data-role="other">Register as Other User</button>` : ""}`
    : `<a class="button button-${planColors[plan.id]}" href="/contact#support-form">Enquire about this plan ${arrow}</a>`}</div></article>`;
  const schoolPlan = plans.find(plan => plan.id === "school");
  const otherPlan = plans.find(plan => plan.id === "other");
  const paidPlans = plans.filter(plan => plan.id !== "school" && plan.id !== "other");
  const discoveryPlan = schoolPlan && otherPlan ? {
    ...schoolPlan,
    id: "school",
    name: "Discovery Plan",
    audience: "For Schools & Other Authorised Users",
    features: [
      ...schoolPlan.features.slice(0, 4),
      "Other users: profile, permitted catalogue suggestions, notifications, and assigned tools"
    ]
  } : null;
  return `${pageHero("Platform Access", "Pricing Information", "Choose a monthly GoErudite plan based on your organisation's role. The listed points describe existing dashboard tools; book purchases and supplier transactions are separate.")}<section class="container pricing-grid">${discoveryPlan ? card(discoveryPlan) : ""}${paidPlans.map(card).join("")}</section>
    <section class="container"><div class="responsibility-strip"><h2>Monthly Platform Plans</h2><div class="responsibility-grid"><p>${icon("▱")} School and Other authorised-user access is listed as free.</p><p>${icon("₹")} Distributor and Retailer plans are ₹1,000/month; Publisher is ₹1,500/month.</p><p>${icon("ⓘ")} Online plan payment and subscription-based dashboard gating are not enabled yet. Contact GoErudite to enquire; no payment or paid activation is processed on this page.</p></div></div><div class="workspace-note"><b>Plan feature scope</b><p>Features depend on role, verification, organisation permissions, and the enabled workflow. This page does not promise POS, payment processing, warehouse management, AI forecasting, or other tools that are not available in the current dashboard.</p></div></section>`;
}

function aboutPage() {
  return `<section class="about-hero"><div class="container about-hero-grid"><div><h1>About <em>GoErudite</em></h1><div class="orange-rule"></div><p>GoErudite is an education catalogue discovery and institutional procurement workflow platform. It helps schools explore academic book information, prepare requirements, request quotations, compare submitted responses, and manage related records.</p><p>Distributors, retailers, publishers, and other authorised users access tools according to their role and permissions. GoErudite does not itself buy or sell books, guarantee stock or prices, process commercial payments, settle invoices, or provide physical delivery.</p><a href="/solutions" class="button">Explore Platform ${arrow}</a></div><div class="about-values-grid">${[["▥", "School-Led Requirements"], ["◇", "Role-Based Access"], ["▣", "Academic Catalogue Details"], ["▧", "Workflow Records"], ["♙", "Human Decisions"], ["▥", "Clear Responsibilities"]].map((x, i) => `<div><span class="line-icon color-${i}">${x[0]}</span>${x[1]}</div>`).join("")}</div></div></section>
    <section class="section container story-section" id="story"><div><span class="eyebrow">What the platform does</span><h2>Catalogue Discovery and Structured Sourcing Workflows</h2><p>Schools can prepare academic book requirements and, subject to account verification and permissions, publish a Request for Quotation (RFQ). Eligible distributors and retailers can respond with supplier-stated availability, quantities, prices, validity, and fulfilment terms.</p><p>Schools can review submitted quotations and use the enabled evaluation and two-person purchase-order approval workflow. An RFQ is not an order, and comparing quotations does not commit a school to purchase.</p><p>Publisher catalogue records, sponsored listings, and user-submitted information are provided for discovery or workflow purposes. Users should independently check book details, supplier terms, availability, and relevant commercial information before entering an agreement.</p></div><div class="illustration-panel"><div class="screen-illustration"><div class="brand"><span class="brand-mark">≡</span><span><b>Go</b>Erudite</span></div><div class="workflow"><span>Prepare RFQ</span> → <span>Compare Quotations</span> → <span>Authorised PO</span></div><div class="screen-lines"></div></div><div class="book-stack">▤ &nbsp; ▤ &nbsp; ▤</div><span class="plant">♧</span></div></section>
    <section class="section soft-section" id="values"><div class="container"><div class="center-heading"><span class="eyebrow">Our approach</span><h2>Clear, Role-Based Sourcing Workflows</h2></div><div class="value-grid">${[["◈", "School-Led Decisions", "Schools review academic requirements and submitted quotations and retain responsibility for their procurement decisions."], ["◇", "Role-Scoped Participation", "Account verification and role permissions control which workflows a user may access."], ["▣", "Private Records", "RFQ, quote, profile, inquiry, and order records are scoped according to the relevant account and role."], ["▧", "Recorded Workflow Activity", "The platform stores operational records to support review of RFQs, quotations, approvals, and fulfilment updates."]].map(x => `<article><span class="feature-icon">${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join("")}</div></div></section>
    <section class="section container vision-mission" id="mission"><article><span class="vision-icon">◎</span><div><span class="eyebrow">Our vision</span><h2>Building a More Structured Education Supply Network</h2><p>Our vision is to strengthen academic procurement access by helping institutions use structured workflows, verified supply participation, and responsible communication.</p><p>We aim to support long-term trust between schools, distributors, retailers, and publishers while reducing operational friction in textbook sourcing.</p></div></article><article><span class="vision-icon">⚑</span><div><span class="eyebrow">Our mission</span><h2>Making Academic Procurement More Transparent</h2><p>Our mission is to help educational institutions raise clear academic requirements and enable verified supply partners to respond through accountable digital workflows.</p><p>GoErudite is designed to support transparency, operational discipline, privacy protection, and role-based decision-making across the education ecosystem.</p></div></article></section>
    ${teamSection()}`;
}

function trustPage() {
  const policies = {
    privacy: [
      ["▤", "Information processed", "Depending on how you use the service, records may include account name and email, organisation profile details, role and verification status, support messages, RFQs, quotations, inventory, catalogue submissions, orders, receipts, disputes, advertisement inquiries, notifications, and audit events."],
      ["◇", "Why records are used", "Information is used to create and administer accounts, apply role and organisation access checks, operate the requested workflow, review verification or moderation submissions, provide support, maintain records, and investigate reported misuse."],
      ["◉", "Access and sharing", "Records are available to the account, organisation members, or other role-authorised users only where the workflow permits. Public catalogue pages and sponsored listings display only their intended listing information. Private school advertisement inquiries are routed to the assigned advertiser without including the school's contact details in the inquiry."],
      ["▣", "Storage and security", "The current application uses a local JSON data store and local JSON backups, with session state held in server memory. Passwords are stored as password hashes and staff invitation tokens are stored as hashes. These controls do not eliminate security or availability risks."],
      ["♙", "Retention and requests", "Records are retained in the application store and backups. Automatic backup deletion or pruning is not enabled, and a comprehensive retention schedule has not been configured. To request access, correction, or deletion, or to report a privacy concern, contact support; requests may be subject to identity checks and applicable legal requirements."],
      ["▧", "Your responsibilities", "Use a unique password, keep account access under authorised control, submit only information you are permitted to share, and promptly report suspected account misuse or inaccurate personal information."]
    ],
    terms: [
      ["▤", "Platform role", "GoErudite provides catalogue discovery and digital workflow tools. It does not itself buy or sell books, guarantee stock, prices, supplier performance, payment, or delivery, or process commercial payments or settle invoices."],
      ["♙", "Accounts and permissions", "Provide accurate registration and organisation information. Account verification and role permissions determine which features are available. Do not use another person's account or attempt to access records outside your authority."],
      ["◈", "Catalogue, RFQs, and quotations", "Catalogue metadata and MRP are for reference and discovery. An RFQ is a request for quotations, not an order. Supplier quotations reflect the supplier's stated terms and validity. Users should independently confirm title, ISBN, edition, quantity, availability, price, taxes, charges, delivery terms, and supplier authority."],
      ["⇄", "Orders and commercial arrangements", "Quotation evaluation does not automatically create a purchase order. A PO is created only through the applicable authorised approval workflow. Negotiation, sale, purchase, invoicing, payment, settlement, shipment, delivery, return, and refund arrangements are handled by the relevant parties outside GoErudite, subject to applicable law and their agreement."],
      ["▧", "User content and conduct", "You are responsible for the accuracy and lawful use of information you submit, including catalogue details, inventory, prices, RFQs, and advertisements. Do not misrepresent identity or supply, submit unlawful content, interfere with the service, or access another user's information without permission."],
      ["⚖", "Legal rights and changes", "Nothing in these website terms is intended to exclude rights or duties that cannot lawfully be excluded. Applicable statutory obligations continue to apply. The platform may update features or terms; material legal terms require review and clear notice before reliance."]
    ],
    guidelines: [
      ["♙", "Use the correct account role", "Register using your actual organisation role. Account verification does not guarantee the accuracy of every user-provided offer or transaction."],
      ["▤", "Keep sourcing records accurate", "Check academic session, board, medium, title, ISBN, edition, quantity, quote validity, and all commercial terms before relying on a record."],
      ["⊘", "Respect privacy and permissions", "Do not try to obtain private school, supplier, or organisation information outside the workflow that authorises access."],
      ["◇", "Report inaccurate content or misuse", "Contact support with the relevant record reference and a clear description. Do not include sensitive personal data unless necessary to explain the report."]
    ],
    returns: [
      ["♙", "Commercial returns", "GoErudite does not sell or deliver books and cannot promise a commercial return, replacement, refund, or payment recovery. The buyer and supplier should agree applicable return, cancellation, replacement, and refund terms directly, consistently with applicable law."],
      ["▤", "Platform dispute records", "Where enabled, a school can record wrong, damaged, or missing quantities after receipt; the supplier can respond; an administrator can record a platform resolution; and the school can close the case. This workflow records reports and decisions but does not itself transfer money, compel a refund, or arrange a replacement."],
      ["⇄", "Keep supporting evidence", "Users should preserve relevant invoices, delivery records, correspondence, and product evidence and share it directly with the other transaction party through appropriate channels. The platform's current dispute workflow does not provide dispute-file attachments."],
      ["⚠", "Seek appropriate assistance", "For a transaction dispute, contact the other party and consider suitable professional or statutory assistance. Platform support can assist with account access and workflow records, not determine contractual or legal rights."]
    ],
    compliance: [
      ["▧", "Legal and business details", "The legal entity name, registered address, statutory identifiers, designated grievance contact, governing-law wording, and jurisdiction must be confirmed by the business owner and reviewed by qualified Indian counsel before publication."],
      ["◇", "No legal certification claim", "These pages describe the implemented product workflows and are not a legal opinion, compliance certification, or assurance that any disclaimer removes statutory responsibilities."],
      ["✉", "Contact and corrections", "For platform support or to report inaccurate content, use the Contact Support form. The business owner should confirm the published response process before launch."]
    ]
  };
  const policyBlock = (id, number, title, intro, items) => `<section class="policy-card" id="${id}"><div class="numbered-title"><b>${number}</b><h2>${title}</h2></div><p>${intro}</p>${items.map(item => `<div class="policy-item"><span>${item[0]}</span><div><h3>${item[1]}</h3><p>${item[2]}</p></div></div>`).join("")}</section>`;
  return `${pageHero("Platform Information,", "Privacy and Terms", "Learn how GoErudite's catalogue, RFQ, quotation, sponsored-listing, and dispute-record workflows operate, and what users should verify independently.")}<section class="container trust-content"><div class="trust-card-grid">${[
    ["▤", "RFQs are requests", "An RFQ invites supplier quotations; it is not a confirmed purchase order."],
    ["◈", "Role-based access", "Account role, organisation, verification, and permissions govern access to platform workflows."],
    ["♙", "Human decisions", "Users make their academic and commercial decisions; the platform does not select a supplier automatically."],
    ["◇", "Sponsored placement", "Sponsored listings are labelled. An advertisement click or inquiry is not a purchase."]
  ].map(item => `<article class="trust-card"><span class="feature-icon">${item[0]}</span><div><h3>${item[1]}</h3><p>${item[2]}</p></div></article>`).join("")}</div>
  <div class="trust-columns">${policyBlock("privacy", "1", "Privacy Information", "This summary describes categories and handling visible in the current application. The business owner should confirm the final legal entity, deployment, processors, retention schedule, and statutory notices before publication.", policies.privacy)}${policyBlock("terms", "2", "Terms &amp; Conditions", "These plain-language terms describe the current platform role and user workflows. They must be professionally reviewed and aligned with actual business operations before being treated as final legal terms.", policies.terms)}${policyBlock("guidelines", "3", "Platform Guidelines", "Use the platform accurately and within your assigned permissions.", policies.guidelines)}${policyBlock("returns", "4", "Return, Cancellation and Dispute Information", "Platform dispute records are separate from any commercial remedy or legal right.", policies.returns)}${policyBlock("compliance", "5", "Compliance and Business Information Notice", "The following business and legal details require owner confirmation and professional review.", policies.compliance)}</div>
  <div class="workspace-note"><b>Important</b><p>This website information does not replace a transaction contract, professional advice, or rights and obligations under applicable Indian law. The platform does not process commercial payments, settle invoices, or arrange physical delivery.</p></div></section>`;
}

function faqPage() {
  const questions = [
    ["What is GoErudite?", "GoErudite provides a catalogue and role-based workflow platform for schools and education suppliers to prepare requirements, exchange quotations, and manage procurement records."],
    ["Does GoErudite sell textbooks directly?", "No. GoErudite provides catalogue discovery and workflow tools. Users arrange product sales, pricing, payments, invoicing, and delivery directly with one another."],
    ["How does an RFQ work?", "An eligible school can prepare an RFQ draft, complete the required information, and publish it to invite quotations. An RFQ is a request for offers, not a purchase order."],
    ["Can a school compare quotations?", "Schools can review quotations received for their RFQs and use the available procurement workflow to make their own selection and approval decisions. A quotation does not itself create an order."],
    ["Who can respond to an RFQ?", "Eligible distributor and retailer accounts can access and respond to RFQs according to their role, account status, verification, and the RFQ's availability."],
    ["Can publishers add catalogue titles?", "Publisher accounts can submit catalogue information through the publisher workflow. Submissions may require review before appearing publicly."],
    ["How does a purchase order get approved?", "Purchase orders follow the configured organisation approval workflow. Where two-person approval applies, a separate Manager or Owner must provide the additional decision before the PO proceeds."],
    ["Does GoErudite process payments or delivery?", "No. Users coordinate payment, invoice settlement, dispatch, and delivery directly. The platform may record workflow information but does not guarantee those commercial arrangements."],
    ["Can I recover a forgotten password or enable MFA?", "You can request a single-use password reset link when GoErudite SMTP email is configured. Reset links expire after 30 minutes and resetting revokes existing sessions. If email delivery is unavailable, contact platform support. Multi-factor authentication is not currently available."],
    ["Does GoErudite provide offline conflict-safe synchronisation?", "No. Conflict-safe offline synchronisation is not currently available. Use the online workflow and confirm that changes have been saved."],
    ["How are sponsored listings handled?", "Sponsored listings are labelled. An eligible active verified school may send a private inquiry to the advertiser. An inquiry is not an order, quote acceptance, or payment."],
    ["Are catalogue MRP and academic details final offers?", "No. Catalogue MRP and metadata are reference information. Check the ISBN, edition, curriculum fit, availability, and current commercial terms directly with the relevant supplier."],
    ["Does the platform guarantee user information is secure?", "The application applies account roles and permissions, but no online system can be represented as risk-free. Use a unique password and share only information needed for the workflow."],
    ["How can I contact support?", "Submit a platform-related support request using the Contact Support form. Do not use that form to submit payment credentials or sensitive documents unless specifically requested through an approved process."],
    ["Can platform users resolve commercial disputes through GoErudite?", "The platform can record workflow information where those features are available. Users remain responsible for their commercial agreements and any remedies available under applicable law."]
  ];
  return `${pageHero("GoErudite Help", "Centre &amp; FAQs", "Practical answers about catalogue discovery, RFQs, quotations, approvals, sponsored listings, and account access.")}<section class="container faq-page"><section class="return-policy"><div class="numbered-title"><b>5</b><h2>Commercial Returns &amp; Disputes</h2></div><div class="return-grid">${[
    ["♙", "Platform role", "GoErudite provides digital catalogue and workflow tools; it is not the seller, buyer, carrier, or payment processor for user transactions."],
    ["▤", "Commercial records", "Keep relevant invoices, delivery records, and correspondence under your own transaction process. Do not assume a platform workflow record replaces a contract or invoice."],
    ["⇄", "Dispute handling", "Users should contact one another and follow their agreement and applicable law. The platform's available dispute records do not guarantee a settlement, refund, or replacement."],
    ["⚠", "Platform support", "Use the support form for account or platform issues. It is not a substitute for legal advice or a commercial dispute-resolution service."]
  ].map(x => `<article><span class="feature-icon">${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join("")}</div></section>
  <section class="account-rules"><div class="numbered-title"><b>6</b><div><h2>Login &amp; Registration</h2><p>Create an account using accurate details and the role that matches your organisation's work.</p></div></div><div class="account-rule-grid">${[["♙", "Choose a role", "School · Distributor · Retailer · Publisher · Other authorised user"], ["▣", "Account review", "Some role workflows require account or organisation verification."], ["▧", "Password access", "Use a unique password. Password recovery and MFA are not currently available."], ["▤", "Use permitted workflows", "Your account role, status, organisation and granted permissions determine available actions."], ["▣", "Share carefully", "Provide only information needed for the relevant platform workflow."]].map(x => `<article><span>${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join("")}</div><button class="button" data-auth="register">Create an account ${arrow}</button></section>
  <section class="faq-section"><div class="numbered-title"><b class="orange-number">7</b><h2>Frequently Asked Questions</h2></div><div class="faq-grid">${questions.map((question, i) => `<details class="faq-item"><summary><span class="faq-symbol">${["▰", "▤", "⚙", "♙", "▣", "▱", "▰", "◫", "₹", "▣", "▧", "✧", "▣", "♙", "◇"][i]}</span><span><b>${question[0]}</b><p>${question[1]}</p></span></summary></details>`).join("")}</div></section></section>`;
}

function supportPage() {
  const contact = publicContact || { phone: "+91 8586032007", phoneHref: "+918586032007", email: "support@goerudite.com", social: [] };
  const socialLinks = contact.social.map(({ name, url }) => url
    ? `<a class="social-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="GoErudite on ${socialLabel(name)}" title="${socialLabel(name)}">${socialIcons[name]}</a>`
    : `<span class="social-link social-link-pending" role="img" aria-label="${socialLabel(name)} profile link not configured" title="${socialLabel(name)} profile link not configured">${socialIcons[name]}</span>`).join("");
  return `<section class="contact-hero"><div class="container contact-hero-inner"><div><h1>Contact <em>GoErudite</em></h1><p>Use this page to submit a question about platform access, account verification, or a GoErudite workflow.</p><p>The support request form is for platform assistance, not for negotiating a product sale or arranging payment or delivery.</p><div class="notice notice-dark">${icon("◇")} Product availability, commercial terms, payments, invoices, and delivery are handled directly by the relevant users.</div></div><div class="contact-art"><span>●</span><b>◉</b><i>✉</i></div></div></section>
    <section class="container support-layout"><aside class="support-info"><h2>Contact Info</h2><p>For platform support, plan enquiries, and account assistance, use the contact options below or submit the support form.</p><div class="contact-info-item"><span>⌖</span><div><b>Address</b><p>Shadipur, West Patel Nagar<br>Pin Code 110008, New Delhi</p></div></div><div class="contact-info-item"><span>⌕</span><div><b>Phone</b><a href="tel:${escapeHtml(contact.phoneHref)}">${escapeHtml(contact.phone)}</a></div></div><div class="contact-info-item"><span>✉</span><div><b>Email</b><a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a></div></div><div class="social-row" aria-label="Social media links">${socialLinks}</div><a class="button button-outline" href="#support-form">Open the support request form ${arrow}</a></aside>
    <section class="support-form-card"><h2>Submit a Support Request</h2><p>Share a platform-related query. Submitting a request does not guarantee a particular response time or outcome.</p><form id="support-form" class="form-grid"><label>First Name <b>*</b><input name="firstName" placeholder="Enter first name" required maxlength="80"></label><label>Last Name <b>*</b><input name="lastName" placeholder="Enter last name" required maxlength="80"></label><label class="field-full">Business Email <b>*</b><input name="email" type="email" placeholder="Enter business email address" required maxlength="254"></label><fieldset class="field-full"><legend>I represent <b>*</b></legend><div class="role-select">${["School Administrator", "Distributor", "Retailer", "Publisher", "Other Authorized User"].map((role, i) => `<label><input type="radio" name="role" value="${role}" ${i === 0 ? "required" : ""}><span>${["🎓", "▣", "▰", "▤", "♙"][i]}</span><small>${role}</small></label>`).join("")}</div></fieldset><label class="field-full">Support Requirement <b>*</b><textarea name="message" rows="4" minlength="10" maxlength="3000" placeholder="Describe your platform query, verification request, or workflow issue." required></textarea></label><div class="field-full form-submit"><button class="button button-wide" type="submit">➤ &nbsp; Submit Request</button></div></form></section></section><div class="container">${notice("GoErudite support is for platform and account assistance. Commercial discussions and transaction arrangements remain between users.", "blue")}</div>`;
}

function passwordResetRequestPage() {
  return `<section class="auth-page container"><div class="auth-card"><span class="eyebrow">Account access</span><h1>Reset your password</h1><p>Enter the email address on your account. If the account exists and email delivery is configured, a one-time reset link will be sent. If no email arrives, contact platform support.</p><form id="password-reset-request-form"><label>Business email<input name="email" type="email" required maxlength="254" autocomplete="email"></label><button class="button" type="submit">Request reset link</button><div class="form-status" role="status" aria-live="polite"></div></form><a href="/dashboard">Return to login</a></div></section>`;
}

function passwordResetConfirmPage(_token) {
  return `<section class="auth-page container"><div class="auth-card"><span class="eyebrow">Secure account recovery</span><h1>Choose a new password</h1><p>Reset links expire after 30 minutes and can be used once. After changing your password, log in again on your devices.</p><form id="password-reset-confirm-form"><label>New password<input name="password" type="password" minlength="10" maxlength="200" required autocomplete="new-password"></label><label>Confirm new password<input name="confirmPassword" type="password" minlength="10" maxlength="200" required autocomplete="new-password"></label><button class="button" type="submit">Update password</button><div class="form-status" role="status" aria-live="polite"></div></form><a href="/dashboard">Return to login</a></div></section>`;
}

function blogIndexPage(items) {
  const articles = items.length ? `<div class="container blog-public-grid">${items.map(item => `<article class="blog-public-card"><a href="/blog/${encodeURIComponent(item.slug)}"><img src="${escapeHtml(item.coverImage)}" alt="" loading="lazy"><div><p class="blog-public-meta">${escapeHtml(item.author)} · ${escapeHtml(formatBlogDate(item.publicationDate || item.publishedAt))}</p><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.content.slice(0, 190))}${item.content.length > 190 ? "…" : ""}</p><span class="blog-read-link">Read article →</span></div></a></article>`).join("")}</div>` : `<div class="container blog-empty"><h2>No published articles yet</h2><p>New GoErudite articles will appear here after publication.</p></div>`;
  return `${pageHero("GoErudite", "Blog", "Read published articles and updates about academic catalogues, institutional RFQs, quotations, and education sourcing workflows.")}${articles}`;
}

function blogDetailPage(item) {
  return `<article class="container blog-public-article"><a class="blog-back-link" href="/blog">← All articles</a><img class="blog-detail-cover" src="${escapeHtml(item.coverImage)}" alt="${escapeHtml(item.title)}"><p class="blog-public-meta">${escapeHtml(item.author)} · ${escapeHtml(formatBlogDate(item.publicationDate || item.publishedAt))}</p><h1>${escapeHtml(item.title)}</h1><div class="blog-public-content">${escapeHtml(item.content)}</div></article>`;
}

function formatBlogDate(value) {
  if (!value) return "Date not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date not set" : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

const categoryChips = ["Academic / School", "Competitive Exams", "Reference", "Children"];
const filterGroups = [
  ["subject", "Subject", ["Mathematics", "Science", "English", "Aptitude", "Other Subjects"]],
  ["board", "Education Board", ["CBSE", "ICSE", "State Board", "Other"]],
  ["medium", "Medium", ["English", "Regional", "Other Medium"]],
  ["level", "Academic Level", ["Class 8", "Class 9", "Class 10", "Class 11", "Class 12", "Primary (1–5)", "Middle (6–8)", "Senior Secondary (11–12)"]]
];

function bookCover(book, large = false) {
  const color = book.cover || book.subject?.toLowerCase() || "navy";
  const label = book.title || "Academic Title";
  const coverClass = color.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  return `<div class="book-cover ${large ? "book-cover-large" : ""} cover-${coverClass}"><span class="cover-tag">${escapeHtml(book.level || "Academic title")}</span><div class="cover-art">${coverIcon(color)}</div><b>${escapeHtml(label)}</b><small>${escapeHtml(book.publisher || "Publisher not specified")}</small><span class="cover-edition">${escapeHtml(book.subject || "Academic title")}</span></div>`;
}

function coverIcon(color) {
  const images = {
    science: "⚛",
    teal: "⌘",
    navy: "▤",
    english: "▰",
    physics: "⚛",
    blue: "◎",
    green: "△",
    math: "＋ ÷ ×",
    mathematics: "＋ ÷ ×",
    competitive: "✦",
    atlas: "◎",
    business: "▥",
    children: "☼"
  };
  return images[color] || images[String(color).toLowerCase()] || "▤";
}

function bookCard(book, _compact = false) {
  return `<article class="book-card">${bookCover(book)}<div class="book-card-content"><div class="book-meta-top"><span>${escapeHtml(book.board || "Board not specified")}</span><span>${book.source === "sample" ? "Sample listing" : "Publisher catalogue"}</span></div><a class="book-title" href="/book/${encodeURIComponent(book.id)}">${escapeHtml(book.title)}</a><p class="book-publisher">${escapeHtml(book.publisher || "Publisher not specified")}</p><div class="book-card-details"><span>${escapeHtml(book.level || "Academic title")}</span><span>Reference MRP: ${money.format(book.price || 0)}</span></div><div class="book-card-details"><span>${escapeHtml(book.medium || "Medium not specified")}</span><span>${escapeHtml(book.session || "Session not specified")}</span></div><div class="book-actions"><a href="/book/${encodeURIComponent(book.id)}">View book details ⓘ</a><button data-rfq="${escapeHtml(book.id)}">Start RFQ draft +</button></div></div></article>`;
}

function catalogPage() {
  const selectedCategory = catalogQuery.get("category") || "";
  const search = catalogQuery.get("q") || "";
  return `<section class="catalog-hero"><div class="container"><span class="eyebrow eyebrow-light">Academic title discovery</span><h1>Explore the Academic Book Catalogue</h1><p>Search academic book and publisher catalogue information by title, ISBN, subject, board, medium, and session. Catalogue entries support discovery and do not confirm stock or a supplier offer.</p><a class="button" href="#catalog-grid">Explore Catalogue ${arrow}</a></div></section>
    <section class="category-strip">${categoryChips.map(category => `<button class="chip ${selectedCategory === category ? "selected" : ""}" data-category="${escapeHtml(category)}">${category}</button>`).join("")}</section>
    <section class="container catalog-layout"><aside class="filters-panel"><div class="filter-heading"><h2>☷ &nbsp; Filters</h2><button type="button" data-clear-filters>Clear all</button></div><form id="catalog-filters">
      ${filterGroups.map(([key, label, values]) => `<fieldset class="filter-group"><legend>${label}</legend>${values.map(value => `<label><input type="radio" name="${key}" value="${value}" ${catalogQuery.get(key) === value ? "checked" : ""}><span>${value}</span></label>`).join("")}</fieldset>`).join("")}
      <fieldset class="filter-group"><legend>Price range (MRP)</legend><label class="range-label"><span>₹0</span><span>Up to ₹5000</span></label><input type="range" name="maxPrice" min="0" max="5000" step="50" value="${catalogQuery.get("maxPrice") || "5000"}" aria-label="Maximum reference MRP"></fieldset>
      <div class="growth-card"><b>Publisher catalogue</b><p>Publisher submissions appear after account verification and administrator review. Catalogue records do not show supplier stock or confirmed selling prices.</p></div><div class="filter-tip"><b>Academic discovery</b><p>Use board, level, subject, medium, and session filters. Schools can start an RFQ draft from a title detail page.</p></div></form></aside>
    <section class="catalog-results" id="catalog-grid"><div class="catalog-toolbar"><form id="catalog-search"><label class="visually-hidden" for="catalog-search-query">Search catalogue by title, publisher, ISBN, board, or session</label><input id="catalog-search-query" name="q" value="${escapeHtml(search)}" placeholder="Search by title, publisher, ISBN, board, or session..."><button aria-label="Search catalogue">⌕</button></form><label>Sort titles<select name="sort" form="catalog-filters"><option value="">Default order</option><option value="title-asc" ${catalogQuery.get("sort") === "title-asc" ? "selected" : ""}>Title A to Z</option><option value="price-asc" ${catalogQuery.get("sort") === "price-asc" ? "selected" : ""}>Reference MRP: low to high</option><option value="price-desc" ${catalogQuery.get("sort") === "price-desc" ? "selected" : ""}>Reference MRP: high to low</option></select></label></div><div class="book-grid catalog-book-grid" id="catalog-list" aria-live="polite"><div class="loading-card">Loading academic titles…</div></div><div class="catalog-pagination" id="catalog-pagination"></div></section></section>
    <div class="container">${notice("Catalogue information, including MRP and academic metadata, is provided for reference and discovery. It does not confirm current stock, supplier availability, a final negotiated price, or a guaranteed sale. A last-updated date is not currently available for every catalogue record; confirm details directly before proceeding.", "blue")}</div>`;
}

function detailPage(book) {
  if (!book) return `<section class="container not-found"><h1>Academic title not found</h1><p>This title may no longer be listed in the catalog.</p><a class="button" href="/catalog">Back to catalog ${arrow}</a></section>`;
  return `<section class="container detail-page"><div class="detail-layout"><aside class="publisher-panel">${bookCover(book, true)}<span class="verified-badge">${book.source === "sample" ? "Sample catalogue record" : "Reviewed catalogue submission"}</span><h2>${escapeHtml(book.publisher)}</h2><p class="publisher-description">Publisher and title information shown in the catalogue record. Contact details and sample files are not available on this listing.</p><div class="publisher-actions"><a href="/about">About GoErudite</a><a href="/contact">Contact support</a></div></aside>
    <article class="detail-main"><span class="book-tag">${escapeHtml(book.board || "Board not specified")}</span><span class="book-tag">${escapeHtml(book.level || "Level not specified")}</span><h1>${escapeHtml(book.title)}</h1><p class="published-by">Publisher <b>${escapeHtml(book.publisher || "Not specified")}</b>${book.author ? ` · Author <b>${escapeHtml(book.author)}</b>` : ""}</p><div class="detail-rating"><strong>Catalogue information</strong> <small>Review ISBN, edition, and academic compatibility before using this record.</small></div><div class="detail-facts">${[
      ["Academic Medium", book.medium || "Not specified"], ["Academic Session", book.session || "Not specified"], ["ISBN", book.isbn || "Not supplied"], ["Page Count", book.pages ? `${book.pages} Pages` : "Not supplied"], ["Published On", book.publicationDate || "Not supplied"], ["Applicable Board", book.board || "Not specified"], ["Recommended Age Group", book.age || "Not specified"], ["Content Type", book.format || "Not specified"], ["Subject Category", book.subject || "Not specified"], ["Edition", book.edition || "Not supplied"]
    ].map(x => `<div>${icon("▤")}<span><b>${x[0]}</b><small>${escapeHtml(x[1])}</small></span></div>`).join("")}</div><div class="mrp-block"><span>Publisher Reference Price (MRP)</span><strong>${money.format(book.price)}</strong><small>Reference information only; confirm the current price directly with a supplier.</small></div><h3>Academic Overview</h3><p>${escapeHtml(book.description)}</p><p>Schools should check the ISBN, edition, and curriculum compatibility before preparing a requirement.</p><div class="rfq-form"><label for="rfq-quantity">Required Quantity</label><div class="quantity-control"><button data-quantity="-1" aria-label="Decrease quantity">−</button><input id="rfq-quantity" type="number" value="1" min="1" max="10000"><button data-quantity="1" aria-label="Increase quantity">+</button></div><button class="button" data-rfq="${escapeHtml(book.id)}">▤ &nbsp;Start RFQ draft</button><small>An RFQ is a request for quotations, not an order. This action saves a school draft.</small></div>
    <p class="form-legal">Catalogue record last-updated date: not provided. Confirm bibliographic details, MRP, availability, and terms directly with the relevant supplier.</p></article>
    <aside class="book-sidebar"><div class="quick-details"><h3>Quick Details</h3>${[["Print Length", book.pages ? `${book.pages} Pages` : "Not supplied"], ["Reading Age", book.age || "Not specified"], ["Edition", book.edition || "Not supplied"], ["ISBN", book.isbn || "Not supplied"]].map(x => `<div>${icon("▤")}<span>${x[0]}</span><b>${escapeHtml(x[1])}</b></div>`).join("")}</div><div class="why-book"><span class="eyebrow">Description</span><h3>Academic overview</h3><p>${escapeHtml(book.description || "No description supplied.")}</p>${(book.highlights || []).map(highlight => `<p>✓ &nbsp;${escapeHtml(highlight)}</p>`).join("")}</div></aside></div>${book.source === "sample" ? notice("Sample catalogue record. Verify bibliographic details and publisher MRP; this record does not confirm stock or supplier availability.", "orange") : notice("Publisher catalogue metadata has been reviewed for listing. Review it independently; listing does not confirm supplier availability or commercial terms.", "blue")}</section>`;
}

function advertisementCard(item) {
  return `<article class="public-ad-card">
    <a href="/advertisements/${encodeURIComponent(item.id)}" data-ad-click="${escapeHtml(item.id)}" aria-label="View sponsored listing: ${escapeHtml(item.title)}">
      ${item.coverImage ? `<img src="${escapeHtml(item.coverImage)}" alt="${escapeHtml(item.productTitle || item.title)}" loading="lazy">` : `<div class="public-ad-placeholder">GoErudite Sponsored Listing</div>`}
      <div class="public-ad-content"><span class="sponsored-label">Sponsored listing</span><h2>${escapeHtml(item.title)}</h2><p class="public-ad-advertiser">${escapeHtml(item.advertiserName)}</p>
      ${item.productTitle ? `<h3>${escapeHtml(item.productTitle)}</h3>` : ""}
      <p>${escapeHtml(item.description)}</p>
      <div class="public-ad-tags">${[item.subject, item.className, item.board, item.medium, item.academicSession].filter(Boolean).map(value => `<span>${escapeHtml(value)}</span>`).join("")}</div>
      <span class="public-ad-link">View sponsored listing ${arrow}</span></div>
    </a>
  </article>`;
}

function advertisementIndexPage(items) {
  return `${pageHero("Sponsored Education", "Listings", "Explore currently available sponsored education listings. Advertisers provide listing information; GoErudite does not sell products or process payments.")}<section class="container public-ad-page">
    <div class="notice notice-sand">${icon("ⓘ")} Listing details and reference prices are supplied by advertisers and may not be independently verified. Confirm availability, edition, price, delivery, and commercial terms directly. An inquiry is private to the advertiser and is not a public RFQ or order.</div>
    ${items.length ? `<div class="public-ad-grid">${items.map(advertisementCard).join("")}</div>` : `<div class="blog-empty"><h2>No active sponsored listings</h2><p>There are no sponsored listings available at the moment. Explore the public catalogue instead.</p><a class="button button-outline" href="/catalog">Explore Catalogue</a></div>`}
  </section>`;
}

function advertisementDetailPage(item) {
  if (!item) return `<section class="container not-found"><h1>Advertisement unavailable</h1><p>This campaign is not active or may have ended.</p><a class="button button-outline" href="/advertisements">Browse advertisements</a></section>`;
  const details = [
    ["ISBN / catalogue reference", item.isbn], ["Subject", item.subject], ["Class / grade", item.className],
    ["Board", item.board], ["Medium", item.medium], ["Academic session", item.academicSession]
  ].filter(([, value]) => value);
  const requestAction = !currentUser
    ? `<button class="button" data-auth="login">Log in as a verified school to contact advertiser ${arrow}</button>`
    : currentUser.role === "school" && currentUser.verificationStatus === "verified" && currentUser.accountStatus === "active"
      ? `<form class="ad-inquiry-form" id="ad-inquiry-form" data-advertisement-id="${escapeHtml(item.id)}"><h2>Contact advertiser</h2><p>Your inquiry is routed to this advertiser through GoErudite. The form sends your requested quantity and message; it does not include your name or email address in those fields.</p><label>Required quantity <input name="quantity" type="number" min="1" max="100000" value="1" required></label><label>Message to advertiser <textarea name="message" maxlength="1000" rows="4" placeholder="Optional: edition, delivery area, or other requirements"></textarea></label><button class="button" type="submit">Send private inquiry ${arrow}</button><div class="ad-inquiry-result" role="status"></div></form>`
      : `<div class="workspace-note"><b>Verified school account required</b><p>Only active, verified schools can send private quote inquiries from advertisements. Supplier roles can continue using the existing public RFQ workflow.</p></div>`;
  return `<section class="container public-ad-detail"><a class="blog-back-link" href="/advertisements">← All sponsored listings</a><article class="public-ad-detail-card">
    <div class="public-ad-detail-image">${item.coverImage ? `<img src="${escapeHtml(item.coverImage)}" alt="${escapeHtml(item.productTitle || item.title)}">` : `<div class="public-ad-placeholder">Sponsored listing</div>`}</div>
    <div class="public-ad-detail-content"><span class="sponsored-label">Sponsored listing · ${escapeHtml(item.advertiserName)}</span><h1>${escapeHtml(item.title)}</h1>${item.productTitle ? `<h2>${escapeHtml(item.productTitle)}</h2>` : ""}<p class="public-ad-description">${escapeHtml(item.description)}</p>
    ${item.referencePrice != null ? `<div class="public-ad-reference-price"><span>Advertiser-provided reference price</span><strong>${money.format(item.referencePrice)}</strong><small>Not a quote or guaranteed transaction price. Confirm directly with the advertiser.</small></div>` : ""}
    ${details.length ? `<dl class="public-ad-facts">${details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>` : ""}
    <p class="public-ad-dates">Campaign dates: ${escapeHtml(item.startDate)} – ${escapeHtml(item.endDate)}</p>${requestAction}
    <div class="notice notice-sand">${icon("ⓘ")} This sponsored listing contains advertiser-provided information. GoErudite provides discovery and inquiry routing only; it does not confirm stock or final pricing, or arrange contracts, delivery, invoicing, or payment.</div>
    </div></article></section>`;
}

function notFoundPage() {
  return `<section class="container not-found"><span class="eyebrow">GoErudite platform</span><h1>Page not found</h1><p>We couldn't find that page. Explore the platform or browse the academic catalog.</p><a class="button" href="/">Go to home ${arrow}</a> <a class="button button-outline" href="/catalog">Browse catalog</a></section>`;
}

function wireGlobalEvents() {
  const search = document.querySelector("#global-search");
  if (search) search.addEventListener("submit", event => {
    event.preventDefault();
    const query = new FormData(search).get("q");
    location.href = `/catalog${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  });
  const menuButton = document.querySelector("[data-menu]");
  const mainNav = document.querySelector("#main-nav");
  menuButton?.addEventListener("click", () => {
    const isOpen = mainNav?.classList.toggle("nav-open") || false;
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });
  mainNav?.querySelectorAll("a, [data-auth]").forEach(item => item.addEventListener("click", () => {
    mainNav.classList.remove("nav-open");
    menuButton?.setAttribute("aria-expanded", "false");
  }));
  document.querySelectorAll("[data-ad-click]").forEach(link => link.addEventListener("click", async event => {
    event.preventDefault();
    link.setAttribute("aria-busy", "true");
    try {
      await api(`/api/advertisements/${encodeURIComponent(link.dataset.adClick)}/click`, { method: "POST" });
      location.href = link.href;
    } catch (error) {
      link.removeAttribute("aria-busy");
      toast(`Could not open this advertisement: ${error.message}`, "error");
    }
  }));
  document.querySelectorAll("[data-auth]").forEach(button => button.addEventListener("click", () => openAuth(button.dataset.auth, button.dataset.role)));
  document.querySelectorAll("[data-logout]").forEach(button => button.addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
      currentUser = null;
      if (location.pathname === "/dashboard") history.pushState({}, "", "/");
      render();
      toast("You have been logged out.");
    } catch (error) { toast(error.message, "error"); }
  }));
  document.querySelector("#support-form")?.addEventListener("submit", submitSupport);
  document.querySelector("#ad-inquiry-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const result = form.querySelector(".ad-inquiry-result");
    button.disabled = true;
    result.textContent = "";
    try {
      const values = Object.fromEntries(new FormData(form));
      const response = await api("/api/ad-inquiries", {
        method: "POST",
        body: JSON.stringify({ ...values, quantity: Number(values.quantity), advertisementId: form.dataset.advertisementId })
      });
      result.textContent = `Private inquiry ${response.inquiry.id} was delivered to the advertiser.`;
      form.reset();
      form.querySelector('input[name="quantity"]').value = "1";
      toast("Private quote inquiry sent to the advertiser.");
    } catch (error) {
      result.textContent = error.message;
      result.setAttribute("role", "alert");
      toast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });
  document.querySelector("#catalog-search")?.addEventListener("submit", event => {
    event.preventDefault();
    catalogQuery.set("q", new FormData(event.currentTarget).get("q") || "");
    catalogQuery.delete("page");
    loadCatalog(true);
  });
  document.querySelector("#catalog-filters")?.addEventListener("change", event => {
    if (event.target.name && !["maxPrice", "sort"].includes(event.target.name)) {
      if (event.target.checked) catalogQuery.set(event.target.name, event.target.value);
      else catalogQuery.delete(event.target.name);
    }
    if (event.target.name === "maxPrice") catalogQuery.set("maxPrice", event.target.value);
    const sortSelects = [...document.querySelectorAll('select[name="sort"]')];
    const selectedSort = sortSelects.find(select => select.value)?.value;
    if (selectedSort) catalogQuery.set("sort", selectedSort);
    else catalogQuery.delete("sort");
    catalogQuery.delete("page");
    loadCatalog(true);
  });
  document.querySelectorAll('select[name="sort"]').forEach(select => select.addEventListener("change", event => {
    if (event.currentTarget.value) catalogQuery.set("sort", event.currentTarget.value);
    else catalogQuery.delete("sort");
    catalogQuery.delete("page");
    loadCatalog(true);
  }));
  document.querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => {
    if (catalogQuery.get("category") === button.dataset.category) catalogQuery.delete("category");
    else catalogQuery.set("category", button.dataset.category);
    document.querySelectorAll("[data-category]").forEach(chip => chip.classList.toggle("selected", catalogQuery.get("category") === chip.dataset.category));
    catalogQuery.delete("page");
    loadCatalog(true);
  }));
  document.querySelector("[data-clear-filters]")?.addEventListener("click", clearCatalogFilters);
  document.querySelectorAll("[data-quantity]").forEach(button => button.addEventListener("click", () => {
    const input = document.querySelector("#rfq-quantity");
    input.value = Math.max(1, Math.min(10000, Number(input.value || 1) + Number(button.dataset.quantity)));
  }));
  document.querySelectorAll("[data-rfq]").forEach(button => button.addEventListener("click", () => submitRfq(button.dataset.rfq, button)));
  document.querySelector("[data-preview]")?.addEventListener("click", () => toast("Sample preview will be available from the verified publisher.", "info"));
  document.querySelectorAll(".faq-item").forEach(item => item.addEventListener("toggle", () => {}));
}

async function submitSupport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form));
    const result = await api("/api/support", { method: "POST", body: JSON.stringify(data) });
    form.reset();
    toast(`${result.message} Reference: ${result.ticketId}`);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    submit.disabled = false;
  }
}

async function submitRfq(bookId, button) {
  if (!currentUser) return openAuth("login");
  if (currentUser.role !== "school") return toast("Institutional RFQs can only be created by school accounts.", "error");
  const quantity = Number(document.querySelector("#rfq-quantity")?.value || 1);
  button.disabled = true;
  try {
    const result = await api("/api/rfqs", { method: "POST", body: JSON.stringify({ bookId, quantity }) });
    toast(`RFQ ${result.rfq.id} saved as a draft. Complete the academic details in your dashboard before publishing.`);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function loadCatalog(updateUrl = false) {
  const list = document.querySelector("#catalog-list");
  const pagination = document.querySelector("#catalog-pagination");
  if (!list) return;
  list.innerHTML = `<div class="loading-card">Loading catalogue titles…</div>`;
  try {
    const query = new URLSearchParams(catalogQuery);
    const result = await api(`/api/catalog?${query.toString()}`);
    catalogItems = result.items;
    catalogTotal = result.total;
    list.innerHTML = catalogItems.length ? catalogItems.map(book => bookCard(book)).join("") : `<div class="empty-state"><h3>No titles match these filters</h3><p>Try a different search term or clear some filters.</p><button class="button button-outline" data-clear-filters>Clear filters</button></div>`;
    const page = Math.max(1, Number(catalogQuery.get("page")) || 1);
    const pageCount = Math.max(1, Math.ceil(catalogTotal / result.pageSize));
    pagination.innerHTML = `<span>Showing ${catalogItems.length ? (page - 1) * result.pageSize + 1 : 0} to ${Math.min(page * result.pageSize, catalogTotal)} of ${catalogTotal} results</span><div>${page > 1 ? `<button data-page="${page - 1}">‹</button>` : ""}<button class="current-page">${page}</button>${page < pageCount ? `<button data-page="${page + 1}">${page + 1}</button>` : ""}<button data-page="${pageCount}">›</button></div>`;
    pagination.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => {
      catalogQuery.set("page", button.dataset.page);
      loadCatalog(true);
      window.scrollTo({ top: document.querySelector("#catalog-grid").offsetTop - 80, behavior: "smooth" });
    }));
    list.querySelector("[data-clear-filters]")?.addEventListener("click", clearCatalogFilters);
    list.querySelectorAll("[data-rfq]").forEach(button => button.addEventListener("click", () => submitRfq(button.dataset.rfq, button)));
    if (updateUrl) history.replaceState({}, "", `/catalog${catalogQuery.size ? `?${catalogQuery}` : ""}`);
  } catch (error) {
    list.innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
  }
}

function openAuth(mode = "login", role = "") {
  const register = mode === "register";
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button class="modal-close" aria-label="Close" data-close-modal>×</button><a class="brand" href="/"><span class="brand-mark">≡</span><span><b>Go</b>Erudite</span></a><span class="eyebrow">Secure role-based access</span><h2 id="auth-title">${register ? "Create your account" : "Welcome back"}</h2><p>${register ? "Register your organisation to access academic sourcing workflows." : "Log in to continue to your GoErudite account."}</p><form id="auth-form">${register ? `<div class="auth-name-fields"><label>First name<input name="firstName" required maxlength="80" autocomplete="given-name"></label><label>Last name<input name="lastName" required maxlength="80" autocomplete="family-name"></label></div><label>Organisation / business name<input name="organizationName" required minlength="2" maxlength="160" autocomplete="organization"></label>` : ""}<label>Business email<input name="email" type="email" required maxlength="254" autocomplete="email"></label>${register ? `<label>Your role<select name="role" required><option value="">Choose your role</option><option value="school" ${role === "school" ? "selected" : ""}>School</option><option value="distributor" ${role === "distributor" ? "selected" : ""}>Distributor</option><option value="retailer" ${role === "retailer" ? "selected" : ""}>Retailer</option><option value="publisher" ${role === "publisher" ? "selected" : ""}>Publisher</option><option value="other" ${role === "other" ? "selected" : ""}>Other authorized user</option><option value="admin">Platform administrator (restricted)</option></select></label><label data-admin-key-field hidden>Administrator bootstrap key<input name="bootstrapKey" type="password" autocomplete="off" maxlength="200"></label>` : ""}<label>Password<input name="password" type="password" minlength="${register ? 10 : 1}" required autocomplete="${register ? "new-password" : "current-password"}" ${register ? 'placeholder="At least 10 characters"' : ""}></label>${register ? `<label class="consent-check"><input name="consent" type="checkbox" required> I agree to the <a href="/trust" target="_blank" rel="noopener">platform terms</a> and privacy policy.</label>` : ""}<button class="button button-wide" type="submit">${register ? "Create account" : "Log in"} ${arrow}</button><small class="form-legal">${register ? "Organisation verification is required before publishing RFQs or supplier quotes. The first administrator requires a server-configured bootstrap key." : "GoErudite is a technology platform. Commercial decisions remain with users."}</small></form>${register ? "" : `<a class="auth-recovery-link" href="/forgot-password">Forgot your password?</a>`}<div class="auth-switch">${register ? "Already registered?" : "New to GoErudite?"} <button data-auth-switch="${register ? "login" : "register"}">${register ? "Log in" : "Create an account"}</button></div></section></div>`;
  modalRoot.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click", event => {
    if (event.target === button || button.classList.contains("modal-close")) modalRoot.innerHTML = "";
  }));
  modalRoot.querySelector("[data-auth-switch]").addEventListener("click", event => openAuth(event.currentTarget.dataset.authSwitch, role));
  modalRoot.querySelector('select[name="role"]')?.addEventListener("change", event => {
    const keyField = modalRoot.querySelector("[data-admin-key-field]");
    const adminSelected = event.currentTarget.value === "admin";
    keyField.hidden = !adminSelected;
    keyField.querySelector("input").required = adminSelected;
  });
  let authStep = "credentials";
  let credentials = null;
  let completedEnrollment = null;
  const completeAuthentication = result => {
    currentUser = result.user;
    modalRoot.innerHTML = "";
    history.pushState({}, "", "/dashboard");
    render();
    toast(`Welcome${register ? " to GoErudite" : " back"}, ${currentUser.firstName}.`);
  };
  const showMfaChallenge = () => {
    authStep = "mfa";
    modalRoot.querySelector("#auth-title").textContent = "Verify your sign-in";
    modalRoot.querySelector(".auth-modal > p").textContent = "Enter the current code from your authenticator, or use one unused recovery code.";
    const form = modalRoot.querySelector("#auth-form");
    form.innerHTML = `<label>Authenticator code<input name="mfaCode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"></label><label>Recovery code<input name="recoveryCode" maxlength="40" autocomplete="off"></label><button class="button button-wide" type="submit">Verify and continue →</button><small class="form-legal">Enter either an authenticator code or one recovery code. Recovery codes can be used only once.</small>`;
    form.querySelector('[name="mfaCode"]').focus();
  };
  const showMfaEnrollment = enrollment => {
    authStep = "enrollment";
    modalRoot.querySelector("#auth-title").textContent = "Set up required MFA";
    modalRoot.querySelector(".auth-modal > p").textContent = "Add this account to a TOTP authenticator app, then verify a current six-digit code.";
    const form = modalRoot.querySelector("#auth-form");
    form.innerHTML = `<section class="workspace-note" data-mfa-setup><b>Authenticator setup key</b><p>Enter this key in your authenticator app. Keep it private.</p><code data-mfa-secret>${escapeHtml(enrollment.secret)}</code><p><small>Setup URI: <span>${escapeHtml(enrollment.otpauthUrl)}</span></small></p></section><label>Authenticator code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code"></label><button class="button button-wide" type="submit">Verify and enable MFA →</button><small class="form-legal">MFA is not enabled until this code verifies successfully. The enrollment expires in ten minutes.</small>`;
    form.querySelector('[name="code"]').focus();
  };
  const showRecoveryCodes = result => {
    authStep = "recovery";
    completedEnrollment = result;
    const form = modalRoot.querySelector("#auth-form");
    form.innerHTML = `<section class="workspace-note"><b>Save these one-time recovery codes</b><p>They are shown only once. Store them somewhere private and separate from your authenticator.</p><code>${result.recoveryCodes.map(escapeHtml).join(" · ")}</code></section><button class="button button-wide" type="submit" data-mfa-recovery-ack>I saved the recovery codes →</button>`;
  };
  modalRoot.querySelector("#auth-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      if (authStep === "credentials") {
        const body = Object.fromEntries(new FormData(form));
        const result = await api(`/api/auth/${register ? "register" : "login"}`, { method: "POST", body: JSON.stringify(body) });
        if (result.mfaRequired) {
          credentials = { email: body.email, password: body.password };
          showMfaChallenge();
        } else if (result.mfaSetupRequired) {
          const enrollment = await api("/api/auth/mfa/enroll/start", { method: "POST", body: JSON.stringify({}) });
          showMfaEnrollment(enrollment);
        } else {
          completeAuthentication(result);
        }
      } else if (authStep === "mfa") {
        const values = Object.fromEntries(new FormData(form));
        const result = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ ...credentials, mfaCode: values.mfaCode, recoveryCode: values.recoveryCode })
        });
        if (result.mfaRequired) throw new Error("Enter an authenticator code or one unused recovery code.");
        completeAuthentication(result);
      } else if (authStep === "enrollment") {
        const values = Object.fromEntries(new FormData(form));
        const result = await api("/api/auth/mfa/enroll/verify", { method: "POST", body: JSON.stringify(values) });
        showRecoveryCodes(result);
      } else if (authStep === "recovery") {
        completeAuthentication(completedEnrollment);
      }
    } catch (error) {
      toast(error.message, "error");
      const currentSubmit = form.querySelector('button[type="submit"]');
      if (currentSubmit) currentSubmit.disabled = false;
    }
  });
  modalRoot.querySelector('input[name="email"]')?.focus();
}

function render() {
  const path = location.pathname;
  if (path === "/") return layout(homePage());
  if (path === "/solutions") return layout(solutionsPage());
  if (path === "/pricing") {
    layout(`<div class="container loading-card">Loading monthly platform plans…</div>`);
    api("/api/plans")
      .then(result => layout(pricingPage(result.items)))
      .catch(error => layout(`<section class="container error-state" role="alert"><h1>Pricing information unavailable</h1><p>${escapeHtml(error.message)}</p><a href="/pricing">Try again</a></section>`));
    return;
  }
  if (path === "/about") return layout(aboutPage());
  if (path === "/trust") return layout(trustPage());
  if (path === "/help") return layout(faqPage());
  if (path === "/contact") return layout(supportPage());
  if (path === "/forgot-password") {
    layout(passwordResetRequestPage());
    document.querySelector("#password-reset-request-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const status = form.querySelector('[role="status"]');
      button.disabled = true;
      status.textContent = "";
      try {
        const result = await api("/api/auth/password-reset/request", {
          method: "POST",
          body: JSON.stringify({ email: new FormData(form).get("email") })
        });
        status.textContent = result.message;
      } catch (error) {
        status.textContent = error.message;
        status.setAttribute("role", "alert");
      } finally {
        button.disabled = false;
      }
    });
    return;
  }
  const resetMatch = path.match(/^\/reset-password\/([a-f0-9]{64})$/);
  if (resetMatch) {
    layout(passwordResetConfirmPage(resetMatch[1]));
    document.querySelector("#password-reset-confirm-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const status = form.querySelector('[role="status"]');
      const values = Object.fromEntries(new FormData(form));
      if (values.password !== values.confirmPassword) {
        status.textContent = "The passwords do not match.";
        status.setAttribute("role", "alert");
        return;
      }
      button.disabled = true;
      status.textContent = "";
      try {
        const result = await api("/api/auth/password-reset/confirm", {
          method: "POST",
          body: JSON.stringify({ token: resetMatch[1], password: values.password })
        });
        form.remove();
        status.textContent = result.message;
        const login = document.createElement("button");
        login.className = "button";
        login.type = "button";
        login.textContent = "Log in";
        login.addEventListener("click", () => openAuth("login"));
        status.after(login);
      } catch (error) {
        status.textContent = error.message;
        status.setAttribute("role", "alert");
        button.disabled = false;
      }
    });
    return;
  }
  if (path === "/blog") {
    layout(`<div class="container loading-card">Loading published articles…</div>`);
    api("/api/blog")
      .then(result => layout(blogIndexPage(result.items)))
      .catch(error => layout(`<section class="container error-state" role="alert">${escapeHtml(error.message)} <a href="/blog">Try again</a></section>`));
    return;
  }
  if (path === "/advertisements") {
    layout(`<div class="container loading-card">Loading active sponsored listings…</div>`);
    api("/api/advertisements")
      .then(result => layout(advertisementIndexPage(result.items)))
      .catch(error => layout(`<section class="container error-state" role="alert"><h1>Sponsored listings unavailable</h1><p>${escapeHtml(error.message)}</p><a href="/advertisements">Try again</a></section>`));
    return;
  }
  const adMatch = path.match(/^\/advertisements\/([A-Za-z0-9-]+)$/);
  if (adMatch) {
    layout(`<div class="container loading-card">Loading sponsored listing…</div>`);
    api(`/api/advertisements/${encodeURIComponent(adMatch[1])}`)
      .then(result => layout(advertisementDetailPage(result.item), "", {
        title: `${result.item.title} | Sponsored Listing | GoErudite`,
        description: `View this sponsored education listing from ${result.item.advertiserName}. Contact the advertiser through GoErudite to ask about availability and terms.`
      }))
      .catch(_error => layout(advertisementDetailPage(null), "", { title: "Sponsored Listing Unavailable | GoErudite", description: "This sponsored listing is unavailable or no longer active." }));
    return;
  }
  const blogMatch = path.match(/^\/blog\/([a-z0-9-]+)$/);
  if (blogMatch) {
    layout(`<div class="container loading-card">Loading article…</div>`);
    api(`/api/blog/${encodeURIComponent(blogMatch[1])}`)
      .then(result => layout(blogDetailPage(result.item), "", {
        title: `${result.item.title} | GoErudite Blog`,
        description: result.item.content.slice(0, 155)
      }))
      .catch(error => layout(`<section class="container error-state" role="alert"><h1>Article unavailable</h1><p>${escapeHtml(error.message)}</p><a href="/blog">Browse published articles</a></section>`));
    return;
  }
  if (path === "/dashboard") return renderDashboard();
  const inviteMatch = path.match(/^\/invite\/([a-f0-9]{64})$/);
  if (inviteMatch) {
    const token = inviteMatch[1];
    layout(`<section class="auth-page container"><div class="auth-card"><span class="eyebrow">Organisation invitation</span><h1>Join your GoErudite organisation</h1><p>This one-time invitation expires 72 hours after it was created. Use a password you have not used elsewhere.</p><form id="team-invite-accept"><label>First name<input name="firstName" maxlength="80" required autocomplete="given-name"></label><label>Last name<input name="lastName" maxlength="80" required autocomplete="family-name"></label><label>Password<input name="password" type="password" minlength="10" maxlength="200" required autocomplete="new-password"></label><label>Confirm password<input name="confirmPassword" type="password" minlength="10" maxlength="200" required autocomplete="new-password"></label><button class="button" type="submit">Accept invitation</button></form><p class="form-legal">If this link has expired or was revoked, ask the organisation owner to issue a new one.</p></div></section>`);
    document.querySelector("#team-invite-accept")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('button[type="submit"]');
      const values = Object.fromEntries(new FormData(form));
      if (values.password !== values.confirmPassword) {
        toast("The passwords do not match.", "error");
        return;
      }
      submit.disabled = true;
      try {
        const result = await api("/api/team/accept", {
          method: "POST",
          body: JSON.stringify({
            token,
            firstName: values.firstName,
            lastName: values.lastName,
            password: values.password
          })
        });
        currentUser = result.user;
        history.replaceState({}, "", "/dashboard");
        render();
        toast(`Welcome to your organisation, ${currentUser.firstName}.`);
      } catch (error) {
        toast(error.message, "error");
        submit.disabled = false;
      }
    });
    return;
  }
  if (path === "/catalog") {
    catalogQuery = new URLSearchParams(location.search);
    layout(catalogPage(), "catalog-main");
    loadCatalog();
    return;
  }
  if (path.startsWith("/book/")) {
    layout(`<div class="container detail-shell"><div class="loading-card">Loading academic title…</div></div>`);
    api(`/api/catalog/${encodeURIComponent(path.slice("/book/".length))}`)
      .then(result => layout(detailPage(result.item), "", {
        title: `${result.item.title} | Academic Book Catalogue | GoErudite`,
        description: `${result.item.title} by ${result.item.publisher || "the listed publisher"}. Review catalogue details and prepare an institutional RFQ draft on GoErudite.`
      }))
      .catch(_error => layout(detailPage(null), "", { title: "Book Details Unavailable | GoErudite", description: "This catalogue title could not be found. Explore the academic book catalogue on GoErudite." }));
    return;
  }
  layout(notFoundPage());
}

function clearCatalogFilters() {
  const search = catalogQuery.get("q");
  catalogQuery = new URLSearchParams();
  if (search) catalogQuery.set("q", search);
  document.querySelectorAll("#catalog-filters input[type=radio]").forEach(input => { input.checked = false; });
  const maximumPrice = document.querySelector('#catalog-filters input[name="maxPrice"]');
  if (maximumPrice) maximumPrice.value = maximumPrice.max;
  document.querySelectorAll('select[name="sort"]').forEach(select => { select.value = ""; });
  document.querySelectorAll("[data-category]").forEach(button => button.classList.remove("selected"));
  loadCatalog(true);
}

async function init() {
  const [sessionResult, contactResult] = await Promise.allSettled([
    api("/api/auth/me"),
    api("/api/public/contact")
  ]);
  if (sessionResult.status === "fulfilled") currentUser = sessionResult.value.user;
  else toast(`Unable to load your session: ${sessionResult.reason.message}`, "error");
  if (contactResult.status === "fulfilled") publicContact = contactResult.value;
  else toast(`Unable to load contact information: ${contactResult.reason.message}`, "error");
  render();
}

init();
window.addEventListener("popstate", render);
