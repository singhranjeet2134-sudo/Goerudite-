const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { strFromU8, strToU8, unzipSync, zipSync } = require("fflate");
const { XMLParser } = require("fast-xml-parser");
const nodemailer = require("nodemailer");
const { appendAuditRecord, verifyAuditRecords } = require("./audit-integrity");
const {
  authenticatorUrl,
  createTotpSecret,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  verifyRecoveryCode,
  verifyTotp
} = require("./mfa");
const { answerArticle, findArticle, suggestionsForRole } = require("./help-engine");

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(__dirname, "..");
const FRONTEND_DIR = process.env.GOERUDITE_FRONTEND_DIR || path.join(ROOT, "frontend");
const DATA_DIR = process.env.GOERUDITE_DATA_DIR || path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const BACKUP_NAME_PATTERN = /^goerudite-\d{8}T\d{6}Z-[a-f0-9]{8}\.json$/;
const sessions = new Map();
const loginAttempts = new Map();
const passwordResetAttempts = new Map();
const mfaEnrollments = new Map();
const helpChatAttempts = new Map();
let adminRegistrationInProgress = false;
let restoreInProgress = false;
let inFlightApiRequests = 0;
let restoreDrainResolver = null;
const configuredSessionTtl = Number(process.env.GOERUDITE_SESSION_TTL_MS);
const SESSION_TTL_MS = Number.isSafeInteger(configuredSessionTtl) && configuredSessionTtl > 0
  ? configuredSessionTtl
  : 7 * 24 * 60 * 60 * 1000;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_EMAIL_ATTEMPT_LIMIT = 5;
const LOGIN_IP_ATTEMPT_LIMIT = 20;
const MAX_LOGIN_ATTEMPT_BUCKETS = 5000;
const MAX_REQUEST_BYTES = 500_000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const MFA_ENROLLMENT_TTL_MS = 10 * 60 * 1000;
const HELP_CHAT_WINDOW_MS = 60_000;
const HELP_CHAT_REQUEST_LIMIT = 20;
const PUBLIC_ASSETS = new Map([
  ["/index.html", "index.html"],
  ["/app.js", "app.js"],
  ["/dashboard.js", "dashboard.js"],
  ["/support-chat.js", "support-chat.js"],
  ["/styles.css", "styles.css"],
  ["/favicon.svg", "favicon.svg"]
]);
const PUBLIC_PAGE_ROUTES = new Set([
  "/solutions", "/pricing", "/about", "/trust", "/help", "/forgot-password", "/contact", "/catalog", "/dashboard", "/blog", "/advertisements"
]);
const PUBLIC_SITEMAP_PATHS = [
  "/", "/solutions", "/pricing", "/about", "/trust", "/help", "/contact",
  "/catalog", "/advertisements", "/blog"
];
const SEO_PAGE_METADATA = {
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
const PUBLIC_ACCESS_PLANS = [
  {
    id: "school",
    name: "School Access",
    audience: "Schools",
    monthlyPrice: 0,
    currency: "INR",
    features: [
      "School profile, academic session, and student-strength records",
      "Create RFQ drafts and publish eligible book requirements",
      "Review supplier quotations and record evaluation decisions",
      "Two-person purchase-order approval where enabled",
      "Purchase-order, receipt, and dispute workflow records"
    ]
  },
  {
    id: "other",
    name: "Authorised User Access",
    audience: "Other authorised users",
    monthlyPrice: 0,
    currency: "INR",
    features: [
      "Role-scoped organisation profile and activity",
      "Submit catalogue book suggestions for review",
      "Review notifications and permitted advertisement inquiries",
      "Access only the tools assigned to the account"
    ]
  },
  {
    id: "distributor",
    name: "Distributor",
    audience: "Distributors",
    monthlyPrice: 1000,
    currency: "INR",
    freeQuoteSubmissions: 3,
    features: [
      "Browse eligible school RFQs and manage quotation drafts",
      "Submit and revise supplier quotations with stated terms",
      "Maintain inventory and use supported XLSX workflows",
      "Record dispatch information for applicable purchase orders",
      "Manage organisation staff and review business analytics where permitted"
    ]
  },
  {
    id: "retailer",
    name: "Retailer",
    audience: "Retailers and bookshops",
    monthlyPrice: 1000,
    currency: "INR",
    freeQuoteSubmissions: 3,
    features: [
      "Browse eligible RFQs and manage local quotations",
      "Search and update ISBN-based inventory records",
      "Use supported XLSX workflows and stock alerts",
      "Keep unsent quotation drafts in this browser",
      "Record applicable fulfilment updates and view reports"
    ]
  },
  {
    id: "publisher",
    name: "Publisher",
    audience: "Publishers",
    monthlyPrice: 1500,
    currency: "INR",
    features: [
      "Maintain catalogue titles, editions, and ISBN records",
      "Map catalogue entries to academic sessions",
      "Maintain publisher reference price lists",
      "Submit catalogue changes and withdrawal requests for review",
      "View demand summaries where privacy thresholds are met"
    ]
  }
];
function approvedSocialProfileUrl(value, domain) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || ![domain, `www.${domain}`].includes(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function publicContactDetails() {
  const social = [
    ["instagram", approvedSocialProfileUrl(process.env.GOERUDITE_INSTAGRAM_URL, "instagram.com")],
    ["linkedin", approvedSocialProfileUrl(process.env.GOERUDITE_LINKEDIN_URL, "linkedin.com")],
    ["whatsapp", "https://wa.me/918586032007"]
  ].map(([name, url]) => ({ name, url, configured: Boolean(url) }));
  return { phone: "+91 8586032007", phoneHref: "+918586032007", email: "support@goerudite.com", social };
}
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const catalog = [
  { id: "mathematics-world", title: "Mathematics World", publisher: "EduPress", category: "Academic / School", subject: "Mathematics", board: "CBSE", level: "Class 10", medium: "English", session: "2025–2026", price: 450, rating: 4.5, reviews: 124, pages: 108, age: "5–10 years", isbn: "93-XXXX-XXXX-X", description: "This academic title is listed by a verified publishing partner and designed to support curriculum-based learning, structured classroom use, and institution-led academic planning.", highlights: ["Aligned with the latest academic syllabus", "Concept-based and easy to understand", "Includes solved examples and practice sets", "Supports independent and classroom learning"], cover: "operations" },
  { id: "science-explorer", title: "Science Explorer", publisher: "GoErudite Press", category: "Academic / School", subject: "Science", board: "CBSE", level: "Class 9", medium: "English", session: "2025–2026", price: 520, rating: 4.7, reviews: 86, pages: 144, age: "14–16 years", isbn: "93-XXXX-XXXX-2", description: "A clear, engaging introduction to core science concepts, supported by practical examples, chapter summaries, and curriculum-aligned exercises.", highlights: ["Curriculum-aligned science concepts", "Illustrated experiments and examples", "Practice questions in every chapter", "Suitable for classroom and home study"], cover: "science" },
  { id: "english-grammar-core", title: "English Grammar Core", publisher: "GoErudite Press", category: "Academic / School", subject: "English", board: "CBSE", level: "Class 8", medium: "English", session: "2025–2026", price: 390, rating: 4.6, reviews: 92, pages: 176, age: "12–14 years", isbn: "93-XXXX-XXXX-3", description: "Build strong language foundations with structured grammar lessons, practical writing exercises, and clear examples for everyday use.", highlights: ["Step-by-step grammar lessons", "Writing and comprehension practice", "Clear examples for every topic", "Progressive exercises and revision"], cover: "english" },
  { id: "physics-core", title: "Physics Core", publisher: "BrightPath Learning", category: "Academic / School", subject: "Science", board: "CBSE", level: "Class 12", medium: "English", session: "2025–2026", price: 680, rating: 4.8, reviews: 73, pages: 312, age: "16–18 years", isbn: "93-XXXX-XXXX-4", description: "A comprehensive physics reference with worked solutions, concept maps, and application-led questions for senior secondary learners.", highlights: ["Detailed concept explanations", "Worked numerical problems", "Application-led question sets", "Board exam revision support"], cover: "physics" },
  { id: "competitive-exam-guide", title: "Competitive Exam Guide", publisher: "Apex Academic", category: "Competitive Exams", subject: "Aptitude", board: "Other", level: "Senior Secondary (11–12)", medium: "English", session: "2025–2026", price: 750, rating: 4.4, reviews: 58, pages: 384, age: "16+ years", isbn: "93-XXXX-XXXX-5", description: "A structured reference for competitive exam preparation with topic-wise guidance and a broad selection of practice questions.", highlights: ["Topic-wise study plans", "Exam-pattern practice sets", "Detailed answer explanations", "Regular revision checkpoints"], cover: "competitive" },
  { id: "reference-atlas", title: "Young Learner's Reference Atlas", publisher: "Northstar Books", category: "Reference", subject: "Other Subjects", board: "State Board", level: "Middle (6–8)", medium: "English", session: "2025–2026", price: 560, rating: 4.6, reviews: 41, pages: 96, age: "10–14 years", isbn: "93-XXXX-XXXX-6", description: "An accessible visual reference that helps learners explore geography, nature, and the wider world through maps and concise explanations.", highlights: ["Full-colour maps and diagrams", "Age-appropriate reference text", "Curriculum-friendly topics", "Durable classroom reference"], cover: "atlas" },
  { id: "business-foundations", title: "Business Foundations", publisher: "EduPress", category: "Academic / School", subject: "Other Subjects", board: "CBSE", level: "Class 11", medium: "English", session: "2025–2026", price: 490, rating: 4.5, reviews: 35, pages: 220, age: "16–18 years", isbn: "93-XXXX-XXXX-7", description: "Introduce key business and commerce concepts through practical examples, clear definitions, and structured case exercises.", highlights: ["Core business concepts explained", "Relevant real-world examples", "Case study practice", "Chapter summaries and review"], cover: "business" },
  { id: "children-storybook", title: "The Curious Garden", publisher: "Little Lantern", category: "Children", subject: "English", board: "Other", level: "Primary (1–5)", medium: "English", session: "2025–2026", price: 280, rating: 4.9, reviews: 67, pages: 48, age: "6–9 years", isbn: "93-XXXX-XXXX-8", description: "A warm illustrated story that encourages curiosity, kindness, and a love of reading for young learners.", highlights: ["Inviting illustrated story", "Encourages independent reading", "Positive themes and vocabulary", "Great for shared reading"], cover: "children" },
  { id: "exam-practice-mathematics", title: "Mathematics Practice Papers", publisher: "Apex Academic", category: "Competitive Exams", subject: "Mathematics", board: "CBSE", level: "Class 10", medium: "English", session: "2025–2026", price: 320, rating: 4.3, reviews: 29, pages: 128, age: "14–16 years", isbn: "93-XXXX-XXXX-9", description: "Targeted mathematics practice papers designed for structured revision, confidence building, and curriculum-aligned preparation.", highlights: ["Full-length practice papers", "Curriculum-based questions", "Answer key for self-review", "Focused revision support"], cover: "math" }
];

function initialStore() {
  return {
    users: [],
    invitations: [],
    passwordResets: [],
    requests: [],
    rfqs: [],
    quotes: [],
    inventory: [],
    publisherCatalog: [],
    orders: [],
    purchaseRequests: [],
    disputes: [],
    approvalPolicies: [],
    supplierTerritories: [],
    territoryExceptions: [],
    blogs: [],
    advertisements: [],
    adEvents: [],
    adInquiries: [],
    notifications: [],
    audit: []
  };
}

function invalidStoreShape(message) {
  const error = new Error(message);
  error.code = "INVALID_STORE_SHAPE";
  return error;
}

function normalizeStoreData(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
    !Array.isArray(parsed.users) || !Array.isArray(parsed.requests) || !Array.isArray(parsed.rfqs)) {
    throw invalidStoreShape("The persisted data store has an invalid shape.");
  }
  for (const key of Object.keys(initialStore())) {
    if (key === "users" || key === "requests" || key === "rfqs") continue;
    if (parsed[key] == null) parsed[key] = [];
    else if (!Array.isArray(parsed[key])) throw invalidStoreShape(`The persisted data store has an invalid ${key} collection.`);
  }
  parsed.users = parsed.users.map(user => {
    if (!user || typeof user !== "object" || Array.isArray(user)) throw invalidStoreShape("The persisted data store contains an invalid user record.");
    return {
      ...user,
      organizationName: user.organizationName || "",
      verificationStatus: user.verificationStatus || "verified",
      accountStatus: user.accountStatus || "active",
      profile: user.profile || {}
    };
  });
  return parsed;
}

function smtpMailerConfiguration() {
  const host = process.env.GOERUDITE_SMTP_HOST?.trim();
  const port = Number(process.env.GOERUDITE_SMTP_PORT || 587);
  const from = process.env.GOERUDITE_SMTP_FROM?.trim();
  const publicUrl = process.env.GOERUDITE_PUBLIC_URL?.trim();
  const user = process.env.GOERUDITE_SMTP_USER?.trim();
  const pass = process.env.GOERUDITE_SMTP_PASS;
  if (!host && !from && !publicUrl && !user && !pass) return null;
  if (!host || !from || !publicUrl || !Number.isInteger(port) || port < 1 || port > 65535 ||
    Boolean(user) !== Boolean(pass)) {
    throw Object.assign(new Error("Email delivery is partially configured. Set SMTP host, port, sender, public URL, and both SMTP credentials or neither."), { status: 503 });
  }
  let baseUrl;
  try {
    baseUrl = new URL(publicUrl);
  } catch {
    throw Object.assign(new Error("GOERUDITE_PUBLIC_URL must be a valid HTTP or HTTPS origin."), { status: 503 });
  }
  if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
    throw Object.assign(new Error("GOERUDITE_PUBLIC_URL must be a clean HTTP or HTTPS origin without a path or credentials."), { status: 503 });
  }
  return { host, port, from, publicUrl: baseUrl.origin, user, pass };
}

async function sendInvitationEmail(config, email, url, expiresAt) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: process.env.GOERUDITE_SMTP_SECURE === "true" || config.port === 465,
    requireTLS: process.env.GOERUDITE_SMTP_REQUIRE_TLS === "true",
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    ...(config.user ? { auth: { user: config.user, pass: config.pass } } : {})
  });
  try {
    await transport.sendMail({
      from: config.from,
      to: email,
      subject: "Your GoErudite organisation invitation",
      text: `You have been invited to join an organisation on GoErudite. Accept the invitation before ${expiresAt}:\n\n${url}\n\nThis link can be used once. If you did not expect this invitation, you can ignore this email.`,
      disableFileAccess: true,
      disableUrlAccess: true
    });
  } finally {
    transport.close();
  }
  return { status: "sent", message: "Invitation email sent successfully." };
}

async function sendPasswordResetEmail(config, email, url, expiresAt) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: process.env.GOERUDITE_SMTP_SECURE === "true" || config.port === 465,
    requireTLS: process.env.GOERUDITE_SMTP_REQUIRE_TLS === "true",
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    ...(config.user ? { auth: { user: config.user, pass: config.pass } } : {})
  });
  try {
    await transport.sendMail({
      from: config.from,
      to: email,
      subject: "Reset your GoErudite password",
      text: `A password reset was requested for your GoErudite account. This one-time link expires at ${expiresAt}:\n\n${url}\n\nIf you did not request this change, ignore this email. Your password will remain unchanged.`,
      disableFileAccess: true,
      disableUrlAccess: true
    });
  } finally {
    transport.close();
  }
}

async function loadStore() {
  try {
    const contents = await fs.readFile(DATA_FILE, "utf8");
    return normalizeStoreData(JSON.parse(contents));
  } catch (error) {
    if (error.code === "ENOENT") return initialStore();
    throw error;
  }
}

let store = initialStore();
let writeQueue = Promise.resolve();

function persistStore() {
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const temporaryFile = `${DATA_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(store, null, 2), { mode: 0o600 });
    await fs.rename(temporaryFile, DATA_FILE);
  });
  return writeQueue;
}

async function listLocalBackups() {
  const backupDir = path.join(DATA_DIR, "backups");
  let names;
  try {
    names = await fs.readdir(backupDir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const entries = [];
  for (const name of names.filter(value => BACKUP_NAME_PATTERN.test(value))) {
    const filePath = path.join(backupDir, name);
    const info = await fs.lstat(filePath);
    if (!info.isFile()) continue;
    let integrity = "invalid";
    try {
      normalizeStoreData(JSON.parse(await fs.readFile(filePath, "utf8")));
      integrity = "valid";
    } catch (error) {
      if (!(error instanceof SyntaxError) && error.code !== "INVALID_STORE_SHAPE") throw error;
    }
    entries.push({ name, sizeBytes: info.size, createdAt: info.mtime.toISOString(), integrity });
  }
  return entries.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function createLocalBackup() {
  await writeQueue;
  const bytes = Buffer.from(JSON.stringify(store, null, 2));
  normalizeStoreData(JSON.parse(bytes.toString("utf8")));
  const backupDir = path.join(DATA_DIR, "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const name = `goerudite-${timestamp}-${crypto.randomBytes(4).toString("hex")}.json`;
  const handle = await fs.open(path.join(backupDir, name), "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const [backup] = await listLocalBackups().then(items => items.filter(item => item.name === name));
  if (!backup || backup.integrity !== "valid") throw new Error("The new local backup did not pass the integrity check.");
  return backup;
}

async function waitForOtherApiRequests() {
  if (inFlightApiRequests <= 1) return;
  await new Promise(resolve => { restoreDrainResolver = resolve; });
}

async function restoreLocalBackup(user, name) {
  if (!BACKUP_NAME_PATTERN.test(name)) throw Object.assign(new Error("Choose a valid local backup file."), { status: 400 });
  const backupDir = path.join(DATA_DIR, "backups");
  const backupDirectoryInfo = await fs.lstat(backupDir).catch(error => {
    if (error.code === "ENOENT") throw Object.assign(new Error("The selected backup no longer exists."), { status: 404 });
    throw error;
  });
  if (!backupDirectoryInfo.isDirectory()) throw Object.assign(new Error("The configured backup directory is not a regular directory."), { status: 400 });
  const backupPath = path.join(backupDir, name);
  const info = await fs.lstat(backupPath).catch(error => {
    if (error.code === "ENOENT") throw Object.assign(new Error("The selected backup no longer exists."), { status: 404 });
    throw error;
  });
  if (!info.isFile()) throw Object.assign(new Error("The selected backup is not a regular local file."), { status: 400 });
  let replacement;
  try {
    replacement = normalizeStoreData(JSON.parse(await fs.readFile(backupPath, "utf8")));
  } catch (error) {
    if (error instanceof SyntaxError || error.code === "INVALID_STORE_SHAPE") {
      throw Object.assign(new Error("The selected backup failed JSON or data-shape integrity checks."), { status: 400 });
    }
    throw error;
  }
  const safetyBackup = await createLocalBackup();
  const restoredAt = new Date().toISOString();
  const restoreEvent = {
    id: crypto.randomUUID(),
    actorId: user.id,
    actorName: `${user.firstName} ${user.lastName}`.trim(),
    actorRole: user.role,
    entity: "backup",
    entityId: name,
    action: "backup.restored",
    before: { safetyBackup: safetyBackup.name },
    after: { restoredBackup: name, safetyBackup: safetyBackup.name },
    createdAt: restoredAt
  };
  appendAuditRecord(replacement.audit, restoreEvent, configuredAuditIntegrityKey());
  await writeQueue;
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporaryFile = `${DATA_FILE}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.restore.tmp`;
  const handle = await fs.open(temporaryFile, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(replacement, null, 2));
    await handle.sync();
  } catch (error) {
    await handle.close();
    await fs.rm(temporaryFile, { force: true });
    throw error;
  }
  await handle.close();
  try {
    await fs.rename(temporaryFile, DATA_FILE);
  } catch (error) {
    await fs.rm(temporaryFile, { force: true });
    throw error;
  }
  store = replacement;
  return { restoredBackup: name, safetyBackup, restoredAt };
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function cleanText(value, limit = 500) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function blogSlug(value) {
  return typeof value === "string" ? value.trim() : "";
}

function imageCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validPng(bytes) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let ended = false;
  let sawHeader = false;
  let sawImage = false;
  const imageData = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) return false;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const expectedCrc = bytes.readUInt32BE(dataEnd);
    if (imageCrc32(bytes.subarray(offset + 4, dataEnd)) !== expectedCrc) return false;
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) return false;
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      const validDepth = colorType === 0 ? [1, 2, 4, 8, 16] :
        colorType === 2 ? [8, 16] :
          colorType === 3 ? [1, 2, 4, 8] :
            colorType === 4 || colorType === 6 ? [8, 16] : [];
      if (!width || !height || width * height > 10000000 || !validDepth.includes(bitDepth) ||
          bytes[dataStart + 10] !== 0 || bytes[dataStart + 11] !== 0 || bytes[dataStart + 12] > 1) return false;
      interlace = bytes[dataStart + 12];
      sawHeader = true;
    } else if (type === "IDAT" && !ended) {
      sawImage = true;
      imageData.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      if (length !== 0 || !sawImage || dataEnd + 4 !== bytes.length) return false;
      ended = true;
      break;
    }
    offset = dataEnd + 4;
  }
  if (!ended) return false;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const rowLengths = [];
  if (!interlace) {
    const rowLength = Math.ceil(width * channels * bitDepth / 8) + 1;
    for (let row = 0; row < height; row += 1) rowLengths.push(rowLength);
  } else {
    const startX = [0, 4, 0, 2, 0, 1, 0];
    const startY = [0, 0, 4, 0, 2, 0, 1];
    const stepX = [8, 8, 4, 4, 2, 2, 1];
    const stepY = [8, 8, 8, 4, 4, 2, 2];
    for (let pass = 0; pass < 7; pass += 1) {
      const passWidth = width <= startX[pass] ? 0 : Math.ceil((width - startX[pass]) / stepX[pass]);
      const passHeight = height <= startY[pass] ? 0 : Math.ceil((height - startY[pass]) / stepY[pass]);
      const rowLength = Math.ceil(passWidth * channels * bitDepth / 8) + 1;
      for (let row = 0; row < passHeight; row += 1) rowLengths.push(rowLength);
    }
  }
  const expectedLength = rowLengths.reduce((total, rowLength) => total + rowLength, 0);
  try {
    const decoded = zlib.inflateSync(Buffer.concat(imageData), { maxOutputLength: expectedLength + 1 });
    if (decoded.length !== expectedLength) return false;
    let rowOffset = 0;
    for (const rowLength of rowLengths) {
      if (decoded[rowOffset] > 4) return false;
      rowOffset += rowLength;
    }
    return true;
  } catch {
    return false;
  }
}

function blogImageError(value) {
  if (typeof value !== "string" || !value) return "Upload a PNG, JPEG, or WebP cover image.";
  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return "Cover images must be valid PNG, JPEG, or WebP files. SVG and other formats are not allowed.";
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 180 * 1024 || bytes.toString("base64") !== match[2]) {
    return "Cover images must be valid base64 and no larger than 180 KB.";
  }
  const mime = match[1];
  let valid = false;
  if (mime === "png") {
    valid = validPng(bytes);
  } else if (mime === "jpeg" && bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]))) {
    let offset = 2;
    let hasFrame = false;
    let hasScan = false;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) break;
      const marker = bytes[offset++];
      if (marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) break;
        const height = bytes.readUInt16BE(offset + 3);
        const width = bytes.readUInt16BE(offset + 5);
        hasFrame = width > 0 && height > 0 && width * height <= 10000000;
      }
      if (marker === 0xda) {
        hasScan = length >= 6 && offset + length < bytes.length - 2;
        break;
      }
      offset += length;
    }
    valid = hasFrame && hasScan;
  } else if (mime === "webp" && bytes.length >= 30 &&
      bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" &&
      bytes.readUInt32LE(4) === bytes.length - 8) {
    const chunk = bytes.toString("ascii", 12, 16);
    const chunkLength = bytes.readUInt32LE(16);
    if (chunk === "VP8X" && chunkLength === 10 && bytes.length >= 30) {
      const width = 1 + bytes.readUIntLE(20, 3);
      const height = 1 + bytes.readUIntLE(23, 3);
      valid = width * height <= 10000000;
    } else if (chunk === "VP8 " && chunkLength >= 10 && bytes.length >= 30 && 20 + chunkLength + (chunkLength % 2) === bytes.length) {
      const width = bytes.readUInt16LE(26) & 0x3fff;
      const height = bytes.readUInt16LE(28) & 0x3fff;
      valid = bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a &&
        width > 0 && height > 0 && width * height <= 10000000;
    } else if (chunk === "VP8L" && chunkLength >= 5 && bytes.length >= 25 && 20 + chunkLength + (chunkLength % 2) === bytes.length) {
      const width = 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
      const height = 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6));
      valid = bytes[20] === 0x2f && width * height <= 10000000;
    }
  }
  return valid ? "" : "The uploaded cover does not match its declared image type.";
}

function validateBlogInput(body, existing = null) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const rawSlug = typeof body.slug === "string" ? body.slug.trim() : "";
  const generatedSlug = title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const slug = blogSlug(rawSlug || generatedSlug);
  const author = typeof body.author === "string" ? body.author.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const coverImage = body.coverImage === undefined ? existing?.coverImage || "" : body.coverImage;
  const publicationDate = body.publicationDate === undefined ? existing?.publicationDate || "" :
    typeof body.publicationDate === "string" ? body.publicationDate.trim() : null;
  if (title.length < 3) return { error: "Blog title must contain at least 3 characters." };
  if (title.length > 160) return { error: "Blog title must not exceed 160 characters." };
  if (rawSlug.length > 180 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { error: "Slug must use lowercase letters and numbers separated by single hyphens." };
  }
  if (author.length < 2) return { error: "Author name must contain at least 2 characters." };
  if (author.length > 100) return { error: "Author name must not exceed 100 characters." };
  if (content.length < 30 || content.length > 100000) return { error: "Blog text must contain 30 to 100,000 characters." };
  if (publicationDate === null || !publicationDate || publicationDate.length > 10 || !/^\d{4}-\d{2}-\d{2}$/.test(publicationDate) || !Number.isFinite(Date.parse(`${publicationDate}T00:00:00Z`)) || new Date(`${publicationDate}T00:00:00Z`).toISOString().slice(0, 10) !== publicationDate) {
    return { error: "A valid publication date is required." };
  }
  const imageError = blogImageError(coverImage);
  if (imageError) return { error: imageError };
  return { value: { title, slug, author, content, coverImage, publicationDate } };
}

async function publishScheduledBlogs() {
  if (restoreInProgress) return;
  const now = Date.now();
  const due = store.blogs.filter(item =>
    item.status === "scheduled" && Number.isFinite(Date.parse(item.scheduledAt)) && Date.parse(item.scheduledAt) <= now
  );
  if (!due.length) return;
  const previous = due.map(item => ({ item, values: { ...item } }));
  for (const item of due) {
    item.status = "published";
    item.publishedAt = item.scheduledAt;
    item.updatedAt = new Date().toISOString();
  }
  try {
    await persistStore();
  } catch (error) {
    for (const snapshot of previous) Object.assign(snapshot.item, snapshot.values);
    throw error;
  }
}

function publicBlogPost(item) {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    author: item.author,
    content: item.content,
    coverImage: item.coverImage,
    publicationDate: item.publicationDate,
    createdAt: item.createdAt,
    publishedAt: item.publishedAt
  };
}

function validateAdvertisementInput(body, existing = null) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const productTitle = typeof body.productTitle === "string" ? body.productTitle.trim() : "";
  const advertiserId = body.advertiserId === undefined ? existing?.advertiserId : cleanText(body.advertiserId, 80);
  const advertiser = store.users.find(item =>
    item.id === advertiserId &&
    ["distributor", "retailer", "publisher", "other"].includes(item.role) &&
    item.accountStatus === "active" &&
    item.verificationStatus === "verified"
  );
  const startDate = typeof body.startDate === "string" ? body.startDate.trim() : "";
  const endDate = typeof body.endDate === "string" ? body.endDate.trim() : "";
  const coverImage = body.coverImage === undefined ? existing?.coverImage || "" : body.coverImage;
  const campaignFee = body.campaignFee === undefined ? existing?.campaignFee : Number(body.campaignFee);
  if (title.length < 3 || title.length > 140) return { error: "Advertisement title must contain 3 to 140 characters." };
  if (description.length < 20 || description.length > 2000) return { error: "Advertisement description must contain 20 to 2,000 characters." };
  if (productTitle.length > 180) return { error: "Book or product title must not exceed 180 characters." };
  if (!advertiser) return { error: "Choose an active, verified distributor, retailer, publisher, or authorised user as advertiser." };
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!validDate(startDate) || !validDate(endDate) || endDate < startDate) {
    return { error: "Enter valid campaign start and end dates; the end date cannot be before the start date." };
  }
  if (!Number.isFinite(campaignFee) || campaignFee < 0 || campaignFee > 10000000) {
    return { error: "Campaign fee must be between ₹0 and ₹10,000,000." };
  }
  if (coverImage) {
    const imageError = blogImageError(coverImage);
    if (imageError) return { error: imageError.replaceAll("cover", "advertisement image") };
  }
  const referencePrice = body.referencePrice === undefined ? existing?.referencePrice ?? null :
    body.referencePrice === "" || body.referencePrice === null ? null : Number(body.referencePrice);
  if (referencePrice !== null && (!Number.isFinite(referencePrice) || referencePrice < 0 || referencePrice > 10000000)) {
    return { error: "Advertiser reference price must be a non-negative amount up to ₹10,000,000." };
  }
  return {
    value: {
      title,
      description,
      productTitle,
      advertiserId: advertiser.id,
      advertiserName: advertiser.organizationName || `${advertiser.firstName} ${advertiser.lastName}`,
      subject: cleanText(body.subject, 100),
      className: cleanText(body.className, 60),
      board: cleanText(body.board, 80),
      medium: cleanText(body.medium, 80),
      academicSession: cleanText(body.academicSession, 30),
      isbn: cleanText(body.isbn, 30),
      referencePrice,
      campaignFee,
      startDate,
      endDate,
      coverImage
    }
  };
}

function advertisementActive(item, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const advertiser = store.users.find(user => user.id === item.advertiserId);
  return item.status === "active" &&
    advertiser?.accountStatus === "active" &&
    advertiser.verificationStatus === "verified" &&
    item.startDate <= today &&
    item.endDate >= today;
}

function publicAdvertisement(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    productTitle: item.productTitle,
    advertiserName: item.advertiserName,
    subject: item.subject,
    className: item.className,
    board: item.board,
    medium: item.medium,
    academicSession: item.academicSession,
    isbn: item.isbn,
    referencePrice: item.referencePrice,
    startDate: item.startDate,
    endDate: item.endDate,
    coverImage: item.coverImage
  };
}

function advertisementAuditSnapshot(item) {
  return item ? {
    id: item.id,
    title: item.title,
    advertiserId: item.advertiserId,
    status: item.status,
    startDate: item.startDate,
    endDate: item.endDate,
    campaignFee: item.campaignFee,
    billingStatus: item.billingStatus
  } : null;
}

function blogAuditSnapshot(item) {
  return item ? {
    id: item.id,
    title: item.title,
    slug: item.slug,
    status: item.status,
    author: item.author,
    publicationDate: item.publicationDate,
    hasCoverImage: Boolean(item.coverImage),
    contentLength: item.content?.length || 0,
    scheduledAt: item.scheduledAt || null,
    publishedAt: item.publishedAt || null
  } : null;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function getSession(request) {
  const match = sessionTokenFromRequest(request);
  if (!match) return null;
  const session = sessions.get(match);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(match);
    return null;
  }
  const user = store.users.find(entry => entry.id === session.userId) || null;
  if (!user || isAccountSuspended(user)) {
    sessions.delete(match);
    return null;
  }
  if (session.mfaEnrollmentPending) return null;
  if (session.mfaVerified !== true || (mfaRequiredForUser(user) && !user.mfaEnabled)) {
    sessions.delete(match);
    return null;
  }
  return user;
}

function sessionTokenFromRequest(request) {
  const cookie = request.headers.cookie || "";
  return cookie.match(/(?:^|;\s*)goerudite_session=([a-f0-9]{64})(?:;|$)/)?.[1] || null;
}

function mfaCookie(token, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `goerudite_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

function getPendingMfaUser(request) {
  const token = sessionTokenFromRequest(request);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session?.mfaEnrollmentPending || session.expiresAt <= Date.now()) {
    if (session?.expiresAt <= Date.now()) sessions.delete(token);
    return null;
  }
  const user = store.users.find(entry => entry.id === session.userId) || null;
  return user && !isAccountSuspended(user) ? user : null;
}

