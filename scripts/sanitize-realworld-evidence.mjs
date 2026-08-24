#!/usr/bin/env node

/**
 * Remove non-essential private metadata from the R2.3 evidence bundle.
 * Prompt text is never read or rewritten by this utility.
 */
import { readFile, writeFile } from "node:fs/promises";

const jsonTargets = [
  "evidence/analyzer-r2-realworld/prompt-extraction.json",
  "evidence/analyzer-r2-realworld/corpus-inventory.json",
  "evidence/analyzer-r2-realworld/exhaustive-analyzer-run.json",
  "evidence/analyzer-r2-realworld/privacy-scan.json",
  "evidence/analyzer-r2-realworld/file-classification.json",
  "evidence/analyzer-r2-realworld-live/judge-protocol-freeze.json",
];

const jsonlTargets = [
  "evidence/analyzer-r2-realworld-live/live-call-evidence.jsonl",
];

function sanitizeObject(value, parent = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item, parent));
  }
  if (!value || typeof value !== "object") return value;

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "REQUEST_ID" || key === "request_id" || key === "sessionID") {
      continue;
    }
    if (key === "ABSOLUTE_PATH") {
      result[key] = `<CORPUS_ROOT>/${parent.CORPUS_CASE_ID || "CASE"}`;
      continue;
    }
    if (key === "CORPUS_ROOT" || key === "CORPUS_ROOT_REALPATH") {
      result[key] = "<CORPUS_ROOT>";
      continue;
    }
    if (key === "SOURCE_FILE" || key === "RELATIVE_PATH") {
      result[key] = "<PRIVATE_FILE>";
      continue;
    }
    if (typeof item === "string") {
      result[key] = item
        .replaceAll(/\/home\/[^\s"']+/g, "<HOME>")
        .replaceAll(/\/media\/[^\s"']+/g, "<WORKSPACE>")
        .replaceAll(/[A-Za-z]:[\\/][^\s"']+/g, "<WORKSPACE>");
    } else {
      result[key] = sanitizeObject(item, value);
    }
  }
  return result;
}

for (const file of jsonTargets) {
  const parsed = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, `${JSON.stringify(sanitizeObject(parsed), null, 2)}\n`);
}

for (const file of jsonlTargets) {
  const lines = (await readFile(file, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.stringify(sanitizeObject(JSON.parse(line))));
  await writeFile(file, `${lines.join("\n")}\n`);
}

const csvFile = "evidence/analyzer-r2-realworld/corpus-inventory.csv";
const csvLines = (await readFile(csvFile, "utf8")).split("\n");
const csvSanitized = csvLines.map((line, index) => {
  if (index === 0 || !line) return line;
  const match = line.match(/^("(?:[^"]|"")*"|[^,]*),("(?:[^"]|"")*"|[^,]*),(.*)$/);
  return match ? `<PRIVATE_FILE>,<CORPUS_ROOT>,${match[3]}` : "<PRIVATE_FILE>,<CORPUS_ROOT>";
});
await writeFile(csvFile, csvSanitized.join("\n"));

const report = "evidence/analyzer-r2-realworld-live/PVL_ANALYZER_R2.3_REALWORLD_LIVE_REPORT.md";
const reportText = await readFile(report, "utf8");
await writeFile(
  report,
  reportText
    .replaceAll(/\/home\/[^\s)`]+/g, "<HOME>")
    .replaceAll(/\/media\/[^\s)`]+/g, "<WORKSPACE>")
    .replaceAll(/C:\\\\[^\s)`]+/g, "<WORKSPACE>"),
);

console.log("SANITIZED_REALWORLD_EVIDENCE=PASS");
