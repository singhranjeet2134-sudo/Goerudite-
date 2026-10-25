const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { totpAt } = require("../mfa");
const zlib = require("node:zlib");
const { strFromU8, strToU8, unzipSync, zipSync } = require("fflate");

const root = path.resolve(__dirname, "..");
const adminKey = "goerudite-e2e-bootstrap-key";
const mfaEncryptionKey = crypto.randomBytes(32).toString("hex");
const auditHmacKey = crypto.randomBytes(32).toString("hex");
let baseUrl;
let dataDir;
let serverProcess;
let serverOutput = "";
let smtpServer;
let smtpPort;
const sentInvitationEmails = [];
let advertisementTestAccounts;
let roleTestAccounts;
const testMfaRecoveryCodes = new Map();

async function availablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

async function startFakeSmtp() {
  smtpServer = createServer(socket => {
    socket.setEncoding("utf8");
    socket.write("220 localhost ESMTP ready\r\n");
    let buffer = "";
    let dataMode = false;
    let message = "";
    socket.on("data", chunk => {
      buffer += chunk;
      while (true) {
        const lineEnd = buffer.indexOf("\r\n");
        if (lineEnd < 0) break;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        if (dataMode) {
          if (line === ".") {
            dataMode = false;
            sentInvitationEmails.push(message);
            message = "";
            socket.write("250 queued\r\n");
          } else message += `${line}\n`;
        } else if (/^EHLO /i.test(line)) socket.write("250-localhost\r\n250 PIPELINING\r\n");
        else if (/^RCPT TO:<bounce-/i.test(line)) socket.write("550 recipient rejected\r\n");
        else if (/^(HELO|MAIL FROM:|RCPT TO:|RSET|NOOP)/i.test(line)) socket.write("250 ok\r\n");
        else if (/^DATA$/i.test(line)) {
          dataMode = true;
          socket.write("354 continue\r\n");
        } else if (/^QUIT$/i.test(line)) {
          socket.write("221 bye\r\n");
          socket.end();
        } else socket.write("500 unsupported\r\n");
      }
    });
  });
  await new Promise((resolve, reject) => {
    smtpServer.once("error", reject);
    smtpServer.listen(0, "127.0.0.1", resolve);
  });
  smtpPort = smtpServer.address().port;
}

async function rawRequest(route, method = "GET", body, cookie = "", extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...extraHeaders
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return {
    status: response.status,
    payload,
    contentType: response.headers.get("content-type") || "",
    robotsTag: response.headers.get("x-robots-tag") || "",
    cacheControl: response.headers.get("cache-control") || "",
    referrerPolicy: response.headers.get("referrer-policy") || "",
    setCookie: response.headers.get("set-cookie") || "",
    cookie: response.headers.get("set-cookie")?.match(/goerudite_session=([^;]+)/)?.[1]
  };
}

async function request(route, method = "GET", body, cookie = "", extraHeaders = {}) {
  let result = await rawRequest(route, method, body, cookie, extraHeaders);
  if (route === "/api/auth/register" && result.status === 201 && result.payload.mfaSetupRequired) {
    const pendingCookie = sessionCookie(result);
    const enrollment = await rawRequest("/api/auth/mfa/enroll/start", "POST", {}, pendingCookie);
    assert.equal(enrollment.status, 200, "mandatory MFA enrollment starts after registration");
    const verify = await rawRequest("/api/auth/mfa/enroll/verify", "POST", {
      code: totpAt(enrollment.payload.secret).code
    }, pendingCookie);
    assert.equal(verify.status, 200, "mandatory MFA enrollment verifies");
    testMfaRecoveryCodes.set(String(body.email).toLowerCase(), verify.payload.recoveryCodes.slice());
    result = { ...result, payload: verify.payload, setCookie: verify.setCookie, cookie: verify.cookie };
  } else if (route === "/api/auth/login" && result.status === 200 && result.payload.mfaRequired) {
    const email = String(body.email).toLowerCase();
    const recoveryCode = testMfaRecoveryCodes.get(email)?.shift();
    assert.ok(recoveryCode, "the isolated test account has an unused MFA recovery code");
    result = await rawRequest("/api/auth/login", "POST", {
      ...body,
      recoveryCode
    }, cookie, extraHeaders);
  }
  return result;
}

function sessionCookie(response) {
  assert.ok(response.cookie, "expected the server to issue a session cookie");
  return `goerudite_session=${response.cookie}`;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function tinyPngDataUrl() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const image = Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(Buffer.from([0, 0, 0, 0, 0]))),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
  return `data:image/png;base64,${image.toString("base64")}`;
}

async function stopMainServer() {
  if (serverProcess && serverProcess.exitCode === null) {
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 2000);
      serverProcess.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      serverProcess.kill();
    });
  }
}