function isAccountSuspended(user) {
  return user.accountStatus === "suspended" || organizationOwner(user).accountStatus === "suspended";
}

function revokeUserSessions(userIds) {
  const revoked = new Set(userIds);
  for (const [token, session] of sessions) {
    if (revoked.has(session.userId)) {
      sessions.delete(token);
      mfaEnrollments.delete(token);
    }
  }
}

function loginAttemptKeys(request, email) {
  const address = request.socket.remoteAddress || "unknown";
  const ipKey = crypto.createHash("sha256").update(`ip:${address}`).digest("hex");
  const emailKey = crypto.createHash("sha256").update(`email:${address}:${email}`).digest("hex");
  return [ipKey, emailKey];
}

function loginAttemptState(key, now = Date.now()) {
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.windowStartedAt >= LOGIN_ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(key);
    return null;
  }
  return entry;
}

function loginRateLimited(request, email) {
  const now = Date.now();
  const keys = loginAttemptKeys(request, email);
  if (keys.some(key => (loginAttemptState(key, now)?.attempts || 0) >=
      (key === keys[0] ? LOGIN_IP_ATTEMPT_LIMIT : LOGIN_EMAIL_ATTEMPT_LIMIT))) return true;
  return false;
}

function recordLoginFailure(request, email) {
  const now = Date.now();
  for (const key of loginAttemptKeys(request, email)) {
    let entry = loginAttemptState(key, now);
    if (!entry) {
      if (loginAttempts.size >= MAX_LOGIN_ATTEMPT_BUCKETS) {
        const oldest = loginAttempts.keys().next().value;
        if (oldest) loginAttempts.delete(oldest);
      }
      entry = { attempts: 0, windowStartedAt: now };
      loginAttempts.set(key, entry);
    }
    entry.attempts += 1;
  }
}

function clearLoginAttempts(request, email) {
  for (const key of loginAttemptKeys(request, email)) loginAttempts.delete(key);
}

function passwordResetAttemptKeys(request, email) {
  const address = request.socket.remoteAddress || "unknown";
  return [
    crypto.createHash("sha256").update(`reset-ip:${address}`).digest("hex"),
    crypto.createHash("sha256").update(`reset-email-ip:${address}:${email}`).digest("hex"),
    crypto.createHash("sha256").update(`reset-email:${email}`).digest("hex")
  ];
}

function passwordResetRateLimited(request, email, recordFailure = false) {
  const now = Date.now();
  const keys = passwordResetAttemptKeys(request, email);
  const limited = keys.some((key, index) => {
    const entry = passwordResetAttempts.get(key);
    if (!entry || now - entry.windowStartedAt >= LOGIN_ATTEMPT_WINDOW_MS) {
      passwordResetAttempts.delete(key);
      return false;
    }
    return entry.attempts >= (index === 0 ? LOGIN_IP_ATTEMPT_LIMIT : LOGIN_EMAIL_ATTEMPT_LIMIT);
  });
  if (recordFailure && !limited) {
    for (const key of keys) {
      let entry = passwordResetAttempts.get(key);
      if (!entry || now - entry.windowStartedAt >= LOGIN_ATTEMPT_WINDOW_MS) {
        if (passwordResetAttempts.size >= MAX_LOGIN_ATTEMPT_BUCKETS) {
          const oldest = passwordResetAttempts.keys().next().value;
          if (oldest) passwordResetAttempts.delete(oldest);
        }
        entry = { attempts: 0, windowStartedAt: now };
        passwordResetAttempts.set(key, entry);
      }
      entry.attempts += 1;
    }
  }
  return limited;
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS, mfaVerified: true });
  return mfaCookie(token, Math.floor(SESSION_TTL_MS / 1000));
}

function createMfaEnrollmentSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    userId: user.id,
    expiresAt: Date.now() + MFA_ENROLLMENT_TTL_MS,
    mfaVerified: false,
    mfaEnrollmentPending: true
  });
  return mfaCookie(token, Math.floor(MFA_ENROLLMENT_TTL_MS / 1000));
}

const ROLE_PERMISSIONS = {
  owner: ["team.manage", "profile.manage", "rfq.view", "rfq.manage", "rfq.publish", "quote.view", "quote.submit", "quote.evaluate", "po.view", "po.request", "po.approve", "po.fulfil", "dispute.respond", "inventory.view", "inventory.manage", "catalogue.view", "catalogue.manage", "notifications.manage", "reports.view"],
  manager: ["profile.manage", "rfq.view", "rfq.manage", "rfq.publish", "quote.view", "quote.submit", "quote.evaluate", "po.view", "po.request", "po.approve", "po.fulfil", "dispute.respond", "inventory.view", "inventory.manage", "catalogue.view", "catalogue.manage", "notifications.manage", "reports.view"],
  buyer: ["profile.view", "rfq.view", "rfq.manage", "rfq.publish", "quote.view", "quote.submit", "quote.evaluate", "po.view", "po.request", "po.fulfil", "dispute.respond", "inventory.view", "catalogue.view", "reports.view", "notifications.manage"],
  reviewer: ["profile.view", "rfq.view", "quote.view", "quote.evaluate", "po.view", "inventory.view", "catalogue.view", "reports.view", "notifications.manage"],
  read_only: ["profile.view", "rfq.view", "quote.view", "po.view", "inventory.view", "catalogue.view", "reports.view", "notifications.manage"]
};

function organizationId(user) {
  return user.organizationId || user.id;
}

function organizationOwner(user) {
  const id = organizationId(user);
  return store.users.find(item => item.id === id) || user;
}

function organizationProfile(user) {
  return organizationOwner(user).profile || user.profile || {};
}

function organizationName(user) {
  return organizationOwner(user).organizationName || user.organizationName || "";
}

function accountVerified(user) {
  return organizationOwner(user).verificationStatus === "verified";
}

function normalizeLocationPart(value) {
  return cleanText(value, 100).normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function supplierTerritoryEligibility(user, rfq, now = Date.now()) {
  if (!["distributor", "retailer"].includes(user.role) || !accountVerified(user) || isAccountSuspended(user)) {
    return { eligible: false, reason: "Supplier verification and active account status are required." };
  }
  const supplierOrganizationId = organizationId(user);
  const exception = store.territoryExceptions.find(item =>
    item.supplierOrganizationId === supplierOrganizationId &&
    item.rfqId === rfq.id &&
    !item.revokedAt &&
    Date.parse(item.expiresAt) > now
  );
  if (exception) return { eligible: true, reason: "An active administrator-approved RFQ exception applies.", exceptionId: exception.id };

  const location = {
    state: normalizeLocationPart(rfq.deliveryState),
    district: normalizeLocationPart(rfq.deliveryDistrict),
    city: normalizeLocationPart(rfq.deliveryCity),
    postalCode: cleanText(rfq.deliveryPostalCode, 12).replace(/\s|-/g, "")
  };
  if (!location.state || !(location.district || location.city || location.postalCode)) {
    return { eligible: false, reason: "The RFQ is missing a verifiable delivery state and city, district, or PIN code." };
  }
  const matched = store.supplierTerritories.find(area => {
    if (area.supplierOrganizationId !== supplierOrganizationId || area.active === false) return false;
    for (const field of ["state", "district", "city"]) {
      const configured = normalizeLocationPart(area[field]);
      if (configured && configured !== location[field]) return false;
    }
    const configuredPin = cleanText(area.postalCode, 12).replace(/\s|-/g, "");
    return !configuredPin || configuredPin === location.postalCode;
  });
  return matched
    ? { eligible: true, reason: "The supplier has an explicitly configured matching service area.", territoryId: matched.id }
    : { eligible: false, reason: "No active supplier service area matches this RFQ delivery location." };
}

function organizationUsers(user) {
  const id = organizationId(user);
  return store.users.filter(item => organizationId(item) === id);
}

function canManageOrganisationStaff(user) {
  return ["school", "distributor", "retailer", "publisher"].includes(user.role);
}

function permissionProfile(user) {
  return user.staffProfile || "owner";
}

function hasPermission(user, permission) {
  return (ROLE_PERMISSIONS[permissionProfile(user)] || []).includes(permission);
}

function mfaRequiredForUser(user) {
  if (user.role === "admin") return true;
  if (canManageOrganisationStaff(user) && hasPermission(user, "team.manage")) return true;
  return ["permissions.manage", "security.manage", "audit.manage", "backup.manage"]
    .some(permission => hasPermission(user, permission));
}

function requirePermission(user, permission, response) {
  if (hasPermission(user, permission)) return true;
  apiError(response, 403, `Your organisation permission profile cannot perform ${permission.replace(".", " ")}.`);
  return false;
}

function publicUser(user) {
  const owner = organizationOwner(user);
  const profile = permissionProfile(user);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    organizationName: organizationName(user),
    verificationStatus: owner.verificationStatus || user.verificationStatus,
    accountStatus: isAccountSuspended(user) ? "suspended" : owner.accountStatus || user.accountStatus,
    profile: organizationProfile(user),
    organizationId: organizationId(user),
    staffProfile: profile,
    permissions: ROLE_PERMISSIONS[profile] || [],
    mfaEnabled: user.mfaEnabled === true,
    mfaRequired: mfaRequiredForUser(user)
  };
}

function ensureMfaEncryptionConfigured() {
  const key = process.env.GOERUDITE_MFA_ENCRYPTION_KEY;
  if (!/^[a-f0-9]{64}$/i.test(key || "")) {
    throw Object.assign(new Error("MFA enrollment is unavailable. Configure GOERUDITE_MFA_ENCRYPTION_KEY through the approved secret manager."), { status: 503 });
  }
}

function verifyMfaFactor(user, code, recoveryCode) {
  if (recoveryCode) {
    const hashes = Array.isArray(user.mfaRecoveryCodeHashes) ? user.mfaRecoveryCodeHashes : [];
    const index = verifyRecoveryCode(recoveryCode, hashes);
    if (index < 0) return null;
    user.mfaRecoveryCodeHashes = hashes.filter((_hash, currentIndex) => currentIndex !== index);
    return { method: "recovery_code" };
  }
  if (!user.mfaSecretEncrypted) return null;
  const secret = decryptSecret(user.mfaSecretEncrypted);
  const counter = verifyTotp(secret, code, Date.now(), user.mfaLastCounter ?? -1);
  if (counter === null) return null;
  user.mfaLastCounter = counter;
  return { method: "totp", counter };
}

function expireMfaEnrollments() {
  const now = Date.now();
  for (const [token, enrollment] of mfaEnrollments) {
    if (enrollment.expiresAt <= now) mfaEnrollments.delete(token);
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

async function passwordMatches(password, storedHash) {
  const [salt, expectedHex] = storedHash.split(":");
  const actual = await hashPassword(password, salt);
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(actual.split(":")[1], "hex");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function configuredAuditIntegrityKey() {
  const value = process.env.GOERUDITE_AUDIT_HMAC_KEY;
  if (!value) return null;
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw Object.assign(new Error("GOERUDITE_AUDIT_HMAC_KEY must be a 32-byte hexadecimal key."), { status: 503 });
  }
  return Buffer.from(value, "hex");
}

function audit(user, entity, entityId, action, before = null, after = null) {
  const event = {
    id: crypto.randomUUID(),
    actorId: user.id,
    actorName: `${user.firstName} ${user.lastName}`.trim(),
    actorRole: user.role,
    entity,
    entityId,
    action,
    before,
    after,
    createdAt: new Date().toISOString()
  };
  appendAuditRecord(store.audit, event, configuredAuditIntegrityKey());
  return store.audit[0];
}

async function expireStaleProcurementRecords() {
  const now = new Date();
  let changed = false;
  for (const rfq of store.rfqs.filter(item => ["published", "responses_received"].includes(item.status) && item.responseDeadline)) {
    const deadline = new Date(`${rfq.responseDeadline}T23:59:59.999Z`);
    if (!Number.isFinite(deadline.getTime()) || deadline >= now) continue;
    const before = { status: rfq.status, responseDeadline: rfq.responseDeadline };
    rfq.status = "expired";
    rfq.updatedAt = now.toISOString();
    const event = {
      id: crypto.randomUUID(),
      actorId: null,
      actorName: "GoErudite system",
      actorRole: "system",
      entity: "rfq",
      entityId: rfq.id,
      action: "rfq.expired",
      before,
      after: { status: rfq.status, responseDeadline: rfq.responseDeadline },
      createdAt: rfq.updatedAt
    };
    appendAuditRecord(store.audit, event, configuredAuditIntegrityKey());
    for (const quote of store.quotes.filter(item => item.rfqId === rfq.id && item.status === "submitted")) {
      notify(quote.supplierId, "rfq_expired", "RFQ response window expired", `${rfq.id} no longer accepts quotation submissions.`, rfq.id);
    }
    changed = true;
  }
  for (const quote of store.quotes.filter(item => item.status === "submitted" && item.validThrough)) {
    const expiry = new Date(`${quote.validThrough}T23:59:59.999Z`);
    if (!Number.isFinite(expiry.getTime()) || expiry >= now) continue;
    const before = { status: quote.status, validThrough: quote.validThrough };
    quote.status = "expired";
    quote.updatedAt = now.toISOString();
    appendAuditRecord(store.audit, {
      id: crypto.randomUUID(),
      actorId: null,
      actorName: "GoErudite system",
      actorRole: "system",
      entity: "quotation",
      entityId: quote.id,
      action: "quotation.expired",
      before,
      after: { status: quote.status, validThrough: quote.validThrough },
      createdAt: quote.updatedAt
    }, configuredAuditIntegrityKey());
    const rfq = store.rfqs.find(item => item.id === quote.rfqId);
    if (rfq) notify(rfq.ownerId || rfq.userId, "quote_expired", "Supplier quotation expired", `${quote.id} is no longer valid for an evaluation or purchase order.`, quote.id);
    notify(quote.supplierId, "quote_expired", "Your quotation expired", `${quote.id} is no longer valid. Submit a revision if the RFQ is still open.`, quote.id);
    changed = true;
  }
  if (changed) {
    await persistStore();
  }
}

function notify(userId, type, title, message, entityId = "") {
  const notification = {
    id: crypto.randomUUID(),
    userId,
    type,
    title,
    message,
    entityId,
    readAt: null,
    createdAt: new Date().toISOString()
  };
  store.notifications.unshift(notification);
  return notification;
}

function apiError(response, status, message) {
  return sendJson(response, status, { error: message });
}

function profileCompletion(user) {
  const profile = organizationProfile(user);
  const required = [
    ["Organisation name", organizationName(user)],
    ["Contact email", user.email],
    ["Address", profile.address],
    ["City", profile.city],
    ["State / region", profile.state],
    ["Postal code", profile.postalCode]
  ];
  if (user.role === "school") {
    required.push(["Academic session", profile.academicSession], ["Education board", profile.board], ["Medium", profile.medium]);
  } else if (["distributor", "retailer"].includes(user.role)) {
    required.push(["Service area", profile.serviceArea]);
  } else if (user.role === "publisher") {
    required.push(["Website", profile.website]);
  }
  const missing = required.filter(([, value]) => !cleanText(value, 300)).map(([label]) => label);
  const completed = required.length - missing.length;
  return {
    percentage: required.length ? Math.round(completed / required.length * 100) : 100,
    completed,
    total: required.length,
    missing
  };
}

function rfqCompleteness(rfq) {
  const missing = [];
  for (const [key, label] of [["session", "academic session"], ["board", "board"], ["state", "state"], ["medium", "medium"], ["deliveryCity", "delivery location"], ["responseDeadline", "response deadline"]]) {
    if (!cleanText(rfq[key], 120)) missing.push(label);
  }
  if (!Array.isArray(rfq.lines) || !rfq.lines.length) missing.push("at least one book line");
  else if (rfq.lines.some(line => !cleanText(line.title, 180) || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1)) {
    missing.push("valid book titles and quantities");
  }
  return { complete: missing.length === 0, missing };
}

function academicCompatibility(rfq) {
  const conflicts = [];
  const unverified = [];
  const normalizeSession = value => {
    const normalized = cleanText(value, 100).toLocaleLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, "");
    const match = normalized.match(/^(\d{4})-(\d{2}|\d{4})$/);
    if (!match) return normalized;
    const start = Number(match[1]);
    let end = Number(match[2]);
    if (match[2].length === 2) {
      end = Math.floor(start / 100) * 100 + end;
      if (end < start) end += 100;
    }
    return `${start}-${end}`;
  };
  for (const line of rfq.lines || []) {
    const book = (line.bookId && matchBook({ bookId: line.bookId })) ||
      (line.catalogSnapshot?.id && matchBook({ bookId: line.catalogSnapshot.id })) || line.catalogSnapshot;
    if (!book) {
      unverified.push(line.title);
      continue;
    }
    for (const [field, requested, mapped] of [
      ["academic session", rfq.session, book.session],
      ["board", rfq.board, book.board],
      ["state", rfq.state, book.state],
      ["medium", rfq.medium, book.medium]
    ]) {
      if (!cleanText(mapped, 100) || !cleanText(requested, 100)) continue;
      const normalize = value => cleanText(value, 100).toLocaleLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
      if (field === "board" && normalize(mapped) === "other") continue;
      const matches = field === "academic session"
        ? normalizeSession(requested) === normalizeSession(mapped)
        : normalize(requested) === normalize(mapped);
      if (!matches) {
        conflicts.push({ title: line.title, field, requested, catalogueValue: mapped });
      }
    }
  }
  return {
    compatible: conflicts.length === 0,
    status: conflicts.length ? "incompatible" : unverified.length ? "manual_review" : "compatible",
    conflicts,
    unverified
  };
}

function safeRfq(rfq, includeVersionHistory = false) {
  const school = store.users.find(user => user.id === (rfq.ownerId || rfq.userId));
  return {
    id: rfq.id,
    ownerId: rfq.ownerId || rfq.userId,
    organizationName: school?.organizationName || "",
    title: rfq.title || rfq.bookTitle || "Academic book requirement",
    session: rfq.session || "2025–2026",
    board: rfq.board || "",
    state: rfq.state || "",
    deliveryState: rfq.deliveryState || "",
    deliveryDistrict: rfq.deliveryDistrict || "",
    medium: rfq.medium || "",
    deliveryCity: rfq.deliveryCity || "",
    deliveryPostalCode: rfq.deliveryPostalCode || "",
    responseDeadline: rfq.responseDeadline || "",
    completeness: rfqCompleteness({
      ...rfq,
      lines: Array.isArray(rfq.lines) ? rfq.lines : [{ title: rfq.bookTitle, quantity: rfq.quantity }]
    }),
    academicCompatibility: academicCompatibility(rfq),
    budget: rfq.budget ?? null,
    lines: Array.isArray(rfq.lines) ? rfq.lines : [{
      id: rfq.bookId || "",
      bookId: rfq.bookId || "",
      title: rfq.bookTitle || "",
      isbn: "",
      edition: "",
      className: "",
      subject: "",
      quantity: rfq.quantity || 0
    }],
    status: rfq.status === "submitted" ? "published" : rfq.status,
    version: rfq.version || 1,
    ...(includeVersionHistory ? { versions: rfq.versions || [] } : {}),
    createdAt: rfq.createdAt,
    updatedAt: rfq.updatedAt || rfq.createdAt
  };
}

function appendCsvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted && character === '"' && source[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === ",") {
      row.push(field.trim());
      field = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && source[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }
  if (quoted) throw Object.assign(new Error("The CSV contains an unclosed quoted field."), { status: 400 });
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function csvRecords(source) {
  const [headingRow, ...rows] = parseCsv(source);
  if (!headingRow || rows.length > 5000) throw Object.assign(new Error("CSV must include a header and no more than 5,000 rows."), { status: 400 });
  const headings = headingRow.map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return rows.map(values => Object.fromEntries(headings.map((heading, index) => [heading, values[index] || ""])));
}

const workbookXmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, trimValues: false });

function readZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > 240000) {
    throw Object.assign(new Error("XLSX files must be smaller than 240 KB."), { status: 400 });
  }
  const lowerBound = Math.max(0, buffer.length - 65557);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= lowerBound; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { endOffset = offset; break; }
  }
  if (endOffset < 0) throw Object.assign(new Error("The XLSX workbook archive is invalid."), { status: 400 });
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (entryCount < 1 || entryCount > 64 || centralSize > buffer.length || centralOffset + centralSize > endOffset) {
    throw Object.assign(new Error("The XLSX workbook has invalid or excessive archive entries."), { status: 400 });
  }
  let totalUncompressed = 0;
  let position = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (position + 46 > buffer.length || buffer.readUInt32LE(position) !== 0x02014b50) {
      throw Object.assign(new Error("The XLSX workbook contains an invalid archive directory."), { status: 400 });
    }
    const uncompressedSize = buffer.readUInt32LE(position + 24);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLength = buffer.readUInt16LE(position + 32);
    totalUncompressed += uncompressedSize;
    if (uncompressedSize > 2_000_000 || totalUncompressed > 4_000_000 || position + 46 + nameLength + extraLength + commentLength > buffer.length) {
      throw Object.assign(new Error("The XLSX workbook expands beyond the permitted size."), { status: 400 });
    }
    position += 46 + nameLength + extraLength + commentLength;
  }
  try {
    const entries = unzipSync(new Uint8Array(buffer));
    return Object.fromEntries(Object.entries(entries).map(([name, bytes]) => [name, strFromU8(bytes)]));
  } catch (error) {
    throw Object.assign(new Error("The XLSX workbook archive could not be read."), { status: 400, cause: error });
  }
}

function valueText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(valueText).join("");
  if (typeof value === "object") {
    if (Object.hasOwn(value, "#text")) return valueText(value["#text"]);
    return Object.entries(value).filter(([key]) => !key.startsWith("@_")).map(([, item]) => valueText(item)).join("");
  }
  return "";
}

function xlsxRecords(buffer) {
  const entries = readZipEntries(buffer);
  const workbook = workbookXmlParser.parse(entries["xl/workbook.xml"] || "").workbook;
  const relationships = workbookXmlParser.parse(entries["xl/_rels/workbook.xml.rels"] || "").Relationships?.Relationship;
  const relationshipById = new Map([].concat(relationships || []).map(relation => [relation["@_Id"], relation["@_Target"]]));
  const sheets = [].concat(workbook?.sheets?.sheet || []).map(sheet => {
    const relationId = sheet["@_r:id"] || sheet["@_id"];
    const target = relationshipById.get(relationId);
    const normalizedTarget = target?.replace(/^\/+/, "") || "";
    const worksheetName = normalizedTarget
      ? path.posix.normalize(normalizedTarget.startsWith("xl/") ? normalizedTarget : path.posix.join("xl", normalizedTarget))
      : "";
    return { name: cleanText(sheet["@_name"], 31), worksheetName };
  });
  if (!sheets.length || sheets.some(sheet => !sheet.name || !/^xl\/worksheets\/sheet\d+\.xml$/.test(sheet.worksheetName) || !entries[sheet.worksheetName])) {
    throw Object.assign(new Error("The XLSX workbook has a missing or invalid worksheet reference."), { status: 400 });
  }
  if (new Set(sheets.map(sheet => sheet.name)).size !== sheets.length) {
    throw Object.assign(new Error("XLSX worksheet names must be unique."), { status: 400 });
  }
  const sharedStrings = entries["xl/sharedStrings.xml"]
    ? [].concat(workbookXmlParser.parse(entries["xl/sharedStrings.xml"])?.sst?.si || []).map(item => valueText(item.t ?? item.r ?? item))
    : [];
  let commonHeadings = null;
  let totalDataRows = 0;
  const records = [];
  for (const sheet of sheets) {
    const rows = [].concat(workbookXmlParser.parse(entries[sheet.worksheetName])?.worksheet?.sheetData?.row || []);
    if (rows.length > 5001) throw Object.assign(new Error(`Worksheet "${sheet.name}" exceeds 5,000 data rows.`), { status: 400 });
    const values = rows.map((row, rowIndex) => {
      const rowNumber = Number(row["@_r"]) || rowIndex + 1;
      const cells = [].concat(row.c || []);
      const result = [];
      for (const cell of cells) {
        if (cell.f != null) {
          throw Object.assign(new Error(`XLSX formulas are not accepted at ${sheet.name}!${rowNumber}; paste reviewed values before importing.`), { status: 400 });
        }
        const ref = String(cell["@_r"] || "");
        const letters = ref.match(/^[A-Z]+/i)?.[0] || "";
        const column = letters.toUpperCase().split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
        if (column < 0 || column > 255) continue;
        let value = cell.v == null ? "" : valueText(cell.v);
        if (cell["@_t"] === "s") value = sharedStrings[Number(value)] || "";
        else if (cell["@_t"] === "inlineStr") value = valueText(cell.is?.t ?? cell.is?.r?.t ?? cell.is);
        result[column] = value;
      }
      return { values: result.map(value => value || ""), rowNumber };
    }).filter(row => row.values.some(value => String(value).trim()));
    const [headingRow, ...dataRows] = values;
    if (!headingRow) throw Object.assign(new Error(`Worksheet "${sheet.name}" must include a header row.`), { status: 400 });
    const headings = headingRow.values.map(value => String(value).toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (headings.some(heading => !heading) || new Set(headings).size !== headings.length) {
      throw Object.assign(new Error(`Worksheet "${sheet.name}" headers must be non-empty and unique after normalization.`), { status: 400 });
    }
    if (commonHeadings && (commonHeadings.length !== headings.length || commonHeadings.some((heading, index) => heading !== headings[index]))) {
      throw Object.assign(new Error(`Worksheet "${sheet.name}" headers do not match the first worksheet after normalization.`), { status: 400 });
    }
    commonHeadings ||= headings;
    totalDataRows += dataRows.length;
    if (totalDataRows > 5000) throw Object.assign(new Error("XLSX imports may contain no more than 5,000 data rows across all worksheets."), { status: 400 });
    records.push(...dataRows.map(row => ({
      ...Object.fromEntries(headings.map((heading, index) => [heading, row.values[index] || ""])),
      __sheet: sheet.name,
      __row: row.rowNumber
    })));
  }
  if (!records.length) throw Object.assign(new Error("XLSX must include a header and at least one data row."), { status: 400 });
  return records;
}

function xlsxWorkbookBuffer(rows, headings) {
  const xmlEscape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
  const columnName = number => {
    let name = "";
    for (let value = number + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
    return name;
  };
  const allRows = [headings, ...rows.map(row => headings.map(heading => row[heading] ?? ""))];
  const sheetRows = allRows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
    const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
    return typeof value === "number" && Number.isFinite(value)
      ? `<c r="${reference}"><v>${value}</v></c>`
      : `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const files = {
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="GoErudite" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`)
  };
  return Buffer.from(zipSync(files, { level: 6 }));
}

function sendWorkbook(response, rows, headings, filename) {
  const workbook = xlsxWorkbookBuffer(rows, headings);
  response.writeHead(200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": workbook.length,
    "Cache-Control": "no-store"
  });
  return response.end(workbook);
}

function importRecords(body, filename) {
  if (typeof body.csv === "string") {
    if (Buffer.byteLength(body.csv) > 240000) throw Object.assign(new Error("CSV files must be smaller than 240 KB."), { status: 400 });
    return csvRecords(body.csv);
  }
  if (typeof body.xlsx !== "string" || !/\.xlsx$/i.test(filename || "")) {
    throw Object.assign(new Error("Upload a .csv or .xlsx workbook smaller than 240 KB."), { status: 400 });
  }
  const encoded = body.xlsx.replace(/^data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,/i, "");
  if (encoded.length > 320000 || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw Object.assign(new Error("The XLSX file has invalid base64 encoding or exceeds 240 KB."), { status: 400 });
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) throw Object.assign(new Error("The XLSX file encoding is invalid."), { status: 400 });
  return xlsxRecords(bytes);
}

function importRecordLocation(record, index) {
  return record.__sheet ? `${record.__sheet}!${record.__row}` : index + 2;
}

function profileForWrite(body) {
  const classCounts = {};
  for (const [key, value] of Object.entries(body)) {
    if (!key.startsWith("classCount:") || value === "") continue;
    const className = cleanText(key.slice("classCount:".length), 40);
    const count = Number(value);
    if (!className || !Number.isInteger(count) || count < 0 || count > 100000) {
      throw Object.assign(new Error("Class-wise student counts must be whole numbers between 0 and 100,000."), { status: 400 });
    }
    classCounts[className] = count;
  }
  const profile = {
    address: cleanText(body.address, 300),
    city: cleanText(body.city, 100),
    district: cleanText(body.district, 100),
    state: cleanText(body.state, 100),
    postalCode: cleanText(body.postalCode, 12),
    board: cleanText(body.board, 80),
    medium: cleanText(body.medium, 80),
    schoolType: cleanText(body.schoolType, 80),
    udiseCode: cleanText(body.udiseCode, 20),
    academicSession: cleanText(body.academicSession, 30),
    classCountsSession: cleanText(body.academicSession, 30),
    students: body.students === "" || body.students == null ? 0 : Number(body.students),
    classCounts,
    serviceArea: cleanText(body.serviceArea, 200),
    website: cleanText(body.website, 200)
  };
  if (profile.postalCode && !/^[0-9A-Za-z -]{3,12}$/.test(profile.postalCode)) {
    throw Object.assign(new Error("Enter a valid service postal code."), { status: 400 });
  }
  if (!Number.isInteger(profile.students) || profile.students < 0 || profile.students > 1000000) {
    throw Object.assign(new Error("Student strength must be a whole number between 0 and 1,000,000."), { status: 400 });
  }
  return profile;
}

function matchBook(input) {
  const bookId = cleanText(input.bookId, 100);
  const isbn = cleanText(input.isbn, 30).replace(/[- ]/g, "").toUpperCase();
  if (bookId) return catalog.find(book => book.id === bookId) || store.publisherCatalog.find(book => book.id === bookId && book.status === "published");
  if (isbn) {
    const matches = [...catalog, ...store.publisherCatalog.filter(book => book.status === "published")].filter(book =>
      cleanText(book.isbn, 30).replace(/[- ]/g, "").toUpperCase() === isbn
    );
    if (matches.length === 1) return matches[0];
  }
  return null;
}

function publicOpportunity(rfq) {
  const { ownerId, organizationName, ...safe } = safeRfq(rfq);
  return {
    ...safe,
    schoolName: "Verified school",
    schoolLocation: safe.deliveryCity || "Location shared after school approval",
    organizationType: "School"
  };
}

function opportunityMatch(rfq, user) {
  const profile = organizationProfile(user);
  const inventory = store.inventory.filter(item => item.ownerId === organizationId(user));
  const matchedLines = rfq.lines.filter(line => inventory.some(item =>
    line.isbn && item.isbn && line.isbn.replace(/[\s-]/g, "").toUpperCase() === item.isbn.replace(/[\s-]/g, "").toUpperCase() ||
    line.title.toLocaleLowerCase() === item.title.toLocaleLowerCase()
  ));
  const reasons = [];
  let score = 0;
  if (matchedLines.length) {
    score += 50 * matchedLines.length / Math.max(rfq.lines.length, 1);
    reasons.push(`${matchedLines.length} of ${rfq.lines.length} requested title(s) match your inventory`);
  } else {
    reasons.push("No exact ISBN/title match in your current inventory");
  }
  const location = [profile.city, profile.state, profile.postalCode]
    .filter(Boolean).map(value => value.toLocaleLowerCase());
  const destination = [rfq.deliveryCity, rfq.deliveryDistrict, rfq.deliveryState, rfq.deliveryPostalCode]
    .filter(Boolean).map(value => value.toLocaleLowerCase());
  if (location.some(value => destination.includes(value))) {
    score += 25;
    reasons.push("Delivery city or state matches your profile");
  } else if (profile.serviceArea && destination.some(value => profile.serviceArea.toLocaleLowerCase().includes(value))) {
    score += 15;
    reasons.push("Destination appears in your configured service area");
  } else {
    reasons.push("Service-area fit is not confirmed");
  }
  if (profile.academicSession && rfq.session === profile.academicSession) {
    score += 15;
    reasons.push("Academic session matches your profile");
  } else {
    reasons.push("Academic-session fit is not confirmed");
  }
  const staleInventory = inventory.some(item => !item.updatedAt || Date.now() - new Date(item.updatedAt).getTime() > 30 * 86400000);
  if (staleInventory) reasons.push("Some inventory is more than 30 days old; confirm availability before quoting");
  return {
    ...publicOpportunity(rfq),
    matchScore: Math.round(score),
    matchBasis: reasons,
    matchType: "transparent_rules",
    inventoryFreshness: staleInventory ? "stale" : "current"
  };
}

