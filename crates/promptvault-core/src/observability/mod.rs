// =============================================================================
// PromptVault Lite — Rust Backend Observability
// =============================================================================
// Minimal backend-side trace structures for frontend ↔ backend correlation.
// The frontend generates trace/span IDs; the backend echoes them in DTOs.
// No heavy instrumentation — just correlation data passthrough.
// =============================================================================

use serde::{Deserialize, Serialize};

/// Trace context passed from frontend via invoke args.
/// The backend echoes this back in response DTOs for correlation.
/// `camelCase` rename matches the frontend's JS object keys.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceContext {
    pub trace_id: String,
    pub span_id: String,
    pub parent_span_id: Option<String>,
}

/// Backend-origin span metadata returned alongside existing DTOs.
/// The frontend MUST NOT claim "rust analysis success" from this alone —
/// it only knows that Tauri invoke returned success. The `backend_span` field
/// merely carries the trace context through the IPC boundary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendSpan {
    pub trace_id: String,
    pub span_id: String,
    pub parent_span_id: Option<String>,
    pub backend_timestamp: String,
    pub backend_duration_ms: Option<f64>,
}

impl TraceContext {
    /// Create a new trace context from a trace ID and span ID.
    pub fn new(trace_id: &str, span_id: &str) -> Self {
        Self {
            trace_id: trace_id.to_string(),
            span_id: span_id.to_string(),
            parent_span_id: None,
        }
    }

    /// Create a child trace context with a parent span reference.
    pub fn child(trace_id: &str, parent_span_id: &str, span_id: &str) -> Self {
        Self {
            trace_id: trace_id.to_string(),
            span_id: span_id.to_string(),
            parent_span_id: Some(parent_span_id.to_string()),
        }
    }

    /// Convert to a BackendSpan with timing data.
    pub fn to_backend_span(&self, backend_duration_ms: Option<f64>) -> BackendSpan {
        BackendSpan {
            trace_id: self.trace_id.clone(),
            span_id: self.span_id.clone(),
            parent_span_id: self.parent_span_id.clone(),
            backend_timestamp: chrono::Utc::now().to_rfc3339(),
            backend_duration_ms,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trace_context_new() {
        let ctx = TraceContext::new("trace-1", "span-1");
        assert_eq!(ctx.trace_id, "trace-1");
        assert_eq!(ctx.span_id, "span-1");
        assert!(ctx.parent_span_id.is_none());
    }

    #[test]
    fn test_trace_context_child() {
        let ctx = TraceContext::child("trace-1", "parent-span", "child-span");
        assert_eq!(ctx.trace_id, "trace-1");
        assert_eq!(ctx.span_id, "child-span");
        assert_eq!(ctx.parent_span_id, Some("parent-span".to_string()));
    }

    #[test]
    fn test_to_backend_span() {
        let ctx = TraceContext::new("trace-x", "span-y");
        let bs = ctx.to_backend_span(Some(42.5));
        assert_eq!(bs.trace_id, "trace-x");
        assert_eq!(bs.span_id, "span-y");
        assert_eq!(bs.backend_duration_ms, Some(42.5));
    }

    #[test]
    fn test_serialization_roundtrip() {
        let ctx = TraceContext {
            trace_id: "t-1".into(),
            span_id: "s-1".into(),
            parent_span_id: Some("p-1".into()),
        };
        let json = serde_json::to_string(&ctx).unwrap();
        let deser: TraceContext = serde_json::from_str(&json).unwrap();
        assert_eq!(deser.trace_id, "t-1");
        assert_eq!(deser.span_id, "s-1");
        assert_eq!(deser.parent_span_id, Some("p-1".to_string()));
    }
}
