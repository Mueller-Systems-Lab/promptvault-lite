use regex::Regex;
use serde_json::Value;
use serde_yaml;

/// Ergebnis des Frontmatter-Parsings
#[derive(Debug, Clone)]
pub struct FrontmatterResult {
    pub metadata: Value,
    pub content: String,
    pub has_frontmatter: bool,
}

/// Parst YAML-Frontmatter aus einem Markdown-String.
///
/// Erwartet Frontmatter zwischen `---` Trennzeichen am Dateianfang.
/// Bei fehlendem oder invaliden Frontmatter wird der gesamte Inhalt
/// als Content zurückgegeben und leere Metadaten gesetzt.
///
/// # Arguments
/// * `raw_content` - Der rohe Markdown-String
///
/// # Returns
/// * `FrontmatterResult` mit extrahierten Metadaten und Content
pub fn parse_frontmatter(raw_content: &str) -> FrontmatterResult {
    let frontmatter_regex =
        Regex::new(r"(?s)^---\s*\n(.*?)\n?---\s*\n?(.*)").expect("Invalid regex");

    if let Some(caps) = frontmatter_regex.captures(raw_content) {
        let yaml_str = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let content = caps.get(2).map(|m| m.as_str()).unwrap_or(raw_content);

        match serde_yaml::from_str::<Value>(yaml_str) {
            Ok(metadata) => {
                // YAML kann leere Dokumente als Null parsen
                if metadata.is_null() {
                    return FrontmatterResult {
                        metadata: Value::Object(serde_json::Map::new()),
                        content: content.to_string(),
                        has_frontmatter: true,
                    };
                }
                // Stelle sicher, dass wir ein Object haben
                if metadata.is_object() {
                    FrontmatterResult {
                        metadata,
                        content: content.to_string(),
                        has_frontmatter: true,
                    }
                } else {
                    // YAML wurde geparst, ist aber kein Object (z.B. ein String)
                    let mut map = serde_json::Map::new();
                    map.insert("_raw".to_string(), metadata);
                    FrontmatterResult {
                        metadata: Value::Object(map),
                        content: content.to_string(),
                        has_frontmatter: true,
                    }
                }
            }
            Err(e) => {
                log::warn!("Invalides YAML-Frontmatter: {}", e);
                FrontmatterResult {
                    metadata: Value::Object(serde_json::Map::new()),
                    content: raw_content.to_string(),
                    has_frontmatter: false,
                }
            }
        }
    } else {
        // Kein Frontmatter gefunden
        FrontmatterResult {
            metadata: Value::Object(serde_json::Map::new()),
            content: raw_content.to_string(),
            has_frontmatter: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_with_valid_frontmatter() {
        let input = "---\ntitle: Test\ntags:\n  - a\n  - b\n---\n\n# Content";
        let result = parse_frontmatter(input);

        assert!(result.has_frontmatter);
        assert_eq!(result.metadata["title"], "Test");
        assert_eq!(result.metadata["tags"][0], "a");
        assert_eq!(result.metadata["tags"][1], "b");
        assert!(result.content.contains("# Content"));
        assert!(!result.content.contains("---"));
    }

    #[test]
    fn test_parse_without_frontmatter() {
        let input = "# Just a heading\n\nSome content";
        let result = parse_frontmatter(input);

        assert!(!result.has_frontmatter);
        assert_eq!(result.content, input);
        assert!(result.metadata.as_object().unwrap().is_empty());
    }

    #[test]
    fn test_parse_with_only_dashes() {
        let input = "---\n---\n\nContent only";
        let result = parse_frontmatter(input);

        assert!(result.has_frontmatter);
        assert!(result.content.contains("Content only"));
    }

    #[test]
    fn test_parse_invalid_yaml() {
        let input = "---\ninvalid: [unclosed\n---\n\nContent";
        let result = parse_frontmatter(input);

        assert!(!result.has_frontmatter);
        assert_eq!(result.content, input);
    }

    #[test]
    fn test_parse_empty_frontmatter() {
        let input = "---\n---\n\n# Content";
        let result = parse_frontmatter(input);

        assert!(result.has_frontmatter);
        assert!(result.content.contains("# Content"));
    }

    #[test]
    fn test_parse_yaml_with_special_chars() {
        let input = "---\ntitle: \"Hello: World\"\ndescription: |\n  Multiline\n  description\n---\n\nContent";
        let result = parse_frontmatter(input);

        assert!(result.has_frontmatter);
        assert_eq!(result.metadata["title"], "Hello: World");
    }

    #[test]
    fn test_no_dash_dash_dash_at_start() {
        let input = "Some text\n---\ntitle: test\n---\nContent";
        let result = parse_frontmatter(input);

        assert!(!result.has_frontmatter);
        assert_eq!(result.content, input);
    }

    #[test]
    fn test_unicode_frontmatter() {
        let md = "---\ntitle: \"Überprüfung der Änderungen\"\ndescription: \"🚀 Emoji Test 🎯\"\ncategory: \"Test\"\n---\n\n# Content";
        let result = parse_frontmatter(md);
        assert!(result.has_frontmatter);
        assert_eq!(result.metadata["title"], "Überprüfung der Änderungen");
    }

    #[test]
    fn test_minimal_frontmatter() {
        let md = "---\ntitle: Test\n---\n\nContent";
        let result = parse_frontmatter(md);
        assert!(result.has_frontmatter);
        assert_eq!(result.metadata["title"], "Test");
    }

    #[test]
    fn test_no_frontmatter() {
        let md = "# Just a heading\n\nSome content without frontmatter.";
        let result = parse_frontmatter(md);
        // Should handle gracefully, returning defaults
        assert!(!result.has_frontmatter);
    }

    #[test]
    fn test_malformed_frontmatter() {
        let md = "---\ntitle: \"unclosed quote\n---\n\nContent";
        let result = parse_frontmatter(md);
        // Should not panic — malformed YAML returns default with no frontmatter
        assert!(!result.has_frontmatter);
    }
}
