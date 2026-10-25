const { test, expect } = require("@playwright/test");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { mkdtemp, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { totpAt } = require("../mfa");

const root = path.resolve(__dirname, "..");
const adminKey = "isolated-e2e-bootstrap-key";
const mfaEncryptionKey = crypto.randomBytes(32).toString("hex");
const auditHmacKey = crypto.randomBytes(32).toString("hex");
const roles = [
  ["admin", "Platform control centre"],
  ["school", "School procurement"],
  ["distributor", "Distributor workspace"],
  ["retailer", "Retailer workspace"],
  ["publisher", "Publisher workspace"],
  ["other", "Account workspace"]
];
const viewports = [
  [320, 568], [360, 800], [390, 844], [430, 932], [600, 960],
  [768, 1024], [1024, 1366], [1280, 800], [1440, 900], [1920, 1080]
];
let baseUrl;
let dataDir;
let serverProcess;
let accounts;
let serverOutput = "";

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

async function api(route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${route} returned ${response.status}: ${payload.error || "request failed"}`);
  return payload;
}

function nextTotpCode(account) {
  const nextAllowedCounter = Number.isInteger(account.mfaCounter) ? account.mfaCounter + 1 : -1;
  const token = totpAt(account.mfaSecret, Math.max(Date.now(), nextAllowedCounter * 30000));
  account.mfaCounter = token.counter;
  return token.code;
}

async function loginInBrowser(page, account) {
  await page.goto(baseUrl);
  await page.locator('[data-auth="login"]').first().click();
  await page.locator("#auth-form [name=email]").fill(account.email);
  await page.locator("#auth-form [name=password]").fill(account.password);
  await page.locator("#auth-form button[type=submit]").click();
  await page.waitForFunction(() =>
    location.pathname === "/dashboard" ||
    document.querySelector("[data-mfa-setup]") ||
    document.querySelector('#auth-form [name="mfaCode"]')
  );
  if (await page.locator("[data-mfa-setup]").count()) {
    const secret = await page.locator("[data-mfa-secret]").textContent();
    account.mfaSecret = secret;
    await page.locator("#auth-form [name=code]").fill(nextTotpCode(account));
    await page.locator("#auth-form button[type=submit]").click();
    await page.locator("[data-mfa-recovery-ack]").click();
  } else if (await page.locator('#auth-form [name="mfaCode"]').count()) {
    expect(account.mfaSecret, "repeat sign-in should reuse the isolated test authenticator secret").toBeTruthy();
    await page.locator('#auth-form [name="mfaCode"]').fill(nextTotpCode(account));
    await page.locator("#auth-form button[type=submit]").click();
  }
  await page.waitForURL(`${baseUrl}/dashboard`);
}

test.beforeAll(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "goerudite-playwright-"));
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
      NODE_ENV: "test"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  serverProcess.stdout.on("data", chunk => { serverOutput += chunk.toString(); });
  serverProcess.stderr.on("data", chunk => { serverOutput += chunk.toString(); });

  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverProcess.exitCode !== null) throw new Error(`Isolated E2E server exited.\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Isolated E2E server did not become ready.\n${serverOutput}`);

  const suffix = crypto.randomUUID();
  accounts = new Map();
  const adminEmail = `admin-${suffix}@example.test`;
  await api("/api/auth/register", {
    firstName: "Test",
    lastName: "Admin",
    email: adminEmail,
    organizationName: "Isolated E2E Administration",
    role: "admin",
    password: "e2e-test-password-1",
    bootstrapKey: adminKey,
    consent: true
  });
  accounts.set("admin", { email: adminEmail, password: "e2e-test-password-1" });

  for (const [role] of roles.filter(([value]) => value !== "admin")) {
    const email = `${role}-${suffix}@example.test`;
    await api("/api/auth/register", {
      firstName: "Test",
      lastName: role,
      email,
      organizationName: `Isolated E2E ${role}`,
      role,
      password: "e2e-test-password-1",
      consent: true
    });
    accounts.set(role, { email, password: "e2e-test-password-1" });
  }
});

test.afterAll(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 3000);
      serverProcess.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      serverProcess.kill();
    });
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test("public and account-help routes load at the requested viewport matrix", async ({ browser }) => {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const routes = [
    "/", "/solutions", "/pricing", "/about", "/trust", "/help", "/catalog",
    "/advertisements", "/blog", "/book/mathematics-world", "/contact",
    "/dashboard", "/forgot-password", `/reset-password/${"a".repeat(64)}`
  ];
  let checks = 0;

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    for (const route of routes) {
      const response = await page.goto(`${baseUrl}${route}`);
      expect(response?.status(), `${route} at ${width}x${height}`).toBe(200);
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth
      }));
      expect(dimensions.document, `${route} overflow at ${width}x${height}`).toBeLessThanOrEqual(dimensions.viewport);
      checks += 1;
    }
  }

  expect(errors).toEqual([]);
  expect(checks).toBe(140);
  await page.goto(`${baseUrl}/`);
  await expect(page.locator(".nav-login svg")).toBeVisible();
  await expect(page.locator('.footer-contact a[href="tel:+918586032007"]')).toContainText("+91 8586032007");
  await expect(page.locator('.social-link[aria-label="GoErudite on WhatsApp"]')).toHaveAttribute("href", "https://wa.me/918586032007");
  await expect(page.locator('.social-link[aria-label="Instagram profile link not configured"]')).toBeVisible();
  await expect(page.locator('.social-link[aria-label="LinkedIn profile link not configured"]')).toBeVisible();
  await page.goto(`${baseUrl}/contact`);
  await expect(page.locator('.support-info a[href="tel:+918586032007"]')).toContainText("+91 8586032007");
  await page.goto(`${baseUrl}/solutions`);
  const heroBounds = await page.locator(".inner-hero").boundingBox();
  const loginBounds = await page.locator(".hero-login .button").boundingBox();
  expect(heroBounds).not.toBeNull();
  expect(loginBounds).not.toBeNull();
  expect(loginBounds.y).toBeGreaterThanOrEqual(heroBounds.y + heroBounds.height);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/`);
  await page.getByRole("button", { name: "Open GoErudite help chat" }).click();
  await expect(page.getByRole("dialog", { name: "GoErudite Help" })).toBeVisible();
  await expect(page.getByRole("log")).toContainText("Hello! I am the GoErudite Help Assistant.");
  await page.locator("#help-chat-language").selectOption("hi");
  await page.locator(".help-chat-input").fill("forgot password");
  await page.locator(".help-chat-input").press("Enter");
  await expect(page.locator(".help-chat-answer-title")).toHaveText("Password bhool gaye");
  await page.getByRole("button", { name: "Conversation saaf karein" }).click();
  await expect(page.getByRole("log")).toContainText("Namaste! Main GoErudite Help Assistant hoon.");
  await page.locator(".help-chat-input").fill("<img src=x onerror=alert(1)> unknown help");
  await page.locator(".help-chat-input").press("Enter");
  await expect(page.locator(".help-chat-user")).toContainText("<img src=x onerror=alert(1)> unknown help");
  await expect(page.locator(".help-chat-user img")).toHaveCount(0);
  await expect(page.locator(".help-chat-related-link")).toHaveAttribute("href", "/contact");
  const chatBounds = await page.locator(".help-chat-panel").boundingBox();
  expect(chatBounds.x).toBeGreaterThanOrEqual(0);
  expect(chatBounds.x + chatBounds.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "GoErudite Help" })).toHaveCount(0);
  await page.close();
  await page.close();
});

