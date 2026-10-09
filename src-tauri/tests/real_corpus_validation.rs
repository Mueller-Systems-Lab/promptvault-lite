//! Real corpus validation test.
//! This test runs evaluate_prompt and analyze_hygiene on all .md files
//! in a real prompt folder. Results are written to evidence/.
//!
//! THIS TEST READS FROM A REAL PROMPT FOLDER AND WRITES TO evidence/
//! It is SAFE: no file contents are committed, only aggregate stats.
//!
//! The folder is not hard-coded; point `PROMPTVAULT_REAL_CORPUS_DIR` at a
//! local prompt folder to run it. Without it the test skips.
//!
//! Run: PROMPTVAULT_REAL_CORPUS_DIR=/path/to/prompts \
//!      cargo test --test real_corpus_validation -- --ignored --nocapture

use std::path::Path;
use std::{collections::HashMap, fs};

const REAL_PROMPT_DIR_ENV: &str = "PROMPTVAULT_REAL_CORPUS_DIR";

#[test]
#[ignore = "Requires real prompt folder and may trigger regex backtracking on certain content"]
fn real_corpus_quality_and_hygiene_eval() {
    let root = match std::env::var(REAL_PROMPT_DIR_ENV) {
        Ok(dir) if !dir.trim().is_empty() => std::path::PathBuf::from(dir),
        _ => {
            eprintln!("SKIP: {REAL_PROMPT_DIR_ENV} is not set. Machine-specific test.");
            return;
        }
    };
    if !root.is_dir() {
        eprintln!(
            "SKIP: {REAL_PROMPT_DIR_ENV} does not point to a directory: {}",
            root.display()
        );
        return;
    }
    let root: &Path = &root;

    // Collect .md files
    let mut md_files: Vec<std::path::PathBuf> = Vec::new();

    for entry in walkdir::WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path().to_path_buf();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        if ext != "md" {
            continue;
        }
        // Skip the hidden .md file
        if path.file_name().and_then(|n| n.to_str()) == Some(".md") {
            continue;
        }
        md_files.push(path);
    }

    println!("Found {} .md files for Rust analysis", md_files.len());

    let mut quality_total: u64 = 0;
    let mut hygiene_total: u64 = 0;
    let mut quality_scores: Vec<u8> = Vec::new();
    let mut hygiene_scores: Vec<u8> = Vec::new();
    let mut missing_sections_count: u64 = 0;
    let mut artifact_count_total: u64 = 0;
    let mut guideline_detections: u64 = 0;
    let mut read_errors: u64 = 0;
    let mut min_quality: u8 = 100;
    let mut max_quality: u8 = 0;
    let mut min_hygiene: u8 = 100;
    let mut max_hygiene: u8 = 0;

    for file_path in &md_files {
        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => {
                read_errors += 1;
                continue;
            }
        };

        // Quality
        let quality =
            promptvault_lite_lib::analysis::quality::evaluate_prompt(&content, "real-corpus");
        quality_scores.push(quality.overall_score);
        quality_total += quality.overall_score as u64;
        missing_sections_count += quality.missing_sections.len() as u64;
        min_quality = min_quality.min(quality.overall_score);
        max_quality = max_quality.max(quality.overall_score);

        // Check if guideline-specific scoring was triggered
        if quality.criteria.iter().any(|c| c.name == "Scope/Zweck") {
            guideline_detections += 1;
        }

        // Hygiene
        let hygiene =
            promptvault_lite_lib::analysis::hygiene::analyze_hygiene(&content, "real-corpus");
        hygiene_scores.push(hygiene.hygiene_score);
        hygiene_total += hygiene.hygiene_score as u64;
        artifact_count_total += hygiene.artifacts.len() as u64;
        min_hygiene = min_hygiene.min(hygiene.hygiene_score);
        max_hygiene = max_hygiene.max(hygiene.hygiene_score);
    }

    let total = quality_scores.len();
    let avg_quality = if total > 0 {
        quality_total as f64 / total as f64
    } else {
        0.0
    };
    let avg_hygiene = if total > 0 {
        hygiene_total as f64 / total as f64
    } else {
        0.0
    };

    // Score distribution
    let mut quality_buckets: HashMap<String, u64> = HashMap::new();
    for &s in &quality_scores {
        let bucket = if s >= 80 {
            "80-100".to_string()
        } else if s >= 60 {
            "60-79".to_string()
        } else if s >= 40 {
            "40-59".to_string()
        } else if s >= 20 {
            "20-39".to_string()
        } else {
            "0-19".to_string()
        };
        *quality_buckets.entry(bucket).or_insert(0) += 1;
    }

    let mut hygiene_buckets: HashMap<String, u64> = HashMap::new();
    for &s in &hygiene_scores {
        let bucket = if s >= 80 {
            "80-100".to_string()
        } else if s >= 60 {
            "60-79".to_string()
        } else if s >= 40 {
            "40-59".to_string()
        } else if s >= 20 {
            "20-39".to_string()
        } else {
            "0-19".to_string()
        };
        *hygiene_buckets.entry(bucket).or_insert(0) += 1;
    }

    let result = serde_json::json!({
        "total_files": total,
        "read_errors": read_errors,
        "readable_files": total,
        "quality": {
            "average": format!("{:.1}", avg_quality),
            "min": min_quality,
            "max": max_quality,
            "distribution": quality_buckets,
        },
        "hygiene": {
            "average": format!("{:.1}", avg_hygiene),
            "min": min_hygiene,
            "max": max_hygiene,
            "distribution": hygiene_buckets,
        },
        "guideline_scoring_triggered": guideline_detections,
        "total_missing_sections": missing_sections_count,
        "total_hygiene_artifacts": artifact_count_total,
    });

    // Find latest evidence directory
    let evidence_base = Path::new("evidence");
    let mut dirs: Vec<_> = fs::read_dir(evidence_base)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().contains("full-real-corpus"))
        .collect();
    dirs.sort_by_key(|d| d.file_name());

    if let Some(latest) = dirs.last() {
        let out_path = latest
            .path()
            .join("local-only")
            .join("quality-hygiene-results.local.json");
        fs::write(&out_path, serde_json::to_string_pretty(&result).unwrap()).unwrap();
        println!("Results saved to {:?}", out_path);
    }

    println!("\n=== RUST QUALITY & HYGIENE RESULTS ===");
    println!("{}", serde_json::to_string_pretty(&result).unwrap());

    // Basic assertions - the code should work without panicking
    assert_eq!(read_errors, 0, "There should be no read errors");
    assert!(total > 0, "Should have processed at least one file");
    assert!(
        quality_scores.iter().all(|&s| s <= 100),
        "All quality scores should be <= 100"
    );
    assert!(
        hygiene_scores.iter().all(|&s| s <= 100),
        "All hygiene scores should be <= 100"
    );
}
