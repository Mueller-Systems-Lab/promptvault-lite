// =============================================================================
// observability_correlation.rs — Backend-origin trace correlation tests
// =============================================================================
//
// Proves that the Rust analyze commands return a REAL backend span when a
// TraceContext is passed, and return NO backend span when it is not.
// This is the backend-origin proof: the "rust-analysis" layer event can only
// exist when the Rust command actually emits backend_span.

use promptvault_lite_lib::commands::analyze;
use promptvault_lite_lib::observability::TraceContext;

#[test]
fn test_evaluate_prompt_emits_backend_span_when_trace_provided() {
    let ctx = TraceContext::new("trace-backend-001", "span-backend-001");
    let result = analyze::evaluate_prompt(
        "prompt-1".to_string(),
        "# Test\n\nImplement authentication with tests.".to_string(),
        Some(ctx),
    )
    .expect("evaluate_prompt must succeed");

    let backend_span = result
        .backend_span
        .expect("backend_span must be present when trace context is provided");

    assert_eq!(backend_span.trace_id, "trace-backend-001");
    assert_eq!(backend_span.span_id, "span-backend-001");
    assert!(backend_span.parent_span_id.is_none());
    assert!(backend_span.backend_duration_ms.is_some());
    assert!(backend_span.backend_duration_ms.unwrap() >= 0.0);
}

#[test]
fn test_evaluate_prompt_no_backend_span_without_trace() {
    let result = analyze::evaluate_prompt(
        "prompt-2".to_string(),
        "# Test\n\nPlain prompt.".to_string(),
        None,
    )
    .expect("evaluate_prompt must succeed");

    assert!(
        result.backend_span.is_none(),
        "backend_span must be None when no trace context is provided"
    );
}

#[test]
fn test_analyze_hygiene_emits_backend_span_when_trace_provided() {
    let ctx = TraceContext::child("trace-backend-002", "parent-span-002", "span-backend-002");
    let result = analyze::analyze_hygiene(
        "prompt-3".to_string(),
        "# Test\n\nClean prompt content.".to_string(),
        Some(ctx),
    )
    .expect("analyze_hygiene must succeed");

    let backend_span = result
        .backend_span
        .expect("backend_span must be present when trace context is provided");

    assert_eq!(backend_span.trace_id, "trace-backend-002");
    assert_eq!(backend_span.span_id, "span-backend-002");
    assert_eq!(
        backend_span.parent_span_id,
        Some("parent-span-002".to_string())
    );
}

#[test]
fn test_analyze_hygiene_no_backend_span_without_trace() {
    let result = analyze::analyze_hygiene(
        "prompt-4".to_string(),
        "# Test\n\nPlain prompt.".to_string(),
        None,
    )
    .expect("analyze_hygiene must succeed");

    assert!(
        result.backend_span.is_none(),
        "backend_span must be None when no trace context is provided"
    );
}

#[test]
fn test_backend_span_is_off_on_equivalent() {
    // The presence of backend_span is the ONLY difference between trace
    // and no-trace. The product result fields must be identical.
    let content = "# Task\n\nImplement a login endpoint with tests and constraints.".to_string();

    let with_trace = analyze::evaluate_prompt(
        "p-eq".to_string(),
        content.clone(),
        Some(TraceContext::new("t-eq", "s-eq")),
    )
    .expect("evaluate_prompt must succeed");
    let without_trace = analyze::evaluate_prompt("p-eq".to_string(), content.clone(), None)
        .expect("evaluate_prompt must succeed");

    assert_eq!(with_trace.overall_score, without_trace.overall_score);
    assert_eq!(with_trace.criteria.len(), without_trace.criteria.len());
    assert_eq!(
        with_trace.recommendations.len(),
        without_trace.recommendations.len()
    );
    // The trace-only difference is the backend_span field.
    assert!(with_trace.backend_span.is_some());
    assert!(without_trace.backend_span.is_none());
}
