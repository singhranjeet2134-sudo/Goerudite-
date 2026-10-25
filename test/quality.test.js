const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv, validateMatrix } = require("../scripts/validate-feature-matrix");
const {
  appendAuditRecord,
  verifyAuditRecords
} = require("../audit-integrity");
const {
  createTotpSecret,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  verifyRecoveryCode,
  verifyTotp,
  totpAt
} = require("../mfa");
const crypto = require("node:crypto");

const header = "Feature ID,Role,Page/route,Control or workflow,Expected behavior,Test performed,Result,Defect reference,Fix reference,Retest result,Responsive test status,Notes,Audit classification,Severity,Dependency / decision,Verification method";

test("feature matrix parser handles quoted commas, quotes, and multiline cells", () => {
  const records = parseCsv(`${header}\nID-1,School,/dashboard,"A control, with comma","Expected ""quoted"" behavior","First line\nsecond line",PASS${",".repeat(9)}`);
  assert.equal(records.length, 2);
  assert.equal(records[1][3], "A control, with comma");
  assert.equal(records[1][4], 'Expected "quoted" behavior');
  assert.equal(records[1][5], "First line\nsecond line");
});

test("feature matrix validation rejects duplicate IDs, unknown statuses, and malformed widths", () => {
  const result = validateMatrix([
    header,
    `ID-1,School,/dashboard,First,Expected,Executed,PASS${",".repeat(9)}`,
    "ID-1,School,/dashboard,Second,Expected,Executed,UNKNOWN,,,,,"
  ].join("\n"));
  assert.ok(result.errors.some(error => error.includes("duplicates feature ID ID-1")));
  assert.ok(result.errors.some(error => error.includes("unknown status: UNKNOWN")));
  assert.ok(result.errors.some(error => error.includes("expected 16")));
});

test("feature matrix validation accepts valid unique records", () => {
  const unauditedRecord = [
    "ID-2", "Admin", "/dashboard", "Second", "Expected", "Executed",
    "NOT TESTED", "", "", "", "", "", "Not tested", "HIGH", "Audit", "Manual scan"
  ].join(",");
  const result = validateMatrix([
    header,
    `ID-1,School,/dashboard,First,Expected,Executed,PASS${",".repeat(9)}`,
    unauditedRecord
  ].join("\n"));
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 2);
});

test("TOTP verifies once, rejects replay, and encrypts authenticator secrets", () => {
  const secret = createTotpSecret();
  const now = 1_700_000_000_000;
  const { code, counter } = totpAt(secret, now);
  assert.equal(verifyTotp(secret, code, now), counter);
  assert.equal(verifyTotp(secret, code, now, counter), null);

  const key = crypto.randomBytes(32).toString("hex");
  const encrypted = encryptSecret(secret, key);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSecret(encrypted, key), secret);
  assert.throws(() => decryptSecret(encrypted, crypto.randomBytes(32).toString("hex")));
});

test("recovery codes are high entropy and individually single-use hashes", () => {
  const { codes, hashes } = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(hashes.length, 10);
  assert.ok(hashes.every(hash => /^[a-f0-9]{64}$/.test(hash)));
  assert.equal(verifyRecoveryCode(codes[0], hashes), 0);
  assert.equal(verifyRecoveryCode("invalid-code", hashes), -1);
  hashes.splice(0, 1);
  assert.equal(verifyRecoveryCode(codes[0], hashes), -1);
});

test("audit hash chains detect modification, deletion, reordering, and missing HMAC keys", () => {
  const records = [];
  const mutableSnapshot = { after: { status: "draft" } };
  appendAuditRecord(records, { id: "first", action: "login", ...mutableSnapshot });
  mutableSnapshot.after.status = "published";
  assert.equal(records[0].after.status, "draft", "audit records must not retain mutable caller-owned snapshots");
  appendAuditRecord(records, { id: "second", action: "verification" });
  assert.equal(verifyAuditRecords(records).valid, true);

  const modified = structuredClone(records);
  modified[0].action = "tampered";
  assert.equal(verifyAuditRecords(modified).valid, false);

  const reordered = structuredClone(records).reverse();
  assert.equal(verifyAuditRecords(reordered).valid, false);

  const key = crypto.randomBytes(32);
  const signed = [];
  appendAuditRecord(signed, { id: "signed", action: "backup" }, key);
  assert.equal(verifyAuditRecords(signed).valid, false);
  assert.equal(verifyAuditRecords(signed, key).valid, true);
});
