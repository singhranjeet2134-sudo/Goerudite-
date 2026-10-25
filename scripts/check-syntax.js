const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const files = [
  "mfa.js",
  "audit-integrity.js",
  "help-knowledge.js",
  "help-engine.js",
  "support-chat.js",
  "server.js",
  "app.js",
  "dashboard.js",
  "playwright.config.js",
  "e2e/roles.spec.js",
  "test/workflows.test.js",
  "test/quality.test.js",
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