test("help chat shows a retry state when its knowledge API is unavailable", async ({ browser }) => {
  const page = await browser.newPage();
  await page.route("**/api/help/chat", route => route.abort());
  await page.goto(`${baseUrl}/`);
  await page.getByRole("button", { name: "Open GoErudite help chat" }).click();
  await expect(page.locator(".help-chat-input")).toBeFocused();
  await expect(page.locator(".help-chat-error")).toContainText("could not be reached");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".help-chat-error")).toBeVisible();
  await page.close();
});

test("every role can log in, navigate all dashboard sections, and log out responsively", async ({ browser }) => {
  const errors = [];
  let sectionViewportChecks = 0;

  for (const [role, dashboardTitle] of roles) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(`${role}: ${error.message}`));
    await loginInBrowser(page, accounts.get(role));
    await expect(page.locator(".workspace-topbar h1")).toHaveText(dashboardTitle);
    await page.reload();
    await expect(page.locator(".workspace-topbar h1")).toHaveText(dashboardTitle);
    const sections = await page.locator("[data-dash-section]").evaluateAll(items => items.map(item => item.dataset.dashSection));
    expect(sections.length, `${role} should expose dashboard sections`).toBeGreaterThan(0);

    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      for (const section of sections) {
        if (width <= 760) await page.locator("[data-workspace-menu]").click();
        await page.locator(`[data-dash-section="${section}"]`).click();
        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth
        }));
        expect(dimensions.document, `${role}/${section} overflow at ${width}x${height}`).toBeLessThanOrEqual(dimensions.viewport);
        sectionViewportChecks += 1;
      }
    }

    await page.locator(".workspace-top-actions [data-logout]").click();
    await expect(page.locator('[data-auth="login"]').first()).toBeVisible();
    await context.close();
  }

  expect(errors).toEqual([]);
  expect(sectionViewportChecks).toBe(760);
});

