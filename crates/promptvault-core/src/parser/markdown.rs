use regex::Regex;

/// Strukturinformationen über den Markdown-Inhalt
#[derive(Debug, Clone)]
pub struct MarkdownStructure {
    pub headings: Vec<HeadingInfo>,
    pub code_blocks: Vec<CodeBlockInfo>,
    pub total_lines: usize,
}

#[derive(Debug, Clone)]
pub struct HeadingInfo {
    pub level: usize,
    pub text: String,
    pub line: usize,
}

#[derive(Debug, Clone)]
pub struct CodeBlockInfo {
    pub language: Option<String>,
    pub start_line: usize,
    pub end_line: usize,
    pub line_count: usize,
}

/// Analysiert die Struktur eines Markdown-Dokuments.
///
/// Extrahiert Überschriften-Hierarchie und Code-Blöcke mit
/// Zeilennummern-Informationen.
pub fn parse_markdown_structure(content: &str) -> MarkdownStructure {
    let heading_regex = Regex::new(r"^(#{1,6})\s+(.+)$").expect("Invalid heading regex");
    let code_block_regex = Regex::new(r"^```(\w*)\s*$").expect("Invalid code block regex");

    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();

    let mut headings: Vec<HeadingInfo> = Vec::new();
    let mut code_blocks: Vec<CodeBlockInfo> = Vec::new();
    let mut in_code_block = false;
    let mut code_start = 0;
    let mut code_lang: Option<String> = None;

    for (i, line) in lines.iter().enumerate() {
        let line_number = i + 1;

        // Code-Block-Erkennung
        if let Some(caps) = code_block_regex.captures(line) {
            if !in_code_block {
                // Code-Block-Anfang
                in_code_block = true;
                code_start = line_number;
                let lang = caps.get(1).unwrap().as_str();
                code_lang = if lang.is_empty() {
                    None
                } else {
                    Some(lang.to_string())
                };
            } else {
                // Code-Block-Ende
                in_code_block = false;
                code_blocks.push(CodeBlockInfo {
                    language: code_lang.take(),
                    start_line: code_start,
                    end_line: line_number,
                    line_count: line_number - code_start + 1,
                });
            }
            continue;
        }

        // Überschriften nur außerhalb von Code-Blöcken erkennen
        if !in_code_block {
            if let Some(caps) = heading_regex.captures(line) {
                let level = caps.get(1).unwrap().as_str().len();
                let text = caps.get(2).unwrap().as_str().trim().to_string();
                headings.push(HeadingInfo {
                    level,
                    text,
                    line: line_number,
                });
            }
        }
    }

    // Ungeschlossener Code-Block
    if in_code_block {
        code_blocks.push(CodeBlockInfo {
            language: code_lang,
            start_line: code_start,
            end_line: total_lines,
            line_count: total_lines - code_start + 1,
        });
    }

    MarkdownStructure {
        headings,
        code_blocks,
        total_lines,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_headings() {
        let input = "# H1\n## H2\n### H3\nText";
        let structure = parse_markdown_structure(input);

        assert_eq!(structure.headings.len(), 3);
        assert_eq!(structure.headings[0].level, 1);
        assert_eq!(structure.headings[0].text, "H1");
        assert_eq!(structure.headings[1].level, 2);
        assert_eq!(structure.headings[2].level, 3);
    }

    #[test]
    fn test_parse_code_blocks() {
        let input = "```rust\nfn main() {}\n```\n\nText";
        let structure = parse_markdown_structure(input);

        assert_eq!(structure.code_blocks.len(), 1);
        assert_eq!(structure.code_blocks[0].language, Some("rust".to_string()));
        assert_eq!(structure.code_blocks[0].line_count, 3);
    }

    #[test]
    fn test_no_headings_in_code_blocks() {
        let input = "```markdown\n# Not a heading\n```\n\n# Real heading";
        let structure = parse_markdown_structure(input);

        assert_eq!(structure.headings.len(), 1);
        assert_eq!(structure.headings[0].text, "Real heading");
    }

    #[test]
    fn test_unclosed_code_block() {
        let input = "```rust\nfn main() {\n    println!(\"hello\");\n}";
        let structure = parse_markdown_structure(input);

        assert_eq!(structure.code_blocks.len(), 1);
        assert_eq!(structure.code_blocks[0].line_count, 4);
    }

    #[test]
    fn test_empty_content() {
        let structure = parse_markdown_structure("");
        assert_eq!(structure.total_lines, 0);
        assert!(structure.headings.is_empty());
        assert!(structure.code_blocks.is_empty());
    }

    #[test]
    fn test_total_lines() {
        let input = "Line 1\nLine 2\nLine 3";
        let structure = parse_markdown_structure(input);
        assert_eq!(structure.total_lines, 3);
    }
}
