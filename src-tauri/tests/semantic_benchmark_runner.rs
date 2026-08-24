//! Semantic quality benchmark runner.
//!
//! Runs the REAL production PromptVault analysis engine
//! (promptvault_lite_lib::analysis::quality + hygiene) over the synthetic
//! benchmark corpus and writes normalized results for metric computation.
//!
//! Methodology protocol: ONE FILE PER SPLIT. The runner selects exactly one
//! split via `PV_BENCH_SPLIT` ("development" | "holdout" | "calibration") and
//! writes `results/<label>.json` with a `{"split": ..., "count": N, "label":
//! ...}` header so the metrics layer can fail closed on split separation.
//! Splits are NEVER combined in one artifact.
//!
//! Run:
//!   cargo test --test semantic_benchmark_runner -- --nocapture
//!
//! Env:
//!   PV_BENCH_DIR    corpus root (default ../benchmarks/semantic-quality)
//!   PV_BENCH_SPLIT  "development" | "holdout" | "calibration" (default: development)
//!   PV_BENCH_LABEL  result label (default: baseline)
//!
//! Output: <PV_BENCH_DIR>/results/pv-<label>.json

use serde_json::{json, Value};
use std::path::PathBuf;

fn bench_dir() -> PathBuf {
    // PV_BENCH_DIR overrides the corpus directory (used for the fresh
    // v2 benchmark under benchmarks/semantic-quality-v2/).
    if let Ok(dir) = std::env::var("PV_BENCH_DIR") {
        return PathBuf::from(dir);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../benchmarks/semantic-quality")
}

fn load_cases(split: &str) -> Value {
    let mut path = match split {
        "calibration" => bench_dir().join("cases/calibration.json"),
        "development" => bench_dir().join("cases/development.json"),
        "holdout" => bench_dir().join("cases/holdout.json"),
        _ => panic!("unknown split"),
    };
    // The legacy corpus keeps the holdout split under holdout/cases.json;
    // fall back to that layout when the v2 layout is absent.
    if !path.exists() && split == "holdout" {
        path = bench_dir().join("holdout/cases.json");
    }
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read {}: {}", path.display(), e));
    serde_json::from_str(&raw).unwrap_or_else(|e| panic!("cannot parse {}: {}", path.display(), e))
}

/// Expected case count per split (methodology protocol: split-separated
/// counts, never a combined total).
fn expected_count(split: &str, v2: bool) -> usize {
    // v2/v3 corpora are variable-size; accept the actual file length for
    // any PV_BENCH_DIR corpus. Only the legacy v1 corpus (no PV_BENCH_DIR) has
    // fixed sizes.
    if v2 {
        // For benchmark v2/v3, defer to the actual cases file length — the
        // caller already loaded `arr` and will assert against its length.
        // Return 0 as a sentinel that the caller should use arr.len() instead.
        return 0;
    }
    match split {
        "calibration" => 48,
        "holdout" => 12,
        _ => panic!("unknown split {split} for v2={v2}"),
    }
}

fn run_case(case: &Value) -> Value {
    let prompt = case["prompt"].as_str().expect("prompt").to_string();
    let id = case["id"].as_str().expect("id").to_string();

    let eval = promptvault_lite_lib::analysis::quality::evaluate_prompt(&prompt, &id);
    let hygiene = promptvault_lite_lib::analysis::hygiene::analyze_hygiene(&prompt, &id);

    let criteria: Vec<Value> = eval
        .criteria
        .iter()
        .map(|c| {
            json!({
                "name": c.name,
                "score": c.score,
                "max_score": c.max_score,
                "weight": c.weight,
            })
        })
        .collect();

    // Guideline routing probe: the guideline variant uses "Scope/Zweck"
    let guideline_routed = eval.criteria.iter().any(|c| c.name == "Scope/Zweck");
    // R2 engine kind (guideline/template/task) — added so the metrics script
    // can distinguish templates (which also carry Scope/Zweck in R2) from
    // genuine guidelines when scoring routing accuracy.
    let content_kind = promptvault_lite_lib::analysis::r2::kind_label(&prompt);

    // Hygiene artifact severity counts
    let mut critical = 0usize;
    let mut warning = 0usize;
    let mut info = 0usize;
    for a in &hygiene.artifacts {
        match a.severity.as_str() {
            "critical" => critical += 1,
            "warning" => warning += 1,
            _ => info += 1,
        }
    }

    json!({
        "id": id,
        "prompt": prompt,
        "expected_kind": case["kind"],
        "expected_language": case["language"],
        "expected_stratum": case["stratum"],
        "pair": case.get("pair"),
        "adversarial_pattern": case.get("adversarial_pattern"),
        "overall_score": eval.overall_score,
        "guideline_routed": guideline_routed,
        "content_kind": content_kind,
        "criteria": criteria,
        "missing_sections": eval.missing_sections,
        "recommendations": eval.recommendations,
        "hygiene_score": hygiene.hygiene_score,
        "hygiene_status": hygiene.status,
        "hygiene_artifact_counts": { "critical": critical, "warning": warning, "info": info },
    })
}

#[test]
fn run_semantic_benchmark() {
    let label = std::env::var("PV_BENCH_LABEL").unwrap_or_else(|_| "baseline".to_string());
    let v2 = std::env::var("PV_BENCH_DIR").is_ok();
    // Default split follows the corpus layout: v2 defaults to development,
    // the legacy v1 corpus defaults to calibration (both avoid the combined
    // artifact the methodology protocol forbids).
    let split = std::env::var("PV_BENCH_SPLIT").unwrap_or_else(|_| {
        if v2 {
            "development".to_string()
        } else {
            "calibration".to_string()
        }
    });

    // Methodology protocol: exactly one split per artifact. The runner never
    // combines development + holdout into a single 72-case file.
    if !matches!(split.as_str(), "development" | "holdout" | "calibration") {
        panic!("PV_BENCH_SPLIT must be development|holdout|calibration, got {split}");
    }
    if v2 && split == "calibration" {
        panic!("v2 benchmark (PV_BENCH_DIR set) has no calibration split");
    }

    let cases = load_cases(&split);
    let arr = cases.as_array().expect("array");
    let out: Vec<Value> = arr.iter().map(run_case).collect();

    let results_dir = bench_dir().join("results");
    std::fs::create_dir_all(&results_dir).expect("create results dir");
    let out_path = results_dir.join(format!("pv-{}.json", label));
    let pretty = serde_json::to_string_pretty(&json!({
        "split": split,
        "count": out.len(),
        "label": label,
        "engine": "promptvault-lite (Rust) evaluate_prompt + analyze_hygiene",
        "results": out,
    }))
    .expect("serialize");
    std::fs::write(&out_path, pretty).expect("write results");
    println!(
        "WROTE {} (split={split}, count={})",
        out_path.display(),
        out.len()
    );

    let mut expected = expected_count(&split, v2);
    if v2 {
        expected = arr.len();
    }
    assert_eq!(
        out.len(),
        expected,
        "expected {expected} benchmark cases for split {split}, got {}",
        out.len()
    );
}