test("Admin supplier territory controls validate, persist, reject duplicates, and remove through the UI", async ({ browser }) => {
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 500) runtimeErrors.push(`${response.status()} ${response.url()}`);
  });

  await loginInBrowser(page, accounts.get("admin"));
  await page.locator('[data-dash-section="territories"]').click();

  const form = page.locator('[data-dashboard-form="supplier-territory"]');
  await expect(form).toBeVisible();
  const supplierSelect = form.locator('[name="supplierOrganizationId"]');
  const supplierId = await supplierSelect.locator("option").evaluateAll(options =>
    options.find(option => option.textContent.startsWith("Isolated E2E distributor"))?.value
  );
  expect(supplierId).toBeTruthy();
  await supplierSelect.selectOption(supplierId);

  const suffix = crypto.randomUUID();
  const territory = {
    state: `QA State ${suffix}`,
    district: "Synthetic QA District",
    city: "Synthetic QA City"
  };
  await form.locator('[name="state"]').fill(territory.state);
  await form.locator('[name="district"]').fill(territory.district);
  await form.locator('[name="city"]').fill(territory.city);

  const invalidPostalCode = form.locator('[name="postalCode"]');
  await invalidPostalCode.fill("123");
  expect(await invalidPostalCode.evaluate(input => input.checkValidity())).toBe(false);
  await invalidPostalCode.fill("");

  const addResponse = page.waitForResponse(response =>
    response.url().endsWith("/api/admin/supplier-territories") &&
    response.request().method() === "POST"
  );
  await form.getByRole("button", { name: "Add service area" }).click();
  expect((await addResponse).status()).toBe(201);
  await expect(page.locator(".workspace-table").filter({ hasText: territory.state })).toBeVisible();

  const duplicateResponse = page.waitForResponse(response =>
    response.url().endsWith("/api/admin/supplier-territories") &&
    response.request().method() === "POST"
  );
  await page.locator('[data-dashboard-form="supplier-territory"] [name="state"]').fill(territory.state);
  await page.locator('[data-dashboard-form="supplier-territory"] [name="district"]').fill(territory.district);
  await page.locator('[data-dashboard-form="supplier-territory"] [name="city"]').fill(territory.city);
  await page.locator('[data-dashboard-form="supplier-territory"]').getByRole("button", { name: "Add service area" }).click();
  expect((await duplicateResponse).status()).toBe(409);
  await expect(page.locator(".toast-error")).toContainText("already configured");

  const territoryRow = page.locator(".workspace-table tr").filter({ hasText: territory.state });
  const removeResponse = page.waitForResponse(response =>
    response.url().includes("/api/admin/supplier-territories/") &&
    response.request().method() === "DELETE"
  );
  await territoryRow.getByRole("button", { name: "Remove" }).click();
  expect((await removeResponse).status()).toBe(200);
  await expect(page.locator(".workspace-table").filter({ hasText: territory.state })).toHaveCount(0);

  const persistedTerritories = await page.evaluate(async () => {
    const response = await fetch("/api/admin/supplier-territories");
    return response.json();
  });
  expect(persistedTerritories.territories.some(item => item.state === territory.state)).toBe(false);
  expect(runtimeErrors).toEqual([]);
  await page.close();
});

test("axe-core reports no critical or serious violations on sampled public and role dashboard pages", async ({ browser }) => {
  const context = await browser.newContext({ bypassCSP: true });
  const page = await context.newPage();
  const routeFindings = [];
  const pages = ["/", "/catalog", "/contact", "/help"];

  for (const route of pages) {
    await page.goto(`${baseUrl}${route}`);
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const findings = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }
      });
      return result.violations.map(item => ({
        id: item.id,
        impact: item.impact,
        description: item.description,
        nodes: item.nodes.length,
        examples: [...new Map(item.nodes.map(node => {
          const summary = node.failureSummary.match(/Element has insufficient color contrast[^\n]*/)?.[0] || node.failureSummary;
          return [summary, { target: node.target[0], summary }];
        })).values()]
      }));
    });
    routeFindings.push({ route, findings });
  }

  for (const [role, dashboardTitle] of roles) {
    await loginInBrowser(page, accounts.get(role));
    await expect(page.locator(".workspace-topbar h1")).toHaveText(dashboardTitle);
    await page.evaluate(() => Promise.all(
      document.getAnimations().map(animation => animation.finished.catch(() => undefined))
    ));
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const findings = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }
      });
      return result.violations.map(item => ({
        id: item.id,
        impact: item.impact,
        description: item.description,
        nodes: item.nodes.length,
        examples: [...new Map(item.nodes.map(node => {
          const summary = node.failureSummary.match(/Element has insufficient color contrast[^\n]*/)?.[0] || node.failureSummary;
          return [summary, { target: node.target[0], summary }];
        })).values()]
      }));
    });
    routeFindings.push({ route: `/dashboard (${role})`, findings });
    await page.locator(".workspace-top-actions [data-logout]").click();
    await expect(page.locator('[data-auth="login"]').first()).toBeVisible();
  }

  const severe = routeFindings.flatMap(({ route, findings }) =>
    findings.filter(item => item.impact === "critical" || item.impact === "serious")
      .map(item => `${route}: ${item.id} (${item.impact}, ${item.nodes} element(s))`)
  );
  expect(severe, JSON.stringify(routeFindings, null, 2)).toEqual([]);
  await context.close();
});