function splitPlan(rfq) {
  const quotes = store.quotes.filter(quote =>
    quote.rfqId === rfq.id &&
    quote.status === "submitted" &&
    (!quote.validThrough || new Date(`${quote.validThrough}T23:59:59`) >= new Date())
  );
  const allocations = [];
  const gaps = [];
  for (const line of rfq.lines) {
    let remaining = line.quantity;
    const candidates = quotes.map(quote => {
      const offered = quote.lines?.find(item => item.rfqLineId === line.id);
      return offered && offered.offeredQuantity > 0 ? { quote, offered } : null;
    }).filter(Boolean).sort((left, right) =>
      left.offered.unitPrice - right.offered.unitPrice ||
      right.offered.offeredQuantity - left.offered.offeredQuantity
    );
    for (const { quote, offered } of candidates) {
      if (remaining === 0) break;
      const quantity = Math.min(remaining, offered.offeredQuantity);
      allocations.push({
        rfqLineId: line.id,
        title: line.title,
        quoteId: quote.id,
        supplierId: quote.supplierId,
        quantity,
        unitPrice: offered.unitPrice,
        estimatedLineTotal: quantity * offered.unitPrice
      });
      remaining -= quantity;
    }
    if (remaining) gaps.push({ rfqLineId: line.id, title: line.title, quantity: remaining });
  }
  return {
    allocations,
    gaps,
    estimatedLineTotal: allocations.reduce((total, item) => total + item.estimatedLineTotal, 0),
    excludesQuoteLevelCharges: true,
    note: "Indicative line-price plan only. Freight, tax, packing, MOQ and supplier selection are not optimized; review and authorize each purchase order yourself."
  };
}

function dashboardAlerts(user) {
  const alerts = [];
  const soon = Date.now() + 7 * 86400000;
  const rfqs = user.role === "school"
    ? store.rfqs.filter(item => (item.ownerId || item.userId) === organizationId(user))
    : ["distributor", "retailer"].includes(user.role)
      ? store.rfqs.filter(item => ["published", "responses_received"].includes(item.status))
      : [];
  for (const rfq of rfqs) {
    if (!rfq.responseDeadline) continue;
    const deadline = new Date(`${rfq.responseDeadline}T23:59:59`);
    if (deadline.getTime() < Date.now()) alerts.push({ type: "expired_deadline", entityId: rfq.id, message: `${rfq.id} response deadline has passed.` });
    else if (deadline.getTime() <= soon) alerts.push({ type: "upcoming_deadline", entityId: rfq.id, message: `${rfq.id} response deadline is within 7 days.` });
  }
  for (const quote of store.quotes.filter(item => item.supplierId === organizationId(user) && item.status === "submitted" && item.validThrough)) {
    const expiry = new Date(`${quote.validThrough}T23:59:59`);
    if (expiry.getTime() <= soon) alerts.push({ type: "quote_expiry", entityId: quote.id, message: `Quotation ${quote.id} expires within 7 days or has expired.` });
  }
  if (["distributor", "retailer"].includes(user.role)) {
    const staleCount = store.inventory.filter(item => item.ownerId === organizationId(user) &&
      (!item.updatedAt || Date.now() - new Date(item.updatedAt).getTime() > 30 * 86400000)).length;
    if (staleCount) alerts.push({ type: "stale_inventory", entityId: "", message: `${staleCount} inventory record(s) have not been refreshed in 30 days.` });
  }
  if (!accountVerified(user)) alerts.push({ type: "verification", entityId: organizationId(user), message: "Organisation verification is awaiting administrator review." });
  return alerts;
}

function publicPublisherTitle(item) {
  return {
    id: item.publicCatalogId,
    source: "publisher",
    title: item.title,
    publisher: item.publisher,
    category: "Academic / School",
    subject: item.subject,
    author: item.author,
    board: item.board,
    level: item.level,
    medium: item.medium,
    session: item.session,
    isbn: item.isbn,
    edition: item.edition,
    price: item.publisherMrp,
    rating: 0,
    reviews: 0,
    pages: item.pages || 0,
    age: item.age || "Academic",
    publicationDate: item.publicationDate || "",
    format: item.format || "Textbook",
    description: item.description || item.subtitle || `${item.title} by ${item.publisher}.`,
    highlights: item.highlights || ["Administrator-reviewed academic catalogue title"],
    cover: "blue"
  };
}

function catalogueMetadata(body, defaults = {}, user) {
  const value = (key, limit) => cleanText(body[key] ?? defaults[key] ?? "", limit);
  const rawMrp = body.publisherMrp ?? defaults.publisherMrp;
  const rawPages = body.pages ?? defaults.pages;
  const highlights = body.highlights ?? defaults.highlights ?? [];
  return {
    title: value("title", 180),
    subtitle: value("subtitle", 180),
    author: value("author", 180),
    publisher: value("publisher", 180) || defaults.publisher || organizationName(user) || `${user.firstName} ${user.lastName}`,
    subject: value("subject", 100),
    level: value("level", 80),
    board: value("board", 80),
    state: value("state", 100),
    medium: value("medium", 80),
    edition: value("edition", 80),
    isbn: value("isbn", 30).replace(/[\s-]/g, "").toUpperCase(),
    session: value("session", 30),
    publicationDate: value("publicationDate", 10),
    format: value("format", 60),
    pages: rawPages == null || rawPages === "" ? "" : Number(rawPages),
    age: value("age", 80),
    description: value("description", 5000),
    highlights: Array.isArray(highlights)
      ? highlights.map(item => cleanText(item, 300)).filter(Boolean).slice(0, 10)
      : String(highlights).split(/\r?\n/).map(item => cleanText(item, 300)).filter(Boolean).slice(0, 10),
    publisherMrp: rawMrp == null || rawMrp === "" ? NaN : Number(rawMrp),
    publisherMrpEffectiveDate: cleanText(body.priceEffectiveDate ?? defaults.publisherMrpEffectiveDate ?? "", 10)
  };
}

