const fs = require("node:fs");
const path = require("node:path");

const EXPECTED_HEADER = [
  "Feature ID",
  "Role",
  "Page/route",
  "Control or workflow",
  "Expected behavior",
  "Test performed",
  "Result",
  "Defect reference",
  "Fix reference",
  "Retest result",
  "Responsive test status",
  "Notes",
  "Audit classification",
  "Severity",
  "Dependency / decision",
  "Verification method"
];
const VALID_STATUSES = new Set([
  "IMPLEMENTED AND TESTED",
  "IMPLEMENTED BUT NOT TESTED",
  "PARTIALLY IMPLEMENTED",
  "BROKEN",
  "MISSING",
  "BLOCKED BY DEPENDENCY",
  "NOT APPLICABLE",
  "PASS",
  "PARTIAL",
  "FIXED - RETEST PASS",
  "FAIL",
  "MISSING",
  "NOT TESTED",
  "BLOCKED"
]);
const OPEN_STATUSES = new Set(["PARTIAL", "MISSING", "NOT TESTED", "BLOCKED", "FAIL"]);

function parseCsv(source) {
  const records = [];
  let record = [];
  let cell = "";
  let quoted = false;

  for (let index = source.charCodeAt(0) === 0xfeff ? 1 : 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      record.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      record.push(cell);
      if (record.some(value => value.length > 0)) records.push(record);
      record = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (cell.length || record.length) {
    record.push(cell);
    if (record.some(value => value.length > 0)) records.push(record);
  }
  return records;
}

function validateMatrix(source) {
  const errors = [];
  let records;
  try {
    records = parseCsv(source);
  } catch (error) {
    return { errors: [error.message], rows: [] };
  }
  if (!records.length) return { errors: ["The feature matrix is empty."], rows: [] };

  const [header, ...rows] = records;
  if (header.length !== EXPECTED_HEADER.length || header.some((value, index) => value !== EXPECTED_HEADER[index])) {
    errors.push("The feature matrix header does not match the required 16-column schema.");
  }
  const identifiers = new Set();

  rows.forEach((row, index) => {
    const line = index + 2;
    if (row.length !== EXPECTED_HEADER.length) errors.push(`Row ${line} has ${row.length} columns; expected 16.`);
    const id = row[0]?.trim();
    if (!id) errors.push(`Row ${line} has no feature ID.`);
    else if (identifiers.has(id)) errors.push(`Row ${line} duplicates feature ID ${id}.`);
    else identifiers.add(id);

    const status = row[6]?.trim();
    if (!VALID_STATUSES.has(status)) errors.push(`Row ${line} has an unknown status: ${status || "(empty)"}.`);
    if (OPEN_STATUSES.has(status)) {
      for (const column of [12, 13, 14, 15]) {
        if (!row[column]?.trim()) errors.push(`Row ${line} is missing audit metadata in ${EXPECTED_HEADER[column]}.`);
      }
      if (row[13] && !["HIGH", "MEDIUM", "LOW"].includes(row[13])) {
        errors.push(`Row ${line} has an invalid severity: ${row[13]}.`);
      }
    }
  });
  return { errors, rows };
}

if (require.main === module) {
  const matrixPath = path.join(__dirname, "..", "FEATURE_TEST_MATRIX.csv");
  const result = validateMatrix(fs.readFileSync(matrixPath, "utf8"));
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Feature matrix valid: ${result.rows.length} data rows, 16 columns, unique IDs and complete open-item metadata.`);
  }
}

module.exports = { parseCsv, validateMatrix };
