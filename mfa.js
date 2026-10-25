const crypto = require("node:crypto");

function base32Encode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const normalized = String(input).replace(/=+$/, "").toUpperCase();
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) throw new Error("Invalid TOTP secret.");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const output = [];
  for (const character of normalized) {
    value = (value << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function createTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function totpAt(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) |
    ((digest[offset + 1] & 255) << 16) |
    ((digest[offset + 2] & 255) << 8) |
    (digest[offset + 3] & 255);
  return { counter, code: String(binary % 1_000_000).padStart(6, "0") };
}

function verifyTotp(secret, submittedCode, timestamp = Date.now(), lastCounter = -1) {
  if (!/^\d{6}$/.test(String(submittedCode))) return null;
  const currentCounter = Math.floor(timestamp / 30000);
  for (const counter of [currentCounter - 1, currentCounter, currentCounter + 1]) {
    if (counter <= lastCounter) continue;
    const expected = totpAt(secret, counter * 30000).code;
    const received = Buffer.from(String(submittedCode));
    const actual = Buffer.from(expected);
    if (crypto.timingSafeEqual(received, actual)) return counter;
  }
  return null;
}

function encryptionKey(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) {
    const error = new Error("MFA encryption is unavailable. Configure GOERUDITE_MFA_ENCRYPTION_KEY with a 32-byte key from the approved secret manager.");
    error.code = "MFA_KEY_UNAVAILABLE";
    throw error;
  }
  return Buffer.from(value, "hex");
}

function encryptSecret(secret, keyValue = process.env.GOERUDITE_MFA_ENCRYPTION_KEY) {
  const key = encryptionKey(keyValue);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `v1:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${ciphertext.toString("hex")}`;
}

function decryptSecret(encrypted, keyValue = process.env.GOERUDITE_MFA_ENCRYPTION_KEY) {
  const match = typeof encrypted === "string" && encrypted.match(/^v1:([a-f0-9]{24}):([a-f0-9]{32}):([a-f0-9]+)$/i);
  if (!match) throw new Error("The stored MFA secret has an invalid format.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(keyValue), Buffer.from(match[1], "hex"));
  decipher.setAuthTag(Buffer.from(match[2], "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(match[3], "hex")),
    decipher.final()
  ]).toString("utf8");
}

function normalizeRecoveryCode(code) {
  return String(code || "").replace(/[\s-]/g, "").toUpperCase();
}

function hashRecoveryCode(code) {
  return crypto.createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

function generateRecoveryCodes(count = 10) {
  const codes = Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(12).toString("hex").toUpperCase();
    return raw.match(/.{1,4}/g).join("-");
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

function verifyRecoveryCode(code, hashes) {
  const actual = Buffer.from(hashRecoveryCode(code), "hex");
  let matchedIndex = -1;
  for (let index = 0; index < hashes.length; index += 1) {
    const expected = Buffer.from(hashes[index], "hex");
    if (expected.length === actual.length && crypto.timingSafeEqual(actual, expected)) matchedIndex = index;
  }
  return matchedIndex;
}

function authenticatorUrl(email, issuer, secret) {
  const label = `${issuer}:${email}`;
  const query = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${encodeURIComponent(label)}?${query}`;
}

module.exports = {
  authenticatorUrl,
  createTotpSecret,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  totpAt,
  verifyRecoveryCode,
  verifyTotp
};