function catalogueMetadataError(item, requireComplete) {
  if (item.title.length < 2) return "Enter a book title.";
  if (!/^(?:\d{9}[\dX]|\d{13})$/i.test(item.isbn)) return "Enter a valid ISBN-10 or ISBN-13.";
  if (!Number.isFinite(item.publisherMrp) || item.publisherMrp < 0 || item.publisherMrp > 10000000) return "Enter a valid publisher list price (MRP).";
  if (!requireComplete) return "";
  const required = [
    ["publisher", "publisher / imprint"],
    ["subject", "subject"],
    ["level", "class / grade"],
    ["board", "applicable board"],
    ["medium", "academic medium"],
    ["edition", "edition"],
    ["session", "academic session"],
    ["publicationDate", "publication date"],
    ["format", "book format"],
    ["age", "recommended age group"],
    ["description", "academic overview"],
    ["publisherMrpEffectiveDate", "MRP effective date"]
  ];
  const missing = required.filter(([key]) => !item[key]).map(([, label]) => label);
  if (missing.length) return `Complete ${missing.join(", ")} before submitting this title for review.`;
  if (!Number.isInteger(item.pages) || item.pages < 1 || item.pages > 50000) return "Enter a page count from 1 to 50,000.";
  if (item.description.length < 20) return "Enter an academic overview of at least 20 characters.";
  if (!item.highlights.length) return "Add at least one book highlight, one per line.";
  for (const key of ["publicationDate", "publisherMrpEffectiveDate"]) {
    const dateValue = item[key];
    const parsedDate = new Date(`${dateValue}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateValue) {
      return `Enter a valid ${key === "publicationDate" ? "publication date" : "MRP effective date"}.`;
    }
  }
  return "";
}

function quoteSnapshot(quote) {
  const { revisionHistory, ...snapshot } = quote;
  return snapshot;
}

function requireRole(user, roles, response) {
  if (!roles.includes(user.role)) {
    apiError(response, 403, "Your account role is not permitted to perform this action.");
    return false;
  }
  return true;
}

function dashboardData(user) {
  const orgId = organizationId(user);
  const profile = organizationProfile(user);
  const members = new Set(organizationUsers(user).map(item => item.id));
  const notifications = store.notifications
    .filter(item => item.userId === user.id || item.userId === orgId)
    .slice(0, 30)
    .map(item => {
      const { readBy, ...notification } = item;
      return {
        ...notification,
        readAt: readBy?.[user.id] || (item.userId === user.id ? item.readAt : null)
      };
    });
  const orders = store.orders.filter(item => item.ownerId === orgId || item.supplierId === orgId);
  const base = {
    user: publicUser(user),
    notifications,
    alerts: dashboardAlerts(user),
    orders,
    adInquiries: store.adInquiries
      .filter(item => item.advertiserId === orgId)
      .map(({ requesterId, ...item }) => item),
    profileCompletion: profileCompletion(user),
    catalogueSubmissions: store.publisherCatalog.filter(item => item.ownerId === orgId),
    disputes: store.disputes.filter(item =>
      user.role === "admin" || item.ownerId === orgId || item.supplierId === orgId
    )
  };
  const ownedRfqs = store.rfqs.filter(item => (item.ownerId || item.userId) === orgId).map(item => safeRfq(item, true));
  if (user.role === "school") {
    const rfqIds = new Set(ownedRfqs.map(item => item.id));
    const quotes = store.quotes.filter(item => rfqIds.has(item.rfqId) && item.status !== "draft");
    const quoteIds = new Set(quotes.map(item => item.id));
    const auditEvents = store.audit.filter(item =>
      members.has(item.actorId) ||
      (item.entity === "rfq" && rfqIds.has(item.entityId)) ||
      (item.entity === "quotation" && quoteIds.has(item.entityId))
    ).slice(0, 30);
    return {
      ...base,
      summary: {
        totalRfqs: ownedRfqs.length,
        drafts: ownedRfqs.filter(item => item.status === "draft").length,
        openRfqs: ownedRfqs.filter(item => ["published", "responses_received", "under_review"].includes(item.status)).length,
        quotations: quotes.filter(item => item.status === "submitted").length,
        pendingDecisions: quotes.filter(item => item.status === "submitted").length,
        studentStrength: profile.students || 0
      },
      demandForecast: Object.entries(profile.classCounts || {}).map(([className, students]) => ({
        className,
        session: profile.classCountsSession || profile.academicSession || "",
        students,
        indicativeCopies: students,
        basis: "one copy per enrolled student; no historical consumption data"
      })),
      rfqs: ownedRfqs,
      purchaseRequests: store.purchaseRequests.filter(item => item.organizationId === orgId),
      quotations: quotes.map(item => {
        const supplier = store.users.find(candidate => candidate.id === item.supplierId);
        return { ...item, supplier: supplier ? supplier.organizationName || `${supplier.firstName} ${supplier.lastName}` : "Verified partner" };
      }),
      profile,
      audit: auditEvents
    };
  }

  if (user.role === "distributor" || user.role === "retailer") {
    const opportunities = accountVerified(user)
      ? store.rfqs.filter(item =>
        ["published", "responses_received"].includes(item.status) &&
        supplierTerritoryEligibility(user, item).eligible
      ).map(item => opportunityMatch(item, user))
      : [];
    const supplierQuotes = store.quotes.filter(item => item.supplierId === orgId);
    const inventory = store.inventory.filter(item => item.ownerId === orgId);
    const openIds = new Set(opportunities.map(item => item.id));
    const completedOrders = orders.filter(item => item.status === "delivered");
    const reliability = completedOrders.length >= 3 ? {
      available: true,
      completedOrders: completedOrders.length,
      onTimeDeliveryRate: Math.round(completedOrders.filter(item =>
        !item.expectedDeliveryDate || !item.deliveredAt || item.deliveredAt <= `${item.expectedDeliveryDate}T23:59:59.999Z`
      ).length / completedOrders.length * 100),
      basis: "Completed purchase-order delivery records only."
    } : {
      available: false,
      completedOrders: completedOrders.length,
      reason: `At least 3 completed delivery records are needed; ${completedOrders.length} available.`
    };
    return {
      ...base,
      reliability,
      summary: {
        opportunities: opportunities.length,
        submittedQuotes: supplierQuotes.filter(item => item.status === "submitted").length,
        drafts: supplierQuotes.filter(item => item.status === "draft").length,
        activeStockLines: inventory.length,
        lowStock: inventory.filter(item => item.availableQuantity <= (item.lowStockThreshold ?? 5)).length,
        responseRate: opportunities.length ? Math.round(
          new Set(supplierQuotes
            .filter(item => ["submitted", "needs_revision", "no_bid", "selected_for_evaluation", "not_selected"].includes(item.status))
            .map(item => item.rfqId)
            .filter(rfqId => openIds.has(rfqId))
          ).size / opportunities.length * 100
        ) : 0
      },
      opportunities,
      quotes: supplierQuotes.map(item => {
        const rfq = store.rfqs.find(candidate => candidate.id === item.rfqId);
        return { ...item, rfq: rfq && supplierTerritoryEligibility(user, rfq).eligible ? publicOpportunity(rfq) : null };
      }),
      inventory,
      audit: store.audit.filter(item => members.has(item.actorId)).slice(0, 30),
      openRfqCount: openIds.size
    };
  }

  if (user.role === "publisher") {
    const submissions = store.publisherCatalog.filter(item => item.ownerId === orgId);
    const demandGroups = new Map();
    for (const rfq of store.rfqs.filter(item => ["published", "responses_received", "under_review", "closed"].includes(item.status))) {
      for (const line of rfq.lines || []) {
        const key = [rfq.session || "", line.className || "", line.subject || ""].join("|");
        const group = demandGroups.get(key) || {
          session: rfq.session || "",
          className: line.className || "Unspecified class",
          subject: line.subject || "Unspecified subject",
          schoolIds: new Set(),
          requestedCopies: 0
        };
        group.schoolIds.add(rfq.ownerId || rfq.userId);
        group.requestedCopies += line.quantity;
        demandGroups.set(key, group);
      }
    }
    const demandAnalytics = [...demandGroups.values()]
      .filter(group => group.schoolIds.size >= 3)
      .map(({ schoolIds, ...group }) => ({ ...group, contributingSchools: schoolIds.size }));
    return {
      ...base,
      summary: {
        titles: submissions.length,
        published: submissions.filter(item => item.status === "published").length,
        pendingReview: submissions.filter(item => item.status === "pending_review").length,
        needsCorrection: submissions.filter(item => item.status === "needs_correction").length
      },
      catalogue: submissions,
      demandAnalytics,
      audit: store.audit.filter(item => members.has(item.actorId)).slice(0, 30)
    };
  }

  if (user.role === "admin") {
    const submittedQuotes = store.quotes.filter(item => item.status === "submitted");
    const overdueRfqs = store.rfqs.filter(item =>
      ["published", "responses_received", "under_review"].includes(item.status) &&
      item.responseDeadline &&
      new Date(`${item.responseDeadline}T23:59:59`) < new Date()
    ).map(item => ({ type: "overdue_rfq", id: item.id, status: item.status }));
    const quoteRevisions = store.quotes.filter(item => item.status === "needs_revision")
      .map(item => ({ type: "quote_revision_required", id: item.id, rfqId: item.rfqId, supplierId: item.supplierId }));
      const fulfilmentExceptions = store.orders.filter(item => item.status === "exception")
      .map(item => ({ type: "fulfilment_exception", id: item.id, rfqId: item.rfqId }));
    return {
      ...base,
      summary: {
        users: store.users.length,
        pendingVerification: store.users.filter(item => item.verificationStatus === "pending").length,
        activeRfqs: store.rfqs.filter(item => ["published", "responses_received", "under_review"].includes(item.status)).length,
        pendingQuotes: submittedQuotes.length,
        catalogueReview: store.publisherCatalog.filter(item => item.status === "pending_review").length,
        openSupport: store.requests.filter(item => !["resolved", "closed"].includes(item.status)).length,
        activeAdvertisements: store.advertisements.filter(item => advertisementActive(item)).length,
        adInquiries: store.adInquiries.length
      },
      users: store.users.map(({ passwordHash, ...item }) => ({
        ...publicUser(item),
        createdAt: item.createdAt
      })),
      rfqs: store.rfqs.map(safeRfq),
      publisherCatalog: store.publisherCatalog,
      orders: store.orders,
      exceptions: [...overdueRfqs, ...quoteRevisions, ...fulfilmentExceptions],
      disputes: store.disputes,
      requests: store.requests,
      audit: store.audit.slice(0, 100)
    };
  }
  return { ...base, summary: {}, profile };
}

async function handleWorkspaceApi(request, response, url) {
  const user = getSession(request);
  const { method } = request;
  const { pathname } = url;
  const jsonBody = () => readBody(request);
  await expireStaleProcurementRecords();

  const publicApi = pathname === "/api/health" || pathname === "/api/plans" || pathname === "/api/public/contact" || pathname.startsWith("/api/catalog") ||
    pathname === "/api/auth/me" || pathname === "/api/auth/login" ||
    pathname === "/api/auth/register" || pathname === "/api/auth/logout" ||
    pathname.startsWith("/api/auth/mfa/") ||
    pathname === "/api/auth/password-reset/request" || pathname === "/api/auth/password-reset/confirm" ||
    pathname === "/api/support" || pathname === "/api/team/accept";
  if (user && isAccountSuspended(user) && !publicApi) {
    return apiError(response, 403, "This account is suspended. Contact GoErudite support for assistance.");
  }

  if (pathname === "/api/auth/mfa/enroll/start" && method === "POST") {
    const pendingUser = getPendingMfaUser(request);
    const activeUser = pendingUser ? null : user;
    const target = pendingUser || activeUser;
    if (!target) return apiError(response, 401, "Authenticate before starting MFA enrollment.");
    if (target.mfaEnabled) return apiError(response, 409, "MFA is already enabled for this account.");
    const token = sessionTokenFromRequest(request);
    if (!token) return apiError(response, 401, "Your enrollment session has expired. Sign in again.");
    if (activeUser) {
      const body = await jsonBody();
      const password = typeof body.password === "string" ? body.password : "";
      if (loginRateLimited(request, target.email)) return apiError(response, 429, "Too many MFA enrollment attempts. Try again after 15 minutes.");
      if (!(await passwordMatches(password, target.passwordHash))) {
        recordLoginFailure(request, target.email);
        return apiError(response, 401, "Current password is incorrect.");
      }
    }
    ensureMfaEncryptionConfigured();
    expireMfaEnrollments();
    let enrollment = mfaEnrollments.get(token);
    if (!enrollment) {
      if (mfaEnrollments.size >= 1000) return apiError(response, 503, "MFA enrollment is temporarily unavailable. Try again shortly.");
      enrollment = { secret: createTotpSecret(), expiresAt: Date.now() + MFA_ENROLLMENT_TTL_MS, attempts: 0 };
      mfaEnrollments.set(token, enrollment);
    }
    return sendJson(response, 200, {
      secret: enrollment.secret,
      otpauthUrl: authenticatorUrl(target.email, "GoErudite", enrollment.secret),
      expiresAt: new Date(enrollment.expiresAt).toISOString()
    });
  }

  if (pathname === "/api/auth/mfa/enroll/verify" && method === "POST") {
    const pendingUser = getPendingMfaUser(request);
    const target = pendingUser || user;
    const token = sessionTokenFromRequest(request);
    const enrollment = token ? mfaEnrollments.get(token) : null;
    if (!target || !enrollment || enrollment.expiresAt <= Date.now()) {
      if (token) mfaEnrollments.delete(token);
      return apiError(response, 401, "Your MFA enrollment has expired. Start again.");
    }
    if (target.mfaEnabled) return apiError(response, 409, "MFA is already enabled for this account.");
    if (loginRateLimited(request, target.email) || enrollment.attempts >= 5) {
      return apiError(response, 429, "Too many MFA verification attempts. Sign in again and retry later.");
    }
    const body = await jsonBody();
    const counter = verifyTotp(enrollment.secret, cleanText(body.code, 10), Date.now(), -1);
    if (counter === null) {
      enrollment.attempts += 1;
      recordLoginFailure(request, target.email);
      if (enrollment.attempts >= 5) mfaEnrollments.delete(token);
      return apiError(response, loginRateLimited(request, target.email) ? 429 : 401, "The authenticator code is invalid or expired.");
    }
    const { codes, hashes } = generateRecoveryCodes();
    target.mfaEnabled = true;
    target.mfaSecretEncrypted = encryptSecret(enrollment.secret);
    target.mfaRecoveryCodeHashes = hashes;
    target.mfaLastCounter = counter;
    target.mfaEnabledAt = new Date().toISOString();
    mfaEnrollments.delete(token);
    clearLoginAttempts(request, target.email);
    audit(target, "account_security", target.id, "auth.mfa_enabled", null, {
      factor: "totp",
      recoveryCodesIssued: hashes.length,
      required: mfaRequiredForUser(target)
    });
    await persistStore();
    revokeUserSessions([target.id]);
    return sendJson(response, 200, {
      user: publicUser(target),
      recoveryCodes: codes,
      message: "MFA is enabled. Save these recovery codes now; each can be used once."
    }, { "Set-Cookie": createSession(target) });
  }

  if (pathname === "/api/auth/mfa/disable" && method === "POST") {
    if (!user) return apiError(response, 401, "Please sign in to manage MFA.");
    if (!user.mfaEnabled) return apiError(response, 409, "MFA is not enabled for this account.");
    if (mfaRequiredForUser(user)) return apiError(response, 403, "MFA is mandatory for this account and cannot be disabled.");
    const body = await jsonBody();
    const password = typeof body.password === "string" ? body.password : "";
    if (loginRateLimited(request, user.email)) return apiError(response, 429, "Too many MFA management attempts. Try again after 15 minutes.");
    if (!(await passwordMatches(password, user.passwordHash))) {
      recordLoginFailure(request, user.email);
      return apiError(response, 401, "Current password is incorrect.");
    }
    let factor;
    try {
      factor = verifyMfaFactor(user, cleanText(body.code, 20), cleanText(body.recoveryCode, 40));
    } catch (error) {
      if (error.code === "MFA_KEY_UNAVAILABLE") return apiError(response, 503, error.message);
      throw error;
    }
    if (!factor) {
      recordLoginFailure(request, user.email);
      return apiError(response, loginRateLimited(request, user.email) ? 429 : 401, "The authenticator or recovery code is invalid.");
    }
    delete user.mfaEnabled;
    delete user.mfaSecretEncrypted;
    delete user.mfaRecoveryCodeHashes;
    delete user.mfaLastCounter;
    delete user.mfaEnabledAt;
    clearLoginAttempts(request, user.email);
    audit(user, "account_security", user.id, "auth.mfa_disabled", { enabled: true }, { enabled: false, method: factor.method });
    await persistStore();
    revokeUserSessions([user.id]);
    return sendJson(response, 200, { user: publicUser(user) }, { "Set-Cookie": createSession(user) });
  }

  if (pathname === "/api/admin/audit/verify" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to verify the audit trail.");
    if (!requireRole(user, ["admin"], response)) return;
    return sendJson(response, 200, { verification: verifyAuditRecords(store.audit, configuredAuditIntegrityKey()) });
  }

  if (pathname === "/api/admin/supplier-territories" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to manage supplier territories.");
    if (!requireRole(user, ["admin"], response)) return;
    const suppliers = store.users.filter(item =>
      ["distributor", "retailer"].includes(item.role) && organizationId(item) === item.id
    ).map(item => ({
      id: item.id,
      organizationName: item.organizationName,
      role: item.role,
      verificationStatus: item.verificationStatus,
      accountStatus: item.accountStatus
    }));
    return sendJson(response, 200, {
      suppliers,
      territories: store.supplierTerritories,
      exceptions: store.territoryExceptions
    });
  }

  if (pathname === "/api/admin/supplier-territories" && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to manage supplier territories.");
    if (!requireRole(user, ["admin"], response)) return;
    const body = await jsonBody();
    const supplierOrganizationId = cleanText(body.supplierOrganizationId, 100);
    const supplier = store.users.find(item => item.id === supplierOrganizationId &&
      organizationId(item) === item.id && ["distributor", "retailer"].includes(item.role));
    if (!supplier) return apiError(response, 404, "Choose an existing Distributor or Retailer organisation.");
    if (isAccountSuspended(supplier)) return apiError(response, 409, "Territories cannot be configured for a suspended supplier.");
    const territory = {
      id: `T-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
      supplierOrganizationId,
      state: cleanText(body.state, 100),
      district: cleanText(body.district, 100),
      city: cleanText(body.city, 100),
      postalCode: cleanText(body.postalCode, 12).replace(/\s|-/g, ""),
      active: true,
      createdBy: user.id,
      createdAt: new Date().toISOString()
    };
    if (!territory.state) return apiError(response, 400, "A service-area State is required.");
    if (territory.postalCode && !/^\d{6}$/.test(territory.postalCode)) return apiError(response, 400, "Enter a valid six-digit India PIN code.");
    const duplicate = store.supplierTerritories.some(item =>
      item.supplierOrganizationId === supplierOrganizationId &&
      ["state", "district", "city", "postalCode"].every(field =>
        normalizeLocationPart(item[field]) === normalizeLocationPart(territory[field])
      )
    );
    if (duplicate) return apiError(response, 409, "This supplier service area is already configured.");
    const priorTerritories = store.supplierTerritories.slice();
    const priorAudit = store.audit.slice();
    store.supplierTerritories.push(territory);
    try {
      audit(user, "supplier_territory", territory.id, "supplier_territory.created", null, territory);
      await persistStore();
    } catch (error) {
      store.supplierTerritories.splice(0, store.supplierTerritories.length, ...priorTerritories);
      store.audit.splice(0, store.audit.length, ...priorAudit);
      throw error;
    }
    return sendJson(response, 201, { territory });
  }

  const territoryMatch = pathname.match(/^\/api\/admin\/supplier-territories\/([^/]+)$/);
  if (territoryMatch && method === "DELETE") {
    if (!user) return apiError(response, 401, "Please log in to manage supplier territories.");
    if (!requireRole(user, ["admin"], response)) return;
    const id = decodeURIComponent(territoryMatch[1]);
    const territory = store.supplierTerritories.find(item => item.id === id);
    if (!territory) return apiError(response, 404, "Supplier service area not found.");
    const priorTerritories = store.supplierTerritories.slice();
    const priorAudit = store.audit.slice();
    store.supplierTerritories.splice(store.supplierTerritories.indexOf(territory), 1);
    try {
      audit(user, "supplier_territory", territory.id, "supplier_territory.removed", territory, null);
      await persistStore();
    } catch (error) {
      store.supplierTerritories.splice(0, store.supplierTerritories.length, ...priorTerritories);
      store.audit.splice(0, store.audit.length, ...priorAudit);
      throw error;
    }
    return sendJson(response, 200, { removed: true, id });
  }

  if (pathname === "/api/admin/territory-exceptions" && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to approve a territory exception.");
    if (!requireRole(user, ["admin"], response)) return;
    const body = await jsonBody();
    const supplierOrganizationId = cleanText(body.supplierOrganizationId, 100);
    const rfqId = cleanText(body.rfqId, 100);
    const reason = cleanText(body.reason, 500);
    const expiry = Date.parse(body.expiresAt);
    const supplier = store.users.find(item => item.id === supplierOrganizationId &&
      organizationId(item) === item.id && ["distributor", "retailer"].includes(item.role));
    const rfq = store.rfqs.find(item => item.id === rfqId);
    if (!supplier || !rfq) return apiError(response, 404, "Choose an existing supplier organisation and RFQ.");
    if (!accountVerified(supplier) || isAccountSuspended(supplier)) return apiError(response, 409, "Only a verified, active supplier may receive a territory exception.");
    if (reason.length < 10) return apiError(response, 400, "Provide a reason of at least 10 characters.");
    if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 365 * 86400000) {
      return apiError(response, 400, "Set an exception expiry within the next 365 days.");
    }
    if (store.territoryExceptions.some(item => item.supplierOrganizationId === supplierOrganizationId && item.rfqId === rfqId && !item.revokedAt && Date.parse(item.expiresAt) > Date.now())) {
      return apiError(response, 409, "An active exception already exists for this supplier and RFQ.");
    }
    const exception = {
      id: `TX-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
      supplierOrganizationId,
      rfqId,
      scope: "single_rfq",
      reason,
      expiresAt: new Date(expiry).toISOString(),
      approvedBy: user.id,
      createdAt: new Date().toISOString()
    };
    const priorExceptions = store.territoryExceptions.slice();
    const priorAudit = store.audit.slice();
    store.territoryExceptions.push(exception);
    try {
      audit(user, "territory_exception", exception.id, "territory_exception.approved", null, exception);
      await persistStore();
    } catch (error) {
      store.territoryExceptions.splice(0, store.territoryExceptions.length, ...priorExceptions);
      store.audit.splice(0, store.audit.length, ...priorAudit);
      throw error;
    }
    return sendJson(response, 201, { exception });
  }

  const territoryExceptionMatch = pathname.match(/^\/api\/admin\/territory-exceptions\/([^/]+)$/);
  if (territoryExceptionMatch && method === "DELETE") {
    if (!user) return apiError(response, 401, "Please log in to revoke a territory exception.");
    if (!requireRole(user, ["admin"], response)) return;
    const id = decodeURIComponent(territoryExceptionMatch[1]);
    const exception = store.territoryExceptions.find(item => item.id === id);
    if (!exception) return apiError(response, 404, "Territory exception not found.");
    if (exception.revokedAt) return apiError(response, 409, "This territory exception has already been revoked.");
    const before = { ...exception };
    const priorAudit = store.audit.slice();
    exception.revokedAt = new Date().toISOString();
    exception.revokedBy = user.id;
    try {
      audit(user, "territory_exception", exception.id, "territory_exception.revoked", before, exception);
      await persistStore();
    } catch (error) {
      Object.assign(exception, before);
      store.audit.splice(0, store.audit.length, ...priorAudit);
      throw error;
    }
    return sendJson(response, 200, { exception });
  }

  if (pathname === "/api/admin/backups" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to view backup status.");
    if (!requireRole(user, ["admin"], response)) return;
    return sendJson(response, 200, { items: await listLocalBackups(), restoreAvailable: true });
  }

  if (pathname === "/api/admin/backups" && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to create a local backup.");
    if (!requireRole(user, ["admin"], response)) return;
    const backup = await createLocalBackup();
    audit(user, "backup", backup.name, "backup.created", null, { sizeBytes: backup.sizeBytes, integrity: backup.integrity });
    await persistStore();
    return sendJson(response, 201, { backup, items: await listLocalBackups(), restoreAvailable: true });
  }

  if (pathname === "/api/admin/backups/restore" && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to restore a local backup.");
    if (!requireRole(user, ["admin"], response)) return;
    if (restoreInProgress) return apiError(response, 409, "Another backup restore is already in progress.");
    const body = await jsonBody();
    const name = cleanText(body.name, 100);
    if (!BACKUP_NAME_PATTERN.test(name) || body.confirmation !== name) {
      return apiError(response, 400, "Type the exact backup filename as confirmation before restoring it.");
    }
    restoreInProgress = true;
    try {
      await waitForOtherApiRequests();
      const result = await restoreLocalBackup(user, name);
      return sendJson(response, 200, { ...result, items: await listLocalBackups() });
    } finally {
      restoreInProgress = false;
    }
  }

  if (pathname === "/api/team/accept" && method === "POST") {
    const body = await jsonBody();
    const token = cleanText(body.token, 100);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const invite = store.invitations.find(item => item.tokenHash === tokenHash);
    if (!invite || invite.revokedAt || invite.usedAt || invite.expiresAt <= new Date().toISOString()) {
      return apiError(response, 410, "This invitation is invalid, expired, or already used. Ask your organisation owner for a new link.");
    }
    const owner = store.users.find(item => item.id === invite.organizationId);
    if (!owner || !canManageOrganisationStaff(owner) || owner.accountStatus !== "active" || owner.verificationStatus !== "verified") {
      return apiError(response, 403, "The inviting organisation is not currently active and verified.");
    }
    const firstName = cleanText(body.firstName, 80);
    const lastName = cleanText(body.lastName, 80);
    const password = typeof body.password === "string" ? body.password : "";
    if (!firstName || !lastName || password.length < 10 || password.length > 200) {
      return apiError(response, 400, "Enter your name and a password between 10 and 200 characters.");
    }
    if (store.users.some(item => item.email === invite.email)) return apiError(response, 409, "An account with this email already exists.");
    const member = {
      id: crypto.randomUUID(),
      firstName,
      lastName,
      email: invite.email,
      role: owner.role,
      organizationName: owner.organizationName,
      organizationId: owner.id,
      staffProfile: invite.staffProfile,
      profile: owner.profile || {},
      accountStatus: owner.accountStatus,
      verificationStatus: owner.verificationStatus,
      passwordHash: await hashPassword(password),
      consentAcceptedAt: owner.consentAcceptedAt,
      createdAt: new Date().toISOString(),
      invitedBy: invite.createdBy
    };
    invite.usedAt = new Date().toISOString();
    invite.acceptedBy = member.id;
    store.users.push(member);
    const auditEvent = audit(owner, "team_invitation", invite.id, "team.invitation_accepted", { status: "pending" }, { status: "accepted", memberId: member.id, staffProfile: member.staffProfile });
    try {
      await persistStore();
    } catch (error) {
      store.users.splice(store.users.indexOf(member), 1);
      invite.usedAt = null;
      invite.acceptedBy = null;
      store.audit = store.audit.filter(item => item.id !== auditEvent.id);
      throw error;
    }
    return sendJson(response, 201, { user: publicUser(member) }, { "Set-Cookie": createSession(member) });
  }

  if (pathname === "/api/dashboard" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to access your role dashboard.");
    return sendJson(response, 200, { ...dashboardData(user), team: canManageOrganisationStaff(user) && hasPermission(user, "team.manage") ? {
      members: organizationUsers(user).map(member => ({
        id: member.id, firstName: member.firstName, lastName: member.lastName, email: member.email,
        staffProfile: permissionProfile(member), createdAt: member.createdAt
      })),
      invitations: store.invitations.filter(item => item.organizationId === organizationId(user) && !item.usedAt && !item.revokedAt && item.expiresAt > new Date().toISOString())
        .map(({ tokenHash, ...item }) => item)
    } : null });
  }

  if (pathname === "/api/team" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to view organisation staff.");
    if (!canManageOrganisationStaff(user)) return apiError(response, 403, "Staff accounts are available only to school, distributor, retailer, and publisher organisations.");
    if (!requirePermission(user, "team.manage", response)) return;
    return sendJson(response, 200, {
      members: organizationUsers(user).map(member => ({
        id: member.id, firstName: member.firstName, lastName: member.lastName, email: member.email,
        staffProfile: permissionProfile(member), createdAt: member.createdAt
      })),
      invitations: store.invitations.filter(item => item.organizationId === organizationId(user) && !item.usedAt && !item.revokedAt && item.expiresAt > new Date().toISOString())
        .map(({ tokenHash, ...item }) => item)
    });
  }

  if (pathname === "/api/team/invites" && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to invite organisation staff.");
    if (!canManageOrganisationStaff(user)) return apiError(response, 403, "Staff accounts are available only to school, distributor, retailer, and publisher organisations.");
    if (!requirePermission(user, "team.manage", response)) return;
    if (permissionProfile(user) !== "owner") return apiError(response, 403, "Only the organisation owner can invite or manage staff accounts.");
    const owner = organizationOwner(user);
    if (!accountVerified(owner) || owner.accountStatus !== "active") return apiError(response, 403, "An active, verified organisation owner is required to invite staff.");
    const body = await jsonBody();
    const email = cleanText(body.email, 254).toLowerCase();
    const staffProfile = cleanText(body.staffProfile, 30);
    if (!validEmail(email) || !["manager", "buyer", "reviewer", "read_only"].includes(staffProfile)) {
      return apiError(response, 400, "Enter a valid staff email and choose Manager, Buyer, Reviewer, or Read-only.");
    }
    if (store.users.some(item => item.email === email) || store.invitations.some(item =>
      item.organizationId === owner.id && item.email === email && !item.usedAt && !item.revokedAt && item.expiresAt > new Date().toISOString()
    )) return apiError(response, 409, "This email already has an account or a live invitation.");
    let mailConfig;
    try {
      mailConfig = smtpMailerConfiguration();
    } catch (error) {
      return apiError(response, error.status || 503, error.message);
    }
    const token = crypto.randomBytes(32).toString("hex");
    const invite = {
      id: `INV-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
      organizationId: owner.id,
      email,
      staffProfile,
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      usedAt: null,
      acceptedBy: null
    };
    store.invitations.unshift(invite);
    const auditEvent = audit(user, "team_invitation", invite.id, "team.invitation_created", null, {
      organizationId: owner.id, email, staffProfile, expiresAt: invite.expiresAt
    });
    try {
      await persistStore();
    } catch (error) {
      store.invitations.splice(store.invitations.indexOf(invite), 1);
      store.audit = store.audit.filter(item => item.id !== auditEvent.id);
      throw error;
    }
    let emailDelivery = { status: "not_configured", message: "SMTP email is not configured; share the one-time link manually." };
    if (mailConfig) {
      const inviteUrl = `${mailConfig.publicUrl}/invite/${token}`;
      try {
        emailDelivery = await sendInvitationEmail(mailConfig, email, inviteUrl, invite.expiresAt);
        invite.emailSentAt = new Date().toISOString();
      } catch (error) {
        console.error("Invitation email delivery failed:", error.code || "SMTP_ERROR");
        emailDelivery = { status: "failed", message: "SMTP delivery failed. The invitation remains active; share the one-time link manually and check SMTP configuration." };
        invite.emailDeliveryError = error.code || "SMTP_ERROR";
      }
      try {
        await persistStore();
      } catch (error) {
        console.error("Invitation email status could not be persisted:", error.code || "STORE_WRITE_ERROR");
        emailDelivery = { status: emailDelivery.status, message: `${emailDelivery.message} The email status could not be recorded; check server storage.` };
      }
    }
    return sendJson(response, 201, {
      invitation: { id: invite.id, email, staffProfile, expiresAt: invite.expiresAt },
      invitePath: `/invite/${token}`,
      emailDelivery
    });
  }

  const teamInviteMatch = pathname.match(/^\/api\/team\/invites\/([^/]+)$/);
  if (teamInviteMatch && method === "DELETE") {
    if (!user) return apiError(response, 401, "Please log in to revoke organisation invitations.");
    if (!canManageOrganisationStaff(user)) return apiError(response, 403, "Staff accounts are available only to school, distributor, retailer, and publisher organisations.");
    if (!requirePermission(user, "team.manage", response)) return;
    if (permissionProfile(user) !== "owner") return apiError(response, 403, "Only the organisation owner can revoke invitations.");
    const invite = store.invitations.find(item => item.id === decodeURIComponent(teamInviteMatch[1]) &&
      item.organizationId === organizationId(user) && !item.usedAt && !item.revokedAt && item.expiresAt > new Date().toISOString());
    if (!invite) return apiError(response, 404, "Live invitation not found.");
    const tokenHash = invite.tokenHash;
    const revokedAt = invite.revokedAt || null;
    invite.revokedAt = new Date().toISOString();
    invite.tokenHash = "";
    const auditEvent = audit(user, "team_invitation", invite.id, "team.invitation_revoked", { status: "pending" }, { status: "revoked" });
    try {
      await persistStore();
    } catch (error) {
      invite.tokenHash = tokenHash;
      invite.revokedAt = revokedAt;
      store.audit = store.audit.filter(item => item.id !== auditEvent.id);
      throw error;
    }
    return sendJson(response, 200, { invitation: { id: invite.id, revokedAt: invite.revokedAt } });
  }

  if (pathname === "/api/profile" && method === "PATCH") {
    if (!user) return apiError(response, 401, "Please log in to update your organisation profile.");
    if (!requirePermission(user, "profile.manage", response)) return;
    const profileOwner = organizationOwner(user);
    const body = await jsonBody();
    const organizationName = cleanText(body.organizationName, 160);
    if (organizationName.length < 2) return apiError(response, 400, "Enter your organisation or business name.");
    if (body.requestVerification === true && profileOwner.verificationStatus !== "rejected") {
      return apiError(response, 409, "Only an account returned for correction can request a new verification review.");
    }
    const nextProfile = profileForWrite(body);
    const before = { organizationName: profileOwner.organizationName, profile: profileOwner.profile };
    profileOwner.organizationName = organizationName;
    profileOwner.profile = { ...profileOwner.profile, ...nextProfile };
    profileOwner.profile.updatedAt = new Date().toISOString();
    if (body.requestVerification === true) {
      profileOwner.verificationStatus = "pending";
      profileOwner.verificationReason = "";
      notifyAdmin("Organisation verification resubmitted", `${organizationName} is ready for administrator review.`, profileOwner.id);
    }
    audit(user, "profile", profileOwner.id, "profile.updated", before, { organizationName: profileOwner.organizationName, profile: profileOwner.profile });
    await persistStore();
    return sendJson(response, 200, { user: publicUser(user) });
  }

  if (pathname === "/api/rfqs" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to view RFQs.");
    if (!requirePermission(user, "rfq.view", response)) return;
    if (user.role === "school") {
      return sendJson(response, 200, { items: store.rfqs.filter(item => (item.ownerId || item.userId) === organizationId(user)).map(item => safeRfq(item, true)) });
    }
    if (user.role === "distributor" || user.role === "retailer") {
      if (!accountVerified(user)) return apiError(response, 403, "Verify your supplier account before viewing school RFQs.");
      return sendJson(response, 200, {
        items: store.rfqs.filter(item =>
          ["published", "responses_received"].includes(item.status) &&
          supplierTerritoryEligibility(user, item).eligible
        ).map(publicOpportunity)
      });
    }
    return apiError(response, 403, "Your role cannot access the RFQ workspace.");
  }

  if (pathname === "/api/rfqs" && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to create a school requirement.");
    if (!requireRole(user, ["school"], response)) return;
    if (!requirePermission(user, "rfq.manage", response)) return;
    const body = await jsonBody();
    if (body.status === "published" && !requirePermission(user, "rfq.publish", response)) return;
    if (body.status === "published" && !accountVerified(user)) {
      return apiError(response, 403, "Complete school account verification before publishing an RFQ. You can save this requirement as a draft.");
    }
    let lines = Array.isArray(body.lines) ? body.lines : [];
    if (!lines.length && body.bookId) {
      const book = matchBook({ bookId: body.bookId });
      if (!book) return apiError(response, 404, "The selected catalog title could not be found.");
      lines = [{
        bookId: book.id,
        title: book.title,
        isbn: /^(?:\d{9}[\dX]|\d{13})$/i.test(book.isbn || "") ? book.isbn : "",
        edition: book.edition || "",
        publisher: book.publisher,
        subject: book.subject,
        className: book.level,
        quantity: body.quantity
      }];
    }
    if (lines.length > 250) return apiError(response, 400, "An RFQ can contain at most 250 book lines.");
    const normalizedLines = [];
    const lineErrors = [];
    const seenIsbns = new Set();
    const seenTitles = new Set();
    for (const [index, line] of lines.entries()) {
      const title = cleanText(line.title, 180);
      const quantity = Number(line.quantity);
      if (!title || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
        lineErrors.push(`Line ${index + 1} needs a book title and a whole-number quantity from 1 to 100,000.`);
        continue;
      }
      const isbn = cleanText(line.isbn, 30).replace(/[\s-]/g, "");
      const book = matchBook(line);
      if (line.bookId && !book) lineErrors.push(`Line ${index + 1} refers to an unavailable catalogue title.`);
      if (isbn && !/^(?:\d{9}[\dX]|\d{13})$/i.test(isbn)) lineErrors.push(`Line ${index + 1} has an invalid ISBN.`);
      const uniqueIsbn = isbn.toUpperCase();
      const uniqueTitle = title.toLocaleLowerCase();
      if (uniqueIsbn && seenIsbns.has(uniqueIsbn)) lineErrors.push(`Line ${index + 1} duplicates an ISBN already in this RFQ.`);
      if (seenTitles.has(uniqueTitle)) lineErrors.push(`Line ${index + 1} duplicates a book title already in this RFQ.`);
      if (uniqueIsbn) seenIsbns.add(uniqueIsbn);
      seenTitles.add(uniqueTitle);
      normalizedLines.push({
        id: crypto.randomUUID(),
        bookId: book?.id || "",
        title,
        isbn,
        edition: cleanText(line.edition, 80),
        publisher: cleanText(line.publisher, 120) || book?.publisher || "",
        className: cleanText(line.className, 60),
        subject: cleanText(line.subject, 100) || book?.subject || "",
        quantity,
        catalogSnapshot: book ? { id: book.id, title: book.title, isbn: book.isbn || "", edition: book.edition || "", session: book.session || "", board: book.board || "", state: book.state || "", medium: book.medium || "" } : null
      });
    }
    if (lines.length && lineErrors.length) return apiError(response, 400, lineErrors.join(" "));
    const profile = organizationProfile(user);
    const rfq = {
      id: `RFQ-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      ownerId: organizationId(user),
      organizationName: organizationName(user),
      title: cleanText(body.title, 160) || `Academic book requirement · ${cleanText(body.session, 30) || profile.academicSession || "New session"}`,
      session: cleanText(body.session, 30) || profile.academicSession || "",
      board: cleanText(body.board, 80) || profile.board || "",
      state: cleanText(body.state, 100) || profile.state || "",
      deliveryState: cleanText(body.deliveryState, 100) || profile.state || "",
      deliveryDistrict: cleanText(body.deliveryDistrict, 100) || profile.district || "",
      medium: cleanText(body.medium, 80) || profile.medium || "",
      deliveryCity: cleanText(body.deliveryCity, 100) || profile.city || "",
      deliveryPostalCode: cleanText(body.deliveryPostalCode, 12).replace(/\s|-/g, "") || cleanText(profile.postalCode, 12).replace(/\s|-/g, ""),
      responseDeadline: cleanText(body.responseDeadline, 40),
      budget: body.budget === "" || body.budget == null ? null : Number(body.budget),
      lines: normalizedLines,
      version: 1,
      versions: [],
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (body.status === "published") {
      const compatibility = academicCompatibility(rfq);
      if (!compatibility.compatible) {
        return apiError(response, 400, `Catalogue compatibility check failed: ${compatibility.conflicts.map(item => `${item.title}: ${item.field} is ${item.catalogueValue}, not ${item.requested}`).join("; ")}.`);
      }
    }
    if (rfq.budget !== null && (!Number.isFinite(rfq.budget) || rfq.budget < 0)) {
      return apiError(response, 400, "Enter a valid non-negative budget or leave it blank.");
    }
    if (rfq.deliveryPostalCode && !/^\d{6}$/.test(rfq.deliveryPostalCode)) {
      return apiError(response, 400, "Delivery PIN code must be a valid six-digit India PIN code.");
    }
    if (rfq.responseDeadline && (!/^\d{4}-\d{2}-\d{2}$/.test(rfq.responseDeadline) || !Number.isFinite(new Date(`${rfq.responseDeadline}T23:59:59`).getTime()) || new Date(`${rfq.responseDeadline}T23:59:59`) < new Date())) {
      return apiError(response, 400, "The quotation deadline must be a valid date in the future.");
    }
    if (body.status === "published") {
      if (!accountVerified(user)) return apiError(response, 403, "Complete school account verification before publishing an RFQ. You can save this requirement as a draft.");
      if (!rfq.session || !rfq.board || !rfq.state || !rfq.medium) return apiError(response, 400, "Academic session, board, state, and medium are required to publish an RFQ.");
      if (!rfq.deliveryState || !(rfq.deliveryCity || rfq.deliveryDistrict || rfq.deliveryPostalCode)) {
        return apiError(response, 400, "Add a delivery State and at least a City, District, or six-digit PIN code before publishing.");
      }
      if (!normalizedLines.length) return apiError(response, 400, lineErrors[0] || "Add at least one valid book line before publishing.");
      if (lineErrors.length) return apiError(response, 400, lineErrors.join(" "));
      rfq.status = "published";
      notify(user.id, "rfq", "RFQ published", `${rfq.id} is now visible to verified supply partners.`, rfq.id);
    }
    store.rfqs.unshift(rfq);
    audit(user, "rfq", rfq.id, rfq.status === "draft" ? "rfq.draft_created" : "rfq.published", null, safeRfq(rfq));
    await persistStore();
    return sendJson(response, 201, { rfq: safeRfq(rfq, true), errors: lineErrors });
  }

  const splitPlanMatch = pathname.match(/^\/api\/rfqs\/([^/]+)\/split-plan$/);
  if (splitPlanMatch && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to plan supplier allocations.");
    if (!requireRole(user, ["school"], response)) return;
    const rfq = store.rfqs.find(item => item.id === decodeURIComponent(splitPlanMatch[1]));
    if (!rfq || (rfq.ownerId || rfq.userId) !== organizationId(user)) return apiError(response, 404, "RFQ not found in your organisation.");
    return sendJson(response, 200, { plan: splitPlan(rfq) });
  }

  const impactPreviewMatch = pathname.match(/^\/api\/rfqs\/([^/]+)\/impact-preview$/);
  if (impactPreviewMatch && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to preview RFQ changes.");
    if (!requireRole(user, ["school"], response)) return;
    const rfq = store.rfqs.find(item => item.id === decodeURIComponent(impactPreviewMatch[1]));
    if (!rfq || (rfq.ownerId || rfq.userId) !== organizationId(user)) return apiError(response, 404, "RFQ not found in your organisation.");
    if (!["published", "responses_received", "under_review"].includes(rfq.status)) return apiError(response, 409, "Impact preview is available only for a published RFQ.");
    const body = await jsonBody();
    if (!Array.isArray(body.lines) || body.lines.length > 250) return apiError(response, 400, "Provide the proposed RFQ lines to preview.");
    const changes = [];
    const beforeById = new Map(rfq.lines.map(line => [line.id, line]));
    const retained = new Set();
    for (const [index, line] of body.lines.entries()) {
      const old = line.id ? beforeById.get(cleanText(line.id, 100)) : null;
      if (old) retained.add(old.id);
      const next = {
        title: cleanText(line.title, 180),
        isbn: cleanText(line.isbn, 30).replace(/[\s-]/g, ""),
        edition: cleanText(line.edition, 80),
        quantity: Number(line.quantity)
      };
      if (!next.title || !Number.isInteger(next.quantity) || next.quantity < 1 || next.quantity > 100000) {
        return apiError(response, 400, `Proposed book line ${index + 1} needs a title and whole-number quantity.`);
      }
      if (!old) changes.push({ type: "added", title: next.title, newQuantity: next.quantity });
      else if (old.title !== next.title || old.isbn !== next.isbn || old.edition !== next.edition || old.quantity !== next.quantity) {
        changes.push({
          type: "changed",
          title: old.title,
          newTitle: next.title,
          oldQuantity: old.quantity,
          newQuantity: next.quantity,
          isbnChanged: old.isbn !== next.isbn,
          editionChanged: old.edition !== next.edition
        });
      }
    }
    for (const old of rfq.lines) {
      if (!retained.has(old.id)) changes.push({ type: "removed", title: old.title, oldQuantity: old.quantity });
    }
    const affectedQuotes = store.quotes.filter(quote => quote.rfqId === rfq.id && ["submitted", "needs_revision", "selected_for_evaluation"].includes(quote.status));
    return sendJson(response, 200, {
      changes,
      affectedQuoteCount: affectedQuotes.length,
      affectedQuoteStatuses: affectedQuotes.map(quote => ({ quoteId: quote.id, status: quote.status })),
      requiresChangeReason: true,
      warning: "Saving this material change creates a new RFQ version and marks current supplier responses as needing revision."
    });
  }

  const rfqMatch = pathname.match(/^\/api\/rfqs\/([^/]+)$/);
  if (rfqMatch && method === "PATCH") {
    if (!user) return apiError(response, 401, "Please log in to change an RFQ.");
    if (!requireRole(user, ["school"], response)) return;
    if (!requirePermission(user, "rfq.manage", response)) return;
    const rfq = store.rfqs.find(item => item.id === decodeURIComponent(rfqMatch[1]));
    if (!rfq || (rfq.ownerId || rfq.userId) !== organizationId(user)) return apiError(response, 404, "RFQ not found in your organisation.");
    const body = await jsonBody();
    if (body.action === "publish" && !requirePermission(user, "rfq.publish", response)) return;
    if (body.publish === true && !requirePermission(user, "rfq.publish", response)) return;
    const before = safeRfq(rfq);
    const action = cleanText(body.action, 30);
    if (action === "publish" && rfq.status === "draft") {
      if (!accountVerified(user)) return apiError(response, 403, "Your school account must be verified before publishing RFQs.");
      if (!rfq.session || !rfq.board || !rfq.state || !rfq.medium || !rfq.lines.length) return apiError(response, 400, "RFQ needs a session, board, state, medium, and at least one book line before publication.");
      if (!rfq.deliveryState || !(rfq.deliveryCity || rfq.deliveryDistrict || rfq.deliveryPostalCode)) {
        return apiError(response, 400, "Add a delivery State and at least a City, District, or six-digit PIN code before publishing.");
      }
      const compatibility = academicCompatibility(rfq);
      if (!compatibility.compatible) {
        return apiError(response, 400, `Catalogue compatibility check failed: ${compatibility.conflicts.map(item => `${item.title}: ${item.field} is ${item.catalogueValue}, not ${item.requested}`).join("; ")}.`);
      }
      rfq.status = "published";
    } else if (action === "close" && ["published", "responses_received", "under_review"].includes(rfq.status)) {
      rfq.status = "closed";
    } else if (action === "cancel" && ["draft", "published", "responses_received", "under_review"].includes(rfq.status)) {
      rfq.status = "cancelled";
    } else if (action === "edit" && ["draft", "published", "responses_received", "under_review"].includes(rfq.status)) {
      if (store.orders.some(order => order.rfqId === rfq.id && order.status !== "cancelled")) {
        return apiError(response, 409, "This RFQ already has an active purchase order. Amend or cancel the order through its own workflow instead.");
      }
      const nextLines = Array.isArray(body.lines) ? body.lines : rfq.lines;
      if (nextLines.length > 250) return apiError(response, 400, "An RFQ can contain at most 250 book lines.");
      const wasPublished = rfq.status !== "draft";
      const nextBudget = Object.hasOwn(body, "budget") ?
        (body.budget === "" || body.budget == null ? null : Number(body.budget)) : rfq.budget ?? null;
      const nextDeadline = Object.hasOwn(body, "responseDeadline") ?
        cleanText(body.responseDeadline, 40) : rfq.responseDeadline || "";
      const nextDelivery = {
        deliveryState: Object.hasOwn(body, "deliveryState") ? cleanText(body.deliveryState, 100) : rfq.deliveryState || "",
        deliveryDistrict: Object.hasOwn(body, "deliveryDistrict") ? cleanText(body.deliveryDistrict, 100) : rfq.deliveryDistrict || "",
        deliveryCity: Object.hasOwn(body, "deliveryCity") ? cleanText(body.deliveryCity, 100) : rfq.deliveryCity || "",
        deliveryPostalCode: Object.hasOwn(body, "deliveryPostalCode")
          ? cleanText(body.deliveryPostalCode, 12).replace(/\s|-/g, "")
          : rfq.deliveryPostalCode || ""
      };
      if (nextDelivery.deliveryPostalCode && !/^\d{6}$/.test(nextDelivery.deliveryPostalCode)) {
        return apiError(response, 400, "Delivery PIN code must be a valid six-digit India PIN code.");
      }
      if (rfq.status === "draft" && body.publish === true &&
        (!nextDelivery.deliveryState || !(nextDelivery.deliveryCity || nextDelivery.deliveryDistrict || nextDelivery.deliveryPostalCode))) {
        return apiError(response, 400, "Add a delivery State and at least a City, District, or six-digit PIN code before publishing.");
      }
      if (nextBudget !== null && (!Number.isFinite(nextBudget) || nextBudget < 0)) return apiError(response, 400, "Enter a valid non-negative budget or leave it blank.");
      if (nextDeadline && (!/^\d{4}-\d{2}-\d{2}$/.test(nextDeadline) || !Number.isFinite(new Date(`${nextDeadline}T23:59:59`).getTime()) || new Date(`${nextDeadline}T23:59:59`) < new Date())) {
        return apiError(response, 400, "The quotation deadline must be a valid date in the future.");
      }
      const normalizedLines = [];
      const seenIsbns = new Set();
      const seenTitles = new Set();
      for (const [index, line] of nextLines.entries()) {
        const title = cleanText(line.title, 180);
        const quantity = Number(line.quantity);
        const isbn = cleanText(line.isbn, 30).replace(/[\s-]/g, "");
        if (!title || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000) return apiError(response, 400, `Book line ${index + 1} needs a title and a valid quantity.`);
        if (line.bookId && !matchBook(line)) return apiError(response, 404, `Book line ${index + 1} refers to an unavailable catalogue title.`);
        if (isbn && !/^(?:\d{9}[\dX]|\d{13})$/i.test(isbn)) return apiError(response, 400, `Book line ${index + 1} has an invalid ISBN.`);
        if (isbn && seenIsbns.has(isbn.toUpperCase())) return apiError(response, 400, `Book line ${index + 1} duplicates an ISBN already in this RFQ.`);
        if (seenTitles.has(title.toLocaleLowerCase())) return apiError(response, 400, `Book line ${index + 1} duplicates a title already in this RFQ.`);
        if (isbn) seenIsbns.add(isbn.toUpperCase());
        seenTitles.add(title.toLocaleLowerCase());
        const book = matchBook(line);
        normalizedLines.push({
          id: cleanText(line.id, 100) || crypto.randomUUID(),
          bookId: book?.id || "",
          title,
          isbn,
          edition: cleanText(line.edition, 80),
          publisher: cleanText(line.publisher, 120) || book?.publisher || "",
          className: cleanText(line.className, 60),
          subject: cleanText(line.subject, 100) || book?.subject || "",
          quantity,
          catalogSnapshot: book ? { id: book.id, title: book.title, isbn: book.isbn || "", edition: book.edition || "", session: book.session || "", board: book.board || "", state: book.state || "", medium: book.medium || "" } : null
        });
      }
      if (wasPublished && normalizedLines.length === 0) return apiError(response, 400, "A published RFQ must retain at least one book line.");
      const academicPreview = academicCompatibility({
        ...rfq,
        session: cleanText(body.session, 30) || rfq.session,
        board: cleanText(body.board, 80) || rfq.board,
        state: cleanText(body.state, 100) || rfq.state,
        medium: cleanText(body.medium, 80) || rfq.medium,
        lines: normalizedLines
      });
      if (wasPublished && !academicPreview.compatible) {
        return apiError(response, 400, `Catalogue compatibility check failed: ${academicPreview.conflicts.map(item => `${item.title}: ${item.field} is ${item.catalogueValue}, not ${item.requested}`).join("; ")}.`);
      }
      const comparableLine = line => ({
        id: line.id || "",
        bookId: line.bookId || "",
        title: line.title || "",
        isbn: line.isbn || "",
        edition: line.edition || "",
        publisher: line.publisher || "",
        className: line.className || "",
        subject: line.subject || "",
        quantity: Number(line.quantity),
        catalogSnapshot: line.catalogSnapshot || null
      });
      const materialChange = ["title", "session", "board", "state", "medium", "responseDeadline"]
        .some(key => Object.hasOwn(body, key) && cleanText(body[key], key === "title" ? 160 : 100) !== cleanText(rfq[key], key === "title" ? 160 : 100)) ||
        Object.entries(nextDelivery).some(([key, value]) => value !== cleanText(rfq[key], 100)) ||
        nextBudget !== (rfq.budget ?? null) ||
        JSON.stringify(normalizedLines.map(comparableLine)) !== JSON.stringify(rfq.lines.map(comparableLine));
      if (wasPublished && materialChange && cleanText(body.changeReason, 300).length < 10) {
        return apiError(response, 400, "Explain the material change before updating a published RFQ.");
      }
      if (wasPublished && materialChange) {
        rfq.versions.push({ version: rfq.version, snapshot: before, changeReason: cleanText(body.changeReason, 300), changedBy: user.id, createdAt: new Date().toISOString() });
        rfq.version += 1;
        store.quotes.filter(quote => quote.rfqId === rfq.id && ["submitted", "needs_revision", "selected_for_evaluation"].includes(quote.status)).forEach(quote => {
          notify(quote.supplierId, "rfq_changed", "RFQ requirements updated", `${rfq.id} changed in version ${rfq.version}. Review the new requirements before responding.`, rfq.id);
          const { revisionHistory, ...previousQuote } = quote;
          quote.revisionHistory = [...(quote.revisionHistory || []), {
            version: quote.version,
            snapshot: previousQuote,
            createdAt: new Date().toISOString(),
            reason: "RFQ requirement version changed"
          }];
          quote.status = "needs_revision";
          quote.updatedAt = new Date().toISOString();
          audit(user, "quotation", quote.id, "quotation.revision_requested", null, { rfqVersion: rfq.version, status: quote.status });
        });
      }
      rfq.lines = normalizedLines;
      for (const key of ["title", "session", "board", "state", "medium", "deliveryCity", "responseDeadline"]) {
        if (Object.hasOwn(body, key)) rfq[key] = cleanText(body[key], key === "title" ? 160 : 100);
      }
      Object.assign(rfq, nextDelivery);
      if (Object.hasOwn(body, "budget")) rfq.budget = nextBudget;
      if (rfq.status === "draft" && body.publish === true) {
        if (!accountVerified(user)) return apiError(response, 403, "Verify the school account before publishing.");
        if (!rfq.session || !rfq.board || !rfq.state || !rfq.medium) return apiError(response, 400, "Complete the academic fields before publishing.");
        if (!rfq.deliveryState || !(rfq.deliveryCity || rfq.deliveryDistrict || rfq.deliveryPostalCode)) {
          return apiError(response, 400, "Add a delivery State and at least a City, District, or six-digit PIN code before publishing.");
        }
        const compatibility = academicCompatibility({ ...rfq, lines: normalizedLines });
        if (!compatibility.compatible) {
          return apiError(response, 400, `Catalogue compatibility check failed: ${compatibility.conflicts.map(item => `${item.title}: ${item.field} is ${item.catalogueValue}, not ${item.requested}`).join("; ")}.`);
        }
        rfq.status = "published";
        notify(user.id, "rfq", "RFQ published", `${rfq.id} is now visible to verified supply partners.`, rfq.id);
      }
    } else {
      return apiError(response, 409, "This RFQ is in a state that does not allow the requested transition.");
    }
    rfq.updatedAt = new Date().toISOString();
    if (action === "publish") notify(user.id, "rfq", "RFQ published", `${rfq.id} is now visible to verified supply partners.`, rfq.id);
    const changedAfter = safeRfq(rfq, true);
    audit(user, "rfq", rfq.id, `rfq.${action}`, before, changedAfter);
    if (["closed", "cancelled"].includes(rfq.status)) {
      store.quotes.filter(quote => quote.rfqId === rfq.id && quote.status === "submitted").forEach(quote => notify(quote.supplierId, "rfq_closed", "RFQ closed", `${rfq.id} has been ${rfq.status}.`, rfq.id));
    }
    await persistStore();
    return sendJson(response, 200, { rfq: changedAfter });
  }

  const rfqQuotesMatch = pathname.match(/^\/api\/rfqs\/([^/]+)\/quotes$/);
  if (rfqQuotesMatch && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to review quotations.");
    const rfqId = decodeURIComponent(rfqQuotesMatch[1]);
    const rfq = store.rfqs.find(item => item.id === rfqId);
    if (!rfq) return apiError(response, 404, "RFQ not found.");
    if (user.role === "school" && (rfq.ownerId || rfq.userId) === organizationId(user)) {
      if (!requirePermission(user, "quote.view", response)) return;
      return sendJson(response, 200, {
        items: store.quotes.filter(item => item.rfqId === rfqId && item.status !== "draft").map(item => {
          const supplier = store.users.find(candidate => candidate.id === item.supplierId);
          return { ...item, supplier: supplier ? supplier.organizationName || `${supplier.firstName} ${supplier.lastName}` : "Verified partner" };
        })
      });
    }
    if (["distributor", "retailer"].includes(user.role)) {
      if (!requirePermission(user, "quote.view", response)) return;
      if (!supplierTerritoryEligibility(user, rfq).eligible) {
        return apiError(response, 403, "Your account is not eligible to access this RFQ under the configured service-area rules.");
      }
      return sendJson(response, 200, { items: store.quotes.filter(item => item.rfqId === rfqId && item.supplierId === organizationId(user)) });
    }
    return apiError(response, 403, "You are not permitted to view these quotations.");
  }

  const rfqQuotePostMatch = pathname.match(/^\/api\/rfqs\/([^/]+)\/quotes$/);
  if (rfqQuotePostMatch && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to respond to an RFQ.");
    if (!requireRole(user, ["distributor", "retailer"], response)) return;
    if (!requirePermission(user, "quote.submit", response)) return;
    if (!accountVerified(user)) return apiError(response, 403, "Your supplier account must be verified before you submit a quotation.");
    const rfqId = decodeURIComponent(rfqQuotePostMatch[1]);
    const rfq = store.rfqs.find(item => item.id === rfqId);
    if (!rfq || !["published", "responses_received"].includes(rfq.status)) return apiError(response, 404, "This RFQ is not accepting supplier responses.");
    const eligibility = supplierTerritoryEligibility(user, rfq);
    if (!eligibility.eligible) return apiError(response, 403, eligibility.reason);
    if (rfq.responseDeadline && new Date(`${rfq.responseDeadline}T23:59:59`) < new Date()) return apiError(response, 409, "The quotation deadline has passed.");
    const body = await jsonBody();
    const existing = store.quotes.find(item => item.rfqId === rfqId && item.supplierId === organizationId(user));
    if (existing && !["draft", "submitted", "expired", "no_bid", "needs_revision"].includes(existing.status)) {
      return apiError(response, 409, "This quotation has already received a school evaluation decision and cannot be silently replaced.");
    }
    const responseType = body.noBid === true ? "no_bid" : "quote";
    if (existing?.status === "submitted" && body.status === "draft" && responseType !== "no_bid") {
      return apiError(response, 409, "A submitted quotation cannot be withdrawn into a draft. Submit a complete revised quotation or contact the school.");
    }
    if (responseType === "no_bid") {
      const validReasonCodes = ["stock_unavailable", "outside_territory", "price_mismatch", "deadline_unavailable", "other"];
      const reasonCode = cleanText(body.reasonCode, 40) || "other";
      const reason = cleanText(body.reason, 500);
      if (!validReasonCodes.includes(reasonCode)) return apiError(response, 400, "Choose a valid standard no-bid reason.");
      if (reasonCode === "other" && reason.length < 5) return apiError(response, 400, "Add a short note when selecting Other as the no-bid reason.");
      const reasonLabels = {
        stock_unavailable: "Requested books unavailable",
        outside_territory: "Outside service territory",
        price_mismatch: "Unable to meet pricing requirement",
        deadline_unavailable: "Cannot meet response or delivery deadline",
        other: reason
      };
      const noBid = {
        id: existing?.id || `Q-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
        rfqId,
        supplierId: organizationId(user),
        supplierRole: user.role,
        version: (existing?.version || 0) + 1,
        status: "no_bid",
        reasonCode,
        reason: reason || reasonLabels[reasonCode],
        revisionHistory: existing ? [...(existing.revisionHistory || []), { version: existing.version, snapshot: quoteSnapshot(existing), createdAt: new Date().toISOString() }] : [],
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (existing) Object.assign(existing, noBid);
      else store.quotes.unshift(noBid);
      notify(rfq.ownerId || rfq.userId, "quote", "Supplier response received", `A supplier submitted a no-bid response for ${rfq.id}.`, rfq.id);
      audit(user, "quotation", noBid.id, "quotation.no_bid", existing || null, noBid);
      await persistStore();
      return sendJson(response, existing ? 200 : 201, { quote: noBid });
    }
    if (!Array.isArray(body.lines) || body.lines.length !== rfq.lines.length) {
      return apiError(response, 400, "Submit a response for every RFQ book line. Mark unavailable titles explicitly.");
    }
    const lineErrors = [];
    const quoteLines = body.lines.map((line, index) => {
      const requested = rfq.lines[index];
      const unitPrice = Number(line.unitPrice);
      const offeredQuantity = Number(line.offeredQuantity);
      const availability = cleanText(line.availability, 20);
      const rawMinimum = line.minimumOrderQuantity;
      const rawPack = line.packSize;
      if (rawMinimum != null && rawMinimum !== "" && !Number.isInteger(Number(rawMinimum))) {
        lineErrors.push(`Line ${index + 1} minimum order quantity must be a whole number.`);
      }
      if (rawPack != null && rawPack !== "" && (!Number.isInteger(Number(rawPack)) || Number(rawPack) < 1 || Number(rawPack) > 100000)) {
        lineErrors.push(`Line ${index + 1} pack size must be a whole number between 1 and 100,000.`);
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 10000000) lineErrors.push(`Line ${index + 1} needs a valid non-negative unit price.`);
      if (!Number.isInteger(offeredQuantity) || offeredQuantity < 0 || offeredQuantity > requested.quantity) lineErrors.push(`Line ${index + 1} offered quantity must be between 0 and ${requested.quantity}.`);
      if (!["full", "partial", "unavailable"].includes(availability)) lineErrors.push(`Line ${index + 1} needs a full, partial, or unavailable status.`);
      if (availability === "unavailable" && offeredQuantity !== 0) lineErrors.push(`Unavailable line ${index + 1} must have zero offered quantity.`);
      if (availability === "full" && offeredQuantity !== requested.quantity) lineErrors.push(`Full-availability line ${index + 1} must meet the requested quantity.`);
      if (availability === "partial" && (offeredQuantity < 1 || offeredQuantity >= requested.quantity)) lineErrors.push(`Partial-availability line ${index + 1} must offer between 1 and the requested quantity.`);
      return {
        rfqLineId: requested.id,
        title: requested.title,
        quantity: requested.quantity,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        offeredQuantity: Number.isInteger(offeredQuantity) ? offeredQuantity : 0,
        minimumOrderQuantity: Number.isInteger(Number(rawMinimum)) ? Number(rawMinimum) : 0,
        packSize: Number.isInteger(Number(rawPack)) && Number(rawPack) > 0 ? Number(rawPack) : 1,
        availability,
        note: cleanText(line.note, 300)
      };
    });
    quoteLines.forEach((line, index) => {
      if (line.minimumOrderQuantity < 0 || line.minimumOrderQuantity > line.offeredQuantity) lineErrors.push(`Line ${index + 1} minimum order quantity cannot exceed the offered quantity.`);
      if (line.availability !== "unavailable" && line.offeredQuantity > 0 &&
        (line.offeredQuantity < line.minimumOrderQuantity || line.offeredQuantity % line.packSize !== 0)) {
        lineErrors.push(`Line ${index + 1} offered quantity must meet the minimum and be a multiple of pack size ${line.packSize}.`);
      }
    });
    if (lineErrors.length) return apiError(response, 400, lineErrors.join(" "));
    const subtotal = quoteLines.reduce((total, line) => total + line.unitPrice * line.offeredQuantity, 0);
    const charges = ["discount", "tax", "freight", "packing"].reduce((acc, key) => {
      const value = Number(body[key] || 0);
      if (!Number.isFinite(value) || value < 0 || value > 100000000) throw Object.assign(new Error(`Enter a valid ${key} amount.`), { status: 400 });
      acc[key] = value;
      return acc;
    }, {});
    const deliveryMode = cleanText(body.deliveryMode, 30);
    if (deliveryMode && !["delivery", "local_delivery", "pickup"].includes(deliveryMode)) {
      return apiError(response, 400, "Choose delivery, local delivery, or school pickup.");
    }
    const quote = {
      id: existing?.id || `Q-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      rfqId,
      supplierId: organizationId(user),
      supplierRole: user.role,
      rfqVersion: rfq.version || 1,
      version: (existing?.version || 0) + 1,
      status: body.status === "draft" ? "draft" : "submitted",
      lines: quoteLines,
      subtotal,
      charges,
      total: Math.max(0, subtotal - charges.discount + charges.tax + charges.freight + charges.packing),
      deliveryEstimate: cleanText(body.deliveryEstimate, 100),
      validThrough: cleanText(body.validThrough, 40),
      deliveryMode: deliveryMode || "delivery",
      fulfillmentNotes: cleanText(body.fulfillmentNotes, 500),
      revisionHistory: existing ? [...(existing.revisionHistory || []), { version: existing.version, snapshot: quoteSnapshot(existing), createdAt: new Date().toISOString() }] : [],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (quote.validThrough && !/^\d{4}-\d{2}-\d{2}$/.test(quote.validThrough)) return apiError(response, 400, "Quote validity must be a valid date.");
    if (quote.validThrough && (!Number.isFinite(new Date(`${quote.validThrough}T23:59:59`).getTime()) || new Date(`${quote.validThrough}T23:59:59`) < new Date())) {
      return apiError(response, 400, "Quote validity must be a date in the future.");
    }
    if (quote.status === "submitted" && (!quote.deliveryEstimate || !quote.validThrough)) return apiError(response, 400, "Add a realistic delivery estimate and quote validity date before submitting.");
    if (existing) Object.assign(existing, quote);
    else store.quotes.unshift(quote);
    const submittedCount = store.quotes.filter(item => item.rfqId === rfq.id && item.status === "submitted").length;
    if (submittedCount && rfq.status === "published") rfq.status = "responses_received";
    rfq.updatedAt = new Date().toISOString();
    audit(user, "quotation", quote.id, quote.status === "draft" ? "quotation.draft_saved" : "quotation.submitted", existing?.revisionHistory?.at(-1)?.snapshot || null, quote);
    if (quote.status === "submitted") notify(rfq.ownerId || rfq.userId, "quote", "Quotation received", `${organizationName(user) || "A verified supply partner"} responded to ${rfq.id}.`, rfq.id);
    await persistStore();
    return sendJson(response, existing ? 200 : 201, { quote });
  }

  const quoteDecisionMatch = pathname.match(/^\/api\/quotes\/([^/]+)\/decision$/);
  if (quoteDecisionMatch && method === "PATCH") {
    if (!user) return apiError(response, 401, "Please log in to record a quotation decision.");
    if (!requireRole(user, ["school"], response)) return;
    if (!requirePermission(user, "quote.evaluate", response)) return;
    const quote = store.quotes.find(item => item.id === decodeURIComponent(quoteDecisionMatch[1]));
    const rfq = quote && store.rfqs.find(item => item.id === quote.rfqId);
    if (!quote || !rfq || (rfq.ownerId || rfq.userId) !== organizationId(user)) return apiError(response, 404, "Quotation not found in your RFQ.");
    if (quote.status !== "submitted") return apiError(response, 409, "Only a submitted quotation can be evaluated.");
    const body = await jsonBody();
    const decision = cleanText(body.decision, 40);
    if (!["selected_for_evaluation", "not_selected"].includes(decision)) return apiError(response, 400, "Choose selected_for_evaluation or not_selected.");
    const reason = cleanText(body.reason, 500);
    if (reason.length < 5) return apiError(response, 400, "Add a short, auditable reason for this evaluation decision.");
    const budgetOverrideReason = cleanText(body.budgetOverrideReason, 300);
    const exceedsBudget = rfq.budget != null && quote.total != null && quote.total > rfq.budget;
    if (decision === "selected_for_evaluation" && exceedsBudget && budgetOverrideReason.length < 10) {
      return apiError(response, 400, "This quotation exceeds the RFQ budget. Provide an authorised override reason of at least 10 characters to select it.");
    }
    const before = { status: quote.status, decisionReason: quote.decisionReason || "", budgetOverrideReason: quote.budgetOverrideReason || "" };
    quote.status = decision;
    quote.decisionReason = reason;
    quote.budgetOverrideReason = decision === "selected_for_evaluation" && exceedsBudget ? budgetOverrideReason : "";
    quote.decidedBy = user.id;
    quote.decidedAt = new Date().toISOString();
    quote.revisionHistory = [...(quote.revisionHistory || []), { version: quote.version, snapshot: before, createdAt: quote.decidedAt }];
    rfq.status = "under_review";
    notify(quote.supplierId, "decision", "School evaluation updated", `Your quotation for ${rfq.id} was ${decision.replace(/_/g, " ")}. This is an evaluation decision, not an order.`, rfq.id);
    audit(user, "quotation", quote.id, "quotation.evaluation_decided", before, { status: quote.status, reason, budgetOverrideReason: quote.budgetOverrideReason });
    await persistStore();
    return sendJson(response, 200, { quote: { id: quote.id, status: quote.status, decisionReason: reason, budgetOverrideReason: quote.budgetOverrideReason, decidedAt: quote.decidedAt }, commercialCommitment: false });
  }

  if (pathname === "/api/orders" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to view purchase orders.");
    if (!requireRole(user, ["school", "distributor", "retailer", "admin"], response)) return;
    if (!requirePermission(user, "po.view", response)) return;
    const items = user.role === "admin" ? store.orders :
      store.orders.filter(order => order.ownerId === organizationId(user) || order.supplierId === organizationId(user));
    return sendJson(response, 200, { items });
  }

  const orderCreateMatch = pathname.match(/^\/api\/rfqs\/([^/]+)\/orders$/);
  if (orderCreateMatch && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to create a purchase order.");
    if (!requireRole(user, ["school"], response)) return;
    if (!requirePermission(user, "po.request", response)) return;
    if (!accountVerified(user)) return apiError(response, 403, "A verified school account is required to create a purchase order.");
    const rfq = store.rfqs.find(item => item.id === decodeURIComponent(orderCreateMatch[1]));
    if (!rfq || (rfq.ownerId || rfq.userId) !== organizationId(user)) return apiError(response, 404, "RFQ not found in your organisation.");
    if (rfq.status === "cancelled") return apiError(response, 409, "A cancelled RFQ cannot be converted to a purchase order.");
    const body = await jsonBody();
    if (body.confirmed !== true) return apiError(response, 400, "Confirm that the school authorises this purchase order.");
    const quote = store.quotes.find(item => item.id === cleanText(body.quoteId, 100) && item.rfqId === rfq.id);
    if (!quote || quote.status !== "selected_for_evaluation") {
      return apiError(response, 409, "Only a quotation explicitly selected by the school for further evaluation can be ordered.");
    }
    if (quote.validThrough && new Date(`${quote.validThrough}T23:59:59.999Z`) < new Date()) {
      return apiError(response, 409, "This quotation has expired. Ask the supplier to submit a valid revision before creating a purchase order.");
    }
    if (store.orders.some(order => order.quoteId === quote.id && !["cancelled"].includes(order.status))) {
      return apiError(response, 409, "A purchase order already exists for this quotation.");
    }
    const requestedLines = Array.isArray(body.lines) ? body.lines : quote.lines.map(line => ({
      rfqLineId: line.rfqLineId,
      quantity: line.offeredQuantity
    }));
    const seen = new Set();
    const orderLines = [];
    for (const [index, line] of requestedLines.entries()) {
      const quoted = quote.lines.find(item => item.rfqLineId === cleanText(line.rfqLineId, 100));
      const quantity = Number(line.quantity);
      if (!quoted || seen.has(quoted.rfqLineId)) return apiError(response, 400, `Purchase order line ${index + 1} is invalid or duplicated.`);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > quoted.offeredQuantity) {
        return apiError(response, 400, `Purchase order line ${index + 1} must be between 1 and the quoted available quantity (${quoted.offeredQuantity}).`);
      }
      if (quantity < (quoted.minimumOrderQuantity || 0) || quantity % (quoted.packSize || 1) !== 0) {
        return apiError(response, 400, `Purchase order line ${index + 1} must meet the supplier minimum and use pack-size multiples of ${quoted.packSize || 1}.`);
      }
      seen.add(quoted.rfqLineId);
      orderLines.push({
        rfqLineId: quoted.rfqLineId,
        title: quoted.title,
        quantity,
        unitPrice: quoted.unitPrice,
        minimumOrderQuantity: quoted.minimumOrderQuantity || 0,
        packSize: quoted.packSize || 1,
        dispatchedQuantity: 0,
        receivedQuantity: 0
      });
    }
    if (!orderLines.length) return apiError(response, 400, "Select at least one quoted book line for this purchase order.");
    if (store.purchaseRequests.some(item => item.quoteId === quote.id && ["pending_approval", "pending_second_approval"].includes(item.status)) ||
      store.orders.some(item => item.quoteId === quote.id && !["cancelled"].includes(item.status))) {
      return apiError(response, 409, "A purchase order request or active purchase order already exists for this quotation.");
    }
    const purchaseRequest = {
      id: `POR-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
      rfqId: rfq.id,
      quoteId: quote.id,
      quoteVersion: quote.version,
      organizationId: organizationId(user),
      requestedBy: user.id,
      requestedByName: `${user.firstName} ${user.lastName}`.trim(),
      requestedByProfile: permissionProfile(user),
      supplierId: quote.supplierId,
      status: "pending_approval",
      lines: orderLines,
      expectedDeliveryDate: cleanText(body.expectedDeliveryDate, 10),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      decisions: []
    };
    if (purchaseRequest.expectedDeliveryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseRequest.expectedDeliveryDate) ||
      !Number.isFinite(new Date(`${purchaseRequest.expectedDeliveryDate}T00:00:00`).getTime()))) {
      return apiError(response, 400, "Expected delivery must be a valid calendar date.");
    }
    store.purchaseRequests.unshift(purchaseRequest);
    audit(user, "purchase_request", purchaseRequest.id, "purchase_order.requested", null, purchaseRequest);
    notify(organizationId(user), "purchase_request", "Purchase order approval requested", `${purchaseRequest.id} for ${rfq.id} needs two independent Owner or Manager approvals.`, purchaseRequest.id);
    await persistStore();
    return sendJson(response, 201, { purchaseRequest, paymentProcessed: false });
  }

  const purchaseApprovalMatch = pathname.match(/^\/api\/purchase-requests\/([^/]+)$/);
  if (purchaseApprovalMatch && method === "PATCH") {
    if (!user) return apiError(response, 401, "Please log in to review a purchase order request.");
    if (!requireRole(user, ["school"], response)) return;
    if (!["owner", "manager"].includes(permissionProfile(user))) return apiError(response, 403, "Only an Owner or Manager can approve a purchase order request.");
    if (!requirePermission(user, "po.approve", response)) return;
    const requestItem = store.purchaseRequests.find(item =>
      item.id === decodeURIComponent(purchaseApprovalMatch[1]) && item.organizationId === organizationId(user)
    );
    if (!requestItem) return apiError(response, 404, "Purchase order request not found in your organisation.");
    if (!["pending_approval", "pending_second_approval"].includes(requestItem.status)) return apiError(response, 409, "This purchase order request is no longer awaiting approval.");
    if (requestItem.requestedBy === user.id) return apiError(response, 403, "The requester cannot approve their own purchase order request.");
    const approvalStage = requestItem.status;
    const body = await jsonBody();
    if (requestItem.status !== approvalStage) return apiError(response, 409, "Another approval decision has already advanced this request.");
    const decision = cleanText(body.decision, 20);
    const note = cleanText(body.note, 500);
    if (!["approve", "reject"].includes(decision)) return apiError(response, 400, "Choose approve or reject.");
    if (note.length < 10) return apiError(response, 400, "Record an approval or rejection note of at least 10 characters.");
    if (!Array.isArray(requestItem.decisions)) requestItem.decisions = [];
    if (requestItem.decisions.some(item => item.actorId === user.id)) return apiError(response, 403, "Each approval must come from a different Owner or Manager.");
    const requiredDecisionCount = approvalStage === "pending_approval" ? 0 : 1;
    if (requestItem.decisions.filter(item => item.decision === "approve").length !== requiredDecisionCount) {
      return apiError(response, 409, "This purchase order request has an inconsistent approval history and cannot be decided.");
    }
    const quote = store.quotes.find(item => item.id === requestItem.quoteId && item.rfqId === requestItem.rfqId);
    if (decision === "approve" && (!quote || quote.status !== "selected_for_evaluation" || (quote.validThrough && new Date(`${quote.validThrough}T23:59:59.999Z`) < new Date()))) {
      return apiError(response, 409, "The source quotation is no longer selected or valid; request a fresh supplier quotation.");
    }
    if (decision === "approve" && store.orders.some(order => order.quoteId === quote.id && order.status !== "cancelled")) {
      return apiError(response, 409, "A purchase order already exists for this quotation.");
    }
    const requestBefore = JSON.parse(JSON.stringify(requestItem));
    requestItem.decisions.push({ actorId: user.id, profile: permissionProfile(user), decision, note, decidedAt: new Date().toISOString() });
    requestItem.updatedAt = new Date().toISOString();
    if (decision === "reject") {
      requestItem.status = "rejected";
      const auditEvent = audit(user, "purchase_request", requestItem.id, "purchase_order.request_rejected", { status: approvalStage }, requestItem);
      const notification = notify(requestItem.requestedBy, "purchase_request", "Purchase order request rejected", `${requestItem.id}: ${note}`, requestItem.id);
      try {
        await persistStore();
      } catch (error) {
        for (const key of Object.keys(requestItem)) delete requestItem[key];
        Object.assign(requestItem, requestBefore);
        store.audit = store.audit.filter(item => item.id !== auditEvent.id);
        store.notifications = store.notifications.filter(item => item.id !== notification.id);
        throw error;
      }
      return sendJson(response, 200, { purchaseRequest: requestItem, order: null });
    }
    if (approvalStage === "pending_approval") {
      requestItem.status = "pending_second_approval";
      requestItem.firstApprovedBy = user.id;
      requestItem.firstApprovedByName = `${user.firstName} ${user.lastName}`.trim();
      const auditEvent = audit(user, "purchase_request", requestItem.id, "purchase_order.first_approval_recorded", { status: approvalStage }, requestItem);
      const notification = notify(requestItem.requestedBy, "purchase_request", "First purchase order approval recorded", `${requestItem.id} now needs approval from a second, different Owner or Manager.`, requestItem.id);
      try {
        await persistStore();
      } catch (error) {
        for (const key of Object.keys(requestItem)) delete requestItem[key];
        Object.assign(requestItem, requestBefore);
        store.audit = store.audit.filter(item => item.id !== auditEvent.id);
        store.notifications = store.notifications.filter(item => item.id !== notification.id);
        throw error;
      }
      return sendJson(response, 200, { purchaseRequest: requestItem, order: null, awaitingSecondApproval: true });
    }
    const owner = organizationOwner(user);
    const supplier = store.users.find(item => item.id === quote.supplierId);
    const now = new Date().toISOString();
    const order = {
      id: `PO-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
      rfqId: requestItem.rfqId,
      quoteId: quote.id,
      quoteVersion: quote.version,
      ownerId: requestItem.organizationId,
      supplierId: quote.supplierId,
      supplierName: supplier?.organizationName || "Approved supply partner",
      schoolName: owner.organizationName,
      status: "issued",
      lines: requestItem.lines.map(line => ({ ...line })),
      deliveryMode: quote.deliveryMode || "delivery",
      deliveryEstimate: quote.deliveryEstimate || "",
      quoteTermsSnapshot: { subtotal: quote.subtotal, total: quote.total, charges: quote.charges, validThrough: quote.validThrough },
      expectedDeliveryDate: requestItem.expectedDeliveryDate,
      purchaseRequestId: requestItem.id,
      approvedBy: user.id,
      approvalActors: requestItem.decisions.map(item => item.actorId),
      fulfilmentHistory: [{ status: "issued", actorId: user.id, note: `Approved request ${requestItem.id}: ${note}`, createdAt: now }],
      createdAt: now,
      updatedAt: now
    };
    requestItem.status = "approved";
    requestItem.approvedBy = user.id;
    requestItem.approvedByName = `${user.firstName} ${user.lastName}`.trim();
    requestItem.approvedByProfile = permissionProfile(user);
    requestItem.approvedAt = now;
    requestItem.orderId = order.id;
    store.orders.unshift(order);
    const requestAudit = audit(user, "purchase_request", requestItem.id, "purchase_order.request_approved", { status: approvalStage }, requestItem);
    const orderAudit = audit(user, "purchase_order", order.id, "order.issued_after_approval", null, order);
    const requesterNotification = notify(requestItem.requestedBy, "purchase_request", "Purchase order approved", `${order.id} was issued after your request was approved.`, order.id);
    const supplierNotification = notify(order.supplierId, "order", "Purchase order received", `${order.id} was issued for ${requestItem.rfqId}. No payment was processed by GoErudite.`, order.id);
    try {
      await persistStore();
    } catch (error) {
      for (const key of Object.keys(requestItem)) delete requestItem[key];
      Object.assign(requestItem, requestBefore);
      store.orders.splice(store.orders.indexOf(order), 1);
      const auditIds = new Set([requestAudit.id, orderAudit.id]);
      const notificationIds = new Set([requesterNotification.id, supplierNotification.id]);
      store.audit = store.audit.filter(item => !auditIds.has(item.id));
      store.notifications = store.notifications.filter(item => !notificationIds.has(item.id));
      throw error;
    }
    return sendJson(response, 200, { purchaseRequest: requestItem, order, paymentProcessed: false });
  }

  const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && method === "PATCH") {
    if (!user) return apiError(response, 401, "Please log in to amend or cancel a purchase order.");
    if (!requireRole(user, ["school"], response)) return;
    if (!requirePermission(user, "po.request", response)) return;
    const order = store.orders.find(item => item.id === decodeURIComponent(orderMatch[1]) && item.ownerId === organizationId(user));
    if (!order) return apiError(response, 404, "Purchase order not found in your organisation.");
    const body = await jsonBody();
    const action = cleanText(body.action, 20);
    const reason = cleanText(body.reason, 500);
    if (reason.length < 10) return apiError(response, 400, "Provide an auditable reason of at least 10 characters.");
    if (action === "cancel") {
      if (!["issued", "accepted"].includes(order.status) || order.lines.some(line => line.receivedQuantity > 0)) {
        return apiError(response, 409, "A purchase order can only be cancelled before dispatch or receipt.");
      }
      const before = { status: order.status, lines: order.lines.map(line => ({ ...line })) };
      order.status = "cancelled";
      order.cancelledAt = new Date().toISOString();
      order.cancellationReason = reason;
      order.updatedAt = order.cancelledAt;
      order.fulfilmentHistory.push({ status: "cancelled", actorId: user.id, note: reason, createdAt: order.updatedAt });
      audit(user, "purchase_order", order.id, "order.cancelled", before, { status: order.status, reason });
      notify(order.supplierId, "order", "Purchase order cancelled", `${order.id} was cancelled by the school: ${reason}`, order.id);
      await persistStore();
      return sendJson(response, 200, { order });
    }
    if (action !== "amend") return apiError(response, 400, "Choose amend or cancel.");
    if (!["issued", "accepted"].includes(order.status) || order.lines.some(line => line.receivedQuantity > 0)) {
      return apiError(response, 409, "A purchase order can only be amended before dispatch or receipt.");
    }
    const quote = store.quotes.find(item => item.id === order.quoteId && item.supplierId === order.supplierId);
    if (!quote) return apiError(response, 409, "The source supplier quotation is unavailable; this order cannot be amended safely.");
    if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > quote.lines.length) {
      return apiError(response, 400, "An amendment must include at least one valid quoted line.");
    }
    const updatedLines = [];
    const seenLines = new Set();
    for (const [index, line] of body.lines.entries()) {
      const quoteLine = quote.lines.find(item => item.rfqLineId === cleanText(line.rfqLineId, 100));
      const quantity = Number(line.quantity);
      if (!quoteLine || seenLines.has(quoteLine.rfqLineId) || !Number.isInteger(quantity) ||
        quantity < 1 || quantity > quoteLine.offeredQuantity) {
        return apiError(response, 400, `Amendment line ${index + 1} must reference a unique quoted line and a quantity within the supplier's offered amount.`);
      }
      if (quantity < (quoteLine.minimumOrderQuantity || 0) || quantity % (quoteLine.packSize || 1) !== 0) {
        return apiError(response, 400, `Amendment line ${index + 1} must meet the supplier minimum and use pack-size multiples of ${quoteLine.packSize || 1}.`);
      }
      seenLines.add(quoteLine.rfqLineId);
      updatedLines.push({
        rfqLineId: quoteLine.rfqLineId,
        title: quoteLine.title,
        quantity,
        unitPrice: quoteLine.unitPrice,
        minimumOrderQuantity: quoteLine.minimumOrderQuantity || 0,
        packSize: quoteLine.packSize || 1,
        dispatchedQuantity: 0,
        receivedQuantity: 0
      });
    }
    const expectedDeliveryDate = Object.hasOwn(body, "expectedDeliveryDate")
      ? cleanText(body.expectedDeliveryDate, 10)
      : order.expectedDeliveryDate || "";
    if (expectedDeliveryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDeliveryDate) ||
      !Number.isFinite(new Date(`${expectedDeliveryDate}T00:00:00`).getTime()))) {
      return apiError(response, 400, "Expected delivery must be a valid calendar date.");
    }
    const before = { status: order.status, version: order.version || 1, lines: order.lines.map(line => ({ ...line })), expectedDeliveryDate: order.expectedDeliveryDate || "" };
    order.amendmentHistory = [...(order.amendmentHistory || []), {
      version: order.version || 1,
      snapshot: before,
      reason,
      changedBy: user.id,
      createdAt: new Date().toISOString()
    }];
    order.version = (order.version || 1) + 1;
    order.lines = updatedLines;
    order.expectedDeliveryDate = expectedDeliveryDate;
    order.status = "issued";
    order.updatedAt = new Date().toISOString();
    order.fulfilmentHistory.push({ status: "amended", actorId: user.id, note: reason, createdAt: order.updatedAt });
    audit(user, "purchase_order", order.id, "order.amended", before, { version: order.version, lines: order.lines, expectedDeliveryDate });
    notify(order.supplierId, "order", "Purchase order amendment requires acknowledgement", `${order.id} was amended to version ${order.version}. Please accept or reject the updated order.`, order.id);
    await persistStore();
    return sendJson(response, 200, { order });
  }

  const fulfilmentMatch = pathname.match(/^\/api\/orders\/([^/]+)\/fulfilment$/);
  if (fulfilmentMatch && method === "PATCH") {
    if (!user) return apiError(response, 401, "Please log in to update purchase-order fulfilment.");
    if (!requireRole(user, ["distributor", "retailer"], response)) return;
    if (!requirePermission(user, "po.fulfil", response)) return;
    const order = store.orders.find(item => item.id === decodeURIComponent(fulfilmentMatch[1]) && item.supplierId === organizationId(user));
    if (!order) return apiError(response, 404, "Purchase order not found in your supplier account.");
    const body = await jsonBody();
    const nextStatus = cleanText(body.status, 30);
    const transitions = {
      issued: ["accepted", "rejected", "exception"],
      accepted: ["picking", "exception"],
      picking: ["packed", "exception"],
      packed: ["dispatched", "exception"],
      dispatched: ["delivery_reported", "exception"],
      partially_received: ["dispatched", "exception"]
    };
    if (!transitions[order.status]?.includes(nextStatus)) {
      return apiError(response, 409, `Cannot change purchase order from ${order.status} to ${nextStatus || "unknown"}.`);
    }
    const note = cleanText(body.note, 500);
    if (nextStatus === "rejected" && note.length < 10) return apiError(response, 400, "Explain why the supplier cannot accept this purchase order in at least 10 characters.");
    if (nextStatus === "exception" && note.length < 5) return apiError(response, 400, "Describe the fulfilment issue before reporting an exception.");
    let dispatchLines = null;
    if (nextStatus === "dispatched") {
      const previous = order.lines.map(line => line.dispatchedQuantity || 0);
      if (Array.isArray(body.lines)) {
        if (body.lines.length !== order.lines.length) return apiError(response, 400, "Provide a cumulative dispatch quantity for every purchase-order line.");
        dispatchLines = [];
        for (const [index, line] of body.lines.entries()) {
          const orderLine = order.lines.find(item => item.rfqLineId === cleanText(line.rfqLineId, 100));
          const quantity = Number(line.dispatchedQuantity);
          if (!orderLine || dispatchLines.some(item => item.rfqLineId === orderLine.rfqLineId) ||
            !Number.isInteger(quantity) || quantity < (orderLine.dispatchedQuantity || 0) || quantity > orderLine.quantity) {
            return apiError(response, 400, `Dispatch line ${index + 1} must be cumulative, whole-number, and within the ordered quantity.`);
          }
          if (quantity > (orderLine.dispatchedQuantity || 0) &&
            (((orderLine.dispatchedQuantity || 0) === 0 && quantity < (orderLine.minimumOrderQuantity || 0)) ||
              (quantity - (orderLine.dispatchedQuantity || 0)) % (orderLine.packSize || 1) !== 0)) {
            return apiError(response, 400, `Dispatch line ${index + 1} must meet the order minimum on its first shipment and ship in pack-size multiples of ${orderLine.packSize || 1}.`);
          }
          dispatchLines.push({ rfqLineId: orderLine.rfqLineId, dispatchedQuantity: quantity });
        }
        if (dispatchLines.every((line, index) => line.dispatchedQuantity === previous[index])) {
          return apiError(response, 400, "Dispatch quantities must increase at least one purchase-order line.");
        }
      } else {
        dispatchLines = order.lines.map(line => ({ rfqLineId: line.rfqLineId, dispatchedQuantity: line.quantity }));
      }
    }
    const before = { status: order.status, lines: order.lines.map(line => ({ ...line })) };
    order.status = nextStatus;
    if (dispatchLines) {
      const dispatchMap = new Map(dispatchLines.map(line => [line.rfqLineId, line.dispatchedQuantity]));
      order.lines.forEach(line => { line.dispatchedQuantity = dispatchMap.get(line.rfqLineId); });
      order.dispatchHistory = [...(order.dispatchHistory || []), {
        lines: dispatchLines,
        trackingReference: cleanText(body.trackingReference, 120),
        courier: cleanText(body.courier, 120),
        actorId: user.id,
        createdAt: new Date().toISOString()
      }];
    }
    order.updatedAt = new Date().toISOString();
    order.fulfilmentHistory.push({
      status: nextStatus,
      actorId: user.id,
      note: note || cleanText(body.trackingReference, 120),
      trackingReference: cleanText(body.trackingReference, 120),
      courier: cleanText(body.courier, 120),
      createdAt: order.updatedAt
    });
    audit(user, "purchase_order", order.id, "order.fulfilment_updated", before, { status: nextStatus, note });
    notify(order.ownerId, "order", `Purchase order ${nextStatus.replace(/_/g, " ")}`, `${order.id} has a supplier fulfilment update${note ? `: ${note}` : "."}`, order.id);
    await persistStore();
    return sendJson(response, 200, { order });
  }

  const receiptMatch = pathname.match(/^\/api\/orders\/([^/]+)\/receipt$/);
  if (receiptMatch && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to confirm a purchase-order delivery.");
    if (!requireRole(user, ["school"], response)) return;
    if (!requirePermission(user, "po.request", response)) return;
    const order = store.orders.find(item => item.id === decodeURIComponent(receiptMatch[1]) && item.ownerId === organizationId(user));
    if (!order) return apiError(response, 404, "Purchase order not found in your organisation.");
    if (order.status !== "delivery_reported") return apiError(response, 409, "The supplier must report dispatch and delivery before the school can confirm receipt.");
    const body = await jsonBody();
    if (!Array.isArray(body.lines) || body.lines.length !== order.lines.length) return apiError(response, 400, "Confirm a received quantity for every purchase-order line.");
    const received = new Map();
    for (const [index, line] of body.lines.entries()) {
      const orderLine = order.lines.find(item => item.rfqLineId === cleanText(line.rfqLineId, 100));
      const quantity = Number(line.receivedQuantity);
      if (!orderLine || received.has(orderLine.rfqLineId) || !Number.isInteger(quantity) ||
        quantity < orderLine.receivedQuantity || quantity > (orderLine.dispatchedQuantity ?? orderLine.quantity)) {
        return apiError(response, 400, `Receipt line ${index + 1} must be a whole-number total between previously received quantity and dispatched quantity.`);
      }
      received.set(orderLine.rfqLineId, quantity);
    }
    if ([...received.values()].every(quantity => quantity === 0)) return apiError(response, 400, "Confirm at least one received copy.");
    const before = { status: order.status, lines: order.lines.map(line => ({ ...line })) };
    order.lines.forEach(line => { line.receivedQuantity = received.get(line.rfqLineId); });
    const complete = order.lines.every(line => line.receivedQuantity === line.quantity);
    order.status = complete ? "delivered" : "partially_received";
    order.updatedAt = new Date().toISOString();
    if (complete) order.deliveredAt = order.updatedAt;
    order.fulfilmentHistory.push({
      status: order.status,
      actorId: user.id,
      note: cleanText(body.note, 500),
      createdAt: order.updatedAt
    });
    audit(user, "purchase_order", order.id, "order.receipt_confirmed", before, { status: order.status, lines: order.lines });
    notify(order.supplierId, "order", `School confirmed ${order.status.replace(/_/g, " ")}`, `${order.id} receipt quantities were recorded by the school.`, order.id);
    await persistStore();
    return sendJson(response, 200, { order, paymentProcessed: false });
  }

  const disputeCreateMatch = pathname.match(/^\/api\/orders\/([^/]+)\/disputes$/);
  if (disputeCreateMatch && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to report a delivery dispute.");
    if (!requireRole(user, ["school"], response)) return;
    if (!requirePermission(user, "po.request", response)) return;
    const order = store.orders.find(item => item.id === decodeURIComponent(disputeCreateMatch[1]) && item.ownerId === organizationId(user));
    if (!order) return apiError(response, 404, "Purchase order not found in your organisation.");
    if (!["partially_received", "delivered"].includes(order.status)) return apiError(response, 409, "Delivery disputes can be filed only after recording a partial or complete receipt.");
    const body = await jsonBody();
    const lineId = cleanText(body.rfqLineId, 100);
    const line = order.lines.find(item => item.rfqLineId === lineId);
    const type = cleanText(body.type, 20);
    const quantity = Number(body.quantity);
    const description = cleanText(body.description, 1000);
    if (!line || !["wrong", "damaged", "missing"].includes(type) ||
      !Number.isInteger(quantity) || quantity < 1 || description.length < 10) {
      return apiError(response, 400, "Choose an order line and dispute type, enter a positive whole-number quantity, and describe the issue in at least 10 characters.");
    }
    const alreadyDisputed = store.disputes.filter(item => item.orderId === order.id && item.rfqLineId === lineId &&
      item.type === type && !["rejected", "closed"].includes(item.status)).reduce((total, item) => total + item.quantity, 0);
    const availableQuantity = type === "missing"
      ? line.quantity - line.receivedQuantity
      : line.receivedQuantity - alreadyDisputed;
    if (quantity > availableQuantity) {
      return apiError(response, 400, `${type === "missing" ? "Missing" : "Received"} dispute quantity cannot exceed the undisputed quantity (${Math.max(0, availableQuantity)}).`);
    }
    const now = new Date().toISOString();
    const dispute = {
      id: `DSP-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
      orderId: order.id,
      rfqId: order.rfqId,
      ownerId: order.ownerId,
      supplierId: order.supplierId,
      schoolName: order.schoolName,
      supplierName: order.supplierName,
      rfqLineId: lineId,
      title: line.title,
      type,
      quantity,
      description,
      status: "open",
      history: [{ status: "open", actorId: user.id, note: description, createdAt: now }],
      createdAt: now,
      updatedAt: now
    };
    store.disputes.unshift(dispute);
    audit(user, "delivery_dispute", dispute.id, "dispute.opened", null, dispute);
    notify(order.supplierId, "dispute", "School reported a delivery dispute", `${dispute.id} concerns ${quantity} ${type} copy/copies of ${line.title}.`, dispute.id);
    notifyAdmin("Delivery dispute requires review", `${dispute.id} was opened for purchase order ${order.id}.`, dispute.id);
    await persistStore();
    return sendJson(response, 201, { dispute });
  }

  const disputeMatch = pathname.match(/^\/api\/disputes\/([^/]+)$/);
  if (disputeMatch && method === "PATCH") {
    if (!user) return apiError(response, 401, "Please log in to update a delivery dispute.");
    if (["distributor", "retailer"].includes(user.role) && !requirePermission(user, "dispute.respond", response)) return;
    const dispute = store.disputes.find(item => item.id === decodeURIComponent(disputeMatch[1]));
    if (!dispute) return apiError(response, 404, "Delivery dispute not found.");
    const body = await jsonBody();
    const action = cleanText(body.action, 30);
    const note = cleanText(body.note, 1000);
    const before = { status: dispute.status, supplierResponse: dispute.supplierResponse || "", resolution: dispute.resolution || "" };
    if (["distributor", "retailer"].includes(user.role) && dispute.supplierId === organizationId(user) && action === "respond") {
      if (!["open", "needs_information"].includes(dispute.status) || note.length < 10) {
        return apiError(response, 409, "Add a response of at least 10 characters while the dispute is open or awaiting information.");
      }
      dispute.status = "responded";
      dispute.supplierResponse = note;
    } else if (user.role === "admin" && action === "resolve") {
      const decision = cleanText(body.decision, 20);
      if (!["upheld", "rejected"].includes(decision) || note.length < 10 ||
        !["open", "responded", "needs_information"].includes(dispute.status)) {
        return apiError(response, 400, "Choose upheld or rejected, provide a resolution of at least 10 characters, and resolve an active dispute.");
      }
      dispute.status = "resolved";
      dispute.decision = decision;
      dispute.resolution = note;
      dispute.resolvedBy = user.id;
      dispute.resolvedAt = new Date().toISOString();
    } else if (user.role === "admin" && action === "request_information") {
      if (!["open", "responded"].includes(dispute.status) || note.length < 10) {
        return apiError(response, 400, "Explain the information request in at least 10 characters.");
      }
      dispute.status = "needs_information";
      dispute.informationRequest = note;
    } else if (user.role === "school" && dispute.ownerId === organizationId(user) && action === "close") {
      if (dispute.status !== "resolved") return apiError(response, 409, "Only a resolved delivery dispute can be closed by the school.");
      dispute.status = "closed";
    } else {
      return apiError(response, 403, "Your role or organisation is not permitted to make this dispute transition.");
    }
    dispute.updatedAt = new Date().toISOString();
    dispute.history.push({ status: dispute.status, actorId: user.id, note, createdAt: dispute.updatedAt });
    audit(user, "delivery_dispute", dispute.id, `dispute.${action}`, before, {
      status: dispute.status,
      decision: dispute.decision || "",
      note
    });
    notify(dispute.ownerId, "dispute", `Delivery dispute ${dispute.status.replace(/_/g, " ")}`, `${dispute.id} has been updated.`, dispute.id);
    notify(dispute.supplierId, "dispute", `Delivery dispute ${dispute.status.replace(/_/g, " ")}`, `${dispute.id} has been updated.`, dispute.id);
    await persistStore();
    return sendJson(response, 200, { dispute });
  }

  if (pathname === "/api/inventory" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to view your inventory.");
    if (!requireRole(user, ["distributor", "retailer"], response)) return;
    if (!requirePermission(user, "inventory.view", response)) return;
    return sendJson(response, 200, { items: store.inventory.filter(item => item.ownerId === organizationId(user)).sort((a, b) => a.title.localeCompare(b.title)) });
  }

  if (pathname === "/api/inventory" && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to update stock.");
    if (!requireRole(user, ["distributor", "retailer"], response)) return;
    if (!requirePermission(user, "inventory.manage", response)) return;
    const body = await jsonBody();
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 500) return apiError(response, 400, "Add between 1 and 500 stock lines.");
    const errors = [];
    const updates = [];
    const seenIsbns = new Set();
    const seenTitles = new Set();
    for (const [index, item] of body.items.entries()) {
      const title = cleanText(item.title, 180);
      const isbn = cleanText(item.isbn, 30).replace(/[\s-]/g, "");
      const availableQuantity = Number(item.availableQuantity);
      const reservedQuantity = Number(item.reservedQuantity || 0);
      const damagedQuantity = Number(item.damagedQuantity || 0);
      const lowStockThreshold = item.lowStockThreshold === "" || item.lowStockThreshold == null ? 5 : Number(item.lowStockThreshold);
      if (!title) errors.push(`Row ${index + 1} needs a title.`);
      if (isbn && !/^(?:\d{9}[\dX]|\d{13})$/i.test(isbn)) errors.push(`Row ${index + 1} has an invalid ISBN.`);
      if (![availableQuantity, reservedQuantity, damagedQuantity, lowStockThreshold].every(value => Number.isInteger(value) && value >= 0 && value <= 10000000)) errors.push(`Row ${index + 1} stock quantities and low-stock threshold must be whole numbers between 0 and 10,000,000.`);
      const normalizedIsbn = isbn.toUpperCase();
      const normalizedTitle = title.toLocaleLowerCase();
      if (normalizedIsbn && seenIsbns.has(normalizedIsbn)) errors.push(`Row ${index + 1} duplicates an ISBN in this update.`);
      if (normalizedTitle && seenTitles.has(normalizedTitle)) errors.push(`Row ${index + 1} duplicates a title in this update.`);
      if (normalizedIsbn) seenIsbns.add(normalizedIsbn);
      if (normalizedTitle) seenTitles.add(normalizedTitle);
      const catalogBook = matchBook(item) || (isbn && catalog.find(book => book.isbn.replace(/[- ]/g, "").toUpperCase() === isbn.toUpperCase()));
      updates.push({
        id: crypto.randomUUID(),
        expectedUpdatedAt: typeof item.expectedUpdatedAt === "string" ? item.expectedUpdatedAt : undefined,
        ownerId: organizationId(user),
        bookId: catalogBook?.id || "",
        title,
        isbn,
        edition: cleanText(item.edition, 80) || catalogBook?.edition || "",
        session: cleanText(item.session, 30) || catalogBook?.session || organizationProfile(user).academicSession || "",
        source: cleanText(item.source, 80) || "Own stock",
        location: cleanText(item.location, 120) || organizationProfile(user).city || "",
        availableQuantity,
        reservedQuantity,
        damagedQuantity,
        lowStockThreshold,
        updatedAt: new Date().toISOString(),
        updateReason: cleanText(item.reason, 300) || "Stock count update"
      });
    }
    if (errors.length) return sendJson(response, 400, { error: errors.slice(0, 50).join(" "), errors });
    for (const next of updates) {
      const existing = store.inventory.find(item => item.ownerId === organizationId(user) && (
        (next.isbn && item.isbn && item.isbn.toUpperCase() === next.isbn.toUpperCase()) ||
        (!next.isbn && item.title.toLowerCase() === next.title.toLowerCase())
      ));
      if (existing && (!next.expectedUpdatedAt || existing.updatedAt !== next.expectedUpdatedAt)) {
        return apiError(response, 409, `Inventory line "${existing.title}" changed or was not loaded before this update. Refresh the inventory and retry.`);
      }
    }
    const changed = [];
    for (const next of updates) {
      const existing = store.inventory.find(item => item.ownerId === organizationId(user) && (
        (next.isbn && item.isbn && item.isbn.toUpperCase() === next.isbn.toUpperCase()) ||
        (!next.isbn && item.title.toLowerCase() === next.title.toLowerCase())
      ));
      if (existing && (!next.expectedUpdatedAt || existing.updatedAt !== next.expectedUpdatedAt)) {
        return apiError(response, 409, `Inventory line "${existing.title}" changed or was not loaded before this update. Refresh the inventory and retry.`);
      }
      const before = existing ? { ...existing } : null;
      const { expectedUpdatedAt, ...inventoryRecord } = next;
      const movement = {
        actorId: user.id,
        reason: inventoryRecord.updateReason,
        before: before ? {
          availableQuantity: before.availableQuantity,
          reservedQuantity: before.reservedQuantity,
          damagedQuantity: before.damagedQuantity
        } : null,
        after: {
          availableQuantity: inventoryRecord.availableQuantity,
          reservedQuantity: inventoryRecord.reservedQuantity,
          damagedQuantity: inventoryRecord.damagedQuantity
        },
        createdAt: inventoryRecord.updatedAt
      };
      const movementHistory = [...(existing?.movementHistory || []), movement].slice(-100);
      if (existing) Object.assign(existing, { ...inventoryRecord, id: existing.id, movementHistory });
      else {
        inventoryRecord.movementHistory = movementHistory;
        store.inventory.push(inventoryRecord);
      }
      const saved = existing || inventoryRecord;
      changed.push(saved);
      audit(user, "inventory", saved.id, "inventory.adjusted", before, saved);
    }
    await persistStore();
    return sendJson(response, 200, { items: changed });
  }

  if (pathname === "/api/inventory/import" && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to import inventory.");
    if (!requireRole(user, ["distributor", "retailer"], response)) return;
    if (!requirePermission(user, "inventory.manage", response)) return;
    const body = await jsonBody();
    let records;
    try {
      records = importRecords(body, body.filename);
    } catch (error) {
      return apiError(response, error.status || 400, error.message);
    }
    if (!records.length) return apiError(response, 400, "The inventory CSV must contain at least one stock row.");
    const normalized = records.map(record => ({
      title: record.title || record.booktitle,
      isbn: record.isbn || record.isbn13 || "",
      availableQuantity: record.availablequantity || record.quantity || "",
      reservedQuantity: record.reservedquantity || 0,
      damagedQuantity: record.damagedquantity || 0,
      lowStockThreshold: record.lowstockthreshold ?? 5,
      edition: record.edition || "",
      session: record.session || "",
      location: record.location || record.warehouse || "",
      sourceRow: record.__row,
      sourceSheet: record.__sheet,
      reason: "CSV inventory import"
    }));
    const validationErrors = [];
    const seenIsbns = new Set();
    const seenTitles = new Set();
    normalized.forEach((line, index) => {
      const row = line.sourceSheet ? `${line.sourceSheet}!${line.sourceRow}` : index + 2;
      const quantities = ["availableQuantity", "reservedQuantity", "damagedQuantity", "lowStockThreshold"]
        .map(key => Number(line[key] ?? (key === "lowStockThreshold" ? 5 : 0)));
      if (!cleanText(line.title, 180)) validationErrors.push({ row, message: "Missing title." });
      if (line.availableQuantity === "" || line.availableQuantity == null) validationErrors.push({ row, message: "availableQuantity is required." });
      if (!quantities.every(quantity => Number.isInteger(quantity) && quantity >= 0 && quantity <= 10000000)) {
        validationErrors.push({ row, message: "Stock quantities and lowStockThreshold must be whole numbers from 0 to 10,000,000." });
      }
      const isbn = cleanText(line.isbn, 30).replace(/[\s-]/g, "").toUpperCase();
      const title = cleanText(line.title, 180).toLocaleLowerCase();
      if (isbn && !/^(?:\d{9}[\dX]|\d{13})$/i.test(isbn)) validationErrors.push({ row, message: "Invalid ISBN." });
      if (isbn && seenIsbns.has(isbn)) validationErrors.push({ row, message: "Duplicate ISBN in this import." });
      if (title && seenTitles.has(title)) validationErrors.push({ row, message: "Duplicate title in this import." });
      if (isbn) seenIsbns.add(isbn);
      if (title) seenTitles.add(title);
    });
    if (validationErrors.length) return sendJson(response, 400, { error: `${validationErrors.length} CSV row(s) need correction.`, errors: validationErrors });
    const saved = await handleInventoryImport(user, normalized);
    return sendJson(response, 200, { imported: saved.length, items: saved, errors: [] });
  }

  if (pathname === "/api/catalogue/submissions" && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to suggest a catalogue title.");
    if (!requireRole(user, ["school", "distributor", "retailer", "publisher", "other"], response)) return;
    if (!requirePermission(user, "catalogue.manage", response)) return;
    const body = await jsonBody();
    const metadata = catalogueMetadata(body, {}, user);
    const metadataError = catalogueMetadataError(metadata, true);
    if (metadataError) return apiError(response, 400, metadataError);
    const normalizedIsbn = metadata.isbn.replace(/[\s-]/g, "").toUpperCase();
    if (store.publisherCatalog.some(item => item.isbn.replace(/[\s-]/g, "").toUpperCase() === normalizedIsbn)) {
      return apiError(response, 409, "This ISBN is already in a catalogue submission. Search the catalogue before submitting again.");
    }
    if (catalog.some(book => book.isbn.replace(/[\s-]/g, "").toUpperCase() === normalizedIsbn)) {
      return apiError(response, 409, "This ISBN is already listed in the verified catalogue.");
    }
    const now = new Date().toISOString();
    const record = {
      ...metadata,
      id: `SUB-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      ownerId: organizationId(user),
      submitterRole: user.role,
      submitterOrganization: organizationName(user) || `${user.firstName} ${user.lastName}`,
      status: "pending_review",
      createdAt: now,
      updatedAt: now,
      revisions: []
    };
    store.publisherCatalog.unshift(record);
    audit(user, "catalogue_submission", record.id, "catalogue.suggestion_submitted", null, record);
    notifyAdmin("Book suggestion awaiting review", `${record.title} was submitted by ${record.submitterOrganization} (${user.role}).`, record.id);
    notify(user.id, "catalogue", "Book suggestion submitted", `${record.title} is waiting for administrator review. It is not public until approved.`, record.id);
    await persistStore();
    return sendJson(response, 201, { item: record, message: "Book suggestion submitted for administrator review." });
  }

  const catalogueSubmissionMatch = pathname.match(/^\/api\/catalogue\/submissions\/([^/]+)$/);
  if (catalogueSubmissionMatch && method === "PATCH") {
    if (!user) return apiError(response, 401, "Please log in to update your book suggestion.");
    if (!requireRole(user, ["school", "distributor", "retailer", "publisher", "other"], response)) return;
    const item = store.publisherCatalog.find(record =>
      record.id === decodeURIComponent(catalogueSubmissionMatch[1]) && record.ownerId === organizationId(user)
    );
    if (!item) return apiError(response, 404, "Book suggestion not found in your account.");
    if (item.status !== "needs_correction") return apiError(response, 409, "Only a suggestion returned for correction can be revised.");
    const body = await jsonBody();
    const next = catalogueMetadata(body, item, user);
    const metadataError = catalogueMetadataError(next, true);
    if (metadataError) return apiError(response, 400, metadataError);
    const normalizedIsbn = next.isbn.replace(/[\s-]/g, "").toUpperCase();
    if (store.publisherCatalog.some(record => record.id !== item.id && record.isbn.replace(/[\s-]/g, "").toUpperCase() === normalizedIsbn) ||
      catalog.some(book => book.isbn.replace(/[\s-]/g, "").toUpperCase() === normalizedIsbn)) {
      return apiError(response, 409, "Another catalogue record already uses this ISBN.");
    }
    const before = JSON.parse(JSON.stringify(item));
    item.revisions = item.revisions || [];
    item.revisions.push({ version: item.version || 1, snapshot: before, changedAt: item.updatedAt });
    item.version = (item.version || 1) + 1;
    Object.assign(item, next, { status: "pending_review", reviewReason: "" });
    item.updatedAt = new Date().toISOString();
    audit(user, "catalogue_submission", item.id, "catalogue.suggestion_resubmitted", before, item);
    notifyAdmin("Corrected book suggestion awaiting review", `${item.title} was resubmitted by ${item.submitterOrganization}.`, item.id);
    notify(user.id, "catalogue", "Book suggestion resubmitted", `${item.title} is waiting for administrator review.`, item.id);
    await persistStore();
    return sendJson(response, 200, { item, message: "Corrected book suggestion resubmitted for administrator review." });
  }

  if (pathname === "/api/publisher/catalogue" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to manage publisher catalogue records.");
    if (!requireRole(user, ["publisher"], response)) return;
    if (!requirePermission(user, "catalogue.view", response)) return;
    return sendJson(response, 200, { items: store.publisherCatalog.filter(item => item.ownerId === organizationId(user)) });
  }

  if (pathname === "/api/publisher/catalogue/import" && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to import publisher catalogue records.");
    if (!requireRole(user, ["publisher"], response)) return;
    if (!requirePermission(user, "catalogue.manage", response)) return;
    const body = await jsonBody();
    let rows;
    try {
      rows = importRecords(body, body.filename);
    } catch (error) {
      return apiError(response, error.status || 400, error.message);
    }
    if (!rows.length) return apiError(response, 400, "The CSV contains no catalogue rows.");
    const imported = [];
    const errors = [];
    for (const [index, row] of rows.entries()) {
      const metadata = catalogueMetadata({
        title: row.title,
        subtitle: row.subtitle,
        author: row.author,
        publisher: row.publisher,
        subject: row.subject,
        level: row.level || row.grade,
        board: row.board,
        state: row.state,
        medium: row.medium,
        edition: row.edition,
        isbn: row.isbn,
        session: row.session,
        publicationDate: row.publicationdate,
        format: row.format,
        pages: row.pages,
        age: row.age,
        description: row.description,
        highlights: row.highlights,
        publisherMrp: row.publishermrp || row.mrp,
        priceEffectiveDate: row.priceeffectivedate || row.mrpeffectivedate
      }, {}, user);
      const metadataError = catalogueMetadataError(metadata, true);
      const duplicate = store.publisherCatalog.some(item => item.isbn === metadata.isbn) ||
        catalog.some(book => book.isbn.replace(/[\s-]/g, "").toUpperCase() === metadata.isbn);
      if (metadataError || duplicate) {
        errors.push({ row: importRecordLocation(row, index), isbn: metadata.isbn || row.isbn || "", error: duplicate ? "ISBN already exists in the catalogue or another submission." : metadataError });
        continue;
      }
      const now = new Date().toISOString();
      const item = {
        ...metadata,
        id: `PUB-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
        ownerId: organizationId(user),
        submitterRole: user.role,
        submitterOrganization: organizationName(user) || `${user.firstName} ${user.lastName}`,
        status: "draft",
        version: 1,
        priceHistory: [{ price: metadata.publisherMrp, effectiveDate: metadata.publisherMrpEffectiveDate, recordedAt: now }],
        createdAt: now,
        updatedAt: now,
        revisions: []
      };
      store.publisherCatalog.unshift(item);
      imported.push(item.id);
      audit(user, "publisher_catalogue", item.id, "catalogue.imported_draft", null, item);
    }
    if (imported.length) await persistStore();
    return sendJson(response, 200, { imported: imported.length, ids: imported, errors });
  }

  if (pathname === "/api/publisher/catalogue" && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to submit a catalogue title.");
    if (!requireRole(user, ["publisher"], response)) return;
    if (!requirePermission(user, "catalogue.manage", response)) return;
    const body = await jsonBody();
    if (body.submit === true && !accountVerified(user)) {
      return apiError(response, 403, "Complete publisher account verification before submitting titles for review. You can save a draft.");
    }
    const metadata = catalogueMetadata(body, {}, user);
    const metadataError = catalogueMetadataError(metadata, body.submit === true);
    if (metadataError) return apiError(response, 400, metadataError);
    if (store.publisherCatalog.some(item => item.isbn.replace(/[\s-]/g, "").toUpperCase() === metadata.isbn)) return apiError(response, 409, "This ISBN is already in a catalogue submission. Open the existing record to revise it.");
    if (catalog.some(book => book.isbn.replace(/[\s-]/g, "").toUpperCase() === metadata.isbn)) return apiError(response, 409, "This ISBN is already listed in the verified catalog.");
    const record = {
      ...metadata,
      id: `PUB-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      ownerId: organizationId(user),
      submitterRole: user.role,
      submitterOrganization: organizationName(user) || `${user.firstName} ${user.lastName}`,
      status: "draft",
      version: 1,
      priceHistory: [{ price: metadata.publisherMrp, effectiveDate: metadata.publisherMrpEffectiveDate, recordedAt: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revisions: []
    };
    if (body.submit === true) {
      record.status = "pending_review";
      notifyAdmin("New title awaiting review", `${record.title} was submitted by ${record.publisher}.`, record.id);
    }
    store.publisherCatalog.unshift(record);
    audit(user, "publisher_catalogue", record.id, record.status === "draft" ? "catalogue.draft_created" : "catalogue.submitted", null, record);
    await persistStore();
    return sendJson(response, 201, { item: record });
  }

  const publisherItemMatch = pathname.match(/^\/api\/publisher\/catalogue\/([^/]+)$/);
  if (publisherItemMatch && method === "PATCH") {
    if (!user) return apiError(response, 401, "Please log in to edit catalogue records.");
    if (!requireRole(user, ["publisher"], response)) return;
    if (!requirePermission(user, "catalogue.manage", response)) return;
    const item = store.publisherCatalog.find(record => record.id === decodeURIComponent(publisherItemMatch[1]) && record.ownerId === organizationId(user));
    if (!item) return apiError(response, 404, "Catalogue record not found in your account.");
    if (!["draft", "needs_correction"].includes(item.status)) return apiError(response, 409, "Only a draft or correction-requested title can be edited.");
    const body = await jsonBody();
    const before = JSON.parse(JSON.stringify(item));
    const next = catalogueMetadata(body, item, user);
    const metadataError = catalogueMetadataError(next, body.submit === true);
    if (metadataError) return apiError(response, 400, metadataError);
    if (store.publisherCatalog.some(record => record.id !== item.id && record.isbn.replace(/[\s-]/g, "").toUpperCase() === next.isbn)) return apiError(response, 409, "Another catalogue title already uses this ISBN.");
    const changed = Object.keys(next).some(key => next[key] !== item[key]);
    if (body.submit === true && !accountVerified(user)) {
      return apiError(response, 403, "Complete publisher account verification before submitting titles for review. You can save a draft.");
    }
    if (!changed && body.submit !== true) return sendJson(response, 200, { item });
    if (changed) {
      item.revisions.push({ version: item.version || 1, snapshot: before, changedAt: item.updatedAt });
      item.version = (item.version || 1) + 1;
      if (Number(next.publisherMrp) !== Number(item.publisherMrp) ||
        next.publisherMrpEffectiveDate !== item.publisherMrpEffectiveDate) {
        item.priceHistory = [...(item.priceHistory || [{
          price: item.publisherMrp,
          effectiveDate: item.publisherMrpEffectiveDate,
          recordedAt: item.updatedAt
        }]), {
          price: next.publisherMrp,
          effectiveDate: next.publisherMrpEffectiveDate,
          recordedAt: new Date().toISOString()
        }];
      }
      Object.assign(item, next);
    }
    item.status = body.submit === true ? "pending_review" : "draft";
    item.updatedAt = new Date().toISOString();
    if (body.submit === true) {
      notifyAdmin("Catalogue correction submitted", `${item.title} is ready for review.`, item.id);
    }
    audit(user, "publisher_catalogue", item.id, body.submit === true ? "catalogue.resubmitted" : "catalogue.edited", before, item);
    await persistStore();
    return sendJson(response, 200, { item });
  }

  const publisherWithdrawalMatch = pathname.match(/^\/api\/publisher\/catalogue\/([^/]+)\/withdrawal$/);
  if (publisherWithdrawalMatch && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to request catalogue withdrawal.");
    if (!requireRole(user, ["publisher"], response)) return;
    if (!requirePermission(user, "catalogue.manage", response)) return;
    const item = store.publisherCatalog.find(record => record.id === decodeURIComponent(publisherWithdrawalMatch[1]) && record.ownerId === organizationId(user));
    if (!item) return apiError(response, 404, "Catalogue record not found in your account.");
    if (item.status !== "published" || item.withdrawalRequest?.status === "pending") {
      return apiError(response, 409, "Only a published title without an existing withdrawal request can be withdrawn.");
    }
    const body = await jsonBody();
    const reason = cleanText(body.reason, 500);
    if (reason.length < 10) return apiError(response, 400, "Explain the withdrawal reason in at least 10 characters.");
    item.withdrawalRequest = { status: "pending", reason, requestedBy: user.id, requestedAt: new Date().toISOString() };
    audit(user, "publisher_catalogue", item.id, "catalogue.withdrawal_requested", null, item.withdrawalRequest);
    notifyAdmin("Catalogue withdrawal request", `${item.title} has a withdrawal request for review.`, item.id);
    await persistStore();
    return sendJson(response, 200, { item });
  }

  const adminWithdrawalMatch = pathname.match(/^\/api\/admin\/catalogue\/([^/]+)\/withdrawal$/);
  if (adminWithdrawalMatch && method === "PATCH") {
    if (!user) return apiError(response, 401, "Please log in to review catalogue withdrawal requests.");
    if (!requireRole(user, ["admin"], response)) return;
    const item = store.publisherCatalog.find(record => record.id === decodeURIComponent(adminWithdrawalMatch[1]));
    if (!item || item.withdrawalRequest?.status !== "pending") return apiError(response, 404, "Pending catalogue withdrawal request not found.");
    const body = await jsonBody();
    const decision = cleanText(body.decision, 20);
    const note = cleanText(body.note, 500);
    if (!["approve", "reject"].includes(decision) || note.length < 10) {
      return apiError(response, 400, "Choose approve or reject and provide a decision note of at least 10 characters.");
    }
    const before = { status: item.status, withdrawalRequest: item.withdrawalRequest };
    const outcome = decision === "approve" ? "approved" : "rejected";
    item.withdrawalRequest = { ...item.withdrawalRequest, status: outcome, decisionNote: note, reviewedBy: user.id, reviewedAt: new Date().toISOString() };
    if (decision === "approve") item.status = "withdrawn";
    item.updatedAt = new Date().toISOString();
    audit(user, "publisher_catalogue", item.id, `catalogue.withdrawal_${outcome}`, before, item);
    notify(item.ownerId, "catalogue", `Catalogue withdrawal ${outcome}`, `${item.title}: ${note}`, item.id);
    await persistStore();
    return sendJson(response, 200, { item });
  }

  if (pathname === "/api/admin/overview" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to access platform administration.");
    if (!requireRole(user, ["admin"], response)) return;
    return sendJson(response, 200, dashboardData(user));
  }

  if (pathname === "/api/admin/audit" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to search the platform audit trail.");
    if (!requireRole(user, ["admin"], response)) return;
    const query = cleanText(url.searchParams.get("q"), 120).toLocaleLowerCase();
    const entity = cleanText(url.searchParams.get("entity"), 80).toLocaleLowerCase();
    const actor = cleanText(url.searchParams.get("actor"), 120).toLocaleLowerCase();
    const from = cleanText(url.searchParams.get("from"), 10);
    const to = cleanText(url.searchParams.get("to"), 10);
    const validDate = value => {
      if (!value) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if (!validDate(from) || !validDate(to) || (from && to && from > to)) {
      return apiError(response, 400, "Enter a valid audit date range.");
    }
    const items = store.audit.filter(item => {
      const searchable = [item.action, item.entity, item.entityId, item.actorName, item.actorRole]
        .join(" ").toLocaleLowerCase();
      const createdDate = String(item.createdAt || "").slice(0, 10);
      return (!query || searchable.includes(query)) &&
        (!entity || String(item.entity || "").toLocaleLowerCase().includes(entity)) &&
        (!actor || `${item.actorName || ""} ${item.actorRole || ""} ${item.actorId || ""}`.toLocaleLowerCase().includes(actor)) &&
        (!from || createdDate >= from) && (!to || createdDate <= to);
    }).slice(0, 500);
    return sendJson(response, 200, { items, truncated: items.length === 500 });
  }

  const adminVerificationMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/verification$/);
  if (adminVerificationMatch && method === "PATCH") {
    if (!user) return apiError(response, 401, "Please log in to review verification cases.");
    if (!requireRole(user, ["admin"], response)) return;
    const target = store.users.find(item => item.id === decodeURIComponent(adminVerificationMatch[1]) && item.role !== "admin");
    if (!target) return apiError(response, 404, "User not found or protected.");
    const body = await jsonBody();
    const decision = cleanText(body.decision, 20);
    if (!["verified", "rejected", "suspended", "active"].includes(decision)) return apiError(response, 400, "Choose verified, rejected, suspended, or active.");
    const reason = cleanText(body.reason, 300);
    if (reason.length < 10) return apiError(response, 400, "Add a clear review reason of at least 10 characters for this account decision.");
    const before = { verificationStatus: target.verificationStatus, accountStatus: target.accountStatus };
    if (decision === "suspended") target.accountStatus = "suspended";
    else if (decision === "active") target.accountStatus = "active";
    else target.verificationStatus = decision;
    target.verificationReason = reason;
    target.reviewedAt = new Date().toISOString();
    target.reviewedBy = user.id;
    audit(user, "user", target.id, "verification.reviewed", before, {
      verificationStatus: target.verificationStatus,
      accountStatus: target.accountStatus,
      reason: target.verificationReason
    });
    notify(target.id, "verification", `Account ${decision}`, target.verificationReason || `Your account is now ${decision}.`);
    if (decision === "suspended") {
      const affectedUsers = target.id === organizationId(target)
        ? store.users.filter(item => organizationId(item) === organizationId(target)).map(item => item.id)
        : [target.id];
      revokeUserSessions(affectedUsers);
    }
    await persistStore();
    return sendJson(response, 200, { user: publicUser(target) });
  }

  const adminCatalogReviewMatch = pathname.match(/^\/api\/admin\/catalogue\/([^/]+)\/review$/);
  if (adminCatalogReviewMatch && method === "PATCH") {
    if (!user) return apiError(response, 401, "Please log in to review catalogue submissions.");
    if (!requireRole(user, ["admin"], response)) return;
    const item = store.publisherCatalog.find(record => record.id === decodeURIComponent(adminCatalogReviewMatch[1]));
    if (!item) return apiError(response, 404, "Catalogue submission not found.");
    if (item.status !== "pending_review") return apiError(response, 409, "Only titles awaiting review can receive an approval decision.");
    const body = await jsonBody();
    const decision = cleanText(body.decision, 20);
    if (!["published", "needs_correction", "discontinued"].includes(decision)) return apiError(response, 400, "Choose published, needs_correction, or discontinued.");
    const reason = cleanText(body.reason, 300);
    if (reason.length < 10) return apiError(response, 400, "Add a catalogue review reason of at least 10 characters for this decision.");
    const before = { ...item };
    if (decision === "published" && store.publisherCatalog.some(record => record.id !== item.id && record.status === "published" && record.isbn === item.isbn)) {
      return apiError(response, 409, "Another published title already uses this ISBN.");
    }
    item.status = decision;
    item.reviewReason = reason;
    item.reviewedBy = user.id;
    item.reviewedAt = new Date().toISOString();
    item.updatedAt = item.reviewedAt;
    if (decision === "published") item.publicCatalogId = `pub-${item.id.toLowerCase()}`;
    audit(user, item.submitterRole === "publisher" ? "publisher_catalogue" : "catalogue_submission", item.id, `catalogue.review.${decision}`, before, item);
    notify(item.ownerId, "catalogue", `Catalogue title ${decision.replace(/_/g, " ")}`, `${item.title}${reason ? `: ${reason}` : " is now in the public academic catalog."}`, item.id);
    await persistStore();
    return sendJson(response, 200, { item });
  }

  const adminSupportMatch = pathname.match(/^\/api\/admin\/support\/([^/]+)$/);
  if (adminSupportMatch && method === "PATCH") {
    if (!user) return apiError(response, 401, "Please log in to manage support requests.");
    if (!requireRole(user, ["admin"], response)) return;
    const ticket = store.requests.find(item => item.id === decodeURIComponent(adminSupportMatch[1]));
    if (!ticket) return apiError(response, 404, "Support request not found.");
    const body = await jsonBody();
    const nextStatus = cleanText(body.status, 40);
    if (!["assigned", "waiting_for_information", "resolved", "closed"].includes(nextStatus)) return apiError(response, 400, "Choose assigned, waiting_for_information, resolved, or closed.");
    const before = { status: ticket.status, assignedTo: ticket.assignedTo || "" };
    ticket.status = nextStatus;
    ticket.assignedTo = user.id;
    ticket.updatedAt = new Date().toISOString();
    audit(user, "support_request", ticket.id, "support.status_changed", before, { status: nextStatus, assignedTo: user.id });
    await persistStore();
    return sendJson(response, 200, { ticket: { id: ticket.id, status: ticket.status, updatedAt: ticket.updatedAt } });
  }

  if (pathname === "/api/notifications" && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to update notifications.");
    if (!requirePermission(user, "notifications.manage", response)) return;
    const body = await jsonBody();
    const notification = store.notifications.find(item =>
      item.id === cleanText(body.id, 100) &&
      (item.userId === user.id || item.userId === organizationId(user))
    );
    if (!notification) return apiError(response, 404, "Notification not found.");
    notification.readBy = notification.readBy && typeof notification.readBy === "object" && !Array.isArray(notification.readBy)
      ? notification.readBy
      : {};
    notification.readBy[user.id] = new Date().toISOString();
    await persistStore();
    const { readBy, ...notificationData } = notification;
    return sendJson(response, 200, {
      notification: { ...notificationData, readAt: readBy[user.id] }
    });
  }

  if (pathname === "/api/rfqs/template.xlsx" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to download the RFQ XLSX template.");
    if (!requireRole(user, ["school"], response)) return;
    if (!requirePermission(user, "rfq.view", response)) return;
    audit(user, "export", "rfq-import-template", "report.template_downloaded", null, { format: "xlsx" });
    await persistStore();
    return sendWorkbook(response, [{
      title: "Mathematics World",
      isbn: "",
      edition: "Third",
      className: "Class 10",
      subject: "Mathematics",
      quantity: 120
    }], ["title", "isbn", "edition", "className", "subject", "quantity"], "goerudite-rfq-book-lines-template.xlsx");
  }

  if (pathname === "/api/rfqs/export.xlsx" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to export RFQs.");
    if (!requireRole(user, ["school"], response)) return;
    if (!requirePermission(user, "rfq.view", response)) return;
    const rows = store.rfqs.filter(item => (item.ownerId || item.userId) === organizationId(user)).flatMap(item => {
      const rfq = safeRfq(item);
      return rfq.lines.map(line => ({
        rfqId: rfq.id, status: rfq.status, session: rfq.session, board: rfq.board,
        state: rfq.state, medium: rfq.medium, title: line.title, isbn: line.isbn,
        edition: line.edition, className: line.className, subject: line.subject,
        quantity: line.quantity, createdAt: rfq.createdAt
      }));
    });
    audit(user, "export", "rfq-workspace", "report.xlsx_exported", null, { rows: rows.length });
    await persistStore();
    return sendWorkbook(response, rows, ["rfqId", "status", "session", "board", "state", "medium", "title", "isbn", "edition", "className", "subject", "quantity", "createdAt"], "goerudite-school-rfqs.xlsx");
  }

  if (pathname === "/api/inventory/template.xlsx" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to download the inventory XLSX template.");
    if (!requireRole(user, ["distributor", "retailer"], response)) return;
    if (!requirePermission(user, "inventory.view", response)) return;
    audit(user, "export", "inventory-import-template", "report.template_downloaded", null, { format: "xlsx" });
    await persistStore();
    return sendWorkbook(response, [{
      title: "Mathematics World", isbn: "", edition: "Third", session: "",
      availableQuantity: 25, reservedQuantity: 0, damagedQuantity: 0,
      lowStockThreshold: 5, location: ""
    }], ["title", "isbn", "edition", "session", "availableQuantity", "reservedQuantity", "damagedQuantity", "lowStockThreshold", "location"], "goerudite-inventory-template.xlsx");
  }

  if (pathname === "/api/inventory/export.xlsx" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to export inventory.");
    if (!requireRole(user, ["distributor", "retailer"], response)) return;
    if (!requirePermission(user, "inventory.view", response)) return;
    const rows = store.inventory.filter(item => item.ownerId === organizationId(user)).map(item => ({
      title: item.title, isbn: item.isbn, edition: item.edition, session: item.session,
      availableQuantity: item.availableQuantity, reservedQuantity: item.reservedQuantity,
      damagedQuantity: item.damagedQuantity, lowStockThreshold: item.lowStockThreshold,
      location: item.location, updatedAt: item.updatedAt
    }));
    audit(user, "export", "inventory", "report.xlsx_exported", null, { rows: rows.length });
    await persistStore();
    return sendWorkbook(response, rows, ["title", "isbn", "edition", "session", "availableQuantity", "reservedQuantity", "damagedQuantity", "lowStockThreshold", "location", "updatedAt"], "goerudite-inventory.xlsx");
  }

  if (pathname === "/api/publisher/catalogue/template.xlsx" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to download the catalogue XLSX template.");
    if (!requireRole(user, ["publisher"], response)) return;
    if (!requirePermission(user, "catalogue.view", response)) return;
    audit(user, "export", "publisher-catalogue-template", "report.template_downloaded", null, { format: "xlsx" });
    await persistStore();
    return sendWorkbook(response, [{
      title: "Mathematics World", subtitle: "", author: "A. Author",
      publisher: organizationName(user), subject: "Mathematics", level: "Class 10",
      board: "CBSE", state: "", medium: "English", edition: "Third",
      isbn: "9780306406157", session: "2026-27", publicationDate: "2026-01-01",
      format: "Textbook", pages: 200, age: "14+", description: "Reviewed mathematics textbook.",
      highlights: "Academic textbook", publisherMrp: 250, priceEffectiveDate: "2026-01-01"
    }], ["title", "subtitle", "author", "publisher", "subject", "level", "board", "state", "medium", "edition", "isbn", "session", "publicationDate", "format", "pages", "age", "description", "highlights", "publisherMrp", "priceEffectiveDate"], "goerudite-publisher-catalogue-template.xlsx");
  }

  if (pathname === "/api/publisher/catalogue/export.xlsx" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to export publisher catalogue records.");
    if (!requireRole(user, ["publisher"], response)) return;
    if (!requirePermission(user, "catalogue.view", response)) return;
    const rows = store.publisherCatalog.filter(item => item.ownerId === organizationId(user)).map(item => ({
      title: item.title, subtitle: item.subtitle, author: item.author, publisher: item.publisher,
      subject: item.subject, level: item.level, board: item.board, state: item.state, medium: item.medium,
      edition: item.edition, isbn: item.isbn, session: item.session, publicationDate: item.publicationDate,
      format: item.format, pages: item.pages, age: item.age, description: item.description,
      highlights: (item.highlights || []).join("\n"), publisherMrp: item.publisherMrp,
      priceEffectiveDate: item.publisherMrpEffectiveDate, status: item.status, version: item.version
    }));
    audit(user, "export", "publisher-catalogue", "report.xlsx_exported", null, { rows: rows.length });
    await persistStore();
    return sendWorkbook(response, rows, ["title", "subtitle", "author", "publisher", "subject", "level", "board", "state", "medium", "edition", "isbn", "session", "publicationDate", "format", "pages", "age", "description", "highlights", "publisherMrp", "priceEffectiveDate", "status", "version"], "goerudite-publisher-catalogue.xlsx");
  }

  if (pathname === "/api/reports/export.csv" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to export your reports.");
    if (!["school", "distributor", "retailer", "publisher", "admin"].includes(user.role)) return apiError(response, 403, "Your role is not permitted to export reports.");
    if (!requirePermission(user, "reports.view", response)) return;
    let rows;
    if (user.role === "school") rows = store.rfqs.filter(item => (item.ownerId || item.userId) === organizationId(user)).map(item => {
      const rfq = safeRfq(item);
      return rfq.lines.map(line => ({ rfqId: rfq.id, status: rfq.status, session: rfq.session, board: rfq.board, state: rfq.state, medium: rfq.medium, title: line.title, isbn: line.isbn, quantity: line.quantity, createdAt: rfq.createdAt }));
    }).flat();
    else if (["distributor", "retailer"].includes(user.role)) rows = store.quotes.filter(item => item.supplierId === organizationId(user)).map(item => ({ quoteId: item.id, rfqId: item.rfqId, status: item.status, total: item.total || 0, version: item.version, updatedAt: item.updatedAt }));
    else if (user.role === "publisher") rows = store.publisherCatalog.filter(item => item.ownerId === organizationId(user)).map(item => ({ title: item.title, isbn: item.isbn, session: item.session, publisherMrp: item.publisherMrp, status: item.status, updatedAt: item.updatedAt }));
    else rows = store.audit.map(item => ({ timestamp: item.createdAt, actor: item.actorName, role: item.actorRole, entity: item.entity, recordId: item.entityId, action: item.action }));
    const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const csv = [headers.map(appendCsvCell).join(","), ...rows.map(row => headers.map(header => appendCsvCell(row[header])).join(","))].join("\r\n");
    audit(user, "export", "role-report", "report.exported", null, { rows: rows.length });
    await persistStore();
    response.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="goerudite-${user.role}-report.csv"`,
      "Cache-Control": "no-store"
    });
    return response.end(csv);
  }

  if (pathname === "/api/rfqs/template.csv" && method === "GET") {
    if (!user) return apiError(response, 401, "Please log in to download the RFQ import template.");
    if (!requireRole(user, ["school"], response)) return;
    audit(user, "export", "rfq-import-template", "report.template_downloaded", null, { format: "csv" });
    await persistStore();
    response.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="goerudite-rfq-book-lines-template.csv"',
      "Cache-Control": "no-store"
    });
    return response.end("title,isbn,edition,className,subject,quantity\r\nMathematics World,,Third,Class 10,Mathematics,120\r\n");
  }

  if (pathname === "/api/rfqs/import" && method === "POST") {
    if (!user) return apiError(response, 401, "Please log in to import a school book list.");
    if (!requireRole(user, ["school"], response)) return;
    if (!requirePermission(user, "rfq.manage", response)) return;
    const body = await jsonBody();
    let imported;
    try {
      imported = importRecords(body, body.filename);
    } catch (error) {
      return apiError(response, error.status || 400, error.message);
    }
    if (imported.length < 1 || imported.length > 250) return apiError(response, 400, "An RFQ import must contain between 1 and 250 book lines.");
    const lines = imported.map(record => ({
      title: record.title || record.booktitle,
      isbn: record.isbn || record.isbn10 || record.isbn13 || "",
      edition: record.edition || "",
      className: record.classname || record.class || record.grade || "",
      subject: record.subject || "",
      quantity: record.quantity || record.requiredquantity || ""
    }));
    const errors = [];
    const seenIsbns = new Set();
    const seenTitles = new Set();
    lines.forEach((line, index) => {
      const row = importRecordLocation(imported[index], index);
      const title = cleanText(line.title, 180);
      const isbn = cleanText(line.isbn, 30).replace(/[\s-]/g, "");
      const quantity = Number(line.quantity);
      if (!title) errors.push({ row, message: "Book title is required." });
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) errors.push({ row, message: "Quantity must be a whole number between 1 and 100,000." });
      if (isbn && !/^(?:\d{9}[\dX]|\d{13})$/i.test(isbn)) errors.push({ row, message: "ISBN must be a valid ISBN-10 or ISBN-13." });
      if (isbn && seenIsbns.has(isbn.toUpperCase())) errors.push({ row, message: "Duplicate ISBN in this import." });
      if (title && seenTitles.has(title.toLocaleLowerCase())) errors.push({ row, message: "Duplicate title in this import." });
      if (isbn) seenIsbns.add(isbn.toUpperCase());
      if (title) seenTitles.add(title.toLocaleLowerCase());
    });
    if (errors.length) return sendJson(response, 400, { error: `${errors.length} row(s) need correction. No draft was created.`, errors });
    const profile = organizationProfile(user);
    const rfq = {
      id: `RFQ-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      ownerId: organizationId(user),
      organizationName: organizationName(user),
      title: cleanText(body.title, 160) || "Imported academic book requirements",
      session: cleanText(body.session, 30) || profile.academicSession || "",
      board: cleanText(body.board, 80) || profile.board || "",
      state: cleanText(body.state, 100) || profile.state || "",
      deliveryState: cleanText(body.deliveryState, 100) || profile.state || "",
      deliveryDistrict: cleanText(body.deliveryDistrict, 100) || profile.district || "",
      medium: cleanText(body.medium, 80) || profile.medium || "",
      deliveryCity: cleanText(body.deliveryCity, 100) || profile.city || "",
      deliveryPostalCode: cleanText(body.deliveryPostalCode, 12).replace(/\s|-/g, "") || cleanText(profile.postalCode, 12).replace(/\s|-/g, ""),
      responseDeadline: "",
      budget: null,
      lines: lines.map(line => {
        const book = matchBook(line);
        return {
          id: crypto.randomUUID(),
          bookId: book?.id || "",
          title: cleanText(line.title, 180),
          isbn: cleanText(line.isbn, 30).replace(/[\s-]/g, ""),
          edition: cleanText(line.edition, 80),
          publisher: book?.publisher || "",
          className: cleanText(line.className, 60),
          subject: cleanText(line.subject, 100) || book?.subject || "",
          quantity: Number(line.quantity),
          catalogSnapshot: book ? { id: book.id, title: book.title, isbn: book.isbn || "", edition: book.edition || "", session: book.session || "", board: book.board || "", state: book.state || "", medium: book.medium || "" } : null
        };
      }),
      version: 1,
      versions: [],
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.rfqs.unshift(rfq);
    audit(user, "rfq", rfq.id, "rfq.csv_draft_imported", null, safeRfq(rfq));
    await persistStore();
    return sendJson(response, 201, { rfq: safeRfq(rfq), imported: rfq.lines.length, status: rfq.status });
  }

  return null;
}

function notifyAdmin(title, message, entityId) {
  for (const admin of store.users.filter(item => item.role === "admin" && item.accountStatus === "active")) {
    notify(admin.id, "review", title, message, entityId);
  }
}

async function handleInventoryImport(user, items) {
  const saved = [];
  for (const item of items) {
    const isbn = cleanText(item.isbn, 30).replace(/[\s-]/g, "");
    const existing = store.inventory.find(record => record.ownerId === organizationId(user) && (
      (isbn && record.isbn && record.isbn.toUpperCase() === isbn.toUpperCase()) ||
      (!isbn && record.title.toLowerCase() === item.title.toLowerCase())
    ));
    const before = existing ? { ...existing } : null;
    const line = {
      id: existing?.id || crypto.randomUUID(),
      ownerId: organizationId(user),
      bookId: matchBook(item)?.id || "",
      title: cleanText(item.title, 180),
      isbn,
      edition: cleanText(item.edition, 80),
      session: cleanText(item.session, 30),
      source: "Own stock",
      location: cleanText(item.location, 120),
      availableQuantity: Number(item.availableQuantity),
      reservedQuantity: Number(item.reservedQuantity || 0),
      damagedQuantity: Number(item.damagedQuantity || 0),
      lowStockThreshold: item.lowStockThreshold == null ? 5 : Number(item.lowStockThreshold),
      updatedAt: new Date().toISOString(),
      updateReason: "CSV inventory import"
    };
    if (existing) Object.assign(existing, line);
    else store.inventory.push(line);
    saved.push(existing || line);
    audit(user, "inventory", line.id, "inventory.csv_imported", before, line);
  }
  await persistStore();
  return saved;
}

async function handleApiInternal(request, response, url) {
  if (url.pathname === "/api/help/chat" && request.method === "GET") {
    const user = getSession(request);
    const role = user?.role || "public";
    return sendJson(response, 200, {
      role,
      suggestions: {
        en: suggestionsForRole(role, "en"),
        hi: suggestionsForRole(role, "hi")
      }
    }, { "Cache-Control": "no-store" });
  }

  if (url.pathname === "/api/help/chat" && request.method === "POST") {
    const now = Date.now();
    const address = request.socket.remoteAddress || "unknown";
    const recentAttempts = (helpChatAttempts.get(address) || []).filter(time => now - time < HELP_CHAT_WINDOW_MS);
    if (recentAttempts.length >= HELP_CHAT_REQUEST_LIMIT) {
      helpChatAttempts.set(address, recentAttempts);
      return apiError(response, 429, "Help chat is temporarily rate limited. Please wait a minute and try again.");
    }
    recentAttempts.push(now);
    helpChatAttempts.set(address, recentAttempts);
    if (helpChatAttempts.size > 5000) {
      for (const [key, attempts] of helpChatAttempts) {
        if (!attempts.some(time => now - time < HELP_CHAT_WINDOW_MS)) helpChatAttempts.delete(key);
      }
    }

    const body = await readBody(request);
    if (typeof body.question !== "string" || !body.question.trim()) {
      return apiError(response, 400, "Enter a question before sending.");
    }
    if (body.question.length > 500) return apiError(response, 400, "Keep your question under 500 characters.");
    if (!["en", "hi"].includes(body.language)) return apiError(response, 400, "Choose English or Hindi.");
    const language = body.language;
    const role = getSession(request)?.role || "public";
    const article = findArticle(body.question, role);
    if (article) return sendJson(response, 200, {
      matched: true,
      answer: answerArticle(article, language),
      suggestions: {
        en: suggestionsForRole(role, "en"),
        hi: suggestionsForRole(role, "hi")
      }
    }, { "Cache-Control": "no-store" });
    return sendJson(response, 200, {
      matched: false,
      message: language === "hi"
        ? "Mujhe abhi is sawal ka verified jawab nahi mila. Kripya dashboard/feature ka naam aur exact error message batayein, ya Support se sampark karein."
        : "I could not find a verified answer yet. Please share the dashboard or feature name and exact error message, or contact Support.",
      suggestions: {
        en: suggestionsForRole(role, "en"),
        hi: suggestionsForRole(role, "hi")
      },
      route: "/contact"
    }, { "Cache-Control": "no-store" });
  }

  if (url.pathname === "/api/help/chat") {
    return apiError(response, 405, "Method not allowed.");
  }

  if (request.method === "GET" && url.pathname === "/api/advertisements") {
    const items = store.advertisements
      .filter(item => advertisementActive(item))
      .sort((left, right) => left.endDate.localeCompare(right.endDate))
      .map(publicAdvertisement);
    return sendJson(response, 200, { items });
  }

  const publicAdMatch = url.pathname.match(/^\/api\/advertisements\/([^/]+)$/);
  if (request.method === "GET" && publicAdMatch) {
    const item = store.advertisements.find(ad => ad.id === decodeURIComponent(publicAdMatch[1]) && advertisementActive(ad));
    return item ? sendJson(response, 200, { item: publicAdvertisement(item) }) : apiError(response, 404, "Advertisement not found or no longer active.");
  }

  const adClickMatch = url.pathname.match(/^\/api\/advertisements\/([^/]+)\/click$/);
  if (request.method === "POST" && adClickMatch) {
    const item = store.advertisements.find(ad => ad.id === decodeURIComponent(adClickMatch[1]) && advertisementActive(ad));
    if (!item) return apiError(response, 404, "Advertisement not found or no longer active.");
    const event = { id: crypto.randomUUID(), advertisementId: item.id, type: "click", createdAt: new Date().toISOString() };
    store.adEvents.unshift(event);
    try {
      await persistStore();
    } catch (error) {
      store.adEvents.splice(store.adEvents.indexOf(event), 1);
      throw error;
    }
    return sendJson(response, 201, { tracked: true });
  }

  if (request.method === "POST" && url.pathname === "/api/ad-inquiries") {
    const user = getSession(request);
    if (!user) return apiError(response, 401, "Log in as a verified school to request a quote from the advertiser.");
    if (user.role !== "school" || !accountVerified(user) || organizationOwner(user).accountStatus !== "active") {
      return apiError(response, 403, "Only active, verified school accounts can send an advertisement inquiry.");
    }
    const body = await readBody(request);
    const advertisementId = cleanText(body.advertisementId, 100);
    const item = store.advertisements.find(ad => ad.id === advertisementId && advertisementActive(ad));
    if (!item) return apiError(response, 404, "Advertisement not found or no longer active.");
    const quantity = Number(body.quantity);
    const message = cleanText(body.message, 1000);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
      return apiError(response, 400, "Requested quantity must be a whole number from 1 to 100,000.");
    }
    const inquiry = {
      id: `ADQ-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
      advertisementId: item.id,
      advertisementTitle: item.title,
      advertiserId: item.advertiserId,
      requesterId: user.id,
      requesterLabel: "Verified school",
      quantity,
      message,
      status: "new",
      createdAt: new Date().toISOString()
    };
    store.adInquiries.unshift(inquiry);
    notify(item.advertiserId, "advertisement_inquiry", "New advertisement quote inquiry", `${quantity} copies requested for "${item.productTitle || item.title}".`, inquiry.id);
    audit(user, "advertisement_inquiry", inquiry.id, "advertisement.inquiry_submitted", null, {
      advertisementId: item.id,
      advertiserId: item.advertiserId,
      quantity,
      messageLength: message.length
    });
    try {
      await persistStore();
    } catch (error) {
      store.adInquiries.splice(store.adInquiries.indexOf(inquiry), 1);
      store.notifications = store.notifications.filter(entry => entry.entityId !== inquiry.id);
      store.audit = store.audit.filter(entry => entry.entityId !== inquiry.id);
      throw error;
    }
    return sendJson(response, 201, { inquiry: { id: inquiry.id, status: inquiry.status } });
  }

  if (request.method === "GET" && url.pathname === "/api/ad-inquiries") {
    const user = getSession(request);
    if (!user) return apiError(response, 401, "Please log in to view advertisement inquiries.");
    if (!["distributor", "retailer", "publisher", "other"].includes(user.role) ||
        organizationOwner(user).accountStatus !== "active" || !accountVerified(user)) {
      return apiError(response, 403, "Only active, verified supply partners can view their advertisement inquiries.");
    }
    const items = store.adInquiries
      .filter(item => item.advertiserId === organizationId(user))
      .map(({ requesterId, ...item }) => item);
    return sendJson(response, 200, { items });
  }

  const adminAdMatch = url.pathname.match(/^\/api\/admin\/advertisements(?:\/([^/]+))?$/);
  if (adminAdMatch) {
    const user = getSession(request);
    if (!user) return apiError(response, 401, "Please log in to manage advertisements.");
    if (user.role !== "admin" || user.accountStatus !== "active") {
      return apiError(response, 403, "Only active administrator accounts can manage advertisements.");
    }
    if (request.method === "GET" && !adminAdMatch[1]) {
      const items = store.advertisements.map(item => ({
        ...item,
        clicks: store.adEvents.filter(event => event.advertisementId === item.id && event.type === "click").length,
        inquiries: store.adInquiries.filter(inquiry => inquiry.advertisementId === item.id).length
      }));
      const advertisers = store.users
        .filter(candidate => ["distributor", "retailer", "publisher", "other"].includes(candidate.role) &&
          candidate.accountStatus === "active" && candidate.verificationStatus === "verified")
        .map(candidate => ({
          id: candidate.id,
          name: candidate.organizationName || `${candidate.firstName} ${candidate.lastName}`,
          role: candidate.role
        }));
      return sendJson(response, 200, { items, advertisers });
    }
    if (request.method === "POST" && !adminAdMatch[1]) {
      const body = await readBody(request);
      const validated = validateAdvertisementInput(body);
      if (validated.error) return apiError(response, 400, validated.error);
      const action = body.action || "draft";
      if (!["draft", "active"].includes(action)) return apiError(response, 400, "Choose draft or active.");
      const now = new Date().toISOString();
      const item = {
        id: `AD-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
        ...validated.value,
        status: action,
        billingStatus: "unbilled",
        createdBy: user.id,
        createdAt: now,
        updatedAt: now
      };
      store.advertisements.unshift(item);
      audit(user, "advertisement", item.id, `advertisement.${action === "active" ? "activated" : "draft_saved"}`, null, advertisementAuditSnapshot(item));
      try {
        await persistStore();
      } catch (error) {
        store.advertisements.splice(store.advertisements.indexOf(item), 1);
        throw error;
      }
      return sendJson(response, 201, { item });
    }
    const item = adminAdMatch[1]
      ? store.advertisements.find(ad => ad.id === decodeURIComponent(adminAdMatch[1]))
      : null;
    if (request.method === "PATCH" && item) {
      const body = await readBody(request);
      const action = body.action || "draft";
      if (!["draft", "active", "paused"].includes(action)) return apiError(response, 400, "Choose draft, active, or paused.");
      const validated = validateAdvertisementInput(body, item);
      if (validated.error) return apiError(response, 400, validated.error);
      if (validated.value.campaignFee !== item.campaignFee && item.billingStatus !== "unbilled") {
        return apiError(response, 409, "Reset or reconcile the manually recorded campaign billing before changing its fee.");
      }
      const billingStatus = body.billingStatus === undefined ? item.billingStatus : body.billingStatus;
      if (!["unbilled", "invoiced_offline", "paid_offline"].includes(billingStatus)) {
        return apiError(response, 400, "Billing status must be unbilled, invoiced_offline, or paid_offline.");
      }
      const previous = advertisementAuditSnapshot(item);
      Object.assign(item, validated.value, {
        status: action,
        billingStatus,
        updatedAt: new Date().toISOString(),
        billingUpdatedAt: billingStatus === item.billingStatus ? item.billingUpdatedAt || null : new Date().toISOString()
      });
      audit(user, "advertisement", item.id, "advertisement.updated", previous, advertisementAuditSnapshot(item));
      await persistStore();
      return sendJson(response, 200, { item });
    }
    if (request.method === "DELETE" && item) {
      const index = store.advertisements.indexOf(item);
      store.advertisements.splice(index, 1);
      audit(user, "advertisement", item.id, "advertisement.deleted", advertisementAuditSnapshot(item), null);
      try {
        await persistStore();
      } catch (error) {
        store.advertisements.splice(index, 0, item);
        throw error;
      }
      return sendJson(response, 200, { deleted: true, id: item.id });
    }
    if (adminAdMatch[1] && !item) return apiError(response, 404, "Advertisement not found.");
    return apiError(response, 405, "Advertisement management endpoint not found.");
  }

  if (request.method === "GET" && url.pathname === "/api/blog") {
    await publishScheduledBlogs();
    const items = store.blogs
      .filter(item => item.status === "published")
      .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
      .map(publicBlogPost);
    return sendJson(response, 200, { items });
  }

  const publicBlogMatch = url.pathname.match(/^\/api\/blog\/([a-z0-9-]+)$/);
  if (request.method === "GET" && publicBlogMatch) {
    await publishScheduledBlogs();
    const item = store.blogs.find(post => post.slug === publicBlogMatch[1] && post.status === "published");
    return item
      ? sendJson(response, 200, { item: publicBlogPost(item) })
      : apiError(response, 404, "Blog post not found.");
  }

  const adminBlogMatch = url.pathname.match(/^\/api\/admin\/blog(?:\/([^/]+))?$/);
  if (adminBlogMatch) {
    const user = getSession(request);
    if (!user) return apiError(response, 401, "Please log in to manage blog posts.");
    if (user.role !== "admin" || user.accountStatus !== "active") {
      return apiError(response, 403, "Only active administrator accounts can manage blog posts.");
    }
    await publishScheduledBlogs();
    if (request.method === "GET" && !adminBlogMatch[1]) {
      return sendJson(response, 200, { items: store.blogs.slice().sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)) });
    }
    if (request.method === "POST" && !adminBlogMatch[1]) {
      const body = await readBody(request);
      const validated = validateBlogInput(body);
      if (validated.error) return apiError(response, 400, validated.error);
      if (store.blogs.some(item => item.slug === validated.value.slug)) return apiError(response, 409, "That blog slug is already in use.");
      const now = new Date().toISOString();
      const item = {
        id: `BLOG-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
        ...validated.value,
        status: "draft",
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        scheduledAt: null
      };
      if (body.action === "publish") {
        item.status = "published";
        item.publishedAt = now;
      } else if (body.action === "schedule") {
        const schedule = Date.parse(body.scheduledAt);
        if (!Number.isFinite(schedule) || schedule <= Date.now()) return apiError(response, 400, "Publication schedule must be a valid future date and time.");
        item.status = "scheduled";
        item.scheduledAt = new Date(schedule).toISOString();
      } else if (body.action && body.action !== "draft") {
        return apiError(response, 400, "Choose draft, publish, or schedule.");
      }
      store.blogs.unshift(item);
      audit(user, "blog", item.id, `blog.${item.status === "published" ? "published" : item.status === "scheduled" ? "scheduled" : "draft_saved"}`, null, blogAuditSnapshot(item));
      await persistStore();
      return sendJson(response, 201, { item });
    }
    const item = adminBlogMatch[1]
      ? store.blogs.find(post => post.id === decodeURIComponent(adminBlogMatch[1]))
      : null;
    if (request.method === "PATCH" && item) {
      const body = await readBody(request);
      const validated = validateBlogInput(body, item);
      if (validated.error) return apiError(response, 400, validated.error);
      if (store.blogs.some(post => post.id !== item.id && post.slug === validated.value.slug)) {
        return apiError(response, 409, "That blog slug is already in use.");
      }
      const action = body.action || "draft";
      if (!["draft", "publish", "unpublish", "schedule"].includes(action)) return apiError(response, 400, "Choose draft, publish, unpublish, or schedule.");
      const scheduledTime = action === "schedule" ? Date.parse(body.scheduledAt) : null;
      if (action === "schedule" && (!Number.isFinite(scheduledTime) || scheduledTime <= Date.now())) {
        return apiError(response, 400, "Publication schedule must be a valid future date and time.");
      }
      const previous = blogAuditSnapshot(item);
      Object.assign(item, validated.value, { updatedAt: new Date().toISOString() });
      if (action === "publish") {
        item.status = "published";
        item.publishedAt = item.publishedAt || item.updatedAt;
        item.scheduledAt = null;
      } else if (action === "schedule") {
        item.status = "scheduled";
        item.scheduledAt = new Date(scheduledTime).toISOString();
        item.publishedAt = null;
      } else {
        item.status = "draft";
        item.scheduledAt = null;
        item.publishedAt = null;
      }
      audit(user, "blog", item.id, `blog.${action === "draft" || action === "unpublish" ? "draft_saved" : action === "publish" ? "published" : "scheduled"}`, previous, blogAuditSnapshot(item));
      await persistStore();
      return sendJson(response, 200, { item });
    }
    if (request.method === "DELETE" && item) {
      const [deleted] = store.blogs.splice(store.blogs.indexOf(item), 1);
      audit(user, "blog", item.id, "blog.deleted", blogAuditSnapshot(deleted), null);
      await persistStore();
      return sendJson(response, 200, { deleted: true, id: item.id });
    }
    if (adminBlogMatch[1] && !item) return apiError(response, 404, "Blog post not found.");
    return apiError(response, request.method === "GET" || request.method === "POST" || request.method === "PATCH" || request.method === "DELETE" ? 404 : 405, "Blog management endpoint not found.");
  }

  await handleWorkspaceApi(request, response, url);
  if (response.writableEnded) return;

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, { status: "ok", service: "GoErudite", catalogCount: catalog.length });
  }

  if (request.method === "GET" && url.pathname === "/api/public/contact") {
    return sendJson(response, 200, publicContactDetails());
  }

  if (request.method === "GET" && url.pathname === "/api/plans") {
    return sendJson(response, 200, {
      items: PUBLIC_ACCESS_PLANS.map(plan => ({
        ...plan,
        billingPeriod: "month",
        paymentEnabled: false,
        subscriptionEnforced: false,
        freeQuoteSubmissions: plan.freeQuoteSubmissions || 0,
        quoteAllowanceEnforced: false
      }))
    });
  }

  if (request.method === "GET" && url.pathname === "/api/catalog") {
    const publishedCatalog = store.publisherCatalog.filter(item => item.status === "published").map(publicPublisherTitle);
    const currentCatalog = [...catalog.map(book => ({ ...book, source: "sample" })), ...publishedCatalog];
    const search = cleanText(url.searchParams.get("q") || "", 100).toLowerCase();
    const filters = {
      category: url.searchParams.get("category"),
      subject: url.searchParams.get("subject"),
      board: url.searchParams.get("board"),
      level: url.searchParams.get("level"),
      medium: url.searchParams.get("medium")
    };
    const maxPrice = url.searchParams.has("maxPrice") ? Number(url.searchParams.get("maxPrice")) : null;
    if (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
      return apiError(response, 400, "Maximum price must be a non-negative number.");
    }
    let results = currentCatalog.filter(book =>
      (!search || [book.title, book.publisher, book.subject, book.board, book.level, book.isbn].some(value => value.toLowerCase().includes(search))) &&
      Object.entries(filters).every(([key, value]) => !value || value === "All" || book[key] === value) &&
      (maxPrice === null || book.price <= maxPrice)
    );
    const sort = url.searchParams.get("sort");
    if (sort === "price-asc") results = [...results].sort((a, b) => a.price - b.price);
    if (sort === "price-desc") results = [...results].sort((a, b) => b.price - a.price);
    if (sort === "title-asc") results = [...results].sort((a, b) => a.title.localeCompare(b.title));
    const requestedPage = url.searchParams.has("page") ? Number(url.searchParams.get("page")) : 1;
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) {
      return apiError(response, 400, "Page must be a positive whole number.");
    }
    const page = requestedPage;
    const pageSize = 9;
    return sendJson(response, 200, { items: results.slice((page - 1) * pageSize, page * pageSize), total: results.length, page, pageSize });
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/catalog/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/catalog/".length));
    const book = catalog.find(item => item.id === id);
    const publicBook = (book ? { ...book, source: "sample" } : null) || store.publisherCatalog
      .filter(item => item.status === "published")
      .map(publicPublisherTitle).find(item => item.id === id);
    return publicBook ? sendJson(response, 200, { item: publicBook }) : sendJson(response, 404, { error: "Book not found." });
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = getSession(request);
    return sendJson(response, 200, { user: user ? publicUser(user) : null });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/password-reset/request") {
    const body = await readBody(request);
    const email = cleanText(body.email, 254).toLowerCase();
    if (!validEmail(email)) return apiError(response, 400, "Enter a valid email address.");
    if (passwordResetRateLimited(request, email)) return apiError(response, 429, "Too many password reset requests. Try again after 15 minutes.");
    passwordResetRateLimited(request, email, true);
    let mailConfig;
    try {
      mailConfig = smtpMailerConfiguration();
    } catch (error) {
      return apiError(response, error.status || 503, "Password recovery email is unavailable. Contact platform support for account-access assistance.");
    }
    if (!mailConfig) {
      return apiError(response, 503, "Password recovery email is not configured. Contact platform support for account-access assistance.");
    }
    const user = store.users.find(entry => entry.email === email && !isAccountSuspended(entry));
    if (!user) {
      return sendJson(response, 202, {
        message: "If an eligible account exists and email delivery succeeds, password reset instructions will be sent. If no email arrives, contact platform support."
      });
    }
    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date();
    const reset = {
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS).toISOString(),
      usedAt: null
    };
    const previousResets = store.passwordResets;
    const previousResetStates = previousResets.map(item => [item, item.usedAt]);
    store.passwordResets = previousResets.filter(item => !item.usedAt && item.expiresAt > now.toISOString());
    const invalidated = store.passwordResets.filter(item => item.userId === user.id && !item.usedAt);
    invalidated.forEach(item => { item.usedAt = now.toISOString(); });
    store.passwordResets.unshift(reset);
    try {
      await persistStore();
    } catch (error) {
      store.passwordResets.splice(store.passwordResets.indexOf(reset), 1);
      invalidated.forEach(item => { item.usedAt = null; });
      store.passwordResets = previousResets;
      previousResetStates.forEach(([item, usedAt]) => { item.usedAt = usedAt; });
      throw error;
    }
    try {
      await sendPasswordResetEmail(mailConfig, email, `${mailConfig.publicUrl}/reset-password/${token}`, reset.expiresAt);
    } catch (error) {
      reset.usedAt = new Date().toISOString();
      try {
        await persistStore();
      } catch (persistError) {
        console.error("Could not invalidate undelivered password reset:", persistError.code || "STORE_ERROR");
      }
      console.error("Password reset email delivery failed:", error.code || "SMTP_ERROR");
    }
    return sendJson(response, 202, {
      message: "If an eligible account exists and email delivery succeeds, password reset instructions will be sent. If no email arrives, contact platform support."
    });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/password-reset/confirm") {
    const body = await readBody(request);
    const token = cleanText(body.token, 64);
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[a-f0-9]{64}$/.test(token) || password.length < 10 || password.length > 200) {
      return apiError(response, 400, "Use a valid reset link and a password between 10 and 200 characters.");
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const reset = store.passwordResets.find(item => {
      if (item.usedAt || item.expiresAt <= new Date().toISOString() ||
        typeof item.tokenHash !== "string" || !/^[a-f0-9]{64}$/.test(item.tokenHash)) return false;
      return crypto.timingSafeEqual(Buffer.from(item.tokenHash, "hex"), Buffer.from(tokenHash, "hex"));
    });
    if (!reset) return apiError(response, 410, "This password reset link is invalid, expired, or already used. Request a new link.");
    const user = store.users.find(entry => entry.id === reset.userId);
    if (!user || isAccountSuspended(user)) return apiError(response, 410, "This password reset link is invalid, expired, or already used. Contact platform support.");
    const previousHash = user.passwordHash;
    const previousResetStates = store.passwordResets.filter(item => item.userId === user.id).map(item => [item, item.usedAt]);
    const resetAt = new Date().toISOString();
    user.passwordHash = await hashPassword(password);
    store.passwordResets.filter(item => item.userId === user.id).forEach(item => { item.usedAt = resetAt; });
    const resetAudit = audit(user, "account", user.id, "auth.password_reset", null, { resetAt });
    try {
      await persistStore();
    } catch (error) {
      user.passwordHash = previousHash;
      previousResetStates.forEach(([item, usedAt]) => { item.usedAt = usedAt; });
      store.audit = store.audit.filter(item => item.id !== resetAudit.id);
      throw error;
    }
    revokeUserSessions([user.id]);
    return sendJson(response, 200, { success: true, message: "Password updated. Log in with your new password." });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readBody(request);
    const firstName = cleanText(body.firstName, 80);
    const lastName = cleanText(body.lastName, 80);
    const email = cleanText(body.email, 254).toLowerCase();
    const role = cleanText(body.role, 30);
    const organizationName = cleanText(body.organizationName, 160);
    const password = typeof body.password === "string" ? body.password : "";
    const validRole = ["school", "distributor", "retailer", "publisher", "other"].includes(role);
    const authorizedAdmin = role === "admin" && process.env.GOERUDITE_ADMIN_KEY &&
      Buffer.byteLength(cleanText(body.bootstrapKey, 200)) === Buffer.byteLength(process.env.GOERUDITE_ADMIN_KEY) &&
      crypto.timingSafeEqual(Buffer.from(cleanText(body.bootstrapKey, 200)), Buffer.from(process.env.GOERUDITE_ADMIN_KEY));
    if (!firstName || !lastName || organizationName.length < 2 || !validEmail(email) || password.length < 10 || password.length > 200 || (!validRole && !authorizedAdmin)) {
      return sendJson(response, 400, { error: "Enter your name, organisation, valid email, supported role, and a password of at least 10 characters." });
    }
    if (body.consent !== true && body.consent !== "on") return sendJson(response, 400, { error: "Accept the platform terms and privacy policy to create an account." });
    if (role === "admin" && (adminRegistrationInProgress || store.users.some(user => user.role === "admin"))) {
      return sendJson(response, 403, { error: "An administrator already exists or is being created. Use the existing administrator account to manage platform access." });
    }
    if (store.users.some(user => user.email === email)) return sendJson(response, 409, { error: "An account with this email already exists. Please log in." });
    const isAdmin = role === "admin";
    if (isAdmin) adminRegistrationInProgress = true;
    try {
      const id = crypto.randomUUID();
      const user = {
        id,
        firstName,
        lastName,
        email,
        role,
        organizationName,
        organizationId: id,
        staffProfile: "owner",
        profile: {},
        consentAcceptedAt: new Date().toISOString(),
        verificationStatus: isAdmin ? "verified" : "pending",
        accountStatus: "active",
        passwordHash: await hashPassword(password),
        createdAt: new Date().toISOString()
      };
      if (store.users.some(existing => existing.email === email)) {
        return sendJson(response, 409, { error: "An account with this email already exists. Please log in." });
      }
      store.users.push(user);
      const previousAudit = store.audit.slice();
      try {
        audit(user, "account", user.id, "auth.registered", null, {
          role: user.role,
          organizationId: user.organizationId,
          verificationStatus: user.verificationStatus
        });
        await persistStore();
      } catch (error) {
        store.users.splice(store.users.indexOf(user), 1);
        store.audit.splice(0, store.audit.length, ...previousAudit);
        throw error;
      }
      if (mfaRequiredForUser(user) && !user.mfaEnabled) {
        return sendJson(response, 201, {
          mfaSetupRequired: true,
          message: "This account must enroll in MFA before it can access GoErudite."
        }, { "Set-Cookie": createMfaEnrollmentSession(user) });
      }
      return sendJson(response, 201, { user: publicUser(user) }, { "Set-Cookie": createSession(user) });
    } finally {
      if (isAdmin) adminRegistrationInProgress = false;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(request);
    const email = cleanText(body.email, 254).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const previousToken = sessionTokenFromRequest(request);
    if (previousToken) sessions.delete(previousToken);
    if (loginRateLimited(request, email)) return apiError(response, 429, "Too many sign-in attempts. Try again after 15 minutes.");
    const user = store.users.find(entry => entry.email === email);
    if (!user || !(await passwordMatches(password, user.passwordHash))) {
      recordLoginFailure(request, email);
      return sendJson(response, 401, { error: "Email or password is incorrect." });
    }
    if (isAccountSuspended(user)) return sendJson(response, 403, { error: "This account is suspended. Contact GoErudite support for assistance." });
    if (mfaRequiredForUser(user) && !user.mfaEnabled) {
      return sendJson(response, 200, {
        mfaSetupRequired: true,
        message: "This account must enroll in MFA before it can access GoErudite."
      }, { "Set-Cookie": createMfaEnrollmentSession(user) });
    }
    let factor = null;
    if (user.mfaEnabled) {
      const code = cleanText(body.mfaCode, 10);
      const recoveryCode = cleanText(body.recoveryCode, 40);
      if (!code && !recoveryCode) {
        return sendJson(response, 200, { mfaRequired: true }, { "Set-Cookie": mfaCookie("", 0) });
      }
      try {
        factor = verifyMfaFactor(user, code, recoveryCode);
      } catch (error) {
        if (error.code === "MFA_KEY_UNAVAILABLE") return apiError(response, 503, error.message);
        throw error;
      }
      if (!factor) {
        recordLoginFailure(request, email);
        return sendJson(response, loginRateLimited(request, email) ? 429 : 401, {
          error: loginRateLimited(request, email)
            ? "Too many sign-in attempts. Try again after 15 minutes."
            : "Email, password, or verification code is incorrect."
        });
      }
    }
    clearLoginAttempts(request, email);
    audit(user, "account_security", user.id, factor ? "auth.login_mfa" : "auth.login", null, {
      role: user.role,
      mfa: user.mfaEnabled === true,
      method: factor?.method || "password"
    });
    await persistStore();
    return sendJson(response, 200, { user: publicUser(user) }, { "Set-Cookie": createSession(user) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const cookie = request.headers.cookie || "";
    const match = cookie.match(/(?:^|;\s*)goerudite_session=([a-f0-9]{64})(?:;|$)/);
    if (match) sessions.delete(match[1]);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return sendJson(response, 200, { success: true }, { "Set-Cookie": `goerudite_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}` });
  }

  if (request.method === "POST" && url.pathname === "/api/support") {
    const body = await readBody(request);
    const firstName = cleanText(body.firstName, 80);
    const lastName = cleanText(body.lastName, 80);
    const email = cleanText(body.email, 254).toLowerCase();
    const role = cleanText(body.role, 40);
    const message = cleanText(body.message, 3000);
    if (!firstName || !lastName || !validEmail(email) || !["School Administrator", "Distributor", "Retailer", "Publisher", "Other Authorized User"].includes(role) || message.length < 10) {
      return sendJson(response, 400, { error: "Complete all required fields and describe your support need in at least 10 characters." });
    }
    const ticket = { id: `GE-${crypto.randomBytes(4).toString("hex").toUpperCase()}`, firstName, lastName, email, role, message, createdAt: new Date().toISOString(), status: "received" };
    store.requests.push(ticket);
    await persistStore();
    return sendJson(response, 201, { success: true, ticketId: ticket.id, message: "Your support request has been received." });
  }

  if (request.method === "POST" && url.pathname === "/api/rfqs") {
    const user = getSession(request);
    if (!user) return sendJson(response, 401, { error: "Please log in to your school account to create an institutional RFQ." });
    if (user.role !== "school") return sendJson(response, 403, { error: "Only verified school accounts can create institutional RFQs." });
    const body = await readBody(request);
    const book = catalog.find(item => item.id === cleanText(body.bookId, 100));
    const quantity = Number(body.quantity);
    if (!book) return sendJson(response, 404, { error: "The selected catalog title could not be found." });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return sendJson(response, 400, { error: "Quantity must be a whole number between 1 and 10,000." });
    const rfq = { id: `RFQ-${crypto.randomBytes(4).toString("hex").toUpperCase()}`, userId: user.id, bookId: book.id, bookTitle: book.title, quantity, createdAt: new Date().toISOString(), status: "submitted" };
    store.rfqs.push(rfq);
    await persistStore();
    return sendJson(response, 201, { success: true, rfq: { id: rfq.id, bookTitle: rfq.bookTitle, quantity: rfq.quantity, status: rfq.status } });
  }

  if (request.method === "GET" && url.pathname === "/api/rfqs") {
    const user = getSession(request);
    if (!user) return sendJson(response, 401, { error: "Please log in to view institutional RFQs." });
    return sendJson(response, 200, { items: store.rfqs.filter(rfq => (rfq.ownerId || rfq.userId) === organizationId(user)).map(({ id, bookTitle, quantity, createdAt, status }) => ({ id, bookTitle, quantity, createdAt, status })) });
  }

  return sendJson(response, 404, { error: "API endpoint not found." });
}

async function handleApi(request, response, url) {
  const restoreRequest = url.pathname === "/api/admin/backups/restore" && request.method === "POST";
  if (restoreInProgress) return apiError(response, restoreRequest ? 409 : 503, restoreRequest
    ? "Another backup restore is already in progress."
    : "A protected backup restore is in progress. Retry this request shortly.");
  inFlightApiRequests += 1;
  try {
    await handleApiInternal(request, response, url);
  } finally {
    inFlightApiRequests -= 1;
    if (restoreInProgress && inFlightApiRequests <= 1 && restoreDrainResolver) {
      const resolve = restoreDrainResolver;
      restoreDrainResolver = null;
      resolve();
    }
  }
}

async function serveStatic(_request, response, url) {
  const pathname = decodeURIComponent(url.pathname);
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    const origin = seoPublicOrigin(url);
    if (pathname === "/robots.txt") {
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" });
      return response.end(`User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /forgot-password\nDisallow: /reset-password/\nDisallow: /invite/\nSitemap: ${origin}/sitemap.xml\n`);
    }
    await publishScheduledBlogs();
    const paths = [
      ...PUBLIC_SITEMAP_PATHS,
      ...catalog.map(book => `/book/${encodeURIComponent(book.id)}`),
      ...store.publisherCatalog
        .filter(book => book.status === "published" && book.publicCatalogId)
        .map(book => `/book/${encodeURIComponent(book.publicCatalogId)}`),
      ...store.blogs
        .filter(blog => blog.status === "published")
        .map(blog => `/blog/${encodeURIComponent(blog.slug)}`),
      ...store.advertisements
        .filter(advertisement => advertisementActive(advertisement))
        .map(advertisement => `/advertisements/${encodeURIComponent(advertisement.id)}`)
    ];
    const urls = [...new Set(paths)].map(route => {
      const location = new URL(route, `${origin}/`).href;
      return `  <url><loc>${escapeXml(location)}</loc></url>`;
    });
    response.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" });
    return response.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
  }
  let statusCode = 200;
  let publicFile = PUBLIC_ASSETS.get(normalizedPath);
  if (pathname.startsWith("/blog/")) await publishScheduledBlogs();
  if (!publicFile && (PUBLIC_PAGE_ROUTES.has(pathname) || /^\/book\/[^/]+$/.test(pathname) || /^\/blog\/[a-z0-9-]+$/.test(pathname) || /^\/advertisements\/[A-Za-z0-9-]+$/.test(pathname) || /^\/invite\/[a-f0-9]{64}$/.test(pathname) || /^\/reset-password\/[a-f0-9]{64}$/.test(pathname))) {
    const bookId = pathname.match(/^\/book\/([^/]+)$/)?.[1];
    const blogSlug = pathname.match(/^\/blog\/([a-z0-9-]+)$/)?.[1];
    const adId = pathname.match(/^\/advertisements\/([A-Za-z0-9-]+)$/)?.[1];
    const knownBook = bookId && (catalog.some(book => book.id === bookId) ||
      store.publisherCatalog.some(book => book.status === "published" && book.publicCatalogId === bookId));
    const knownBlog = blogSlug && store.blogs.some(item => item.slug === blogSlug && item.status === "published");
    const knownAd = adId && store.advertisements.some(item => item.id === adId && advertisementActive(item));
    if (PUBLIC_PAGE_ROUTES.has(pathname) || knownBook || knownBlog || knownAd || /^\/invite\/[a-f0-9]{64}$/.test(pathname) || /^\/reset-password\/[a-f0-9]{64}$/.test(pathname)) publicFile = "index.html";
    else statusCode = 404;
  }
  if (!publicFile) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return response.end("Page not found.");
  }
  let filePath = path.join(FRONTEND_DIR, publicFile);
  let body;
  try {
    body = await fs.readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      filePath = path.join(ROOT, publicFile);
      body = await fs.readFile(filePath);
    } else {
      throw error;
    }
  }
  if (publicFile === "index.html") {
    body = Buffer.from(applyPublicPageMetadata(body.toString("utf8"), pathname, seoPublicOrigin(url)), "utf8");
  }
  const sensitiveAuthPage = pathname === "/forgot-password" ||
    pathname.startsWith("/reset-password/") || pathname.startsWith("/invite/");
  response.writeHead(statusCode, {
    "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": sensitiveAuthPage ? "no-store" :
      [".html", ".js", ".css"].includes(path.extname(filePath).toLowerCase()) ? "no-cache" : "public, max-age=3600",
    ...(sensitiveAuthPage ? { "Referrer-Policy": "no-referrer" } : {}),
    ...(pathname === "/dashboard" || pathname === "/forgot-password" ||
      pathname.startsWith("/invite/") || pathname.startsWith("/reset-password/")
      ? { "X-Robots-Tag": "noindex, nofollow" }
      : {})
  });
  response.end(body);
}

function seoPublicOrigin(url) {
  const configuredOrigin = process.env.GOERUDITE_PUBLIC_URL?.trim();
  if (!configuredOrigin) return url.origin;
  let parsed;
  try {
    parsed = new URL(configuredOrigin);
  } catch {
    throw Object.assign(new Error("GOERUDITE_PUBLIC_URL must be a valid HTTP or HTTPS origin."), { status: 503 });
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
    parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw Object.assign(new Error("GOERUDITE_PUBLIC_URL must be a clean HTTP or HTTPS origin without a path or credentials."), { status: 503 });
  }
  return parsed.origin;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[character]);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function applyPublicPageMetadata(html, pathname, origin) {
  let metadata = SEO_PAGE_METADATA[pathname];
  if (pathname.startsWith("/reset-password/")) {
    metadata = [
      "Set a New GoErudite Password | Account Help",
      "Choose a new password using your secure, time-limited GoErudite account recovery link."
    ];
  }
  if (!metadata) {
    const bookId = pathname.match(/^\/book\/([^/]+)$/)?.[1];
    const book = bookId && (catalog.find(item => item.id === bookId) ||
      store.publisherCatalog.find(item => item.status === "published" && item.publicCatalogId === bookId));
    if (book) metadata = [
      `${book.title} | Academic Book Catalogue | GoErudite`,
      `${book.title} by ${book.publisher || "the listed publisher"}. Review catalogue details and prepare an institutional RFQ draft on GoErudite.`
    ];
    const blogSlug = pathname.match(/^\/blog\/([a-z0-9-]+)$/)?.[1];
    const blog = blogSlug && store.blogs.find(item => item.slug === blogSlug && item.status === "published");
    if (blog) metadata = [`${blog.title} | GoErudite Blog`, blog.content.slice(0, 155)];
    const advertisementId = pathname.match(/^\/advertisements\/([A-Za-z0-9-]+)$/)?.[1];
    const advertisement = advertisementId && store.advertisements.find(item => item.id === advertisementId && advertisementActive(item));
    if (advertisement) metadata = [
      `${advertisement.title} | Sponsored Listing | GoErudite`,
      `View this sponsored education listing from ${advertisement.advertiserName}. Contact the advertiser through GoErudite to ask about availability and terms.`
    ];
  }
  const [title, description] = metadata || ["GoErudite | Academic Catalogue and Sourcing Workflows", SEO_PAGE_METADATA["/"][1]];
  const canonicalPath = pathname.startsWith("/reset-password/") ? "/forgot-password" :
    pathname.startsWith("/invite/") ? "/dashboard" : pathname;
  const canonical = new URL(canonicalPath, `${origin}/`).href;
  const robots = pathname === "/dashboard" || pathname === "/forgot-password" ||
    pathname.startsWith("/invite/") || pathname.startsWith("/reset-password/")
    ? "noindex, nofollow"
    : "index, follow";
  const setTagContent = (markup, pattern, replacement) => pattern.test(markup)
    ? markup.replace(pattern, replacement)
    : markup.replace("</head>", `${replacement}\n  </head>`);
  html = setTagContent(html, /<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = setTagContent(html, /<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeHtml(description)}">`);
  html = setTagContent(html, /<meta\s+name="robots"[^>]*>/i, `<meta name="robots" content="${robots}">`);
  html = setTagContent(html, /<meta\s+name="goerudite-canonical-origin"[^>]*>/i, `<meta name="goerudite-canonical-origin" content="${escapeHtml(origin)}">`);
  html = setTagContent(html, /<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${escapeHtml(canonical)}">`);
  html = setTagContent(html, /<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${escapeHtml(title)}">`);
  html = setTagContent(html, /<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${escapeHtml(description)}">`);
  html = setTagContent(html, /<meta\s+property="og:type"[^>]*>/i, '<meta property="og:type" content="website">');
  return setTagContent(html, /<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${escapeHtml(canonical)}">`);
}

let initPromise = null;

async function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      store = await loadStore();
      try {
        await publishScheduledBlogs();
      } catch (error) {
        console.error("Could not publish due blog posts during startup:", error);
      }
    })();
  }
  return initPromise;
}

