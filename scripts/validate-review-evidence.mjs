#!/usr/bin/env node
// Validate durable independent-review records (docs/audits/reviews/*.json).
//
// This is a VALIDATOR, not an enforcement mechanism. It checks that a record
// names the exact reviewed commit, carries a verdict and findings, and never
// claims that an agent review is a human approval. It does not — and cannot —
// require a review to exist before a merge: GitHub branch protection has no
// primitive for that (classification: DOCUMENT_ONLY).
//
// Usage:
//   node scripts/validate-review-evidence.mjs <record.json> [more.json ...]
//   node scripts/validate-review-evidence.mjs --dir docs/audits/reviews
// Exit codes: 0 all valid, 1 validation error, 2 usage error.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const REQUIRED = [
  "pr",
  "code_head_reviewed",
  "review_type",
  "reviewer_role",
  "timestamp",
  "verdict",
  "findings_summary",
  "findings",
  "delta_review_sha",
  "enforcement",
];

const REVIEW_TYPES = new Set(["AGENT_INDEPENDENT_REVIEW", "HUMAN_APPROVAL", "CI_VALIDATION"]);
const VERDICTS = new Set(["APPROVE", "APPROVE_WITH_NITS", "REQUEST_CHANGES", "BLOCK"]);
const SEVERITIES = new Set(["critical", "high", "medium", "low", "nit"]);

export function validateReviewRecord(record, { fileName = "record.json" } = {}) {
  const errors = [];
  const warnings = [];

  for (const field of REQUIRED) {
    if (!Object.hasOwn(record, field)) errors.push(`missing required field: ${field}`);
  }
  if (!Number.isInteger(record.pr) || record.pr <= 0) errors.push("pr must be a positive integer");
  if (typeof record.code_head_reviewed !== "string" || !/^[0-9a-f]{40}$/.test(record.code_head_reviewed)) {
    errors.push("code_head_reviewed must be a full lowercase 40-hex commit SHA");
  }
  if (!REVIEW_TYPES.has(record.review_type)) errors.push(`review_type must be one of ${[...REVIEW_TYPES].join(", ")}`);
  if (!VERDICTS.has(record.verdict)) errors.push(`verdict must be one of ${[...VERDICTS].join(", ")}`);
  if (typeof record.reviewer_role !== "string" || !record.reviewer_role.trim()) errors.push("reviewer_role must be a non-empty string");
  if (typeof record.timestamp !== "string" || Number.isNaN(Date.parse(record.timestamp))) {
    errors.push("timestamp must be a valid ISO-8601 string");
  }
  if (!Array.isArray(record.findings)) {
    errors.push("findings must be an array");
  } else {
    record.findings.forEach((finding, index) => {
      for (const key of ["id", "severity", "description", "fixed"]) {
        if (!Object.hasOwn(finding ?? {}, key)) errors.push(`findings[${index}] missing ${key}`);
      }
      if (finding && !SEVERITIES.has(finding.severity)) errors.push(`findings[${index}].severity invalid`);
      if (finding && typeof finding.fixed !== "boolean") errors.push(`findings[${index}].fixed must be boolean`);
    });
  }
  if (record.delta_review_sha !== null && !/^[0-9a-f]{40}$/.test(record.delta_review_sha ?? "")) {
    errors.push("delta_review_sha must be null or a full 40-hex SHA");
  }
  if (record.review_type === "AGENT_INDEPENDENT_REVIEW") {
    if (/approv/i.test(record.verdict) && !/independent/i.test(record.reviewer_role)) {
      warnings.push("agent review verdict present but reviewer_role does not identify an independent reviewer");
    }
    if (record.enforcement?.review_evidence !== "DOCUMENT_ONLY") {
      warnings.push("agent review should record enforcement.review_evidence = DOCUMENT_ONLY (no server-side enforcement exists)");
    }
  }
  if (record.review_type !== "HUMAN_APPROVAL" && record.human_approval === true) {
    errors.push("human_approval may only be true for review_type HUMAN_APPROVAL");
  }
  if (record.review_type === "HUMAN_APPROVAL" && record.human_approval !== true) {
    errors.push("review_type HUMAN_APPROVAL requires human_approval: true");
  }
  if (typeof record.evidence_commit === "string" && record.evidence_commit === record.code_head_reviewed) {
    errors.push("self-referential record: evidence_commit must not equal code_head_reviewed (record the code head; commit this evidence separately)");
  }
  if (/^\s*$/.test(record.findings_summary ?? "")) errors.push("findings_summary must not be empty");

  return { ok: errors.length === 0, errors, warnings, fileName };
}

function collectFiles(argv) {
  if (argv[0] === "--dir") {
    const dir = resolve(argv[1]);
    if (!statSync(dir).isDirectory()) throw new Error(`${dir} is not a directory`);
    return readdirSync(dir)
      .filter((name) => /^REVIEW-.*\.json$/.test(name))
      .map((name) => join(dir, name));
  }
  return argv.map((file) => resolve(file));
}

function main(argv) {
  if (argv.length === 0) {
    console.error("usage: validate-review-evidence.mjs <record.json> [...] | --dir <dir>");
    return 2;
  }
  const files = collectFiles(argv);
  if (files.length === 0) {
    console.log("REVIEW_EVIDENCE=NONE");
    return 0;
  }
  let failed = 0;
  for (const file of files) {
    let record;
    try {
      record = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      console.error(`REVIEW_EVIDENCE=FAIL ${file}: ${error.message}`);
      failed += 1;
      continue;
    }
    const result = validateReviewRecord(record, { fileName: file });
    for (const warning of result.warnings) console.warn(`REVIEW_EVIDENCE=WARN ${file}: ${warning}`);
    if (result.ok) console.log(`REVIEW_EVIDENCE=PASS ${file}`);
    else {
      console.error(`REVIEW_EVIDENCE=FAIL ${file}: ${result.errors.join("; ")}`);
      failed += 1;
    }
  }
  return failed === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith("validate-review-evidence.mjs")) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`REVIEW_EVIDENCE=FAIL ${error.message}`);
    process.exitCode = 2;
  }
}
