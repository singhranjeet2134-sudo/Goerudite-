const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const files = [
  "backend/server.js",
  "backend/mfa.js",
  "backend/audit-integrity.js",
  "backend/help-knowledge.js",
  "backend/help-engine.js",
  "frontend/app.js",
  "frontend/dashboard.js",
  "frontend/support-chat.js",
  "api/index.js",
  "server.js",
  "playwright.config.js",
  "e2e/roles.spec.js",
  "test/workflows.test.js",
  "test/quality.test.js",
  "test/help-chat.test.js",
  "scripts/validate-feature-matrix.js"
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax/build verification passed for ${files.length} JavaScript files; this project has no bundling step.`);