async function startMainServer() {
  serverProcess = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(new URL(baseUrl).port),
      GOERUDITE_DATA_DIR: dataDir,
      GOERUDITE_ADMIN_KEY: adminKey,
      GOERUDITE_MFA_ENCRYPTION_KEY: mfaEncryptionKey,
      GOERUDITE_AUDIT_HMAC_KEY: auditHmacKey,
      GOERUDITE_SMTP_HOST: "127.0.0.1",
      GOERUDITE_SMTP_PORT: String(smtpPort),
      GOERUDITE_SMTP_FROM: "GoErudite <invites@example.test>",
      GOERUDITE_PUBLIC_URL: "https://goerudite.example.test",
      GOERUDITE_INSTAGRAM_URL: "https://www.instagram.com/goerudite.test/",
      GOERUDITE_LINKEDIN_URL: "https://www.linkedin.com/company/goerudite-test/",
      GOERUDITE_SMTP_REQUIRE_TLS: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  serverProcess.stdout.on("data", chunk => { serverOutput += chunk.toString(); });
  serverProcess.stderr.on("data", chunk => { serverOutput += chunk.toString(); });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (serverProcess.exitCode !== null) throw new Error(`Test server exited before becoming ready.\n${serverOutput}`);
    try {
      const health = await fetch(`${baseUrl}/api/health`);
      if (health.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not become ready.\n${serverOutput}`);
}

before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "goerudite-e2e-"));
  await startFakeSmtp();
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      GOERUDITE_DATA_DIR: dataDir,
      GOERUDITE_ADMIN_KEY: adminKey,
      GOERUDITE_MFA_ENCRYPTION_KEY: mfaEncryptionKey,
      GOERUDITE_AUDIT_HMAC_KEY: auditHmacKey,
      GOERUDITE_SMTP_HOST: "127.0.0.1",
      GOERUDITE_SMTP_PORT: String(smtpPort),
      GOERUDITE_SMTP_FROM: "GoErudite <invites@example.test>",
      GOERUDITE_PUBLIC_URL: "https://goerudite.example.test",
      GOERUDITE_INSTAGRAM_URL: "https://www.instagram.com/goerudite.test/",
      GOERUDITE_LINKEDIN_URL: "https://www.linkedin.com/company/goerudite-test/",
      GOERUDITE_SMTP_REQUIRE_TLS: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  serverProcess.stdout.on("data", chunk => { serverOutput += chunk.toString(); });
  serverProcess.stderr.on("data", chunk => { serverOutput += chunk.toString(); });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Test server exited before becoming ready.\n${serverOutput}`);
    }
    try {
      const health = await fetch(`${baseUrl}/api/health`);
      if (health.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not become ready.\n${serverOutput}`);
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 2000);
      serverProcess.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      serverProcess.kill();
    });
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  if (smtpServer) await new Promise(resolve => smtpServer.close(resolve));
});

test("mandatory MFA enrollment, sign-in, recovery-code single use, and rate limiting", async () => {
  const suffix = crypto.randomUUID();
  const email = `mfa-${suffix}@example.test`;
  const password = "mfa-protection-test-password";
  const registration = await rawRequest("/api/auth/register", "POST", {
    firstName: "MFA",
    lastName: "Owner",
    email,
    organizationName: "MFA Test School",
    role: "school",
    password,
    consent: true
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.payload.mfaSetupRequired, true);
  const pendingCookie = sessionCookie(registration);
  assert.equal((await rawRequest("/api/dashboard", "GET", undefined, pendingCookie)).status, 401);

  const enrollment = await rawRequest("/api/auth/mfa/enroll/start", "POST", {}, pendingCookie);
  assert.equal(enrollment.status, 200);
  assert.match(enrollment.payload.otpauthUrl, /^otpauth:\/\/totp\//);
  const rejectedCode = await rawRequest("/api/auth/mfa/enroll/verify", "POST", { code: "not-a-code" }, pendingCookie);
  assert.equal(rejectedCode.status, 401);

  const firstCode = totpAt(enrollment.payload.secret).code;
  const verified = await rawRequest("/api/auth/mfa/enroll/verify", "POST", { code: firstCode }, pendingCookie);
  assert.equal(verified.status, 200);
  assert.equal(verified.payload.user.mfaEnabled, true);
  assert.equal(verified.payload.user.mfaRequired, true);
  assert.equal(verified.payload.recoveryCodes.length, 10);
  assert.equal("mfaSecretEncrypted" in verified.payload.user, false);
  assert.equal((await rawRequest("/api/dashboard", "GET", undefined, pendingCookie)).status, 401);
  const activeCookie = sessionCookie(verified);
  assert.equal((await rawRequest("/api/dashboard", "GET", undefined, activeCookie)).status, 200);
  assert.equal((await rawRequest("/api/auth/mfa/disable", "POST", {
    password,
    code: firstCode
  }, activeCookie)).status, 403, "mandatory MFA cannot be disabled");

  const secondFactorPrompt = await rawRequest("/api/auth/login", "POST", { email, password });
  assert.equal(secondFactorPrompt.status, 200);
  assert.equal(secondFactorPrompt.payload.mfaRequired, true);
  assert.equal(secondFactorPrompt.cookie, undefined);
  const replayedCode = await rawRequest("/api/auth/login", "POST", { email, password, mfaCode: firstCode });
  assert.equal(replayedCode.status, 401, "a previously accepted TOTP counter cannot be replayed");
  const nextCode = totpAt(enrollment.payload.secret, (Math.floor(Date.now() / 30000) + 1) * 30000).code;
  const otpLogin = await rawRequest("/api/auth/login", "POST", { email, password, mfaCode: nextCode });
  assert.equal(otpLogin.status, 200);
  assert.equal(otpLogin.payload.user.mfaEnabled, true);

  const recoveryCode = verified.payload.recoveryCodes[0];
  const recoveryLogin = await rawRequest("/api/auth/login", "POST", { email, password, recoveryCode });
  assert.equal(recoveryLogin.status, 200);
  assert.equal(recoveryLogin.payload.user.mfaEnabled, true);
  assert.equal((await rawRequest("/api/auth/login", "POST", { email, password, recoveryCode })).status, 401,
    "a recovery code cannot be reused");

  const rateEmail = `mfa-rate-${suffix}@example.test`;
  const rateRegistration = await rawRequest("/api/auth/register", "POST", {
    firstName: "Rate",
    lastName: "Limit",
    email: rateEmail,
    organizationName: "MFA Rate Limit School",
    role: "school",
    password,
    consent: true
  });
  const rateCookie = sessionCookie(rateRegistration);
  const rateEnrollment = await rawRequest("/api/auth/mfa/enroll/start", "POST", {}, rateCookie);
  let lastAttempt;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    lastAttempt = await rawRequest("/api/auth/mfa/enroll/verify", "POST", { code: "not-a-code" }, rateCookie);
  }
  assert.equal(lastAttempt.status, 429, "enrollment verification is rate limited");
  assert.ok(rateEnrollment.payload.secret);

  const optionalRegistration = await request("/api/auth/register", "POST", {
    firstName: "Optional",
    lastName: "MFA",
    email: `mfa-optional-${suffix}@example.test`,
    organizationName: "Optional MFA Account",
    role: "other",
    password,
    consent: true
  });
  assert.equal(optionalRegistration.payload.user.mfaRequired, false);
  assert.equal(optionalRegistration.payload.user.mfaEnabled, false);
  const optionalCookie = sessionCookie(optionalRegistration);
  const optionalEnrollment = await rawRequest("/api/auth/mfa/enroll/start", "POST", {
    password
  }, optionalCookie);
  assert.equal(optionalEnrollment.status, 200);
  const optionalVerification = await rawRequest("/api/auth/mfa/enroll/verify", "POST", {
    code: totpAt(optionalEnrollment.payload.secret).code
  }, optionalCookie);
  assert.equal(optionalVerification.status, 200);
  assert.equal(optionalVerification.payload.user.mfaRequired, false);
  const optionalActiveCookie = sessionCookie(optionalVerification);
  const optionalDisable = await rawRequest("/api/auth/mfa/disable", "POST", {
    password,
    recoveryCode: optionalVerification.payload.recoveryCodes[0]
  }, optionalActiveCookie);
  assert.equal(optionalDisable.status, 200);
  assert.equal(optionalDisable.payload.user.mfaEnabled, false);
});

test("role-based procurement and moderation journeys", async () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const roleUsers = {};

  const health = await request("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.payload.status, "ok");
  const publicPlans = await request("/api/plans");
  assert.equal(publicPlans.status, 200);
  assert.deepEqual(publicPlans.payload.items.map(item => [item.id, item.monthlyPrice]), [
    ["school", 0],
    ["other", 0],
    ["distributor", 1000],
    ["retailer", 1000],
    ["publisher", 1500]
  ]);
  assert.ok(publicPlans.payload.items.every(item => item.paymentEnabled === false && item.subscriptionEnforced === false));
  assert.equal(publicPlans.payload.items.find(item => item.id === "distributor").freeQuoteSubmissions, 3);
  assert.equal(publicPlans.payload.items.find(item => item.id === "retailer").freeQuoteSubmissions, 3);
  assert.ok(publicPlans.payload.items.every(item => item.quoteAllowanceEnforced === false));
  const publicContact = await request("/api/public/contact");
  assert.equal(publicContact.status, 200);
  assert.equal(publicContact.payload.phone, "+91 8586032007");
  assert.equal(publicContact.payload.phoneHref, "+918586032007");
  assert.equal(publicContact.payload.email, "support@goerudite.com");
  assert.deepEqual(publicContact.payload.social.map(item => item.name), ["instagram", "linkedin", "whatsapp"]);
  assert.equal(publicContact.payload.social.find(item => item.name === "instagram").url, "https://www.instagram.com/goerudite.test/");
  assert.equal(publicContact.payload.social.find(item => item.name === "linkedin").url, "https://www.linkedin.com/company/goerudite-test/");
  assert.ok(publicContact.payload.social.some(item => item.name === "whatsapp" && item.url === "https://wa.me/918586032007"));
  assert.ok(publicContact.payload.social.every(item => ["instagram", "linkedin", "whatsapp"].includes(item.name)));
  assert.equal((await request("/api/catalog?maxPrice=0")).payload.total, 0);
  assert.equal((await request("/api/catalog?maxPrice=-1")).status, 400);
  assert.equal((await request("/api/catalog?page=0")).status, 400);
  assert.equal((await request("/api/catalog?page=not-a-number")).status, 400);
  assert.equal((await request("/does-not-exist")).status, 404);
  for (const route of ["/", "/solutions", "/pricing", "/about", "/trust", "/help", "/forgot-password", "/contact", "/dashboard", "/catalog", "/advertisements", "/blog"]) {
    const page = await request(route);
    assert.equal(page.status, 200, `${route} public page`);
    assert.match(page.contentType, /text\/html/);
    if (route === "/dashboard") assert.equal(page.robotsTag, "noindex, nofollow");
  }
  const publicHomeHtml = (await request("/")).payload;
  assert.match(publicHomeHtml, /<title>GoErudite \| Academic Book Catalogue and RFQ Workflows<\/title>/);
  assert.match(publicHomeHtml, /<link rel="canonical" href="https:\/\/goerudite\.example\.test\/">/);
  assert.match(publicHomeHtml, /<meta property="og:url" content="https:\/\/goerudite\.example\.test\/">/);
  const bookPageHtml = (await request("/book/mathematics-world")).payload;
  assert.match(bookPageHtml, /<title>Mathematics World \| Academic Book Catalogue \| GoErudite<\/title>/);
  assert.match(bookPageHtml, /<link rel="canonical" href="https:\/\/goerudite\.example\.test\/book\/mathematics-world">/);
  const dashboardHtml = (await request("/dashboard")).payload;
  assert.match(dashboardHtml, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(dashboardHtml, /<title>Role-Based Account Dashboard \| GoErudite<\/title>/);
  const invitationHtml = (await request(`/invite/${"a".repeat(64)}`)).payload;
  assert.match(invitationHtml, /<meta name="robots" content="noindex, nofollow">/);
  const passwordResetPage = await request(`/reset-password/${"b".repeat(64)}`);
  assert.equal(passwordResetPage.status, 200);
  assert.equal(passwordResetPage.robotsTag, "noindex, nofollow");
  assert.match(passwordResetPage.payload, /<title>Set a New GoErudite Password \| Account Help<\/title>/);
  assert.equal(passwordResetPage.cacheControl, "no-store");
  assert.equal(passwordResetPage.referrerPolicy, "no-referrer");
  assert.match(passwordResetPage.payload, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(passwordResetPage.payload, /<link rel="canonical" href="https:\/\/goerudite\.example\.test\/forgot-password">/);
  assert.equal(passwordResetPage.payload.includes("b".repeat(64)), false, "reset token is not reflected in canonical metadata");
  assert.equal(passwordResetPage.contentType, "text/html; charset=utf-8");
  const robots = await request("/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(robots.contentType, /text\/plain/);
  assert.match(robots.payload, /Disallow: \/dashboard/);
  assert.match(robots.payload, /Sitemap: https:\/\/goerudite\.example\.test\/sitemap\.xml/);
  const sitemap = await request("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.contentType, /application\/xml/);
  assert.match(sitemap.payload, /https:\/\/goerudite\.example\.test\/catalog/);
  assert.match(sitemap.payload, /https:\/\/goerudite\.example\.test\/book\/mathematics-world/);
  assert.doesNotMatch(sitemap.payload, /\/dashboard|\/invite\//);
  const privateInvite = await request(`/invite/${"a".repeat(64)}`);
  assert.equal(privateInvite.status, 200);
  assert.equal(privateInvite.robotsTag, "noindex, nofollow");
  for (const route of ["/index.html", "/app.js", "/dashboard.js", "/styles.css", "/favicon.svg"]) {
    assert.equal((await request(route)).status, 200, `${route} public asset`);
  }
  for (const route of ["/server.js", "/README.md", "/.gitignore", "/data/store.json"]) {
    assert.equal((await request(route)).status, 404, `${route} is not a public asset`);
  }
  assert.equal((await request("/api/auth/register", "POST", {
    firstName: "Missing",
    lastName: "Organisation",
    email: `missing-${suffix}@example.test`,
    role: "school",
    password: "audit-password-1",
    consent: true
  })).status, 400);
  const registrationWithoutConsent = await request("/api/auth/register", "POST", {
    firstName: "No",
    lastName: "Consent",
    email: `no-consent-${suffix}@example.test`,
    organizationName: "Consent Test School",
    role: "school",
    password: "audit-password-1"
  });
  assert.equal(registrationWithoutConsent.status, 400);
  assert.match(registrationWithoutConsent.payload.error, /terms and privacy/i);

  const adminRegistrations = await Promise.all(["first", "second"].map(label => request("/api/auth/register", "POST", {
    firstName: "Audit",
    lastName: "Admin",
    email: `admin-${label}-${suffix}@example.test`,
    organizationName: "Audit Administration",
    role: "admin",
    password: "admin-password-1",
    bootstrapKey: adminKey,
    consent: true
  })));
  const adminRegistration = adminRegistrations.find(item => item.status === 201);
  const rejectedConcurrentAdmin = adminRegistrations.find(item => item.status === 403);
  assert.ok(adminRegistration, "exactly one first-admin registration should succeed");
  assert.ok(rejectedConcurrentAdmin, "a concurrent first-admin registration should be rejected");
  const adminEmail = adminRegistration.payload.user.email;
  assert.equal(adminRegistration.status, 201);
  const concurrentDuplicateRegistrations = await Promise.all(Array.from({ length: 8 }, () => request("/api/auth/register", "POST", {
    firstName: "Concurrent",
    lastName: "School",
    email: `concurrent-${suffix}@example.test`,
    organizationName: "Concurrent Registration Test School",
    role: "school",
    password: "concurrency-test-password",
    consent: true
  })));
  assert.equal(concurrentDuplicateRegistrations.filter(item => item.status === 201).length, 1,
    "only one concurrent registration for the same email may succeed");
  assert.equal(concurrentDuplicateRegistrations.filter(item => item.status === 409).length, 7);
  const concurrentEmailRecords = JSON.parse(await readFile(path.join(dataDir, "store.json"), "utf8")).users
    .filter(item => item.email === `concurrent-${suffix}@example.test`);
  assert.equal(concurrentEmailRecords.length, 1, "the persisted store must contain one account for the email");

  const concurrentSupportRequests = await Promise.all(Array.from({ length: 12 }, (_, index) => request("/api/support", "POST", {
    firstName: "Concurrent",
    lastName: `Support ${index}`,
    email: `concurrent-support-${index}-${suffix}@example.test`,
    role: "School Administrator",
    message: `Isolated concurrent persistence check number ${index}.`
  })));
  assert.ok(concurrentSupportRequests.every(item => item.status === 201));
  const concurrentRequestIds = new Set(concurrentSupportRequests.map(item => item.payload.ticketId));
  const persistedConcurrentRequests = JSON.parse(await readFile(path.join(dataDir, "store.json"), "utf8")).requests;
  assert.equal(concurrentRequestIds.size, 12);
  assert.ok([...concurrentRequestIds].every(id => persistedConcurrentRequests.some(item => item.id === id)),
    "all independent concurrent writes must be present in the persisted JSON store");

  assert.match(adminRegistration.setCookie, /HttpOnly/);
  assert.match(adminRegistration.setCookie, /SameSite=Lax/);
  assert.match(adminRegistration.setCookie, /Path=\//);
  const admin = sessionCookie(adminRegistration);

  const loginKey = `login-limit-${suffix}@example.test`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await request("/api/auth/login", "POST", { email: loginKey, password: "wrong-password" })).status, 401);
  }
  const rateLimitedLogin = await request("/api/auth/login", "POST", { email: loginKey, password: "wrong-password" });
  assert.equal(rateLimitedLogin.status, 429);
  assert.match(rateLimitedLogin.payload.error, /too many sign-in attempts/i);
  const invalidKnownUserLogin = await request("/api/auth/login", "POST", {
    email: adminEmail,
    password: "incorrect-admin-password"
  });
  assert.equal(invalidKnownUserLogin.status, 401);
  assert.equal(invalidKnownUserLogin.cookie, undefined, "invalid credentials must not issue a session cookie");

  for (const role of ["school", "distributor", "retailer", "publisher", "other"]) {
    const registration = await request("/api/auth/register", "POST", {
      firstName: role,
      lastName: "Tester",
      email: `${role}-${suffix}@example.test`,
      organizationName: `${role} Test Organisation`,
      role,
      password: "tester-password-1",
      consent: true
    });
    assert.equal(registration.status, 201, `${role} registration`);
    roleUsers[role] = {
      id: registration.payload.user.id,
      email: `${role}-${suffix}@example.test`,
      cookie: sessionCookie(registration)
    };
  }
  const storeBeforeHelpChat = await readFile(path.join(dataDir, "store.json"), "utf8");
  const publicHelpConfig = await request("/api/help/chat");
  assert.equal(publicHelpConfig.status, 200);
  assert.equal(publicHelpConfig.payload.role, "public");
  assert.ok(publicHelpConfig.payload.suggestions.en.length > 0);
  const helpRoleCookies = {
    admin,
    ...Object.fromEntries(Object.entries(roleUsers).map(([role, account]) => [role, account.cookie]))
  };
  for (const [role, cookie] of Object.entries(helpRoleCookies)) {
    const helpConfig = await request("/api/help/chat", "GET", undefined, cookie);
    assert.equal(helpConfig.payload.role, role);
    assert.ok(helpConfig.payload.suggestions.en.length > 0);
  }
  const distributorHelpConfig = await request("/api/help/chat", "GET", undefined, roleUsers.distributor.cookie);
  assert.ok(!distributorHelpConfig.payload.suggestions.en.includes("Create and publish a School RFQ"));
  const schoolHelpAnswer = await request("/api/help/chat", "POST", {
    question: "rfq publish nahi ho rahi",
    language: "hi"
  }, roleUsers.school.cookie);
  assert.equal(schoolHelpAnswer.status, 200);
  assert.equal(schoolHelpAnswer.payload.matched, true);
  assert.equal(schoolHelpAnswer.payload.answer.id, "school-rfq-publish");
  assert.ok(schoolHelpAnswer.payload.answer.steps.some(step => /Book requirements/.test(step)));
  const wrongRoleHelp = await request("/api/help/chat", "POST", {
    question: "school academic session board state medium student strength",
    language: "en"
  }, roleUsers.distributor.cookie);
  assert.equal(wrongRoleHelp.payload.matched, false);
  const unknownHelp = await request("/api/help/chat", "POST", {
    question: "<img src=x onerror=alert(1)> unknown help",
    language: "en"
  });
  assert.equal(unknownHelp.payload.matched, false);
  assert.ok(!unknownHelp.payload.message.includes("<img"));
  assert.equal((await request("/api/help/chat", "POST", { question: " ", language: "en" })).status, 400);
  assert.equal((await request("/api/help/chat", "POST", { question: "x".repeat(501), language: "en" })).status, 400);
  assert.equal((await request("/api/help/chat", "POST", { question: "hello", language: "fr" })).status, 400);
  for (let attempt = 0; attempt < 14; attempt += 1) {
    assert.equal((await request("/api/help/chat", "POST", { question: "forgot password", language: "en" })).status, 200);
  }
  const rateLimitedChat = await request("/api/help/chat", "POST", { question: "forgot password", language: "en" });
  assert.equal(rateLimitedChat.status, 429);
  assert.equal(await readFile(path.join(dataDir, "store.json"), "utf8"), storeBeforeHelpChat,
    "help questions and suggestions must not be persisted in the business store");
  const secondSchoolRegistration = await request("/api/auth/register", "POST", {
    firstName: "Second",
    lastName: "School",
    email: `second-school-${suffix}@example.test`,
    organizationName: "Second School Test Organisation",
    role: "school",
    password: "second-school-password-1",
    consent: true
  });
  assert.equal(secondSchoolRegistration.status, 201);
  const secondSchool = {
    id: secondSchoolRegistration.payload.user.id,
    cookie: sessionCookie(secondSchoolRegistration)
  };
  const thirdSchoolRegistration = await request("/api/auth/register", "POST", {
    firstName: "Third",
    lastName: "School",
    email: `third-school-${suffix}@example.test`,
    organizationName: "Third School Test Organisation",
    role: "school",
    password: "third-school-password-1",
    consent: true
  });
  assert.equal(thirdSchoolRegistration.status, 201);
  const thirdSchool = {
    id: thirdSchoolRegistration.payload.user.id,
    cookie: sessionCookie(thirdSchoolRegistration)
  };
  const persistedAuthUsers = JSON.parse(await readFile(path.join(dataDir, "store.json"), "utf8")).users;
  for (const account of persistedAuthUsers) {
    assert.match(account.passwordHash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
    assert.notEqual(account.passwordHash, "tester-password-1");
    assert.equal(Object.hasOwn(account, "password"), false);
  }
  const attemptedRoleChange = await request("/api/profile", "PATCH", {
    organizationName: "School Test Organisation",
    role: "admin",
    staffProfile: "owner",
    permissions: ["admin"]
  }, roleUsers.school.cookie);
  assert.equal(attemptedRoleChange.status, 200);
  const unchangedSchool = await request("/api/auth/me", "GET", undefined, roleUsers.school.cookie);
  assert.equal(unchangedSchool.payload.user.role, "school");
  assert.equal(unchangedSchool.payload.user.staffProfile, "owner");
  assert.equal((await request("/api/admin/overview", "GET", undefined, roleUsers.school.cookie)).status, 403);
  const recoveryRegistration = await request("/api/auth/register", "POST", {
    firstName: "Recovery",
    lastName: "Tester",
    email: `recovery-${suffix}@example.test`,
    organizationName: "Password Recovery Test School",
    role: "school",
    password: "recovery-old-password",
    consent: true
  });
  assert.equal(recoveryRegistration.status, 201);
  const recoveryCookie = sessionCookie(recoveryRegistration);
  const resetRequest = await request("/api/auth/password-reset/request", "POST", {
    email: recoveryRegistration.payload.user.email
  });
  assert.equal(resetRequest.status, 202);
  assert.equal(Object.hasOwn(resetRequest.payload, "token"), false);
  const resetEmail = sentInvitationEmails.join("").replace(/=\n/g, "").replace(/\s/g, "");
  const resetToken = resetEmail.match(/https:\/\/goerudite\.example\.test\/reset-password\/([a-f0-9]{64})/)?.[1];
  assert.ok(resetToken, "configured SMTP receives a single-use reset link");
  const unknownResetRequest = await request("/api/auth/password-reset/request", "POST", {
    email: `unknown-${suffix}@example.test`
  });
  assert.equal(unknownResetRequest.status, 202);
  assert.equal(unknownResetRequest.payload.message, resetRequest.payload.message);
  const resetConfirmation = await request("/api/auth/password-reset/confirm", "POST", {
    token: resetToken,
    password: "recovery-new-password"
  });
  assert.equal(resetConfirmation.status, 200);
  assert.equal((await request("/api/auth/me", "GET", undefined, recoveryCookie)).payload.user, null);
  const previousPasswordLogin = await request("/api/auth/login", "POST", {
    email: recoveryRegistration.payload.user.email,
    password: "recovery-old-password"
  });
  assert.equal(previousPasswordLogin.status, 401);
  assert.equal(previousPasswordLogin.cookie, undefined);
  const updatedPasswordLogin = await request("/api/auth/login", "POST", {
    email: recoveryRegistration.payload.user.email,
    password: "recovery-new-password"
  });
  assert.equal(updatedPasswordLogin.status, 200);
  assert.equal((await request("/api/auth/password-reset/confirm", "POST", {
    token: resetToken,
    password: "recovery-reused-password"
  })).status, 410);
  const failedDeliveryRegistration = await request("/api/auth/register", "POST", {
    firstName: "Bounce",
    lastName: "Recovery",
    email: `bounce-reset-${suffix}@example.test`,
    organizationName: "Reset Delivery Failure School",
    role: "school",
    password: "bounce-reset-password",
    consent: true
  });
  assert.equal(failedDeliveryRegistration.status, 201);
  const failedDeliveryResponse = await request("/api/auth/password-reset/request", "POST", {
    email: failedDeliveryRegistration.payload.user.email
  });
  assert.equal(failedDeliveryResponse.status, 202);
  assert.equal(Object.hasOwn(failedDeliveryResponse.payload, "token"), false);
  const failedDeliveryStore = JSON.parse(await readFile(path.join(dataDir, "store.json"), "utf8"));
  const failedDeliveryReset = failedDeliveryStore.passwordResets.find(item => item.userId === failedDeliveryRegistration.payload.user.id);
  assert.ok(failedDeliveryReset?.usedAt, "a failed reset email cannot leave an active reset token");

  const pendingRfq = await request("/api/rfqs", "POST", {
    status: "published",
    session: "2026-27",
    board: "CBSE",
    state: "Delhi",
    medium: "English",
    lines: [{ title: "Not yet approved", quantity: 2 }]
  }, roleUsers.school.cookie);
  assert.equal(pendingRfq.status, 403);
  assert.equal((await request("/api/rfqs", "GET", undefined, roleUsers.distributor.cookie)).status, 403,
    "unverified suppliers cannot browse school RFQs");
  const unverifiedSupplierDashboard = await request("/api/dashboard", "GET", undefined, roleUsers.distributor.cookie);
  assert.equal(unverifiedSupplierDashboard.status, 200);
  assert.deepEqual(unverifiedSupplierDashboard.payload.opportunities, [],
    "unverified suppliers must not receive RFQ opportunities through the dashboard API");

  const unverifiedDraft = await request("/api/publisher/catalogue", "POST", {
    title: "Publisher draft",
    isbn: "9781234567804",
    publisherMrp: 100
  }, roleUsers.publisher.cookie);
  assert.equal(unverifiedDraft.status, 201);
  const unverifiedSubmission = await request("/api/publisher/catalogue", "POST", {
    title: "Blocked publisher submission",
    isbn: "9781234567811",
    publisherMrp: 100,
    subject: "Science",
    level: "Class 5",
    board: "CBSE",
    medium: "English",
    edition: "1",
    session: "2026-27",
    submit: true
  }, roleUsers.publisher.cookie);
  assert.equal(unverifiedSubmission.status, 403);

  assert.equal((await request(`/api/admin/users/${roleUsers.school.id}/verification`, "PATCH", {
    decision: "verified"
  }, admin)).status, 400, "verification decisions require an audit reason");
  for (const role of Object.keys(roleUsers)) {
    const result = await request(`/api/admin/users/${roleUsers[role].id}/verification`, "PATCH", {
      decision: "verified",
      reason: "Organisation details reviewed and verified."
    }, admin);
    assert.equal(result.status, 200, `verify ${role}`);
    assert.equal((await request("/api/dashboard", "GET", undefined, roleUsers[role].cookie)).status, 200);
  }
  assert.equal((await request(`/api/admin/users/${secondSchool.id}/verification`, "PATCH", {
    decision: "verified",
    reason: "Second school registration reviewed."
  }, admin)).status, 200);
  assert.equal((await request(`/api/admin/users/${thirdSchool.id}/verification`, "PATCH", {
    decision: "verified",
    reason: "Third school registration reviewed."
  }, admin)).status, 200);
  for (const supplierRole of ["distributor", "retailer"]) {
    const territory = await request("/api/admin/supplier-territories", "POST", {
      supplierOrganizationId: roleUsers[supplierRole].id,
      state: "Delhi",
      city: "Delhi"
    }, admin);
    assert.equal(territory.status, 201, `${supplierRole} service territory is explicitly configured`);
  }
  assert.equal((await request("/api/admin/supplier-territories", "POST", {
    supplierOrganizationId: roleUsers.distributor.id,
    state: "Delhi",
    city: "Delhi"
  }, admin)).status, 409, "duplicate supplier territories are rejected");
  assert.equal((await request("/api/admin/supplier-territories", "POST", {
    supplierOrganizationId: roleUsers.distributor.id,
    state: "Delhi",
    city: "Other",
    postalCode: "123"
  }, admin)).status, 400, "invalid territory postal codes are rejected");
  assert.equal((await request("/api/admin/supplier-territories", "GET", undefined, roleUsers.school.cookie)).status, 403,
    "school users cannot manage supplier territories");
  const territoryRfq = await request("/api/rfqs", "POST", {
    status: "published",
    title: "Territory exception test",
    session: "2026-27",
    board: "CBSE",
    state: "Delhi",
    medium: "English",
    deliveryState: "Maharashtra",
    deliveryCity: "Mumbai",
    responseDeadline: "2099-12-31",
    lines: [{ title: "Territory scoped requirement", quantity: 3 }]
  }, roleUsers.school.cookie);
  assert.equal(territoryRfq.status, 201);
  const outOfTerritoryList = await request("/api/rfqs", "GET", undefined, roleUsers.distributor.cookie);
  assert.equal(outOfTerritoryList.payload.items.some(item => item.id === territoryRfq.payload.rfq.id), false,
    "suppliers cannot discover RFQs outside their configured locations");
  assert.equal((await request(`/api/rfqs/${territoryRfq.payload.rfq.id}/quotes`, "GET", undefined,
    roleUsers.distributor.cookie)).status, 403, "direct quote access enforces supplier territory");
  const outOfTerritoryQuote = await request(`/api/rfqs/${territoryRfq.payload.rfq.id}/quotes`, "POST", {
    lines: [{ unitPrice: 35, offeredQuantity: 3, availability: "full" }],
    deliveryEstimate: "5 days",
    validThrough: "2099-12-31"
  }, roleUsers.distributor.cookie);
  assert.equal(outOfTerritoryQuote.status, 403, "direct quotation submission enforces supplier territory");
  assert.equal((await request("/api/admin/territory-exceptions", "POST", {
    supplierOrganizationId: roleUsers.distributor.id,
    rfqId: territoryRfq.payload.rfq.id,
    reason: "This expiry must be rejected.",
    expiresAt: new Date(Date.now() - 86400000).toISOString()
  }, admin)).status, 400, "expired territory exceptions are rejected");
  const territoryException = await request("/api/admin/territory-exceptions", "POST", {
    supplierOrganizationId: roleUsers.distributor.id,
    rfqId: territoryRfq.payload.rfq.id,
    reason: "Verified exception for an approved delivery commitment.",
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
  }, admin);
  assert.equal(territoryException.status, 201);
  assert.equal((await request("/api/rfqs", "GET", undefined, roleUsers.distributor.cookie)).payload.items.some(
    item => item.id === territoryRfq.payload.rfq.id
  ), true, "an active single-RFQ exception grants only the scoped opportunity");
  const exceptionQuote = await request(`/api/rfqs/${territoryRfq.payload.rfq.id}/quotes`, "POST", {
    lines: [{ unitPrice: 35, offeredQuantity: 3, availability: "full" }],
    deliveryEstimate: "5 days",
    validThrough: "2099-12-31"
  }, roleUsers.distributor.cookie);
  assert.equal(exceptionQuote.status, 201);
  const exceptionRevocation = await request(`/api/admin/territory-exceptions/${territoryException.payload.exception.id}`,
    "DELETE", undefined, admin);
  assert.equal(exceptionRevocation.status, 200);
  assert.equal((await request(`/api/rfqs/${territoryRfq.payload.rfq.id}/quotes`, "GET", undefined,
    roleUsers.distributor.cookie)).status, 403, "revocation immediately removes exception access");
  assert.equal((await request(`/api/admin/territory-exceptions/${territoryException.payload.exception.id}`,
    "DELETE", undefined, admin)).status, 409, "a territory exception cannot be revoked twice");
  const auditVerification = await request("/api/admin/audit/verify", "GET", undefined, admin);
  assert.equal(auditVerification.status, 200);
  assert.equal(auditVerification.payload.verification.valid, true,
    JSON.stringify(auditVerification.payload.verification));
  assert.ok(auditVerification.payload.verification.checked > 0,
    "the audit API verifies the persisted hash chain after territory changes");
  const incompleteAcademicRfq = await request("/api/rfqs", "POST", {
    status: "published",
    lines: [{ title: "Academic fields must be supplied", quantity: 2 }]
  }, secondSchool.cookie);
  assert.equal(incompleteAcademicRfq.status, 400,
    "the backend rejects publication without required academic fields");
  const organisationStaff = {};
  for (const role of ["school", "distributor", "retailer", "publisher"]) {
    const staffEmail = `${role}-staff-${suffix}@example.test`;
    const staffProfile = role === "school" ? "manager" : "read_only";
    const invitation = await request("/api/team/invites", "POST", {
      email: staffEmail,
      staffProfile
    }, roleUsers[role].cookie);
    assert.equal(invitation.status, 201, `${role} owner can invite staff`);
    assert.match(invitation.payload.invitePath, /^\/invite\/[a-f0-9]{64}$/);
    assert.equal((await request(invitation.payload.invitePath)).status, 200, "invite route serves the acceptance page");
    const token = invitation.payload.invitePath.split("/").pop();
    const accepted = await request("/api/team/accept", "POST", {
      token,
      firstName: "Invited",
      lastName: role,
      password: "invited-staff-password-1"
    });
    assert.equal(accepted.status, 201, `${role} invitation is accepted`);
    assert.equal(accepted.payload.user.role, role);
    assert.equal(accepted.payload.user.organizationId, roleUsers[role].id);
    assert.equal(accepted.payload.user.staffProfile, staffProfile);
    assert.equal((await request("/api/team", "GET", undefined, sessionCookie(accepted))).status, 403);
    assert.equal((await request("/api/team/accept", "POST", {
      token,
      firstName: "Second",
      lastName: "Use",
      password: "invited-staff-password-2"
    })).status, 410, "invite can be used only once");
    organisationStaff[role] = {
      id: accepted.payload.user.id,
      email: staffEmail,
      cookie: sessionCookie(accepted)
    };
  }
  roleUsers.schoolManager = organisationStaff.school;
  const schoolOwnerNotifications = await request("/api/dashboard", "GET", undefined, roleUsers.school.cookie);
  const sharedSchoolNotification = schoolOwnerNotifications.payload.notifications.find(item => item.userId === roleUsers.school.id);
  assert.ok(sharedSchoolNotification, "organisation notifications should be visible to invited staff");
  const managerNotifications = await request("/api/dashboard", "GET", undefined, roleUsers.schoolManager.cookie);
  assert.equal(managerNotifications.payload.notifications.find(item => item.id === sharedSchoolNotification.id)?.readAt, null);
  assert.equal((await request("/api/notifications", "POST", { id: sharedSchoolNotification.id }, roleUsers.schoolManager.cookie)).status, 200,
    "organisation staff can mark a shared organisation notification as read");
  const managerReadNotification = await request("/api/dashboard", "GET", undefined, roleUsers.schoolManager.cookie);
  assert.ok(managerReadNotification.payload.notifications.find(item => item.id === sharedSchoolNotification.id)?.readAt);
  const persistedReadState = JSON.parse(await readFile(path.join(dataDir, "store.json"), "utf8"))
    .notifications.find(item => item.id === sharedSchoolNotification.id);
  assert.ok(persistedReadState.readBy?.[roleUsers.schoolManager.id]);
  assert.equal(persistedReadState.readAt, null, "staff read state is stored separately from the legacy shared readAt field");
  const ownerUnreadNotification = await request("/api/dashboard", "GET", undefined, roleUsers.school.cookie);
  assert.equal(ownerUnreadNotification.payload.notifications.find(item => item.id === sharedSchoolNotification.id)?.readAt, null,
    "a staff member's read state must not mark the owner's copy as read");
  assert.equal((await request("/api/notifications", "POST", { id: sharedSchoolNotification.id }, roleUsers.other.cookie)).status, 404,
    "another organisation cannot mark a school notification as read");
  const secondManagerInvite = await request("/api/team/invites", "POST", {
    email: `second-manager-${suffix}@example.test`,
    staffProfile: "manager"
  }, roleUsers.school.cookie);
  assert.equal(secondManagerInvite.status, 201);
  const secondManagerAcceptance = await request("/api/team/accept", "POST", {
    token: secondManagerInvite.payload.invitePath.split("/").pop(),
    firstName: "Second",
    lastName: "Approver",
    password: "second-manager-password-1"
  });
  assert.equal(secondManagerAcceptance.status, 201);
  roleUsers.schoolSecondManager = {
    id: secondManagerAcceptance.payload.user.id,
    cookie: sessionCookie(secondManagerAcceptance)
  };
  const revokedInvite = await request("/api/team/invites", "POST", {
    email: `revoked-staff-${suffix}@example.test`,
    staffProfile: "buyer"
  }, roleUsers.school.cookie);
  assert.equal(revokedInvite.status, 201);
  assert.equal(revokedInvite.payload.emailDelivery.status, "sent");
  const deliveredEmailText = sentInvitationEmails.join("").replace(/=\n/g, "").replace(/\s/g, "");
  assert.ok(deliveredEmailText.includes(`revoked-staff-${suffix}@example.test`) &&
    deliveredEmailText.includes(`https://goerudite.example.test${revokedInvite.payload.invitePath}`),
  "configured SMTP receives the invitation and configured public URL");
  const revokedInviteId = revokedInvite.payload.invitation.id;
  assert.equal((await request(`/api/team/invites/${revokedInviteId}`, "DELETE", undefined, roleUsers.school.cookie)).status, 200);
  assert.equal((await request("/api/team/accept", "POST", {
    token: revokedInvite.payload.invitePath.split("/").pop(),
    firstName: "Revoked",
    lastName: "Invite",
    password: "revoked-staff-password-1"
  })).status, 410, "revoked invitations cannot be redeemed");
  const bouncedInvite = await request("/api/team/invites", "POST", {
    email: `bounce-${suffix}@example.test`,
    staffProfile: "buyer"
  }, roleUsers.school.cookie);
  assert.equal(bouncedInvite.status, 201);
  assert.equal(bouncedInvite.payload.emailDelivery.status, "failed");
  assert.equal((await request("/api/team/accept", "POST", {
    token: bouncedInvite.payload.invitePath.split("/").pop(),
    firstName: "Manual",
    lastName: "Fallback",
    password: "manual-fallback-password-1"
  })).status, 201, "a delivery failure leaves the one-time invite usable for manual sharing");
  const teamList = await request("/api/team", "GET", undefined, roleUsers.school.cookie);
  assert.equal(teamList.status, 200);
  assert.ok(teamList.payload.members.some(member => member.id === organisationStaff.school.id));
  assert.ok(teamList.payload.invitations.every(invite => !Object.hasOwn(invite, "tokenHash")));
  assert.equal((await request("/api/inventory", "POST", {
    items: [{ title: "Unauthorised inventory change", availableQuantity: 3 }]
  }, organisationStaff.distributor.cookie)).status, 403, "read-only staff cannot change supplier inventory");

  const backupDenied = await request("/api/admin/backups", "POST", {}, roleUsers.school.cookie);
  assert.equal(backupDenied.status, 403, "non-admin cannot create backups");
  const backupCreated = await request("/api/admin/backups", "POST", {}, admin);
  assert.equal(backupCreated.status, 201);
  assert.equal(backupCreated.payload.backup.integrity, "valid");
  assert.equal(backupCreated.payload.restoreAvailable, true);
  const backupStatus = await request("/api/admin/backups", "GET", undefined, admin);
  assert.equal(backupStatus.payload.restoreAvailable, true);
  assert.ok(backupStatus.payload.items.some(item => item.name === backupCreated.payload.backup.name));
  assert.equal((await request("/api/admin/backups/restore", "POST", {
    name: backupCreated.payload.backup.name,
    confirmation: backupCreated.payload.backup.name
  }, roleUsers.school.cookie)).status, 403, "non-admin cannot restore a backup");
  assert.equal((await request("/api/admin/backups/restore", "POST", {
    name: backupCreated.payload.backup.name,
    confirmation: "not-the-filename"
  }, admin)).status, 400, "restore requires exact filename confirmation");
  assert.equal((await request("/api/admin/backups/restore", "POST", {
    name: "../store.json",
    confirmation: "../store.json"
  }, admin)).status, 400, "restore rejects paths outside the backup filename allowlist");
  const corruptBackupName = "goerudite-20260101T000000Z-deadbeef.json";
  await writeFile(path.join(dataDir, "backups", corruptBackupName), "not a JSON backup", { flag: "wx" });
  const corruptBackupStatus = await request("/api/admin/backups", "GET", undefined, admin);
  assert.equal(corruptBackupStatus.payload.items.find(item => item.name === corruptBackupName)?.integrity, "invalid");
  assert.equal((await request("/api/admin/backups/restore", "POST", {
    name: corruptBackupName,
    confirmation: corruptBackupName
  }, admin)).status, 400, "invalid backups are never restored");

  const rfqTemplateResponse = await fetch(`${baseUrl}/api/rfqs/template.xlsx`, { headers: { Cookie: roleUsers.school.cookie } });
  assert.equal(rfqTemplateResponse.status, 200);
  assert.match(rfqTemplateResponse.headers.get("content-type"), /spreadsheetml\.sheet/);
  const rfqTemplateBytes = Buffer.from(await rfqTemplateResponse.arrayBuffer());
  const rfqXlsxImport = await request("/api/rfqs/import", "POST", {
    filename: "school-lines.xlsx",
    xlsx: rfqTemplateBytes.toString("base64"),
    title: "XLSX imported school requirements"
  }, roleUsers.school.cookie);
  assert.equal(rfqXlsxImport.status, 201, JSON.stringify(rfqXlsxImport.payload));
  assert.equal(rfqXlsxImport.payload.imported, 1);
  assert.equal(rfqXlsxImport.payload.rfq.status, "draft");
  assert.equal((await request("/api/rfqs/export.xlsx", "GET", undefined, roleUsers.school.cookie)).contentType.includes("spreadsheetml.sheet"), true);
  assert.equal((await request("/api/rfqs/import", "POST", {
    filename: "invalid.xlsx",
    xlsx: "!!!!"
  }, roleUsers.school.cookie)).status, 400);

  const inventoryTemplateResponse = await fetch(`${baseUrl}/api/inventory/template.xlsx`, { headers: { Cookie: roleUsers.distributor.cookie } });
  assert.equal(inventoryTemplateResponse.status, 200);
  const inventoryTemplateBytes = Buffer.from(await inventoryTemplateResponse.arrayBuffer());
  const multiSheetEntries = unzipSync(new Uint8Array(inventoryTemplateBytes));
  const secondSheetContents = strFromU8(multiSheetEntries["xl/worksheets/sheet1.xml"]).replace("Mathematics World", "Multi Sheet Book");
  multiSheetEntries["xl/worksheets/sheet2.xml"] = strToU8(secondSheetContents);
  multiSheetEntries["xl/workbook.xml"] = strToU8(strFromU8(multiSheetEntries["xl/workbook.xml"]).replace(
    "</sheets>",
    '<sheet name="SecondSheet" sheetId="2" r:id="rId2"/></sheets>'
  ));
  multiSheetEntries["xl/_rels/workbook.xml.rels"] = strToU8(strFromU8(multiSheetEntries["xl/_rels/workbook.xml.rels"]).replace(
    "</Relationships>",
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'
  ));
  const multiSheetImport = await request("/api/inventory/import", "POST", {
    filename: "multi-sheet-inventory.xlsx",
    xlsx: Buffer.from(zipSync(multiSheetEntries)).toString("base64")
  }, roleUsers.distributor.cookie);
  assert.equal(multiSheetImport.status, 200, JSON.stringify(multiSheetImport.payload));
  assert.equal(multiSheetImport.payload.imported, 2, "matching-header worksheets are merged");
  const invalidSecondSheet = unzipSync(new Uint8Array(inventoryTemplateBytes));
  const invalidSheetContents = strFromU8(invalidSecondSheet["xl/worksheets/sheet1.xml"]).replace("<v>25</v>", "<v>not-a-number</v>");
  invalidSecondSheet["xl/worksheets/sheet2.xml"] = strToU8(invalidSheetContents);
  invalidSecondSheet["xl/workbook.xml"] = strToU8(strFromU8(invalidSecondSheet["xl/workbook.xml"]).replace(
    "</sheets>",
    '<sheet name="BadInventory" sheetId="2" r:id="rId2"/></sheets>'
  ));
  invalidSecondSheet["xl/_rels/workbook.xml.rels"] = strToU8(strFromU8(invalidSecondSheet["xl/_rels/workbook.xml.rels"]).replace(
    "</Relationships>",
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'
  ));
  const invalidMultiSheetImport = await request("/api/inventory/import", "POST", {
    filename: "invalid-multi-sheet.xlsx",
    xlsx: Buffer.from(zipSync(invalidSecondSheet)).toString("base64")
  }, roleUsers.distributor.cookie);
  assert.equal(invalidMultiSheetImport.status, 400);
  assert.ok(invalidMultiSheetImport.payload.errors.some(error => error.row === "BadInventory!2"), "validation errors identify worksheet and source row");
  const mismatchedHeaders = unzipSync(new Uint8Array(inventoryTemplateBytes));
  mismatchedHeaders["xl/worksheets/sheet2.xml"] = strToU8(strFromU8(mismatchedHeaders["xl/worksheets/sheet1.xml"]).replace("title", "wrongHeader"));
  mismatchedHeaders["xl/workbook.xml"] = strToU8(strFromU8(mismatchedHeaders["xl/workbook.xml"]).replace(
    "</sheets>",
    '<sheet name="Mismatched" sheetId="2" r:id="rId2"/></sheets>'
  ));
  mismatchedHeaders["xl/_rels/workbook.xml.rels"] = strToU8(strFromU8(mismatchedHeaders["xl/_rels/workbook.xml.rels"]).replace(
    "</Relationships>",
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'
  ));
  const mismatchedHeadersImport = await request("/api/inventory/import", "POST", {
    filename: "mismatched-headers.xlsx",
    xlsx: Buffer.from(zipSync(mismatchedHeaders)).toString("base64")
  }, roleUsers.distributor.cookie);
  assert.equal(mismatchedHeadersImport.status, 400);
  assert.match(mismatchedHeadersImport.payload.error, /headers do not match/i);
  const formulaWorkbookEntries = unzipSync(new Uint8Array(inventoryTemplateBytes));
  const inventoryWorksheet = strFromU8(formulaWorkbookEntries["xl/worksheets/sheet1.xml"]);
  const formulaCell = /<c r="A2" t="inlineStr">[\s\S]*?<\/c>/;
  assert.match(inventoryWorksheet, formulaCell);
  formulaWorkbookEntries["xl/worksheets/sheet1.xml"] = strToU8(inventoryWorksheet.replace(
    formulaCell,
    '<c r="A2"><f>1+1</f><v>Mathematics World</v></c>'
  ));
  const formulaImport = await request("/api/inventory/import", "POST", {
    filename: "formula-inventory.xlsx",
    xlsx: Buffer.from(zipSync(formulaWorkbookEntries)).toString("base64")
  }, roleUsers.distributor.cookie);
  assert.equal(formulaImport.status, 400);
  assert.match(formulaImport.payload.error, /formulas are not accepted/i);
  const inventoryXlsxImport = await request("/api/inventory/import", "POST", {
    filename: "inventory.xlsx",
    xlsx: inventoryTemplateBytes.toString("base64")
  }, roleUsers.distributor.cookie);
  assert.equal(inventoryXlsxImport.status, 200);
  assert.equal(inventoryXlsxImport.payload.imported, 1);
  assert.equal((await request("/api/inventory/export.xlsx", "GET", undefined, roleUsers.distributor.cookie)).status, 200);

  const publisherTemplateResponse = await fetch(`${baseUrl}/api/publisher/catalogue/template.xlsx`, { headers: { Cookie: roleUsers.publisher.cookie } });
  assert.equal(publisherTemplateResponse.status, 200);
  const publisherTemplateBytes = Buffer.from(await publisherTemplateResponse.arrayBuffer());
  const publisherXlsxImport = await request("/api/publisher/catalogue/import", "POST", {
    filename: "catalogue.xlsx",
    xlsx: publisherTemplateBytes.toString("base64")
  }, roleUsers.publisher.cookie);
  assert.equal(publisherXlsxImport.status, 200);
  assert.equal(publisherXlsxImport.payload.imported, 1);
  assert.equal((await request("/api/publisher/catalogue/export.xlsx", "GET", undefined, roleUsers.publisher.cookie)).status, 200);
  advertisementTestAccounts = {
    adminEmail,
    adminPassword: "admin-password-1",
    schoolEmail: roleUsers.school.email,
    partnerEmail: roleUsers.distributor.email,
    password: "tester-password-1",
    partnerId: roleUsers.distributor.id
  };
  roleTestAccounts = {
    admin: { email: adminEmail, password: "admin-password-1" },
    ...Object.fromEntries(Object.entries(roleUsers).filter(([role]) => !["schoolManager", "schoolSecondManager"].includes(role)).map(([role, user]) => [role, {
      email: user.email,
      password: "tester-password-1",
      id: user.id
    }]))
  };
  const otherSession = await request("/api/auth/me", "GET", undefined, roleUsers.other.cookie);
  assert.equal(otherSession.payload.user.id, roleUsers.other.id);
  assert.equal((await request("/api/auth/logout", "POST", {}, roleUsers.other.cookie)).status, 200);
  assert.equal((await request("/api/auth/me", "GET", undefined, roleUsers.other.cookie)).payload.user, null);
  assert.equal((await request("/api/dashboard", "GET", undefined, roleUsers.other.cookie)).status, 401);
  const otherLogin = await request("/api/auth/login", "POST", {
    email: roleUsers.other.email,
    password: "tester-password-1"
  });
  assert.equal(otherLogin.status, 200);
  roleUsers.other.cookie = sessionCookie(otherLogin);
  assert.equal((await request(`/api/admin/users/${roleUsers.other.id}/verification`, "PATCH", {
    decision: "suspended",
    reason: "Administrative security test suspension."
  }, admin)).status, 200);
  assert.equal((await request("/api/auth/me", "GET", undefined, roleUsers.other.cookie)).payload.user, null);
  assert.equal((await request("/api/dashboard", "GET", undefined, roleUsers.other.cookie)).status, 401);
  assert.equal((await request("/api/auth/login", "POST", {
    email: roleUsers.other.email,
    password: "tester-password-1"
  })).status, 403);
  assert.equal((await request(`/api/admin/users/${roleUsers.other.id}/verification`, "PATCH", {
    decision: "active",
    reason: "Restoring the test account after access-control checks."
  }, admin)).status, 200);
  const restoredOtherLogin = await request("/api/auth/login", "POST", {
    email: roleUsers.other.email,
    password: "tester-password-1"
  });
  assert.equal(restoredOtherLogin.status, 200);
  roleUsers.other.cookie = sessionCookie(restoredOtherLogin);
  assert.equal((await request("/api/admin/overview", "GET", undefined, admin)).status, 200);
  const adminDashboard = await request("/api/dashboard", "GET", undefined, admin);
  assert.equal(adminDashboard.status, 200);
  assert.ok(Array.isArray(adminDashboard.payload.exceptions));
  assert.equal((await request("/api/admin/overview", "GET", undefined, roleUsers.school.cookie)).status, 403);
  assert.equal((await request("/api/rfqs", "GET", undefined, roleUsers.publisher.cookie)).status, 403);
  assert.equal((await request("/api/rfqs", "GET", undefined, roleUsers.other.cookie)).status, 403);
  assert.equal((await request("/api/orders", "GET", undefined, roleUsers.other.cookie)).status, 403);
  assert.equal((await request("/api/profile", "PATCH", {
    organizationName: "Cross-origin attempt"
  }, roleUsers.school.cookie, { Origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await request("/api/profile", "PATCH", {
    organizationName: "Cross-site fetch attempt"
  }, roleUsers.school.cookie, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await request("/api/profile", "PATCH", {
    organizationName: "School Test Organisation",
    postalCode: "!!"
  }, roleUsers.school.cookie)).status, 400);
  const profileUpdate = await request("/api/profile", "PATCH", {
    organizationName: "School Test Organisation",
    academicSession: "2026-27",
    board: "CBSE",
    state: "Delhi",
    medium: "English",
    "classCount:Class 5": 28
  }, roleUsers.school.cookie);
  assert.equal(profileUpdate.status, 200);
  const schoolDashboard = await request("/api/dashboard", "GET", undefined, roleUsers.school.cookie);
  assert.equal(schoolDashboard.payload.demandForecast.find(item => item.className === "Class 5").indicativeCopies, 28);
  assert.equal(schoolDashboard.payload.demandForecast.find(item => item.className === "Class 5").session, "2026-27");
  assert.ok(schoolDashboard.payload.profileCompletion.percentage >= 0 && schoolDashboard.payload.profileCompletion.percentage <= 100);
  assert.ok(schoolDashboard.payload.profileCompletion.missing.includes("Postal code"));
  for (const role of ["distributor", "retailer", "publisher"]) {
    const state = `${role} service state`;
    const profile = await request("/api/profile", "PATCH", {
      organizationName: `${role} Test Organisation`,
      state,
      serviceArea: `${role} test service area`,
      website: "https://publisher.example.test"
    }, roleUsers[role].cookie);
    assert.equal(profile.status, 200, `${role} profile update`);
    const dashboard = await request("/api/dashboard", "GET", undefined, roleUsers[role].cookie);
    assert.equal(dashboard.payload.user.profile.state, state, `${role} state persists`);
  }
  const demandPayload = () => ({
    status: "published",
    title: "Privacy threshold test",
    session: "2030-2031",
    board: "CBSE",
    state: "Delhi",
    medium: "English",
    deliveryState: "Delhi",
    deliveryCity: "Delhi",
    responseDeadline: "2099-12-31",
    lines: [{ title: "Shared demand test title", className: "Class 3", subject: "Privacy test", quantity: 10 }]
  });
  for (const schoolCookie of [roleUsers.school.cookie, secondSchool.cookie, roleUsers.school.cookie]) {
    const demandRfq = await request("/api/rfqs", "POST", demandPayload(), schoolCookie);
    assert.equal(demandRfq.status, 201);
  }
  let demandDashboard = await request("/api/dashboard", "GET", undefined, roleUsers.publisher.cookie);
  assert.equal(demandDashboard.payload.demandAnalytics.some(item =>
    item.session === "2030-2031" && item.className === "Class 3" && item.subject === "Privacy test"
  ), false, "two organisations cannot satisfy the anonymous demand threshold even with multiple RFQs");
  const thirdSchoolDemand = await request("/api/rfqs", "POST", demandPayload(), thirdSchool.cookie);
  assert.equal(thirdSchoolDemand.status, 201);
  demandDashboard = await request("/api/dashboard", "GET", undefined, roleUsers.publisher.cookie);
  const sharedDemand = demandDashboard.payload.demandAnalytics.find(item =>
    item.session === "2030-2031" && item.className === "Class 3" && item.subject === "Privacy test"
  );
  assert.deepEqual(
    { contributingSchools: sharedDemand?.contributingSchools, requestedCopies: sharedDemand?.requestedCopies },
    { contributingSchools: 3, requestedCopies: 40 }
  );
  assert.equal(Object.hasOwn(sharedDemand, "schoolIds"), false);
  assert.equal(Object.hasOwn(sharedDemand, "rfqIds"), false);

  const matchedBook = (await request("/api/catalog?q=Mathematics")).payload.items[0];
  assert.ok(matchedBook);
  const matchedRfq = await request("/api/rfqs", "POST", {
    status: "draft",
    session: "2026-27",
    board: "CBSE",
    state: "Delhi",
    medium: "English",
    lines: [{ bookId: matchedBook.id, title: matchedBook.title, quantity: 2 }]
  }, roleUsers.school.cookie);
  assert.equal(matchedRfq.status, 201);
  assert.equal(matchedRfq.payload.rfq.lines[0].bookId, matchedBook.id);
  assert.ok(matchedRfq.payload.rfq.completeness.missing.includes("delivery location"));
  assert.ok(matchedRfq.payload.rfq.completeness.missing.includes("response deadline"));
  assert.equal(matchedRfq.payload.rfq.lines[0].catalogSnapshot.title, matchedBook.title);
  const incompatibleRfq = await request("/api/rfqs", "POST", {
    status: "published",
    session: "2026-27",
    board: "CBSE",
    state: "Delhi",
    medium: "English",
    deliveryState: "Delhi",
    deliveryCity: "Delhi",
    responseDeadline: "2099-12-31",
    lines: [{ bookId: matchedBook.id, title: matchedBook.title, quantity: 2 }]
  }, roleUsers.school.cookie);
  assert.equal(incompatibleRfq.status, 400);
  assert.match(incompatibleRfq.payload.error, /academic session/i);
  const compatibleRfq = await request("/api/rfqs", "POST", {
    status: "published",
    session: "2025-26",
    board: "CBSE",
    state: "Delhi",
    medium: "English",
    deliveryState: "Delhi",
    deliveryCity: "Delhi",
    responseDeadline: "2099-12-31",
    lines: [{ bookId: matchedBook.id, title: matchedBook.title, quantity: 2 }]
  }, roleUsers.school.cookie);
  assert.equal(compatibleRfq.status, 201, compatibleRfq.payload.error);
  assert.equal(compatibleRfq.payload.rfq.academicCompatibility.compatible, true);
  assert.equal((await request("/api/dashboard", "GET", undefined, roleUsers.school.cookie))
    .payload.purchaseRequests.length, 0, "publishing an RFQ must not create a purchase order");
  const editableRfq = await request("/api/rfqs", "POST", {
    status: "published",
    session: "2025–2026",
    board: "CBSE",
    state: "Delhi",
    medium: "English",
    deliveryState: "Delhi",
    deliveryCity: "Delhi",
    responseDeadline: "2099-12-31",
    lines: [{ title: "Versioned academic requirement", quantity: 4 }]
  }, roleUsers.school.cookie);
  assert.equal(editableRfq.status, 201);
  const editedRfq = await request(`/api/rfqs/${editableRfq.payload.rfq.id}`, "PATCH", {
    action: "edit",
    changeReason: "Adjusting quantities after class enrolment review.",
    lines: [{ ...editableRfq.payload.rfq.lines[0], quantity: 5 }]
  }, roleUsers.school.cookie);
  assert.equal(editedRfq.status, 200);
  assert.equal(editedRfq.payload.rfq.version, 2);
  assert.equal(editedRfq.payload.rfq.versions[0].snapshot.lines[0].quantity, 4);
  const rfqAuditDashboard = await request("/api/dashboard", "GET", undefined, roleUsers.school.cookie);
  assert.ok(rfqAuditDashboard.payload.audit.some(item =>
    item.entity === "rfq" && item.entityId === editableRfq.payload.rfq.id && item.action === "rfq.edit"
  ), "material RFQ edits must be auditable");
  const unchangedRfq = await request(`/api/rfqs/${editableRfq.payload.rfq.id}`, "PATCH", {
    action: "edit",
    lines: editedRfq.payload.rfq.lines
  }, roleUsers.school.cookie);
  assert.equal(unchangedRfq.status, 200);
  assert.equal(unchangedRfq.payload.rfq.version, 2);
  assert.equal(unchangedRfq.payload.rfq.versions.length, 1);

  const rfqResult = await request("/api/rfqs", "POST", {
    status: "published",
    title: "E2E academic requirement",
    session: "2026-27",
    board: "CBSE",
    state: "Delhi",
    medium: "English",
    deliveryState: "Delhi",
    deliveryCity: "Delhi",
    budget: 900,
    lines: [{ title: "E2E Mathematics", quantity: 20, subject: "Mathematics" }]
  }, roleUsers.school.cookie);
  assert.equal(rfqResult.status, 201);
  const rfq = rfqResult.payload.rfq;
  assert.equal((await request("/api/rfqs", "GET", undefined, secondSchool.cookie)).payload.items.some(item => item.id === rfq.id), false);
  assert.equal((await request(`/api/rfqs/${rfq.id}`, "PATCH", {
    action: "cancel"
  }, secondSchool.cookie)).status, 404);
  assert.equal((await request(`/api/rfqs/${rfq.id}/quotes`, "GET", undefined, secondSchool.cookie)).status, 403);
  const publisherDashboard = await request("/api/dashboard", "GET", undefined, roleUsers.publisher.cookie);
  const publisherDemand = publisherDashboard.payload.demandAnalytics.find(item =>
    item.session === "2030-2031" && item.className === "Class 3" && item.subject === "Privacy test"
  );
  assert.equal(publisherDemand.contributingSchools, 3);
  assert.equal(Object.hasOwn(publisherDemand, "schoolIds"), false);
  assert.equal(Object.hasOwn(publisherDemand, "rfqIds"), false);
  assert.equal((await request(`/api/rfqs/${rfq.id}/quotes`, "POST", {
    lines: [{ unitPrice: 10, offeredQuantity: 1, availability: "partial" }],
    status: "submitted"
  }, roleUsers.publisher.cookie)).status, 403);
  const opportunities = await request("/api/rfqs", "GET", undefined, roleUsers.distributor.cookie);
  const opportunity = opportunities.payload.items.find(item => item.id === rfq.id);
  assert.ok(opportunity);
  assert.equal(opportunity.schoolName, "Verified school");
  assert.equal("ownerId" in opportunity, false);
  assert.equal("organizationName" in opportunity, false);

  const expiredQuoteAttempt = await request(`/api/rfqs/${rfq.id}/quotes`, "POST", {
    lines: [{ unitPrice: 50, offeredQuantity: 20, availability: "full" }],
    deliveryEstimate: "5 business days",
    validThrough: "2020-01-01"
  }, roleUsers.distributor.cookie);
  assert.equal(expiredQuoteAttempt.status, 400);
  const invalidPackQuote = await request(`/api/rfqs/${rfq.id}/quotes`, "POST", {
    lines: [{ unitPrice: 50, offeredQuantity: 20, availability: "full", minimumOrderQuantity: 5, packSize: 3 }],
    deliveryEstimate: "5 business days",
    validThrough: "2099-12-31"
  }, roleUsers.distributor.cookie);
  assert.equal(invalidPackQuote.status, 400);
  const quoteResult = await request(`/api/rfqs/${rfq.id}/quotes`, "POST", {
    lines: [{ unitPrice: 50, offeredQuantity: 20, availability: "full", note: "Edition confirmed", minimumOrderQuantity: 4, packSize: 2 }],
    deliveryEstimate: "5 business days",
    validThrough: "2099-12-31",
    freight: 40,
    deliveryMode: "pickup"
  }, roleUsers.distributor.cookie);
  assert.equal(quoteResult.status, 201);
  const quote = quoteResult.payload.quote;
  const revisedQuote = await request(`/api/rfqs/${rfq.id}/quotes`, "POST", {
    lines: [{ unitPrice: 50, offeredQuantity: 20, availability: "full", note: "Edition and stock rechecked", minimumOrderQuantity: 4, packSize: 2 }],
    deliveryEstimate: "6 business days",
    validThrough: "2099-12-31",
    freight: 40,
    deliveryMode: "pickup"
  }, roleUsers.distributor.cookie);
  assert.equal(revisedQuote.status, 200);
  assert.equal(revisedQuote.payload.quote.id, quote.id, "revisions update one supplier/RFQ quote rather than creating duplicates");
  assert.equal(revisedQuote.payload.quote.version, 2);
  assert.equal(revisedQuote.payload.quote.revisionHistory.length, 1);
  assert.equal(revisedQuote.payload.quote.revisionHistory[0].snapshot.deliveryEstimate, "5 business days");
  assert.equal((await request(`/api/quotes/${quote.id}/decision`, "PATCH", {
    decision: "not_selected",
    reason: "This is not owned by the requesting school."
  }, secondSchool.cookie)).status, 404);
  assert.equal(quote.total, 1040);
  assert.equal(quote.deliveryMode, "pickup");
  const supplierDraft = await request(`/api/rfqs/${rfq.id}/quotes`, "POST", {
    lines: [{ unitPrice: 45, offeredQuantity: 20, availability: "full" }],
    status: "draft"
  }, roleUsers.retailer.cookie);
  assert.equal(supplierDraft.status, 201);
  assert.equal(supplierDraft.payload.quote.status, "draft");
  assert.ok((await request(`/api/rfqs/${rfq.id}/quotes`, "GET", undefined, roleUsers.retailer.cookie))
    .payload.items.some(item => item.id === supplierDraft.payload.quote.id));
  assert.equal((await request(`/api/rfqs/${rfq.id}/quotes`, "GET", undefined, roleUsers.school.cookie))
    .payload.items.some(item => item.id === supplierDraft.payload.quote.id), false);
  assert.equal((await request("/api/dashboard", "GET", undefined, roleUsers.school.cookie))
    .payload.quotations.some(item => item.id === supplierDraft.payload.quote.id), false);
  const splitPlan = await request(`/api/rfqs/${rfq.id}/split-plan`, "GET", undefined, roleUsers.school.cookie);
  assert.equal(splitPlan.status, 200);
  assert.equal(splitPlan.payload.plan.allocations[0].quantity, 20);
  assert.equal(splitPlan.payload.plan.gaps.length, 0);
  assert.equal(splitPlan.payload.plan.excludesQuoteLevelCharges, true);
  assert.equal((await request(`/api/rfqs/${rfq.id}/split-plan`, "GET", undefined, roleUsers.distributor.cookie)).status, 403);
  const impactPreview = await request(`/api/rfqs/${rfq.id}/impact-preview`, "POST", {
    lines: rfq.lines.map(line => ({ ...line, quantity: 25 }))
  }, roleUsers.school.cookie);
  assert.equal(impactPreview.status, 200);
  assert.equal(impactPreview.payload.changes[0].type, "changed");
  assert.equal(impactPreview.payload.affectedQuoteCount, 1);
  assert.equal((await request(`/api/rfqs/${rfq.id}/impact-preview`, "POST", { lines: rfq.lines }, roleUsers.distributor.cookie)).status, 403);
  assert.ok((await request(`/api/rfqs/${rfq.id}/quotes`, "GET", undefined, roleUsers.school.cookie))
    .payload.items.some(item => item.id === quote.id));
  const retailerResponses = (await request(`/api/rfqs/${rfq.id}/quotes`, "GET", undefined, roleUsers.retailer.cookie)).payload.items;
  assert.equal(retailerResponses.length, 1);
  assert.equal(retailerResponses[0].id, supplierDraft.payload.quote.id);
  const overBudgetDecision = await request(`/api/quotes/${quote.id}/decision`, "PATCH", {
    decision: "selected_for_evaluation",
    reason: "Selected for follow-up review."
  }, roleUsers.school.cookie);
  assert.equal(overBudgetDecision.status, 400);
  const decision = await request(`/api/quotes/${quote.id}/decision`, "PATCH", {
    decision: "selected_for_evaluation",
    reason: "Selected for follow-up review.",
    budgetOverrideReason: "Approved by the school procurement head."
  }, roleUsers.school.cookie);
  assert.equal(decision.status, 200);
  assert.equal(decision.payload.quote.budgetOverrideReason, "Approved by the school procurement head.");
  assert.equal(decision.payload.commercialCommitment, false);
  const deniedOrder = await request(`/api/rfqs/${rfq.id}/orders`, "POST", {
    quoteId: quote.id,
    confirmed: true
  }, roleUsers.distributor.cookie);
  assert.equal(deniedOrder.status, 403);
  assert.equal((await request(`/api/rfqs/${rfq.id}/orders`, "POST", {
    quoteId: quote.id,
    confirmed: false
  }, roleUsers.school.cookie)).status, 400);
  const orderResult = await request(`/api/rfqs/${rfq.id}/orders`, "POST", {
    quoteId: quote.id,
    confirmed: true,
    lines: [{ rfqLineId: quote.lines[0].rfqLineId, quantity: 20 }]
  }, roleUsers.school.cookie);
  assert.equal(orderResult.status, 201);
  assert.equal(orderResult.payload.paymentProcessed, false);
  const purchaseRequest = orderResult.payload.purchaseRequest;
  assert.equal(purchaseRequest.status, "pending_approval");
  assert.equal((await request(`/api/purchase-requests/${purchaseRequest.id}`, "PATCH", {
    decision: "approve",
    note: "Owner cannot approve the request they created."
  }, roleUsers.school.cookie)).status, 403, "requester cannot self-approve");
  const approval = await request(`/api/purchase-requests/${purchaseRequest.id}`, "PATCH", {
    decision: "approve",
    note: "Independent manager approved the procurement request."
  }, roleUsers.schoolManager.cookie);
  assert.equal(approval.status, 200);
  assert.equal(approval.payload.order, null, "first approval must not issue a purchase order");
  assert.equal(approval.payload.awaitingSecondApproval, true);
  assert.equal(approval.payload.purchaseRequest.status, "pending_second_approval");
  assert.equal((await request(`/api/purchase-requests/${purchaseRequest.id}`, "PATCH", {
    decision: "approve",
    note: "Same manager cannot approve a request twice."
  }, roleUsers.schoolManager.cookie)).status, 403, "one manager cannot provide both approvals");
  const secondApproval = await request(`/api/purchase-requests/${purchaseRequest.id}`, "PATCH", {
    decision: "approve",
    note: "A different authorised manager independently approved this request."
  }, roleUsers.schoolSecondManager.cookie);
  assert.equal(secondApproval.status, 200);
  assert.equal(secondApproval.payload.purchaseRequest.status, "approved");
  assert.equal(new Set(secondApproval.payload.order.approvalActors).size, 2);
  assert.equal((await request(`/api/purchase-requests/${purchaseRequest.id}`, "PATCH", {
    decision: "approve",
    note: "The final request cannot be decided again."
  }, roleUsers.schoolManager.cookie)).status, 409);
  const order = secondApproval.payload.order;
  assert.equal(order.status, "issued");
  const invalidAmendment = await request(`/api/orders/${order.id}`, "PATCH", {
    action: "amend",
    reason: "Adjusting the quantity after internal review.",
    lines: [{ rfqLineId: quote.lines[0].rfqLineId, quantity: 21 }]
  }, roleUsers.school.cookie);
  assert.equal(invalidAmendment.status, 400);
  const amendment = await request(`/api/orders/${order.id}`, "PATCH", {
    action: "amend",
    reason: "Reducing the quantity to match confirmed enrolment.",
    lines: [{ rfqLineId: quote.lines[0].rfqLineId, quantity: 18 }]
  }, roleUsers.school.cookie);
  assert.equal(amendment.status, 200);
  assert.equal(amendment.payload.order.version, 2);
  assert.equal(amendment.payload.order.status, "issued");
  assert.equal(amendment.payload.order.lines[0].quantity, 18);
  assert.equal(amendment.payload.order.amendmentHistory.length, 1);
  assert.equal((await request(`/api/rfqs/${rfq.id}`, "PATCH", {
    action: "edit",
    changeReason: "Update academic requirements after review.",
    lines: rfq.lines
  }, roleUsers.school.cookie)).status, 409);
  assert.equal((await request(`/api/rfqs/${rfq.id}/orders`, "POST", {
    quoteId: quote.id,
    confirmed: true
  }, roleUsers.school.cookie)).status, 409);
  assert.equal((await request("/api/orders", "GET", undefined, roleUsers.school.cookie)).payload.items[0].id, order.id);
  assert.equal((await request("/api/orders", "GET", undefined, roleUsers.retailer.cookie)).payload.items.length, 0);
  assert.equal((await request(`/api/orders/${order.id}/fulfilment`, "PATCH", {
    status: "accepted"
  }, roleUsers.school.cookie)).status, 403);
  assert.equal((await request(`/api/orders/${order.id}/receipt`, "POST", {
    lines: [{ rfqLineId: order.lines[0].rfqLineId, receivedQuantity: 10 }]
  }, roleUsers.distributor.cookie)).status, 403);
  assert.equal((await request(`/api/orders/${order.id}/fulfilment`, "PATCH", {
    status: "dispatched"
  }, roleUsers.distributor.cookie)).status, 409);
  for (const status of ["accepted", "picking", "packed"]) {
    const transition = await request(`/api/orders/${order.id}/fulfilment`, "PATCH", {
      status,
      trackingReference: "TRACK-TEST"
    }, roleUsers.distributor.cookie);
    assert.equal(transition.status, 200, `transition to ${status}`);
  }
  const firstDispatch = await request(`/api/orders/${order.id}/fulfilment`, "PATCH", {
    status: "dispatched",
    lines: [{ rfqLineId: order.lines[0].rfqLineId, dispatchedQuantity: 12 }]
  }, roleUsers.distributor.cookie);
  assert.equal(firstDispatch.status, 200);
  assert.equal(firstDispatch.payload.order.lines[0].dispatchedQuantity, 12);
  assert.equal((await request(`/api/orders/${order.id}/fulfilment`, "PATCH", {
    status: "delivery_reported"
  }, roleUsers.distributor.cookie)).status, 200);
  assert.equal((await request(`/api/orders/${order.id}/receipt`, "POST", {
    lines: [{ rfqLineId: order.lines[0].rfqLineId, receivedQuantity: 13 }]
  }, roleUsers.school.cookie)).status, 400);
  const partialReceipt = await request(`/api/orders/${order.id}/receipt`, "POST", {
    lines: [{ rfqLineId: order.lines[0].rfqLineId, receivedQuantity: 10 }]
  }, roleUsers.school.cookie);
  assert.equal(partialReceipt.status, 200);
  assert.equal(partialReceipt.payload.order.status, "partially_received");
  assert.equal(partialReceipt.payload.paymentProcessed, false);
  assert.equal((await request(`/api/orders/${order.id}/fulfilment`, "PATCH", {
    status: "dispatched",
    lines: [{ rfqLineId: order.lines[0].rfqLineId, dispatchedQuantity: 18 }]
  }, roleUsers.distributor.cookie)).status, 200);
  assert.equal((await request(`/api/orders/${order.id}/fulfilment`, "PATCH", {
    status: "delivery_reported"
  }, roleUsers.distributor.cookie)).status, 200);
  const fullReceipt = await request(`/api/orders/${order.id}/receipt`, "POST", {
    lines: [{ rfqLineId: order.lines[0].rfqLineId, receivedQuantity: 18 }]
  }, roleUsers.school.cookie);
  assert.equal(fullReceipt.status, 200);
  assert.equal(fullReceipt.payload.order.status, "delivered");
  const disputeResult = await request(`/api/orders/${order.id}/disputes`, "POST", {
    rfqLineId: order.lines[0].rfqLineId,
    type: "damaged",
    quantity: 1,
    description: "One delivered copy has water damage on several pages."
  }, roleUsers.school.cookie);
  assert.equal(disputeResult.status, 201);
  const dispute = disputeResult.payload.dispute;
  assert.equal((await request(`/api/disputes/${dispute.id}`, "PATCH", {
    action: "respond",
    note: "We are checking the packing record and courier condition."
  }, roleUsers.retailer.cookie)).status, 403);
  const supplierDisputeResponse = await request(`/api/disputes/${dispute.id}`, "PATCH", {
    action: "respond",
    note: "We checked the dispatch record and will replace the damaged copy."
  }, roleUsers.distributor.cookie);
  assert.equal(supplierDisputeResponse.status, 200);
  const disputeResolution = await request(`/api/disputes/${dispute.id}`, "PATCH", {
    action: "resolve",
    decision: "upheld",
    note: "Supplier replacement confirmed; school report is upheld."
  }, admin);
  assert.equal(disputeResolution.status, 200);
  assert.equal(disputeResolution.payload.dispute.status, "resolved");
  const closedDispute = await request(`/api/disputes/${dispute.id}`, "PATCH", {
    action: "close"
  }, roleUsers.school.cookie);
  assert.equal(closedDispute.status, 200);
  assert.equal(closedDispute.payload.dispute.status, "closed");
  const schoolRelogin = await request("/api/auth/login", "POST", {
    email: roleUsers.school.email,
    password: "tester-password-1"
  });
  assert.equal(schoolRelogin.status, 200);
  roleUsers.school.cookie = sessionCookie(schoolRelogin);
  const persistedSchoolDashboard = await request("/api/dashboard", "GET", undefined, roleUsers.school.cookie);
  assert.ok(persistedSchoolDashboard.payload.rfqs.some(item => item.id === rfq.id),
    "school RFQs persist and remain visible after logging in again");
  assert.ok(persistedSchoolDashboard.payload.orders.some(item => item.id === order.id),
    "purchase orders persist and remain visible after logging in again");
  assert.ok(persistedSchoolDashboard.payload.disputes.some(item =>
    item.id === dispute.id && item.status === "closed"
  ), "closed disputes persist and remain visible after logging in again");

  const rejectionRfq = await request("/api/rfqs", "POST", {
    status: "published",
    session: "2025–2026",
    board: "CBSE",
    state: "Delhi",
    medium: "English",
    deliveryState: "Delhi",
    deliveryCity: "Delhi",
    responseDeadline: "2099-12-31",
    lines: [{ title: "Supplier rejection requirement", quantity: 4 }]
  }, roleUsers.school.cookie);
  assert.equal(rejectionRfq.status, 201);
  const retailerSubmitted = await request(`/api/rfqs/${rejectionRfq.payload.rfq.id}/quotes`, "POST", {
    lines: [{ unitPrice: 45, offeredQuantity: 4, availability: "full" }],
    deliveryEstimate: "6 business days",
    validThrough: "2099-12-31",
    status: "submitted"
  }, roleUsers.retailer.cookie);
  assert.equal(retailerSubmitted.status, 201);
  const retailerDecision = await request(`/api/quotes/${retailerSubmitted.payload.quote.id}/decision`, "PATCH", {
    decision: "selected_for_evaluation",
    reason: "Retailer meets the school price and academic requirements."
  }, roleUsers.school.cookie);
  assert.equal(retailerDecision.status, 200);
  const rejectedOrderResult = await request(`/api/rfqs/${rejectionRfq.payload.rfq.id}/orders`, "POST", {
    quoteId: retailerSubmitted.payload.quote.id,
    confirmed: true,
    lines: [{ rfqLineId: retailerSubmitted.payload.quote.lines[0].rfqLineId, quantity: 4 }]
  }, roleUsers.school.cookie);
  assert.equal(rejectedOrderResult.status, 201);
  const rejectedOrderApproval = await request(`/api/purchase-requests/${rejectedOrderResult.payload.purchaseRequest.id}`, "PATCH", {
    decision: "approve",
    note: "Independent manager approved this request for supplier response."
  }, roleUsers.schoolManager.cookie);
  assert.equal(rejectedOrderApproval.status, 200);
  assert.equal(rejectedOrderApproval.payload.order, null);
  const finalRejectedOrderApproval = await request(`/api/purchase-requests/${rejectedOrderResult.payload.purchaseRequest.id}`, "PATCH", {
    decision: "approve",
    note: "A different manager independently approves this supplier order."
  }, roleUsers.schoolSecondManager.cookie);
  assert.equal(finalRejectedOrderApproval.status, 200);
  const rejectedOrderId = finalRejectedOrderApproval.payload.order.id;
  const supplierRejectionWithoutReason = await request(`/api/orders/${rejectedOrderId}/fulfilment`, "PATCH", {
    status: "rejected",
    note: "No"
  }, roleUsers.retailer.cookie);
  assert.equal(supplierRejectionWithoutReason.status, 400);
  const supplierRejection = await request(`/api/orders/${rejectedOrderId}/fulfilment`, "PATCH", {
    status: "rejected",
    note: "The local store cannot guarantee the requested edition in this quantity."
  }, roleUsers.retailer.cookie);
  assert.equal(supplierRejection.status, 200);
  assert.equal(supplierRejection.payload.order.status, "rejected");

  const cancelRfq = await request("/api/rfqs", "POST", {
    status: "published",
    session: "2025–2026",
    board: "CBSE",
    state: "Delhi",
    medium: "English",
    deliveryCity: "Delhi",
    responseDeadline: "2099-12-31",
    lines: [{ title: "Purchase order cancellation requirement", quantity: 3 }]
  }, roleUsers.school.cookie);
  assert.equal(cancelRfq.status, 201);
  const cancelQuote = await request(`/api/rfqs/${cancelRfq.payload.rfq.id}/quotes`, "POST", {
    lines: [{ unitPrice: 30, offeredQuantity: 3, availability: "full" }],
    deliveryEstimate: "5 days",
    validThrough: "2099-12-31",
    status: "submitted"
  }, roleUsers.distributor.cookie);
  assert.equal(cancelQuote.status, 201);
  assert.equal((await request(`/api/quotes/${cancelQuote.payload.quote.id}/decision`, "PATCH", {
    decision: "selected_for_evaluation",
    reason: "Supplier offer meets the new RFQ requirements."
  }, roleUsers.school.cookie)).status, 200);
  const cancelPo = await request(`/api/rfqs/${cancelRfq.payload.rfq.id}/orders`, "POST", {
    quoteId: cancelQuote.payload.quote.id,
    confirmed: true
  }, roleUsers.schoolManager.cookie);
  assert.equal(cancelPo.status, 201);
  assert.equal((await request(`/api/purchase-requests/${cancelPo.payload.purchaseRequest.id}`, "PATCH", {
    decision: "approve",
    note: "A manager may not approve their own submitted request."
  }, roleUsers.schoolManager.cookie)).status, 403, "Manager requester cannot self-approve");
  const cancelPoApproval = await request(`/api/purchase-requests/${cancelPo.payload.purchaseRequest.id}`, "PATCH", {
    decision: "approve",
    note: "Independent school owner approved this request."
  }, roleUsers.school.cookie);
  assert.equal(cancelPoApproval.status, 200);
  assert.equal(cancelPoApproval.payload.order, null);
  const cancelPoSecondApproval = await request(`/api/purchase-requests/${cancelPo.payload.purchaseRequest.id}`, "PATCH", {
    decision: "approve",
    note: "A different manager separately approves this purchase order."
  }, roleUsers.schoolSecondManager.cookie);
  assert.equal(cancelPoSecondApproval.status, 200);
  const cancelledPo = await request(`/api/orders/${cancelPoSecondApproval.payload.order.id}`, "PATCH", {
    action: "cancel",
    reason: "School revised its procurement plan before supplier acceptance."
  }, roleUsers.school.cookie);
  assert.equal(cancelledPo.status, 200);
  assert.equal(cancelledPo.payload.order.status, "cancelled");
  const rejectedApprovalRequest = await request(`/api/rfqs/${cancelRfq.payload.rfq.id}/orders`, "POST", {
    quoteId: cancelQuote.payload.quote.id,
    confirmed: true
  }, roleUsers.school.cookie);
  assert.equal(rejectedApprovalRequest.status, 201);
  const rejectedApproval = await request(`/api/purchase-requests/${rejectedApprovalRequest.payload.purchaseRequest.id}`, "PATCH", {
    decision: "reject",
    note: "The school owner changed the procurement priority and rejected this request."
  }, roleUsers.schoolManager.cookie);
  assert.equal(rejectedApproval.status, 200);
  assert.equal(rejectedApproval.payload.purchaseRequest.status, "rejected");
  assert.equal(rejectedApproval.payload.order, null);
  assert.equal((await request(`/api/purchase-requests/${rejectedApprovalRequest.payload.purchaseRequest.id}`, "PATCH", {
    decision: "approve",
    note: "This request already has a final rejection decision."
  }, roleUsers.school.cookie)).status, 409);
  const rejectedAtSecondStageRequest = await request(`/api/rfqs/${cancelRfq.payload.rfq.id}/orders`, "POST", {
    quoteId: cancelQuote.payload.quote.id,
    confirmed: true
  }, roleUsers.school.cookie);
  assert.equal(rejectedAtSecondStageRequest.status, 201);
  const firstApprovalBeforeRejection = await request(`/api/purchase-requests/${rejectedAtSecondStageRequest.payload.purchaseRequest.id}`, "PATCH", {
    decision: "approve",
    note: "First manager approves for independent review."
  }, roleUsers.schoolManager.cookie);
  assert.equal(firstApprovalBeforeRejection.status, 200);
  const rejectionAtSecondStage = await request(`/api/purchase-requests/${rejectedAtSecondStageRequest.payload.purchaseRequest.id}`, "PATCH", {
    decision: "reject",
    note: "Second manager rejects after reviewing the changed school plan."
  }, roleUsers.schoolSecondManager.cookie);
  assert.equal(rejectionAtSecondStage.status, 200);
  assert.equal(rejectionAtSecondStage.payload.purchaseRequest.status, "rejected");
  assert.equal(rejectionAtSecondStage.payload.order, null);
  assert.equal((await request(`/api/orders/${order.id}/receipt`, "POST", {
    lines: [{ rfqLineId: order.lines[0].rfqLineId, receivedQuantity: 20 }]
  }, roleUsers.school.cookie)).status, 409);

  const noBidRfq = await request("/api/rfqs", "POST", {
    status: "published",
    title: "E2E no-bid requirement",
    session: "2026-27",
    board: "CBSE",
    state: "Delhi",
    medium: "English",
    deliveryState: "Delhi",
    deliveryCity: "Delhi",
    lines: [{ title: "E2E unavailable title", quantity: 4 }]
  }, roleUsers.school.cookie);
  const noBid = await request(`/api/rfqs/${noBidRfq.payload.rfq.id}/quotes`, "POST", {
    noBid: true,
    reasonCode: "outside_territory"
  }, roleUsers.retailer.cookie);
  assert.equal(noBid.status, 201);
  assert.equal(noBid.payload.quote.status, "no_bid");
  assert.equal(noBid.payload.quote.reasonCode, "outside_territory");
  assert.equal(noBid.payload.quote.reason, "Outside service territory");
  assert.equal((await request(`/api/rfqs/${noBidRfq.payload.rfq.id}/quotes`, "POST", {
    noBid: true,
    reasonCode: "invalid_reason"
  }, roleUsers.retailer.cookie)).status, 400);
  const cancellation = await request(`/api/rfqs/${noBidRfq.payload.rfq.id}`, "PATCH", {
    action: "cancel"
  }, roleUsers.school.cookie);
  assert.equal(cancellation.payload.rfq.status, "cancelled");

  const inventory = await request("/api/inventory", "POST", {
    items: [{
      title: "E2E inventory record",
      availableQuantity: 15,
      reservedQuantity: 0,
      damagedQuantity: 0,
      lowStockThreshold: 0
    }]
  }, roleUsers.retailer.cookie);
  assert.equal(inventory.status, 200);
  const stock = inventory.payload.items[0];
  assert.equal(stock.lowStockThreshold, 0);
  assert.equal((await request("/api/inventory", "GET", undefined, roleUsers.distributor.cookie))
    .payload.items.some(item => item.id === stock.id), false, "inventory is scoped to its retailer organisation");
  const update = await request("/api/inventory", "POST", {
    items: [{
      title: stock.title,
      availableQuantity: 14,
      reservedQuantity: 0,
      damagedQuantity: 0,
      lowStockThreshold: 0,
      expectedUpdatedAt: stock.updatedAt,
      reason: "Physical stock count"
    }]
  }, roleUsers.retailer.cookie);
  assert.equal(update.status, 200);
  assert.equal(update.payload.items[0].availableQuantity, 14);
  assert.equal(update.payload.items[0].movementHistory.length, 2);
  assert.equal((await request("/api/inventory", "POST", {
    items: [{ title: stock.title, availableQuantity: 10, expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }]
  }, roleUsers.retailer.cookie)).status, 409);
  assert.equal((await request("/api/inventory/import", "POST", {
    csv: "title,availableQuantity\nDuplicate title,1\nDuplicate title,2"
  }, roleUsers.retailer.cookie)).status, 400);

  const catalogueFields = (title, isbn) => ({
    title,
    subtitle: `${title} subtitle`,
    author: "E2E Book Author",
    publisher: "E2E Academic Press",
    isbn,
    subject: "Science",
    level: "Class 5",
    board: "CBSE",
    state: "Delhi",
    medium: "English",
    edition: "2nd edition",
    session: "2026-27",
    pages: 212,
    age: "10-12 years",
    publicationDate: "2026-04-01",
    format: "Textbook",
    publisherMrp: 200,
    priceEffectiveDate: "2026-04-01",
    description: `A complete academic overview for ${title}, including the learning approach and curriculum coverage.`,
    highlights: "Curriculum-aligned chapters\nPractice questions"
  });
  const publisherDraft = await request("/api/publisher/catalogue", "POST", {
    ...catalogueFields("E2E reviewed title", "9781234567897")
  }, roleUsers.publisher.cookie);
  assert.equal(publisherDraft.status, 201);
  const publisherSubmission = await request(`/api/publisher/catalogue/${publisherDraft.payload.item.id}`, "PATCH", {
    submit: true
  }, roleUsers.publisher.cookie);
  assert.equal(publisherSubmission.status, 200, JSON.stringify(publisherSubmission.payload));
  assert.equal(publisherSubmission.payload.item.status, "pending_review");
  assert.equal((await request(`/api/admin/catalogue/${publisherDraft.payload.item.id}/review`, "PATCH", {
    decision: "published"
  }, admin)).status, 400, "catalogue decisions require an audit reason");
  const moderation = await request(`/api/admin/catalogue/${publisherDraft.payload.item.id}/review`, "PATCH", {
    decision: "published",
    reason: "Academic metadata and ISBN were reviewed."
  }, admin);
  assert.equal(moderation.status, 200);
  const publicTitle = await request("/api/catalog?q=E2E%20reviewed%20title");
  assert.ok(publicTitle.payload.items.some(item => item.id === moderation.payload.item.publicCatalogId));
  const sortedCatalogue = await request("/api/catalog?sort=price-asc&page=1");
  assert.equal(sortedCatalogue.payload.page, 1);
  assert.equal(sortedCatalogue.payload.pageSize, 9);
  assert.equal(sortedCatalogue.payload.total, 10);
  assert.ok(sortedCatalogue.payload.items.every((item, index, items) => index === 0 || items[index - 1].price <= item.price));
  const secondCataloguePage = await request("/api/catalog?sort=price-asc&page=2");
  assert.equal(secondCataloguePage.payload.page, 2);
  assert.equal(secondCataloguePage.payload.items.length, 1);
  assert.ok(sortedCatalogue.payload.items.at(-1).price <= secondCataloguePage.payload.items[0].price);
  const titleSortedCatalogue = await request("/api/catalog?sort=title-asc");
  assert.ok(titleSortedCatalogue.payload.items.every((item, index, items) =>
    index === 0 || items[index - 1].title.localeCompare(item.title) <= 0
  ));
  const publicDetails = await request(`/api/catalog/${moderation.payload.item.publicCatalogId}`);
  assert.equal(publicDetails.payload.item.pages, 212);
  assert.equal(publicDetails.payload.item.age, "10-12 years");
  assert.match(publicDetails.payload.item.description, /complete academic overview/i);
  assert.equal(publicDetails.payload.item.highlights.length, 2);
  const withdrawal = await request(`/api/publisher/catalogue/${publisherDraft.payload.item.id}/withdrawal`, "POST", {
    reason: "This edition is superseded and should no longer be offered."
  }, roleUsers.publisher.cookie);
  assert.equal(withdrawal.status, 200);
  assert.equal(withdrawal.payload.item.status, "published");
  assert.equal((await request(`/api/admin/catalogue/${publisherDraft.payload.item.id}/withdrawal`, "PATCH", {
    decision: "approve",
    note: "Publisher supplied the verified replacement edition details."
  }, roleUsers.school.cookie)).status, 403);
  const withdrawalDecision = await request(`/api/admin/catalogue/${publisherDraft.payload.item.id}/withdrawal`, "PATCH", {
    decision: "approve",
    note: "Publisher supplied the verified replacement edition details."
  }, admin);
  assert.equal(withdrawalDecision.status, 200);
  assert.equal(withdrawalDecision.payload.item.status, "withdrawn");
  const auditSearch = await request("/api/admin/audit?q=withdrawal_requested", "GET", undefined, admin);
  assert.equal(auditSearch.status, 200);
  assert.ok(auditSearch.payload.items.some(item => item.entityId === publisherDraft.payload.item.id));
  assert.equal((await request("/api/admin/audit", "GET", undefined, roleUsers.school.cookie)).status, 403);
  const publisherImport = await request("/api/publisher/catalogue/import", "POST", {
    csv: "title,isbn,publisher,mrp,subject,level,board,state,medium,edition,session,publicationDate,format,pages,age,description,highlights,mrpEffectiveDate\nImported title,9781234567880,Academic Press,150,Mathematics,Class 5,CBSE,Delhi,English,1st edition,2026-27,2026-04-01,Textbook,180,10-12 years,A complete academic overview covering concepts and practice for learners.,Chapters and exercises,2026-04-01\nDuplicate imported title,9781234567880,Academic Press,150,Mathematics,Class 5,CBSE,Delhi,English,1st edition,2026-27,2026-04-01,Textbook,180,10-12 years,A complete academic overview covering concepts and practice for learners.,Chapters and exercises,2026-04-01"
  }, roleUsers.publisher.cookie);
  assert.equal(publisherImport.status, 200);
  assert.equal(publisherImport.payload.imported, 1);
  assert.equal(publisherImport.payload.errors[0].row, 3);
  const importedItem = (await request("/api/publisher/catalogue", "GET", undefined, roleUsers.publisher.cookie)).payload.items.find(item => item.id === publisherImport.payload.ids[0]);
  assert.equal(importedItem.status, "draft", "bulk-imported publisher titles remain drafts pending review");
  assert.equal((await request(`/api/catalog?q=${encodeURIComponent(importedItem.title)}`)).payload.items.length, 0,
    "unapproved imported publisher titles are not publicly visible");
  const updatedPublisherDraft = await request(`/api/publisher/catalogue/${importedItem.id}`, "PATCH", {
    publisherMrp: 175,
    priceEffectiveDate: "2026-05-01"
  }, roleUsers.publisher.cookie);
  assert.equal(updatedPublisherDraft.status, 200);
  assert.equal(updatedPublisherDraft.payload.item.priceHistory.length, 2);

  assert.equal((await request("/api/catalogue/submissions", "POST", catalogueFields("Unauthenticated", "9780000000002"))).status, 401);
  assert.equal((await request("/api/catalogue/submissions", "POST", { title: "Incomplete suggestion" }, roleUsers.other.cookie)).status, 400);
  assert.equal((await request("/api/publisher/catalogue", "GET", undefined, roleUsers.other.cookie)).status, 403);
  assert.equal((await request("/api/admin/catalogue/not-a-record/review", "PATCH", {
    decision: "published"
  }, roleUsers.other.cookie)).status, 403);
  assert.equal((await request("/api/catalogue/submissions", "POST", {
    ...catalogueFields("Invalid date book", "9780000000003"),
    publicationDate: "2026-02-31"
  }, roleUsers.other.cookie)).status, 400);

  let firstSuggestionIsbn = "";
  for (const [index, role] of ["school", "distributor", "retailer", "other"].entries()) {
    const title = `E2E ${role} book suggestion`;
    const isbn = `978777777777${index}`;
    let expectedTitle = title;
    if (!firstSuggestionIsbn) firstSuggestionIsbn = isbn;
    const suggestion = await request("/api/catalogue/submissions", "POST", catalogueFields(title, isbn), roleUsers[role].cookie);
    assert.equal(suggestion.status, 201, `${role} book suggestion`);
    assert.equal(suggestion.payload.item.status, "pending_review");
    assert.equal(suggestion.payload.item.submitterRole, role);
    assert.equal((await request(`/api/catalog?q=${encodeURIComponent(title)}`)).payload.items.length, 0);
    const ownerDashboard = await request("/api/dashboard", "GET", undefined, roleUsers[role].cookie);
    assert.ok(ownerDashboard.payload.catalogueSubmissions.some(item => item.id === suggestion.payload.item.id));
    const otherViewer = await request("/api/dashboard", "GET", undefined,
      roleUsers[role] === roleUsers.school ? roleUsers.other.cookie : roleUsers.school.cookie);
    assert.ok(!otherViewer.payload.catalogueSubmissions.some(item => item.id === suggestion.payload.item.id));
    let reviewItem = suggestion.payload.item;
    let correction = null;
    if (role === "other") {
      correction = await request(`/api/admin/catalogue/${reviewItem.id}/review`, "PATCH", {
        decision: "needs_correction",
        reason: "Please clarify the academic overview and update the title wording."
      }, admin);
      assert.equal(correction.status, 200);
      const revisedTitle = "E2E corrected other-user book suggestion";
      const revised = await request(`/api/catalogue/submissions/${reviewItem.id}`, "PATCH", catalogueFields(revisedTitle, isbn), roleUsers.other.cookie);
      assert.equal(revised.status, 200);
      assert.equal(revised.payload.item.status, "pending_review");
      assert.equal(revised.payload.item.version, 2);
      assert.equal(revised.payload.item.revisions.length, 1);
      assert.equal((await request(`/api/catalogue/submissions/${reviewItem.id}`, "PATCH", catalogueFields(revisedTitle, isbn), roleUsers.school.cookie)).status, 404);
      reviewItem = revised.payload.item;
      expectedTitle = revisedTitle;
    }
    const approval = await request(`/api/admin/catalogue/${reviewItem.id}/review`, "PATCH", {
      decision: "published",
      reason: "Bibliographic details and academic mapping reviewed."
    }, admin);
    assert.equal(approval.status, 200);
    const listed = await request(`/api/catalog/${approval.payload.item.publicCatalogId}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.payload.item.title, expectedTitle);
    assert.equal(listed.payload.item.pages, 212);
  }
  assert.equal((await request("/api/catalogue/submissions", "POST",
    catalogueFields("Duplicate catalogue suggestion", firstSuggestionIsbn), roleUsers.other.cookie)).status, 409);

  const support = await request("/api/support", "POST", {
    firstName: "E2E",
    lastName: "Requester",
    email: `support-${suffix}@example.test`,
    role: "School Administrator",
    message: "Verify the support status workflow end to end."
  });
  assert.equal(support.status, 201);
  const supportUpdate = await request(`/api/admin/support/${support.payload.ticketId}`, "PATCH", {
    status: "waiting_for_information"
  }, admin);
  assert.equal(supportUpdate.status, 200);
  assert.equal(supportUpdate.payload.ticket.status, "waiting_for_information");

  const report = await request("/api/reports/export.csv", "GET", undefined, roleUsers.school.cookie);
  assert.equal(report.status, 200);
  assert.match(report.contentType, /text\/csv/);

  assert.equal((await request("/api/admin/blog")).status, 401);
  assert.equal((await request("/api/admin/blog", "GET", undefined, roleUsers.school.cookie)).status, 403);
  assert.equal((await request("/api/admin/blog", "POST", {
    title: "Unauthorized blog attempt",
    author: "School",
    content: "This content is long enough to pass a minimum length check.",
    coverImage: tinyPngDataUrl()
  }, roleUsers.school.cookie)).status, 403);
  assert.equal((await request("/api/admin/blog/unknown", "PATCH", {}, roleUsers.school.cookie)).status, 403);
  assert.equal((await request("/api/admin/blog/unknown", "DELETE", undefined, roleUsers.school.cookie)).status, 403);
  assert.deepEqual((await request("/api/blog")).payload.items, []);

  const coverImage = tinyPngDataUrl();
  const blogFields = {
    title: "GoErudite workflow guide",
    slug: "goerudite-workflow-guide",
    author: "Audit Admin",
    publicationDate: "2026-06-15",
    content: "This guide explains how schools and suppliers use structured procurement workflows. It is plain text managed by the administrator.",
    coverImage
  };
  const invalidImage = await request("/api/admin/blog", "POST", {
    ...blogFields,
    slug: "invalid-cover",
    coverImage: "data:image/png;base64,SGVsbG8="
  }, admin);
  assert.equal(invalidImage.status, 400);
  assert.match(invalidImage.payload.error, /cover/i);
  const oversizedImage = await request("/api/admin/blog", "POST", {
    ...blogFields,
    slug: "oversized-cover",
    coverImage: `data:image/png;base64,${"A".repeat(245764)}`
  }, admin);
  assert.equal(oversizedImage.status, 400);
  assert.match(oversizedImage.payload.error, /180 KB/i);
  const invalidDate = await request("/api/admin/blog", "POST", {
    ...blogFields,
    slug: "invalid-publication-date",
    publicationDate: "2026-02-31"
  }, admin);
  assert.equal(invalidDate.status, 400);
  const missingDateFields = { ...blogFields };
  delete missingDateFields.publicationDate;
  assert.equal((await request("/api/admin/blog", "POST", {
    ...missingDateFields,
    slug: "missing-publication-date"
  }, admin)).status, 400);
  assert.equal((await request("/api/admin/blog", "POST", {
    ...blogFields,
    title: "T".repeat(161),
    slug: "overlong-title"
  }, admin)).status, 400);
  const invalidSlug = await request("/api/admin/blog", "POST", {
    ...blogFields,
    slug: "invalid--slug"
  }, admin);
  assert.equal(invalidSlug.status, 400);
  const createdBlog = await request("/api/admin/blog", "POST", { ...blogFields, action: "draft" }, admin);
  assert.equal(createdBlog.status, 201);
  assert.equal(createdBlog.payload.item.status, "draft");
  const persistedDraft = await request("/api/admin/blog", "POST", {
    ...blogFields,
    title: "Persistent draft after restart",
    slug: "persistent-draft-after-restart",
    action: "draft"
  }, admin);
  assert.equal(persistedDraft.status, 201);
  assert.equal((await request(`/blog/${blogFields.slug}`)).status, 404);
  assert.equal((await request(`/api/blog/${blogFields.slug}`)).status, 404);
  assert.equal((await request("/api/blog")).payload.items.length, 0);
  const duplicateBlog = await request("/api/admin/blog", "POST", {
    ...blogFields,
    title: "Duplicate workflow guide",
    action: "draft"
  }, admin);
  assert.equal(duplicateBlog.status, 409);

  const publishedBlog = await request(`/api/admin/blog/${createdBlog.payload.item.id}`, "PATCH", {
    ...blogFields,
    action: "publish"
  }, admin);
  assert.equal(publishedBlog.status, 200);
  assert.equal(publishedBlog.payload.item.status, "published");
  assert.equal((await request("/api/blog")).payload.items.length, 1);
  assert.equal((await request(`/api/blog/${blogFields.slug}`)).payload.item.content, blogFields.content);
  assert.equal((await request(`/blog/${blogFields.slug}`)).status, 200);
  const publishedBlogHtml = (await request(`/blog/${blogFields.slug}`)).payload;
  assert.match(publishedBlogHtml, /<title>GoErudite workflow guide \| GoErudite Blog<\/title>/);
  assert.ok(publishedBlogHtml.includes(`<link rel="canonical" href="https://goerudite.example.test/blog/${blogFields.slug}">`));
  const publishedSitemap = await request("/sitemap.xml");
  assert.match(publishedSitemap.payload, new RegExp(`https://goerudite\\.example\\.test/blog/${blogFields.slug}`));
  const unpublish = await request(`/api/admin/blog/${createdBlog.payload.item.id}`, "PATCH", {
    ...blogFields,
    action: "unpublish"
  }, admin);
  assert.equal(unpublish.status, 200);
  assert.equal(unpublish.payload.item.status, "draft");
  assert.equal((await request(`/api/blog/${blogFields.slug}`)).status, 404);
  assert.doesNotMatch((await request("/sitemap.xml")).payload, new RegExp(`/blog/${blogFields.slug}`));
  const scheduled = await request(`/api/admin/blog/${createdBlog.payload.item.id}`, "PATCH", {
    ...blogFields,
    action: "schedule",
    scheduledAt: new Date(Date.now() + 86400000).toISOString()
  }, admin);
  assert.equal(scheduled.status, 200);
  assert.equal(scheduled.payload.item.status, "scheduled");
  assert.equal((await request("/api/blog")).payload.items.length, 0);
  assert.equal((await request(`/blog/${blogFields.slug}`)).status, 404);
  const rescheduledPast = await request(`/api/admin/blog/${createdBlog.payload.item.id}`, "PATCH", {
    ...blogFields,
    action: "schedule",
    scheduledAt: "2000-01-01T00:00:00.000Z"
  }, admin);
  assert.equal(rescheduledPast.status, 400);
  assert.equal((await request("/api/admin/blog", "GET", undefined, admin)).payload.items[0].status, "scheduled");
  const nearTermSchedule = await request(`/api/admin/blog/${createdBlog.payload.item.id}`, "PATCH", {
    ...blogFields,
    action: "schedule",
    scheduledAt: new Date(Date.now() + 250).toISOString()
  }, admin);
  assert.equal(nearTermSchedule.status, 200);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal((await request("/api/blog")).payload.items.length, 1);
  assert.equal((await request("/api/admin/blog", "GET", undefined, admin)).payload.items.find(item => item.id === createdBlog.payload.item.id).status, "published");
  assert.equal((await request(`/blog/${blogFields.slug}`)).status, 200);
  assert.equal((await request(`/api/admin/blog/${createdBlog.payload.item.id}`, "PATCH", {
    ...blogFields,
    action: "unpublish"
  }, admin)).payload.item.status, "draft");
  const persistedSchedule = await request(`/api/admin/blog/${createdBlog.payload.item.id}`, "PATCH", {
    ...blogFields,
    action: "schedule",
    scheduledAt: new Date(Date.now() + 86400000).toISOString()
  }, admin);
  assert.equal(persistedSchedule.payload.item.status, "scheduled");
  assert.equal((await request("/api/blog")).payload.items.length, 0);

  await stopMainServer();
  await startMainServer();
  const adminLogin = await request("/api/auth/login", "POST", {
    email: adminEmail,
    password: "admin-password-1"
  });
  assert.equal(adminLogin.status, 200);
  const restartedAdmin = sessionCookie(adminLogin);
  const persistedBlogs = await request("/api/admin/blog", "GET", undefined, restartedAdmin);
  assert.equal(persistedBlogs.status, 200);
  const persistedScheduled = persistedBlogs.payload.items.find(item => item.id === createdBlog.payload.item.id);
  const persistedDraftRecord = persistedBlogs.payload.items.find(item => item.id === persistedDraft.payload.item.id);
  assert.equal(persistedScheduled.status, "scheduled");
  assert.equal(persistedScheduled.content, blogFields.content);
  assert.equal(persistedDraftRecord.status, "draft");
  const publishedAgain = await request(`/api/admin/blog/${createdBlog.payload.item.id}`, "PATCH", {
    ...blogFields,
    action: "publish"
  }, restartedAdmin);
  assert.equal(publishedAgain.status, 200);
  const deletedBlog = await request(`/api/admin/blog/${createdBlog.payload.item.id}`, "DELETE", undefined, restartedAdmin);
  assert.equal(deletedBlog.status, 200);
  assert.equal((await request(`/api/admin/blog/${persistedDraft.payload.item.id}`, "DELETE", undefined, restartedAdmin)).status, 200);
  assert.equal((await request(`/blog/${blogFields.slug}`)).status, 404);
  assert.equal((await request(`/api/blog/${blogFields.slug}`)).status, 404);
  assert.equal((await request("/api/blog")).payload.items.length, 0);

  const restoreBaseline = await request("/api/admin/backups", "POST", {}, restartedAdmin);
  assert.equal(restoreBaseline.status, 201);
  const postBackupSupport = await request("/api/support", "POST", {
    firstName: "Restore",
    lastName: "Verification",
    email: `restore-${suffix}@example.test`,
    role: "School Administrator",
    message: "This record should be removed by restoring the earlier isolated backup."
  });
  assert.equal(postBackupSupport.status, 201);
  const restored = await request("/api/admin/backups/restore", "POST", {
    name: restoreBaseline.payload.backup.name,
    confirmation: restoreBaseline.payload.backup.name
  }, restartedAdmin);
  assert.equal(restored.status, 200);
  assert.equal(restored.payload.restoredBackup, restoreBaseline.payload.backup.name);
  assert.equal(restored.payload.safetyBackup.integrity, "valid");
  const restoredOverview = await request("/api/admin/overview", "GET", undefined, restartedAdmin);
  assert.equal(restoredOverview.status, 200);
  assert.equal(restoredOverview.payload.requests.some(item => item.id === postBackupSupport.payload.ticketId), false);
  assert.ok(restoredOverview.payload.audit.some(item =>
    item.entity === "backup" && item.action === "backup.restored" &&
    item.entityId === restoreBaseline.payload.backup.name
  ));
  const restoredAuditIntegrity = await request("/api/admin/audit/verify", "GET", undefined, restartedAdmin);
  assert.equal(restoredAuditIntegrity.status, 200);
  assert.equal(restoredAuditIntegrity.payload.verification.valid, true,
    JSON.stringify(restoredAuditIntegrity.payload.verification));
  const suspendedOrganisation = await request(`/api/admin/users/${roleUsers.school.id}/verification`, "PATCH", {
    decision: "suspended",
    reason: "Verify organisation-wide session revocation."
  }, restartedAdmin);
  assert.equal(suspendedOrganisation.status, 200);
  assert.equal((await request("/api/auth/me", "GET", undefined, roleUsers.school.cookie)).payload.user, null);
  assert.equal((await request("/api/auth/me", "GET", undefined, roleUsers.schoolManager.cookie)).payload.user, null);
  assert.equal((await request("/api/dashboard", "GET", undefined, roleUsers.schoolManager.cookie)).status, 401);
  assert.equal((await request(`/api/admin/users/${roleUsers.school.id}/verification`, "PATCH", {
    decision: "active",
    reason: "Restore the organisation after session revocation checks."
  }, restartedAdmin)).status, 200);
  assert.equal((await request("/api/auth/me", "GET", undefined, roleUsers.schoolManager.cookie)).payload.user, null,
    "restoring an account does not resurrect revoked sessions");
});

test("role dashboards and API permissions remain separated", async () => {
  assert.ok(roleTestAccounts, "the procurement workflow should have registered role accounts");
  const sessionsByRole = {};
  for (const [role, account] of Object.entries(roleTestAccounts)) {
    const login = await request("/api/auth/login", "POST", {
      email: account.email,
      password: account.password
    });
    assert.equal(login.status, 200, `${role} login`);
    sessionsByRole[role] = sessionCookie(login);
    const dashboard = await request("/api/dashboard", "GET", undefined, sessionsByRole[role]);
    assert.equal(dashboard.status, 200, `${role} dashboard API`);
    assert.equal(dashboard.payload.user.role, role);
    assert.equal("passwordHash" in dashboard.payload.user, false);
    if (role === "school") assert.ok(Array.isArray(dashboard.payload.rfqs));
    if (["distributor", "retailer"].includes(role)) assert.ok(Array.isArray(dashboard.payload.opportunities));
    if (role === "publisher") assert.ok(Array.isArray(dashboard.payload.catalogue));
    if (role === "other") assert.equal("rfqs" in dashboard.payload, false);
    if (role === "admin") assert.ok(Array.isArray(dashboard.payload.users));
  }

  assert.equal((await request("/api/rfqs", "GET", undefined, sessionsByRole.school)).status, 200);
  for (const role of ["distributor", "retailer"]) {
    assert.equal((await request("/api/rfqs", "GET", undefined, sessionsByRole[role])).status, 200);
    assert.equal((await request("/api/ad-inquiries", "GET", undefined, sessionsByRole[role])).status, 200);
  }
  for (const role of ["publisher", "other", "admin"]) {
    assert.equal((await request("/api/rfqs", "GET", undefined, sessionsByRole[role])).status, 403);
  }
  assert.equal((await request("/api/ad-inquiries", "GET", undefined, sessionsByRole.publisher)).status, 200);
  assert.equal((await request("/api/ad-inquiries", "GET", undefined, sessionsByRole.other)).status, 200);
  for (const role of ["school", "admin"]) {
    assert.equal((await request("/api/ad-inquiries", "GET", undefined, sessionsByRole[role])).status, 403);
  }
  const pendingAdvertiser = await request("/api/auth/register", "POST", {
    firstName: "Pending",
    lastName: "Advertiser",
    email: `pending-advertiser-${crypto.randomUUID()}@example.test`,
    organizationName: "Pending advertiser organisation",
    role: "distributor",
    password: "pending-advertiser-password",
    consent: true
  });
  assert.equal(pendingAdvertiser.status, 201);
  assert.equal((await request("/api/ad-inquiries", "GET", undefined, sessionCookie(pendingAdvertiser))).status, 403);

  for (const role of ["school", "distributor", "retailer", "publisher", "other"]) {
    assert.equal((await request("/api/admin/advertisements", "GET", undefined, sessionsByRole[role])).status, 403, `${role} cannot manage ads`);
    assert.equal((await request("/api/admin/blog", "GET", undefined, sessionsByRole[role])).status, 403, `${role} cannot manage blogs`);
  }
  assert.equal((await request("/api/admin/advertisements", "GET", undefined, sessionsByRole.admin)).status, 200);

  const admin = sessionsByRole.admin;
  const suspendedRole = roleTestAccounts.distributor;
  assert.equal((await request(`/api/admin/users/${suspendedRole.id}/verification`, "PATCH", {
    decision: "suspended",
    reason: "Checking inquiry API denial for a suspended account."
  }, admin)).status, 200);
  assert.equal((await request("/api/ad-inquiries", "GET", undefined, sessionsByRole.distributor)).status, 401);
  assert.equal((await request(`/api/admin/users/${suspendedRole.id}/verification`, "PATCH", {
    decision: "active",
    reason: "Account access restored after review."
  }, admin)).status, 200);
});

test("advertisement campaigns route private inquiries and persist real metrics", async () => {
  assert.ok(advertisementTestAccounts, "the procurement workflow should have registered test accounts");
  const adminLogin = await request("/api/auth/login", "POST", {
    email: advertisementTestAccounts.adminEmail,
    password: advertisementTestAccounts.adminPassword
  });
  const schoolLogin = await request("/api/auth/login", "POST", {
    email: advertisementTestAccounts.schoolEmail,
    password: advertisementTestAccounts.password
  });
  const partnerLogin = await request("/api/auth/login", "POST", {
    email: advertisementTestAccounts.partnerEmail,
    password: advertisementTestAccounts.password
  });
  assert.equal(adminLogin.status, 200);
  assert.equal(schoolLogin.status, 200);
  assert.equal(partnerLogin.status, 200);
  let admin = sessionCookie(adminLogin);
  const school = sessionCookie(schoolLogin);
  let partner = sessionCookie(partnerLogin);

  assert.equal((await request("/api/admin/advertisements", "GET", undefined, school)).status, 403);
  assert.equal((await request("/api/admin/advertisements", "GET")).status, 401);
  assert.equal((await request("/api/advertisements")).status, 200);
  const today = new Date().toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const fields = {
    title: "CBSE Science textbook campaign",
    description: "A sponsored listing for an academic textbook with verified supplier availability and school quotation inquiries.",
    productTitle: "Science Explorer",
    advertiserId: advertisementTestAccounts.partnerId,
    subject: "Science",
    className: "Class 9",
    board: "CBSE",
    medium: "English",
    academicSession: "2026-27",
    isbn: "9781234567890",
    referencePrice: 425,
    campaignFee: 1250,
    startDate: today,
    endDate,
    coverImage: tinyPngDataUrl(),
    action: "active"
  };
  const badAdvertiser = await request("/api/admin/advertisements", "POST", {
    ...fields,
    advertiserId: "unverified-account"
  }, admin);
  assert.equal(badAdvertiser.status, 400);
  const created = await request("/api/admin/advertisements", "POST", fields, admin);
  assert.equal(created.status, 201);
  assert.equal(created.payload.item.status, "active");
  assert.equal(created.payload.item.billingStatus, "unbilled");
  const adId = created.payload.item.id;
  const publicList = await request("/api/advertisements");
  assert.equal(publicList.status, 200);
  assert.equal(publicList.payload.items.length, 1);
  assert.equal(publicList.payload.items[0].id, adId);
  assert.equal("advertiserId" in publicList.payload.items[0], false);
  assert.equal("campaignFee" in publicList.payload.items[0], false);
  assert.equal((await request(`/advertisements/${adId}`)).status, 200);
  const draftAd = await request("/api/admin/advertisements", "POST", {
    ...fields,
    title: "Private campaign draft",
    action: "draft"
  }, admin);
  assert.equal(draftAd.status, 201);
  assert.equal((await request(`/api/advertisements/${draftAd.payload.item.id}`)).status, 404);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const futureAd = await request("/api/admin/advertisements", "POST", {
    ...fields,
    title: "Future campaign listing",
    startDate: tomorrow,
    endDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    action: "active"
  }, admin);
  assert.equal(futureAd.status, 201);
  assert.equal((await request(`/api/advertisements/${futureAd.payload.item.id}`)).status, 404);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const expiredAd = await request("/api/admin/advertisements", "POST", {
    ...fields,
    title: "Expired campaign listing",
    startDate: twoDaysAgo,
    endDate: yesterday,
    action: "active"
  }, admin);
  assert.equal(expiredAd.status, 201);
  assert.equal((await request(`/api/advertisements/${expiredAd.payload.item.id}`)).status, 404);
  const invalidImage = await request("/api/admin/advertisements", "POST", {
    ...fields,
    title: "Invalid image listing",
    coverImage: "data:image/svg+xml;base64,PHN2Zy8+"
  }, admin);
  assert.equal(invalidImage.status, 400);

  assert.equal((await request("/api/ad-inquiries", "POST", {
    advertisementId: adId,
    quantity: 10
  })).status, 401);
  assert.equal((await request("/api/ad-inquiries", "POST", {
    advertisementId: adId,
    quantity: 10
  }, partner)).status, 403);
  assert.equal((await request("/api/ad-inquiries", "POST", {
    advertisementId: adId,
    quantity: "not-a-number"
  }, school)).status, 400);
  const click = await request(`/api/advertisements/${adId}/click`, "POST");
  assert.equal(click.status, 201);
  const inquiry = await request("/api/ad-inquiries", "POST", {
    advertisementId: adId,
    quantity: 120,
    message: "Please confirm the current edition and delivery availability."
  }, school);
  assert.equal(inquiry.status, 201);
  assert.match(inquiry.payload.inquiry.id, /^ADQ-/);
  const otherSupplierLogin = await request("/api/auth/login", "POST", {
    email: roleTestAccounts.retailer.email,
    password: roleTestAccounts.retailer.password
  });
  assert.equal(otherSupplierLogin.status, 200);
  assert.deepEqual((await request("/api/ad-inquiries", "GET", undefined, sessionCookie(otherSupplierLogin))).payload.items, []);
  const partnerDashboard = await request("/api/dashboard", "GET", undefined, partner);
  assert.equal(partnerDashboard.status, 200);
  assert.equal(partnerDashboard.payload.adInquiries.length, 1);
  assert.equal(partnerDashboard.payload.adInquiries[0].quantity, 120);
  assert.equal("requesterId" in partnerDashboard.payload.adInquiries[0], false);
  assert.equal((await request("/api/ad-inquiries", "GET", undefined, school)).status, 403);
  const adminMetrics = await request("/api/admin/advertisements", "GET", undefined, admin);
  const trackedAd = adminMetrics.payload.items.find(item => item.id === adId);
  assert.equal(trackedAd.clicks, 1);
  assert.equal(trackedAd.inquiries, 1);
  const advertisementAudit = await request("/api/admin/audit?entity=advertisement", "GET", undefined, admin);
  assert.ok(advertisementAudit.payload.items.some(item => item.entityId === adId && item.action === "advertisement.activated"));
  const inquiryAudit = await request(`/api/admin/audit?q=${encodeURIComponent(inquiry.payload.inquiry.id)}`, "GET", undefined, admin);
  assert.ok(inquiryAudit.payload.items.some(item => item.action === "advertisement.inquiry_submitted"));

  const paused = await request(`/api/admin/advertisements/${adId}`, "PATCH", {
    ...fields,
    action: "paused"
  }, admin);
  assert.equal(paused.status, 200);
  assert.equal((await request(`/api/advertisements/${adId}`)).status, 404);
  assert.equal((await request(`/api/advertisements/${adId}/click`, "POST")).status, 404);
  const reactivated = await request(`/api/admin/advertisements/${adId}`, "PATCH", {
    ...fields,
    action: "active",
    billingStatus: "invoiced_offline"
  }, admin);
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.payload.item.billingStatus, "invoiced_offline");
  const feeChange = await request(`/api/admin/advertisements/${adId}`, "PATCH", {
    ...fields,
    campaignFee: 1400,
    billingStatus: "invoiced_offline",
    action: "active"
  }, admin);
  assert.equal(feeChange.status, 409);
  const suspendedAdvertiser = await request(`/api/admin/users/${advertisementTestAccounts.partnerId}/verification`, "PATCH", {
    decision: "suspended",
    reason: "Reviewing advertiser eligibility concerns."
  }, admin);
  assert.equal(suspendedAdvertiser.status, 200);
  assert.equal((await request("/api/advertisements")).payload.items.some(item => item.id === adId), false);
  assert.equal((await request("/api/ad-inquiries", "POST", {
    advertisementId: adId,
    quantity: 1
  }, school)).status, 404);
  assert.equal((await request(`/api/admin/users/${advertisementTestAccounts.partnerId}/verification`, "PATCH", {
    decision: "active",
    reason: "Advertiser eligibility rechecked and access restored."
  }, admin)).status, 200);

  const preRestartPartnerSession = partner;
  await stopMainServer();
  await startMainServer();
  assert.equal((await request("/api/auth/me", "GET", undefined, preRestartPartnerSession)).payload.user, null,
    "in-memory sessions are invalidated by a server restart");
  const restartedAdminLogin = await request("/api/auth/login", "POST", {
    email: advertisementTestAccounts.adminEmail,
    password: advertisementTestAccounts.adminPassword
  });
  const restartedPartnerLogin = await request("/api/auth/login", "POST", {
    email: advertisementTestAccounts.partnerEmail,
    password: advertisementTestAccounts.password
  });
  assert.equal(restartedAdminLogin.status, 200);
  assert.equal(restartedPartnerLogin.status, 200);
  admin = sessionCookie(restartedAdminLogin);
  partner = sessionCookie(restartedPartnerLogin);
  const persistedAdminAds = await request("/api/admin/advertisements", "GET", undefined, admin);
  const persistedAd = persistedAdminAds.payload.items.find(item => item.id === adId);
  assert.equal(persistedAd.clicks, 1);
  assert.equal(persistedAd.inquiries, 1);
  assert.equal(persistedAd.billingStatus, "invoiced_offline");
  const persistedPartnerDashboard = await request("/api/dashboard", "GET", undefined, partner);
  assert.equal(persistedPartnerDashboard.payload.adInquiries[0].id, inquiry.payload.inquiry.id);

  assert.equal((await request(`/api/admin/advertisements/${adId}`, "DELETE", undefined, admin)).status, 200);
  assert.equal((await request("/api/advertisements")).payload.items.length, 0);
  assert.equal((await request(`/advertisements/${adId}`)).status, 404);
});

test("sessions expire on the server", async () => {
  const expiryDataDir = await mkdtemp(path.join(os.tmpdir(), "goerudite-expiry-"));
  const storeFile = path.join(expiryDataDir, "store.json");
  const expiredInviteToken = "expired-invitation-token";
  const expiredResetToken = "c".repeat(64);
  await writeFile(storeFile, JSON.stringify({
    users: [{
      id: "expired-invite-owner",
      firstName: "Invite",
      lastName: "Owner",
      email: "invite-owner@example.test",
      role: "school",
      organizationId: "expired-invite-owner",
      organizationName: "Expired Invite School",
      accountStatus: "active",
      verificationStatus: "verified",
      profile: {}
    }],
    invitations: [{
      id: "INV-EXPIRED",
      organizationId: "expired-invite-owner",
      email: "expired-invitee@example.test",
      staffProfile: "buyer",
      tokenHash: crypto.createHash("sha256").update(expiredInviteToken).digest("hex"),
      createdBy: "expired-invite-owner",
      createdAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-02T00:00:00.000Z",
      usedAt: null,
      acceptedBy: null
    }],
    passwordResets: [{
      id: "RESET-EXPIRED",
      userId: "expired-invite-owner",
      tokenHash: crypto.createHash("sha256").update(expiredResetToken).digest("hex"),
      createdAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-02T00:00:00.000Z",
      usedAt: null
    }],
    requests: [],
    rfqs: [{
      id: "RFQ-OLD",
      ownerId: "school-old",
      status: "published",
      responseDeadline: "2020-01-01",
      lines: [],
      version: 1,
      versions: []
    }],
    quotes: [{
      id: "Q-OLD",
      rfqId: "RFQ-OLD",
      supplierId: "supplier-old",
      status: "submitted",
      validThrough: "2020-01-01",
      version: 1
    }]
  }));
  const port = await availablePort();
  const expiryUrl = `http://127.0.0.1:${port}`;
  let expiryProcess;
  let expiryOutput = "";
  try {
    expiryProcess = spawn(process.execPath, [path.join(root, "server.js")], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        GOERUDITE_DATA_DIR: expiryDataDir,
        GOERUDITE_MFA_ENCRYPTION_KEY: mfaEncryptionKey,
        GOERUDITE_AUDIT_HMAC_KEY: auditHmacKey,
        GOERUDITE_SESSION_TTL_MS: "1000",
        NODE_ENV: "production"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    expiryProcess.stdout.on("data", chunk => { expiryOutput += chunk.toString(); });
    expiryProcess.stderr.on("data", chunk => { expiryOutput += chunk.toString(); });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (expiryProcess.exitCode !== null) break;
      try {
        const health = await fetch(`${expiryUrl}/api/health`);
        if (health.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, `Expiry test server did not start.\n${expiryOutput}`);
    const expiredInvite = await fetch(`${expiryUrl}/api/team/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: expiredInviteToken,
        firstName: "Expired",
        lastName: "Invite",
        password: "expired-invite-password"
      })
    });
    assert.equal(expiredInvite.status, 410);
    const afterExpiredInvite = JSON.parse(await readFile(storeFile, "utf8"));
    assert.equal(afterExpiredInvite.users.length, 1, "an expired invitation does not create a member account");
    assert.equal(afterExpiredInvite.invitations[0].usedAt, null);
    const expiredReset = await fetch(`${expiryUrl}/api/auth/password-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: expiredResetToken,
        password: "expired-reset-password"
      })
    });
    assert.equal(expiredReset.status, 410, "expired reset links cannot change account credentials");
    const unavailableRecoveryEmail = await fetch(`${expiryUrl}/api/auth/password-reset/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "any-account@example.test" })
    });
    assert.equal(unavailableRecoveryEmail.status, 503, "password recovery does not claim email delivery when SMTP is unconfigured");
    const registrationResponse = await fetch(`${expiryUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Expiry",
        lastName: "Check",
        email: `expiry-${crypto.randomUUID()}@example.test`,
        organizationName: "Expiry Test School",
        role: "school",
        password: "expiry-test-password",
        consent: true
      })
    });
    assert.equal(registrationResponse.status, 201);
    const registrationPayload = await registrationResponse.json();
    assert.equal(registrationPayload.mfaSetupRequired, true);
    const pendingCookie = registrationResponse.headers.get("set-cookie").split(";")[0];
    const enrollmentResponse = await fetch(`${expiryUrl}/api/auth/mfa/enroll/start`, {
      method: "POST",
      headers: { Cookie: pendingCookie, "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(enrollmentResponse.status, 200);
    const enrollmentPayload = await enrollmentResponse.json();
    const verificationResponse = await fetch(`${expiryUrl}/api/auth/mfa/enroll/verify`, {
      method: "POST",
      headers: { Cookie: pendingCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ code: totpAt(enrollmentPayload.secret).code })
    });
    assert.equal(verificationResponse.status, 200);
    const cookie = verificationResponse.headers.get("set-cookie");
    assert.match(cookie, /Max-Age=1/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    await new Promise(resolve => setTimeout(resolve, 1100));
    const me = await fetch(`${expiryUrl}/api/auth/me`, {
      headers: { Cookie: cookie.split(";")[0] }
    });
    assert.deepEqual(await me.json(), { user: null });
    const dashboard = await fetch(`${expiryUrl}/api/dashboard`, {
      headers: { Cookie: cookie.split(";")[0] }
    });
    assert.equal(dashboard.status, 401);
    const persisted = JSON.parse(await readFile(storeFile, "utf8"));
    assert.equal(persisted.rfqs[0].status, "expired");
    assert.equal(persisted.quotes[0].status, "expired");
  } finally {
    if (expiryProcess && expiryProcess.exitCode === null) {
      await new Promise(resolve => {
        const timeout = setTimeout(resolve, 2000);
        expiryProcess.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
        expiryProcess.kill();
      });
    }
    await rm(expiryDataDir, { recursive: true, force: true });
  }
});