async function requestListener(request, response) {
  await ensureInitialized();
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.origin;
      const fetchSite = request.headers["sec-fetch-site"];
      let originMismatch = false;
      if (origin) {
        try {
          originMismatch = new URL(origin).origin !== url.origin;
        } catch {
          originMismatch = true;
        }
      }
      if (originMismatch || fetchSite === "cross-site") {
        return apiError(response, 403, "Cross-origin state-changing requests are not allowed.");
      }
    }
    if (url.pathname.startsWith("/api/")) await handleApi(request, response, url);
    else if (request.method === "GET" || request.method === "HEAD") await serveStatic(request, response, url);
    else sendJson(response, 405, { error: "Method not allowed." }, { Allow: "GET, HEAD" });
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    const status = error.status || 500;
    if (status === 500) console.error(error);
    sendJson(response, status, { error: status === 500 ? "The server could not complete the request." : error.message });
  }
}

const server = http.createServer(requestListener);

async function main() {
  await ensureInitialized();
  const scheduledBlogPublisher = setInterval(() => {
    publishScheduledBlogs().catch(error => console.error("Scheduled blog publication failed:", error));
  }, 15_000);
  scheduledBlogPublisher.unref();

  server.listen(PORT, "0.0.0.0", () => console.log(`GoErudite is running at http://localhost:${PORT}`));
}

// Automatically start the server when run directly
if (require.main === module || !process.env.VERCEL) {
  main().catch(error => {
    console.error("Could not start GoErudite:", error);
    process.exitCode = 1;
  });
}

module.exports = server;
module.exports.requestListener = requestListener;
module.exports.ensureInitialized = ensureInitialized;
