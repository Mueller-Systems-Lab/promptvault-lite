//! Local synthetic embedding provider (Issue #199, ADR-004 Phase 1).
//!
//! Deterministic, dependency-free feature-hashing embedder. The vectors are a
//! *structural* similarity proxy (shared tokens → similar vectors) — they are
//! NOT a semantic model. Real embedding providers remain deferred until the
//! owner decision recorded in ADR-004 ("Phase 2 — separate owner approval").
//!
//! Contract:
//! - pure function of the input text (no RNG, no clock, no network)
//! - identical inputs always produce identical vectors (index/query consistency)
//! - fixed dimensionality ([`EMBEDDING_DIMENSIONS`])
//! - L2-normalised so cosine similarity is a plain dot product

/// Fixed vector dimensionality of the synthetic provider.
pub const EMBEDDING_DIMENSIONS: usize = 64;

/// Provider identifier persisted in `embedding_models`.
pub const SYNTHETIC_PROVIDER: &str = "synthetic";

/// Model identifier persisted in `embedding_models`.
pub const SYNTHETIC_MODEL: &str = "feature-hash-v1";

/// FNV-1a 64-bit hash (deterministic, no external crate).
fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        hash ^= u64::from(*b);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// Tokenize into lowercase alphanumeric words (`a-z`, `0-9`, `äöüß` kept via
/// char::is_alphanumeric on the lowercase form).
fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !(c.is_alphanumeric()))
        .filter(|t| !t.is_empty() && t.len() >= 2)
        .map(|t| t.to_string())
        .collect()
}

/// Embed a text into a fixed-size, L2-normalised vector using feature hashing.
///
/// Empty input yields the zero vector (defined by the ADR-004 provider
/// contract: "return a zero-vector for truly empty content").
pub fn embed_text(text: &str) -> Vec<f32> {
    let mut vec = vec![0.0f32; EMBEDDING_DIMENSIONS];
    let tokens = tokenize(text);
    if tokens.is_empty() {
        return vec;
    }
    for token in &tokens {
        let h = fnv1a(token.as_bytes());
        let bucket = (h % EMBEDDING_DIMENSIONS as u64) as usize;
        // Sign from a second hash bit to reduce collision bias.
        let sign = if (h >> 63) & 1 == 1 { -1.0f32 } else { 1.0 };
        vec[bucket] += sign;
    }
    let norm: f32 = vec.iter().map(|v| v * v).sum::<f32>().sqrt();
    if norm > 0.0 {
        for v in vec.iter_mut() {
            *v /= norm;
        }
    }
    vec
}

/// Cosine similarity for equal-length vectors. Inputs need not be normalised.
/// Returns 0.0 for mismatched lengths (defensive, never panics).
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|v| v * v).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|v| v * v).sum::<f32>().sqrt();
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    dot / (na * nb)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embed_is_deterministic() {
        let a = embed_text("Rolle: Du bist ein Tester. Ziel: Prüfe die Dateien.");
        let b = embed_text("Rolle: Du bist ein Tester. Ziel: Prüfe die Dateien.");
        assert_eq!(a, b);
    }

    #[test]
    fn embed_has_fixed_dimensions() {
        assert_eq!(embed_text("x").len(), EMBEDDING_DIMENSIONS);
        assert_eq!(embed_text("").len(), EMBEDDING_DIMENSIONS);
    }

    #[test]
    fn empty_input_is_zero_vector() {
        assert!(embed_text("").iter().all(|v| *v == 0.0));
        assert!(embed_text("!!! ??? ###").iter().all(|v| *v == 0.0));
    }

    #[test]
    fn vectors_are_l2_normalised() {
        let v = embed_text("Beliebiger Text mit mehreren Token für die Normierung");
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5);
    }

    #[test]
    fn similar_texts_rank_above_dissimilar() {
        let q = embed_text("implement search feature react typescript");
        let near = embed_text("implement search feature in react with typescript");
        let far = embed_text("rezept für kartoffelsalat mit speck");
        assert!(cosine_similarity(&q, &near) > cosine_similarity(&q, &far));
    }

    #[test]
    fn identical_vectors_have_similarity_one() {
        let v = embed_text("identischer Text");
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-5);
    }

    #[test]
    fn cosine_handles_mismatched_input() {
        assert_eq!(cosine_similarity(&[1.0], &[1.0, 2.0]), 0.0);
        assert_eq!(cosine_similarity(&[], &[]), 0.0);
    }
}
