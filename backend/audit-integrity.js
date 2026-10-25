const crypto = require("node:crypto");

const GENESIS_HASH = "0".repeat(64);

function withoutIntegrity(event) {
  const { integrity, ...record } = event;
  return record;
}

function legacyAnchor(records) {
  return crypto.createHash("sha256").update(JSON.stringify(records.map(withoutIntegrity))).digest("hex");
}

function eventHash(event, previousHash, algorithm, key) {
  const material = `${previousHash}\n${JSON.stringify(withoutIntegrity(event))}`;
  if (algorithm === "hmac-sha256-chain") return crypto.createHmac("sha256", key).update(material).digest("hex");
  return crypto.createHash("sha256").update(material).digest("hex");
}

function appendAuditRecord(records, event, key = null) {
  const snapshot = JSON.parse(JSON.stringify(event));
  const previousHash = records[0]?.integrity?.hash ||
    (records.length ? legacyAnchor(records) : GENESIS_HASH);
  const algorithm = key ? "hmac-sha256-chain" : "sha256-chain";
  const record = {
    ...snapshot,
    integrity: {
      version: 1,
      algorithm,
      previousHash,
      hash: eventHash(snapshot, previousHash, algorithm, key)
    }
  };
  records.unshift(record);
  return record;
}

function verifyAuditRecords(records, key = null) {
  const chain = [];
  let legacyStarted = false;
  let legacyRecords = [];
  for (const event of records) {
    if (event.integrity) {
      if (legacyStarted) return { valid: false, checked: chain.length, legacyUnsealed: legacyRecords.length, reason: "Hashed audit entries are out of order." };
      chain.push(event);
    } else {
      legacyStarted = true;
      legacyRecords.push(event);
    }
  }
  for (let index = 0; index < chain.length; index += 1) {
    const event = chain[index];
    const { algorithm, previousHash, hash, version } = event.integrity;
    if (version !== 1 || !["sha256-chain", "hmac-sha256-chain"].includes(algorithm)) {
      return { valid: false, checked: index, legacyUnsealed: legacyRecords.length, reason: "Unsupported audit integrity metadata." };
    }
    if (algorithm === "hmac-sha256-chain" && !key) {
      return { valid: false, checked: index, legacyUnsealed: legacyRecords.length, reason: "The audit verification key is unavailable." };
    }
    const expectedPrevious = chain[index + 1]?.integrity?.hash ||
      (legacyRecords.length ? legacyAnchor(legacyRecords) : GENESIS_HASH);
    if (previousHash !== expectedPrevious) {
      return { valid: false, checked: index, legacyUnsealed: legacyRecords.length, reason: "Audit chain link mismatch." };
    }
    const expectedHash = eventHash(event, previousHash, algorithm, key);
    const actualBytes = Buffer.from(hash || "", "hex");
    const expectedBytes = Buffer.from(expectedHash, "hex");
    if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) {
      return { valid: false, checked: index, legacyUnsealed: legacyRecords.length, reason: "Audit record integrity mismatch." };
    }
  }
  return {
    valid: true,
    checked: chain.length,
    legacyUnsealed: legacyRecords.length,
    algorithm: chain[0]?.integrity?.algorithm || "not_started",
    reason: legacyRecords.length ? "New audit records verify; legacy records predate integrity chaining." : "All audit records verify."
  };
}

module.exports = { appendAuditRecord, verifyAuditRecords };
