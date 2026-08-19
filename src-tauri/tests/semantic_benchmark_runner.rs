//! Semantic quality benchmark runner.
//!
//! Runs the REAL production PromptVault analysis engine
//! (promptvault_lite_lib::analysis::quality + hygiene) over the synthetic
//! benchmark corpus and writes normalized results for metric computation.
//!
//! Run: cargo test --test semantic_benchmark_runner -- --nocapture
//!
//! Output: ../benchmarks/semantic-quality/results/pv-<label>.json

use serde_json::{json, Value};
use std::path::PathBuf;

fn bench_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../benchmarks/semantic-quality")
}

fn load_cases(split: &str) -> Value {
    let path = match split {
        "calibration" => bench_dir().join("cases/calibration.json"),
        "holdout" => bench_dir().join("holdout/cases.json"),
        _ => panic!("unknown split"),
    };
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read {}: {}", path.display(), e));
    serde_json::from_str(&raw).unwrap_or_else(|e| panic!("cannot parse {}: {}", path.display(), e))
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
    let mut out = Vec::new();

    for split in ["calibration", "holdout"] {
        let cases = load_cases(split);
        let arr = cases.as_array().expect("array");
        for case in arr {
            out.push(run_case(case));
        }
    }

    let results_dir = bench_dir().join("results");
    std::fs::create_dir_all(&results_dir).expect("create results dir");
    let out_path = results_dir.join(format!("pv-{}.json", label));
    let pretty = serde_json::to_string_pretty(&json!({
        "label": label,
        "engine": "promptvault-lite (Rust) evaluate_prompt + analyze_hygiene",
        "count": out.len(),
        "results": out,
    }))
    .expect("serialize");
    std::fs::write(&out_path, pretty).expect("write results");
    println!("WROTE {}", out_path.display());
    assert_eq!(out.len(), 60, "expected 60 benchmark cases");
}
