const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  reporter: "list",
  use: {
    browserName: "chromium",
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000
  }
});
