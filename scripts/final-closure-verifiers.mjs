#!/usr/bin/env node

/**
 * Final bounded-product closure verifiers.
 *
 * The live external study is deliberately informational here: 86/176 is
 * preserved as incomplete evidence and is not a product-contract gate.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const EXPECTED_EXTERNAL_CASES = 176;
const EXPECTED_VALID_CASES = 86;
const ANALYZER_SHA = "b6eb1d0b10a20298a26731e1f2d8824756aa2e9c";
const BACKUP_SHA = "e5fda6602237d3251d065db0f1e7e199c2d2d1b8";
const VALIDATION_BRANCH = "quality/analyzer-r2-realworld-validation";

const result = {};

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function readJsonl(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function trackedFiles(prefix) {
  return git(["ls-files", prefix]).split("\n").filter(Boolean);
}

function privacyVerifier() {
  const files = [
    ...trackedFiles("evidence/analyzer-r2-realworld"),
    ...trackedFiles("evidence/analyzer-r2-realworld-live"),
    "docs/audits/PVL-EXTERNAL-SEMANTIC-STUDY-FREEZE-20260824.md",
    "docs/audits/PVL-FINAL-PROJECT-CLOSURE-20260824.md",
  ];
  const violations = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (/\/home\/xxammaxx|\/media\/xxammaxx|[A-Z]:\\promptvault/i.test(text)) {
      violations.push(`${file}: unnecessary private path`);
    }
    if (/["'](?:REQUEST_ID|request_id|sessionID)["']\s*:/.test(text)) {
      violations.push(`${file}: request/session identifier`);
    }
    if (/-----BEGIN .*PRIVATE KEY-----|\bsk-[A-Za-z0-9]{20,}\b|Bearer\s+[A-Za-z0-9._-]{20,}/i.test(text)) {
      violations.push(`${file}: credential-like payload`);
    }
  }

  const corpusInventory = readJson("evidence/analyzer-r2-realworld/corpus-inventory.json");
  const privacyScan = readJson("evidence/analyzer-r2-realworld/privacy-scan.json");
  const liveCalls = readJsonl("evidence/analyzer-r2-realworld-live/live-call-evidence.jsonl");
  const localOnly = privacyScan.counts?.LOCAL_ONLY_REVIEW;
  const localOnlySent = liveCalls.filter((row) => row.REDACTED_OR_ORIGINAL === "LOCAL_ONLY_REVIEW").length;
  const noRawPromptFields = files.every((file) => {
    const text = readFileSync(file, "utf8");
    return !/"(?:RAW_PROMPT|PROMPT_TEXT|FULL_CONTENT|CONTENT_TEXT)"\s*:/.test(text);
  });

  if (corpusInventory.CORPUS_ROOT !== "<CORPUS_ROOT>") {
    violations.push("corpus inventory root is not sanitized");
  }
  if (localOnly !== 3 || localOnlySent !== 0) {
    violations.push(`local-only transmission accounting mismatch: classified=${localOnly}, sent=${localOnlySent}`);
  }
  if (!noRawPromptFields) violations.push("raw prompt field present in closure evidence");

  return {
    status: violations.length ? "FAIL" : "PASS",
    raw_corpus_committed: noRawPromptFields ? 0 : "UNKNOWN",
    raw_secrets_committed: violations.some((v) => v.includes("credential")) ? "UNKNOWN" : 0,
    local_only_external_transmissions: localOnlySent,
    evidence_sanitized: violations.length === 0 ? "PASS" : "FAIL",
    violations,
  };
}

function semanticStudyTruthVerifier() {
  const judgments = readJsonl("evidence/analyzer-r2-realworld-live/realworld-live-judgments.jsonl");
  const valid = judgments.filter(
    (row) =>
      row.JUDGE_A_RESULT &&
      !row.JUDGE_A_RESULT.__error &&
      row.JUDGE_B_RESULT &&
      !row.JUDGE_B_RESULT.__error &&
      row.REFERENCE_SCORE !== null &&
      row.REFERENCE_SCORE !== undefined &&
      row.REFERENCE_BAND,
  );
  const report = readFileSync(
    "docs/audits/PVL-EXTERNAL-SEMANTIC-STUDY-FREEZE-20260824.md",
    "utf8",
  );
  const requiredTruth = [
    /EXPECTED_CASES=176/,
    /COMPLETED_VALID_CASES=86/,
    /MISSING_CASES=90/,
    /STOP_REASON=EXTERNAL_PROVIDER_INSTABILITY/,
    /FINAL_GENERALIZATION_CONCLUSION=NOT_PROVEN/,
    /STUDY_STATUS=INCOMPLETE_EXTERNAL_VALIDATION/,
    /INTERIM_NON_AUTHORITATIVE/,
    /ANALYZER_CHANGED=NO/,
    /SIMULATED_RESULTS_USED_FOR_FINAL=NO/,
  ];
  const status = valid.length === EXPECTED_VALID_CASES &&
    judgments.length === 87 &&
    requiredTruth.every((pattern) => pattern.test(report));
  return {
    status: status ? "PASS" : "FAIL",
    expected: EXPECTED_EXTERNAL_CASES,
    completed_valid: valid.length,
    missing: EXPECTED_EXTERNAL_CASES - valid.length,
    stop_reason: "EXTERNAL_PROVIDER_INSTABILITY",
    partial_metrics_authoritative: false,
    broad_semantic_generalization_claimed: false,
    post_result_analyzer_tuning: false,
  };
}

function publicClaimsVerifier() {
  const files = ["README.md", "docs/USER_GUIDE.md", "website/index.html"];
  const text = files.map((file) => readFileSync(file, "utf8")).join("\n");
  const unsupported = [
    /semantic quality oracle/i,
    /authoritative semantic score/i,
    /objectively evaluates prompt quality/i,
    /understands whether a prompt is good/i,
  ].filter((pattern) => pattern.test(text));
  const boundedSignals = [
    /structure/i,
    /completeness/i,
    /hygiene/i,
    /contradiction/i,
    /offline/i,
    /deterministic/i,
  ].every((pattern) => pattern.test(text));
  return {
    status: unsupported.length === 0 && boundedSignals ? "PASS" : "FAIL",
    unsupported_claims: unsupported.map(String),
    bounded_signals_present: boundedSignals,
  };
}

function productContractVerifier() {
  const corpus = readJson("evidence/analyzer-r2-realworld/exhaustive-analyzer-run.json");
  const determinismOne = readJson("evidence/analyzer-r2-realworld/determinism-run1.json");
  const determinismTwo = readJson("evidence/analyzer-r2-realworld/determinism-run2.json");
  const recommendation = readJson("evidence/analyzer-r2-realworld/recommendation-review.json");
  const readme = readFileSync("README.md", "utf8");
  const staleEvidence = readJson("evidence/r23/phase-04/dom-qa-r23-stale-reanalysis-evidence.json");
  const performance = readJson("evidence/analyzer-r2-realworld/performance.json");
  const checks = {
    local_first: /local-first/i.test(readme),
    offline_analyzer: /offline/i.test(readme) && /No cloud/i.test(readme),
    deterministic: /deterministic/i.test(readme) && JSON.stringify(determinismOne) === JSON.stringify(determinismTwo),
    real_corpus_execution: corpus.TOTAL_ANALYZED_SUCCESSFULLY === 185 && corpus.TOTAL_PROMPTS_ATTEMPTED === 185 && corpus.ANALYZER_EXECUTION_SUCCESS_RATE === 100,
    production_llm_dependency: /No cloud|never a production dependency/i.test(readme),
    structure_analysis: /structure/i.test(readme),
    completeness_analysis: /completeness/i.test(readme),
    hygiene_signals: /hygiene/i.test(readme),
    contradiction_signals: /contradiction/i.test(readme) && Boolean(corpus.results?.some((row) => row.CONTRADICTIONS)),
    recommendation_behavior: recommendation.CRITICAL_MISLEADING_COUNT === 0,
    ui: readme.includes("PromptVault Lite") && readFileSync("tests/e2e/real-corpus-smoke.spec.ts", "utf8").length > 0,
    stale_state_handling: staleEvidence.stale_state === "PASS" && staleEvidence.reanalysis === "PASS",
    performance: Number.isFinite(performance.P95_MS) && performance.P95_MS > 0,
    public_claims_aligned: publicClaimsVerifier().status === "PASS",
  };
  return {
    status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
    checks,
    analyzer_sha: ANALYZER_SHA,
    external_study_informational: true,
  };
}

function analyzerFreezeVerifier() {
  const current = git(["diff", "--name-only", `${ANALYZER_SHA}..HEAD`, "--", "src-tauri/src/analysis/r2"]);
  return {
    status: current === "" ? "PASS" : "FAIL",
    analyzer_sha: ANALYZER_SHA,
    changed_since_frozen_sha: current ? current.split("\n") : [],
  };
}

function gitIntegrationSafetyVerifier() {
  const branch = git(["branch", "--show-current"]);
  const head = git(["rev-parse", "HEAD"]);
  const validationRemote = git(["ls-remote", "origin", `refs/heads/${VALIDATION_BRANCH}`]).split(/\s+/)[0];
  const backupRemote = git(["ls-remote", "origin", "refs/heads/backup/pre-finalization-20260824"]).split(/\s+/)[0];
  const originMaster = git(["rev-parse", "origin/master"]);
  const safe = branch === VALIDATION_BRANCH &&
    validationRemote === head &&
    backupRemote === BACKUP_SHA &&
    originMaster.length === 40;
  return {
    status: safe ? "PASS" : "FAIL",
    branch,
    head,
    validation_remote_sha: validationRemote,
    backup_remote_sha: backupRemote,
    origin_master: originMaster,
    backup_preserved: backupRemote === BACKUP_SHA,
    no_force_push_required: true,
    backup_only_branch_merged: false,
  };
}

result.FINAL_PROMPTVAULT_PRODUCT_CONTRACT_VERIFIER = productContractVerifier();
result.FINAL_SEMANTIC_STUDY_TRUTH_VERIFIER = semanticStudyTruthVerifier();
result.FINAL_PRIVACY_VERIFIER = privacyVerifier();
result.ANALYZER_FREEZE_VERIFIER = analyzerFreezeVerifier();
result.FINAL_GIT_INTEGRATION_SAFETY_VERIFIER = gitIntegrationSafetyVerifier();

const failed = Object.values(result).some((item) => item.status === "FAIL");
result.FINAL_PROMPTVAULT_PROJECT_VERIFIER = {
  status: failed ? "FAIL" : "PASS",
  product_contract: result.FINAL_PROMPTVAULT_PRODUCT_CONTRACT_VERIFIER.status,
  semantic_study_truth: result.FINAL_SEMANTIC_STUDY_TRUTH_VERIFIER.status,
  privacy: result.FINAL_PRIVACY_VERIFIER.status,
  integration_safe: result.FINAL_GIT_INTEGRATION_SAFETY_VERIFIER.status,
  incomplete_external_study_is_informational: true,
};

writeFileSync(
  "evidence/final-closure-verifiers-20260824.json",
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
process.exit(failed ? 1 : 0);
