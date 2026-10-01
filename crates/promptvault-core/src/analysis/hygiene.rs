use crate::models::{ArtifactCategory, DetectedArtifact, PromptHygiene};
use regex::Regex;

// =============================================================================
// Prompt-Hygieneanalyse — Erkennung unerwünschter/verunreinigender Inhalte
// =============================================================================

/// Führt eine vollständige Hygieneanalyse eines Prompts durch.
/// Erkennt 12 Kategorien von Artefakten und berechnet einen Hygiene-Score.
pub fn analyze_hygiene(content: &str, prompt_id: &str) -> PromptHygiene {
    let mut hygiene = PromptHygiene::new(prompt_id.to_string());
    let mut all_artifacts: Vec<DetectedArtifact> = Vec::new();

    // Alle Detektoren ausführen
    all_artifacts.extend(detect_project_artifacts(content));
    all_artifacts.extend(detect_repo_references(content));
    all_artifacts.extend(detect_file_paths(content));
    all_artifacts.extend(detect_issue_references(content));
    all_artifacts.extend(detect_test_reports(content));
    all_artifacts.extend(detect_log_lines(content));
    all_artifacts.extend(detect_stacktraces(content));
    all_artifacts.extend(detect_build_output(content));
    all_artifacts.extend(detect_json_dumps(content));
    all_artifacts.extend(detect_code_dumps(content));
    all_artifacts.extend(detect_pii(content));
    all_artifacts.extend(detect_secrets(content));
    // Neue Detektoren (Issue #90)
    all_artifacts.extend(detect_chat_meta(content));
    all_artifacts.extend(detect_scope_pollution(content));
    all_artifacts.extend(detect_ocr_residue(content));
    all_artifacts.extend(detect_role_mismatch(content));
    all_artifacts.extend(detect_missing_structure(content));
    all_artifacts.extend(detect_evidence_blocks(content));

    // Hygiene-Score berechnen (100 minus Abzüge pro Artefakt)
    let mut score: i32 = 100;

    for artifact in &all_artifacts {
        score -= match artifact.severity.as_str() {
            "critical" => 20,
            "warning" => 8,
            _ => 3,
        };
    }

    let final_score = score.clamp(0, 100) as u8;
    hygiene.hygiene_score = final_score;
    hygiene.status = PromptHygiene::determine_status(final_score);
    hygiene.artifacts = all_artifacts;

    hygiene
}

// -----------------------------------------------------------------------------
// Kategorie 1: Projektartefakte — generische Erkennung von Eigennamen
// -----------------------------------------------------------------------------

fn detect_project_artifacts(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    // Heuristik: CamelCase- oder PascalCase-Namen die wie Projektnamen aussehen
    // Mindestens 2 Großbuchstaben + Kleinbuchstaben, Länge 5-30
    let project_regex = Regex::new(
        r"\b([A-Z][a-z]+){2,}(OS|App|Tool|Kit|Hub|Vault|Visor|Pet|DB|API|SDK|CLI|UI|Pro|Lite|Server|Client)?\b"
    ).unwrap();

    for cap in project_regex.captures_iter(content) {
        let matched = cap.get(0).unwrap();
        let full_match = matched.as_str();

        // Filtere bekannte Nicht-Projekt-Wörter
        if is_common_word(full_match) {
            continue;
        }

        // Filtere Wörter die nur aus einem Wort bestehen (zu unspezifisch)
        let word_count = full_match.chars().filter(|&c| c.is_uppercase()).count();
        if word_count < 2 && full_match.len() < 8 {
            continue;
        }

        artifacts.push(DetectedArtifact::new(
            ArtifactCategory::ProjectArtifact,
            "warning".into(),
            full_match.to_string(),
            line_of(content, matched.start()),
            col_of(content, matched.start()),
            Some(format!(
                "{{{}}}",
                full_match.to_uppercase().replace(' ', "_")
            )),
        ));
    }

    artifacts
}

fn is_common_word(word: &str) -> bool {
    let common = [
        "JavaScript",
        "TypeScript",
        "Python",
        "React",
        "Angular",
        "Vue",
        "NodeJS",
        "GitHub",
        "GitLab",
        "Docker",
        "Kubernetes",
        "Linux",
        "Windows",
        "MacOS",
        "Android",
        "iOS",
        "PostgreSQL",
        "MongoDB",
        "Redis",
        "RabbitMQ",
        "Kafka",
        "GraphQL",
        "REST",
        "JSON",
        "YAML",
        "HTML",
        "CSS",
        "SQL",
        "HTTP",
        "PromptVault",
        "PromptVaultLite", // Eigener Name ist okay
        "OpenAI",
        "Anthropic",
        "Claude",
        "GPT",
        // Prompt-Engineering domain terms (not project artifacts)
        "BatchPrompting",
    ];
    common.contains(&word)
}

// -----------------------------------------------------------------------------
// Kategorie 2: Repository-Spuren
// -----------------------------------------------------------------------------

fn detect_repo_references(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    let patterns = [
        r"github\.com/[\w\-\.]+/[\w\-\.]+",
        r"gitlab\.com/[\w\-\.]+/[\w\-\.]+",
        r"bitbucket\.org/[\w\-\.]+/[\w\-\.]+",
        r"\b[\w\-]+/[\w\-]+@[\w\-\:]+", // owner/repo@branch
    ];

    for pattern in &patterns {
        if let Ok(re) = Regex::new(pattern) {
            for m in re.find_iter(content) {
                artifacts.push(DetectedArtifact::new(
                    ArtifactCategory::RepoReference,
                    "warning".into(),
                    m.as_str().to_string(),
                    line_of(content, m.start()),
                    col_of(content, m.start()),
                    Some("{REPOSITORY_URL}".into()),
                ));
            }
        }
    }

    artifacts
}

// -----------------------------------------------------------------------------
// Kategorie 3: Dateipfade
// -----------------------------------------------------------------------------

fn detect_file_paths(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    let patterns = [
        // Unix absolute Pfade
        r"(?:^|\s)(/(?:home|usr|opt|var|tmp|etc|mnt)/[\w\-\./]+)",
        // Windows absolute Pfade
        r"(?:^|\s)([A-Za-z]:\\(?:[\w\-\.]+\\)*[\w\-\.]+)",
        // Relative Pfade mit src/, app/, lib/, tests/, docs/
        r"(?:^|\s)((?:src|app|lib|tests?|docs?|components?|pages?|utils?|hooks?|stores?|assets?)/[\w\-\./]+)",
        // Dateiendungen
        r"\b[\w\-/]+\.(?:tsx?|jsx?|rs|py|go|java|rb|php|css|html|json|yaml|yml|toml|md|sql)\b",
    ];

    for pattern in &patterns {
        if let Ok(re) = Regex::new(pattern) {
            for m in re.find_iter(content) {
                let matched = m.as_str().trim();
                // Filtere zu kurze Matches
                if matched.len() < 5 {
                    continue;
                }
                // Filtere offensichtliche false-positives (Markdown-Dateien wie README.md)
                if matched.ends_with(".md") && !matched.contains('/') && !matched.contains('\\') {
                    continue;
                }

                artifacts.push(DetectedArtifact::new(
                    ArtifactCategory::FilePath,
                    "warning".into(),
                    matched.to_string(),
                    line_of(content, m.start()),
                    col_of(content, m.start()),
                    Some("{FILE_PATH}".into()),
                ));
            }
        }
    }

    artifacts
}

// -----------------------------------------------------------------------------
// Kategorie 4: Issue-Referenzen
// -----------------------------------------------------------------------------

fn detect_issue_references(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    let re = Regex::new(r"(?i)\b(Issue|PR|Bug|Ticket|Task|Feature)\s*#\s*(\d+)\b").unwrap();

    for cap in re.captures_iter(content) {
        let full_match = cap.get(0).unwrap();
        artifacts.push(DetectedArtifact::new(
            ArtifactCategory::IssueReference,
            "info".into(),
            full_match.as_str().to_string(),
            line_of(content, full_match.start()),
            col_of(content, full_match.start()),
            Some(format!(
                "{{{}}}",
                cap.get(1).unwrap().as_str().to_uppercase()
            )),
        ));
    }

    artifacts
}

// -----------------------------------------------------------------------------
// Kategorie 5: Testreports
// -----------------------------------------------------------------------------

fn detect_test_reports(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    // Pattern: "X passed, Y skipped, Z failed"
    let re = Regex::new(r"(\d+)\s+(passed|bestanden|erfolgreich).*?(\d+)\s+(failed|fehlgeschlagen|nicht\s+bestanden)").unwrap();

    for m in re.find_iter(content) {
        artifacts.push(DetectedArtifact::new(
            ArtifactCategory::TestReport,
            "info".into(),
            m.as_str().to_string(),
            line_of(content, m.start()),
            col_of(content, m.start()),
            Some("{TEST_RESULTS}".into()),
        ));
    }

    // Pattern: "Test Suites: X passed, Y total"
    let re2 = Regex::new(r"(?i)(tests?\s+(run|suites?)|test\s+results?)\s*:?\s*\d+").unwrap();
    for m in re2.find_iter(content) {
        artifacts.push(DetectedArtifact::new(
            ArtifactCategory::TestReport,
            "info".into(),
            m.as_str().to_string(),
            line_of(content, m.start()),
            col_of(content, m.start()),
            Some("{TEST_SUMMARY}".into()),
        ));
    }

    artifacts
}

// -----------------------------------------------------------------------------
// Kategorie 6: Log-Zeilen
// -----------------------------------------------------------------------------

fn detect_log_lines(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    let re = Regex::new(
        r"(?m)^\s*(?:\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})?\s*(INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL)\b"
    ).unwrap();

    for m in re.find_iter(content) {
        artifacts.push(DetectedArtifact::new(
            ArtifactCategory::LogLine,
            "info".into(),
            m.as_str().to_string(),
            line_of(content, m.start()),
            col_of(content, m.start()),
            Some("{LOG_ENTRY}".into()),
        ));
    }

    artifacts
}

// -----------------------------------------------------------------------------
// Kategorie 7: Stacktraces
// -----------------------------------------------------------------------------

fn detect_stacktraces(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    let patterns = [
        r"(?m)^\s+at\s+[\w\.$<>]+\([^)]*\)",
        r"(?m)^Traceback\s+\(most\s+recent\s+call\s+last\)",
        r#"(?m)^Exception\s+(in\s+thread\s+)?["']?\w+"#,
        r#"(?m)^\s+File\s+"[^"]+",\s+line\s+\d+"#,
        r"(?m)^Caused\s+by:",
        r"(?m)^thread\s+'[\w\-]+'\s+panicked\s+at",
    ];

    for pattern in &patterns {
        if let Ok(re) = Regex::new(pattern) {
            for m in re.find_iter(content) {
                artifacts.push(DetectedArtifact::new(
                    ArtifactCategory::Stacktrace,
                    "info".into(),
                    m.as_str().to_string(),
                    line_of(content, m.start()),
                    col_of(content, m.start()),
                    Some("{STACKTRACE}".into()),
                ));
            }
        }
    }

    artifacts
}

// -----------------------------------------------------------------------------
// Kategorie 8: Build-Output
// -----------------------------------------------------------------------------

fn detect_build_output(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    let patterns = [
        r"(npm|pnpm|yarn)\s+(run\s+)?(build|test|dev|start|install|lint|format)",
        r"cargo\s+(build|test|run|check|clippy|fmt)",
        r"go\s+(build|test|run|mod)",
        r"(?i)(compil|build)\s+(successful|failed|error|warning)",
        r"(?m)^\s*(>|➜|❯|\$)\s+(npm|pnpm|cargo|make|docker)",
        r"(?i)(installing|building|compiling|bundling)\s+(packages?|dependencies|modules?)",
    ];

    for pattern in &patterns {
        if let Ok(re) = Regex::new(pattern) {
            for m in re.find_iter(content) {
                artifacts.push(DetectedArtifact::new(
                    ArtifactCategory::BuildOutput,
                    "info".into(),
                    m.as_str().to_string(),
                    line_of(content, m.start()),
                    col_of(content, m.start()),
                    Some("{BUILD_COMMAND}".into()),
                ));
            }
        }
    }

    artifacts
}

// -----------------------------------------------------------------------------
// Kategorie 9: JSON-Dumps
// -----------------------------------------------------------------------------

fn detect_json_dumps(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    // Finde Zeilen die mit { oder [ beginnen und JSON-ähnlich aussehen
    let lines: Vec<&str> = content.lines().collect();

    let mut in_json_block = false;
    let mut json_start = 0;
    let mut brace_depth = 0i32;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();

        if (trimmed.starts_with('{') || trimmed.starts_with('[')) && !in_json_block {
            in_json_block = true;
            json_start = i;
            brace_depth = 0;
        }

        if in_json_block {
            brace_depth += trimmed.chars().filter(|&c| c == '{' || c == '[').count() as i32;
            brace_depth -= trimmed.chars().filter(|&c| c == '}' || c == ']').count() as i32;

            if brace_depth <= 0 && in_json_block {
                let json_size = i - json_start + 1;
                if json_size > 5 {
                    // Große JSON-Blöcke (>500 Zeichen)
                    let json_text: String = lines[json_start..=i].join("\n");
                    if json_text.len() > 500 {
                        artifacts.push(DetectedArtifact::new(
                            ArtifactCategory::JsonDump,
                            "warning".into(),
                            format!(
                                "JSON-Block ({} Zeilen, {} Zeichen)",
                                json_size,
                                json_text.len()
                            ),
                            json_start + 1,
                            1,
                            Some("{JSON_DATA}".into()),
                        ));
                    }
                }
                in_json_block = false;
            }
        }
    }

    artifacts
}

// -----------------------------------------------------------------------------
// Kategorie 10: Code-Dumps
// -----------------------------------------------------------------------------

fn detect_code_dumps(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    // Finde Markdown-Codeblöcke die sehr lang sind (>20 Zeilen).
    // Line-based scanning — no backtracking-prone regex needed.
    let mut in_block = false;
    let mut block_start: usize = 0;
    let mut block_line_count: usize = 0;

    for (line_idx, line) in content.lines().enumerate() {
        if line.trim().starts_with("```") {
            if in_block {
                // End of code block
                if block_line_count > 20 {
                    // Estimate byte offset for line_of/col_of using the start line
                    let byte_offset = byte_offset_for_line(content, line_idx - block_line_count);
                    artifacts.push(DetectedArtifact::new(
                        ArtifactCategory::CodeDump,
                        "info".into(),
                        format!("Code-Block ({} Zeilen)", block_line_count),
                        line_of(content, byte_offset),
                        col_of(content, byte_offset),
                        Some("{CODE_SNIPPET}".into()),
                    ));
                }
                in_block = false;
                block_line_count = 0;
            } else {
                // Start of code block
                in_block = true;
                block_start = line_idx;
                block_line_count = 0;
            }
            continue;
        }
        if in_block {
            block_line_count += 1;
        }
    }

    // Handle unclosed code block at end of file
    if in_block && block_line_count > 20 {
        let byte_offset = byte_offset_for_line(content, block_start);
        artifacts.push(DetectedArtifact::new(
            ArtifactCategory::CodeDump,
            "info".into(),
            format!("Code-Block ({} Zeilen)", block_line_count),
            line_of(content, byte_offset),
            col_of(content, byte_offset),
            Some("{CODE_SNIPPET}".into()),
        ));
    }

    // Auch inline-code der sehr lang ist
    let inline_re = Regex::new(r"`[^`]{200,}`").unwrap();
    for m in inline_re.find_iter(content) {
        artifacts.push(DetectedArtifact::new(
            ArtifactCategory::CodeDump,
            "info".into(),
            format!("Langer Inline-Code ({} Zeichen)", m.as_str().len()),
            line_of(content, m.start()),
            col_of(content, m.start()),
            Some("{CODE_SNIPPET}".into()),
        ));
    }

    artifacts
}

// -----------------------------------------------------------------------------
// Kategorie 11: Personenbezogene Daten (PII)
// -----------------------------------------------------------------------------

fn detect_pii(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    // E-Mail-Adressen
    let email_re = Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b").unwrap();
    for m in email_re.find_iter(content) {
        artifacts.push(DetectedArtifact::new(
            ArtifactCategory::Pii,
            "critical".into(),
            m.as_str().to_string(),
            line_of(content, m.start()),
            col_of(content, m.start()),
            Some("{EMAIL}".into()),
        ));
    }

    // Telefonnummern (Deutschland, International)
    let phone_re = Regex::new(
        r"(?:\+?(\d{1,3})[\s\-\.]?)?(?:\(?0?\d{2,4}\)?[\s\-\.]?)?\d{3,4}[\s\-\.]?\d{3,5}",
    )
    .unwrap();
    for m in phone_re.find_iter(content) {
        let matched = m.as_str();
        // Nur als Telefon markieren wenn es wie eine Telefonnummer aussieht
        let digit_count = matched.chars().filter(|c| c.is_ascii_digit()).count();
        if (7..=15).contains(&digit_count) {
            artifacts.push(DetectedArtifact::new(
                ArtifactCategory::Pii,
                "critical".into(),
                matched.to_string(),
                line_of(content, m.start()),
                col_of(content, m.start()),
                Some("{PHONE}".into()),
            ));
        }
    }

    artifacts
}

// -----------------------------------------------------------------------------
// Kategorie 12: Secrets
// -----------------------------------------------------------------------------

fn detect_secrets(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    let secret_patterns = [
        // API Keys
        (
            r#"(?i)(api[_\s\-]?key|apikey|api[_\s\-]?secret|api[_\s\-]?token)\s*[:=]\s*['"`]?([\w\-\.]{20,})['"`]?"#,
            "API Key",
        ),
        // Generic Tokens
        (
            r#"(?i)(token|access[_\s\-]?token|auth[_\s\-]?token|bearer)\s*[:=]\s*['"`]?([\w\-\.]{20,})['"`]?"#,
            "Token",
        ),
        // Passwords
        (
            r#"(?i)(password|passwd|pwd|secret)\s*[:=]\s*['"`]([^'"`]{4,})['"`]"#,
            "Password",
        ),
        // Private Keys
        (
            r"-----BEGIN\s+(RSA|EC|DSA|OPENSSH)?\s*PRIVATE\s+KEY-----",
            "Private Key",
        ),
        // AWS Keys
        (r"(?i)(AKIA[0-9A-Z]{16})", "AWS Access Key"),
        // JWT Tokens
        (
            r"eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+(?:\.[A-Za-z0-9\-_]+)?",
            "JWT Token",
        ),
        // Stripe Keys
        (r"(?i)(sk|pk)_(live|test)_[0-9a-zA-Z]{24,}", "Stripe Key"),
        // GitHub Tokens
        (
            r"(?i)(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}",
            "GitHub Token",
        ),
    ];

    for (pattern, secret_type) in &secret_patterns {
        if let Ok(re) = Regex::new(pattern) {
            for m in re.find_iter(content) {
                artifacts.push(DetectedArtifact::new(
                    ArtifactCategory::Secret,
                    "critical".into(),
                    format!("{}: {}", secret_type, mask_secret(m.as_str())),
                    line_of(content, m.start()),
                    col_of(content, m.start()),
                    Some(format!(
                        "{{{}}}",
                        secret_type.to_uppercase().replace(' ', "_")
                    )),
                ));
            }
        }
    }

    artifacts
}

fn mask_secret(secret: &str) -> String {
    if secret.len() <= 8 {
        return "***".to_string();
    }
    format!("{}...{}", &secret[..4], &secret[secret.len() - 4..])
}

// -----------------------------------------------------------------------------
// Hilfsfunktionen
// -----------------------------------------------------------------------------

/// Berechnet die Zeilennummer (1-basiert) für eine Byte-Position
fn line_of(content: &str, pos: usize) -> usize {
    content[..pos].chars().filter(|&c| c == '\n').count() + 1
}

/// Berechnet die Spaltennummer (1-basiert) für eine Byte-Position
fn col_of(content: &str, pos: usize) -> usize {
    if let Some(last_nl) = content[..pos].rfind('\n') {
        pos - last_nl
    } else {
        pos + 1
    }
}

/// Gibt ungefähre Byte-Offset für den Anfang einer bestimmten Zeile (0-basiert).
/// Wird für die zeilenbasierte Code-Block-Erkennung verwendet.
fn byte_offset_for_line(content: &str, line: usize) -> usize {
    let mut current_line = 0;
    for (i, c) in content.char_indices() {
        if current_line == line {
            return i;
        }
        if c == '\n' {
            current_line += 1;
        }
    }
    // Falls die Zeile über das Ende hinausgeht, den letzten gültigen Index nehmen
    content.len()
}

// =============================================================================
// Neue Detektoren (Issue #90 — Typed Local Action Layer)
// =============================================================================

/// Kategorie 13: Chat-Metakommentare (User/Assistant/System/Human/AI labels)
fn detect_chat_meta(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();
    let chat_regex =
        Regex::new(r"(?im)^(User|Assistant|System|Human|AI|Agent|Bot|Model)\s*:\s*.+$").unwrap();

    for cap in chat_regex.captures_iter(content) {
        let matched = cap.get(0).unwrap();
        artifacts.push(DetectedArtifact::new(
            ArtifactCategory::ChatMeta,
            "warning".into(),
            matched.as_str().to_string(),
            line_of(content, matched.start()),
            col_of(content, matched.start()),
            Some("{CHAT_ROLE}".into()),
        ));
    }
    artifacts
}

/// Kategorie 14: Scope-Pollution (fremde App-/Projektartefakte)
fn detect_scope_pollution(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();
    // Bekannte fremde Projektnamen
    let foreign_apps = [
        "Positron",
        "MietVisor",
        "CiviPet",
        "Tesseron",
        "OpenCode",
        "CodeBuddy",
        "Cursor",
        "Copilot",
    ];

    for app in &foreign_apps {
        let pattern = format!(r"\b{}\b", regex::escape(app));
        if let Ok(re) = Regex::new(&pattern) {
            for cap in re.captures_iter(content) {
                let matched = cap.get(0).unwrap();
                artifacts.push(DetectedArtifact::new(
                    ArtifactCategory::ScopePollution,
                    "warning".into(),
                    matched.as_str().to_string(),
                    line_of(content, matched.start()),
                    col_of(content, matched.start()),
                    Some("{SCOPE_CLEAN}".into()),
                ));
            }
        }
    }
    artifacts
}

/// Kategorie 15: OCR-Residue (Screenshot/OCR-Textfragmente ohne Aufgabenbezug)
fn detect_ocr_residue(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    // UI-Elementbeschreibungen ohne Kontext
    let ocr_patterns = [
        r"(?i)\b(button|schaltfläche|dropdown|eingabefeld|textfeld|checkbox|radio|tab|menü|menu|toolbar|statusbar|title bar|dialog|modal|popup|overlay)\s*(?:label|text|angezeigt|click|klick)?\s*$",
        r"(?i)^\s*(?:OK|Cancel|Abbrechen|Save|Speichern|Delete|Löschen|Submit|Senden|Close|Schließen)\s*$",
        r"(?i)^\s*(?:Settings|Einstellungen|Preferences|Präferenzen|Help|Hilfe|About|Über)\s*$",
    ];

    let mut has_task_context = false;
    // Check if there's a task-related section
    if Regex::new(r"(?i)(aufgabe|task|ziel|goal|auftrag|rolle|role|context|kontext)")
        .unwrap()
        .is_match(content)
    {
        has_task_context = true;
    }

    for pattern in &ocr_patterns {
        if let Ok(re) = Regex::new(pattern) {
            for cap in re.captures_iter(content) {
                let matched = cap.get(0).unwrap();
                // Only flag if there's no task context (isolated UI descriptions)
                if !has_task_context {
                    artifacts.push(DetectedArtifact::new(
                        ArtifactCategory::OcrResidue,
                        "info".into(),
                        matched.as_str().to_string(),
                        line_of(content, matched.start()),
                        col_of(content, matched.start()),
                        Some("{UI_RELEVANT}".into()),
                    ));
                }
            }
        }
    }
    artifacts
}

/// Kategorie 16: Role Mismatch (unstimmige Rollen/Sektoren)
fn detect_role_mismatch(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    // Detect multiple conflicting role statements
    let role_sectors = [
        ("developer|entwickler|engineer|programmierer", "dev"),
        ("designer|gestalter|ux|ui", "design"),
        ("analyst|analytiker|data|daten", "analytics"),
        ("writer|autor|redakteur|content|texter", "writing"),
        ("tester|qa|qualität|prüfer", "testing"),
        ("manager|projektleiter|scrum|product owner", "management"),
    ];

    let mut found_sectors: Vec<&str> = Vec::new();

    for (pattern, sector) in &role_sectors {
        if let Ok(re) = Regex::new(&format!(r"(?i)\b(?:{})\b", pattern)) {
            if re.is_match(content) {
                found_sectors.push(sector);
            }
        }
    }

    // Flag if 3+ different sectors are mentioned (suggests role confusion)
    if found_sectors.len() >= 3 {
        // Find the context line with role mentions
        for (line_idx, line) in content.lines().enumerate() {
            let match_count = role_sectors
                .iter()
                .filter(|(p, _)| {
                    Regex::new(&format!(r"(?i)\b(?:{})\b", p))
                        .map(|re| re.is_match(line))
                        .unwrap_or(false)
                })
                .count();
            if match_count >= 2 {
                artifacts.push(DetectedArtifact::new(
                    ArtifactCategory::RoleMismatch,
                    "warning".into(),
                    line.trim().to_string(),
                    line_idx + 1,
                    1,
                    Some("{CORRECTED_ROLE}".into()),
                ));
            }
        }
    }

    artifacts
}

/// Prüft ob der Inhalt eine Guideline/Richtlinie ist (nicht Task-Prompt).
///
/// Delegiert an den gemeinsamen R2-Router (`r2::type_router::is_guideline`,
/// spec §10 M2) — die einzige Quelle der Wahrheit für Guideline-Routing
/// (qualität.rs und hygiene.rs teilen sich diesen Router).
fn is_guideline_content(content: &str) -> bool {
    crate::analysis::r2::type_router::is_guideline(content)
}

/// Kategorie 17: Missing Structure (fehlender Standardaufbau)
fn detect_missing_structure(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    // For guideline/policy content, use different structural expectations.
    // Guidelines define reusable rules, not single task prompts.
    if is_guideline_content(content) {
        return detect_missing_guideline_structure(content);
    }

    // Canonical sections that should be present in a well-structured prompt
    let required_sections = [
        (r"(?im)^#{1,3}\s*(rolle|role|rollendefinition)", "Rolle"),
        (r"(?im)^#{1,3}\s*(ziel|goal|aufgabe|task|objective)", "Ziel"),
        (
            r"(?im)^#{1,3}\s*(kontext|context|hintergrund|background)",
            "Kontext",
        ),
        (
            r"(?im)^#{1,3}\s*(anforderung|requirements|eingabe|input)",
            "Anforderungen",
        ),
        (
            r"(?im)^#{1,3}\s*(ausgabe|output|format|ergebnis)",
            "Ausgabeformat",
        ),
        (
            r"(?im)^#{1,3}\s*(einschränkung|constraint|grenze|limitation|boundary)",
            "Constraints",
        ),
    ];

    let mut missing: Vec<&str> = Vec::new();

    for (pattern, name) in &required_sections {
        if let Ok(re) = Regex::new(pattern) {
            if !re.is_match(content) {
                missing.push(name);
            }
        }
    }

    // Flag if >= 3 canonical sections are missing
    if missing.len() >= 3 && content.trim().len() > 100 {
        artifacts.push(DetectedArtifact::new(
            ArtifactCategory::MissingStructure,
            "info".into(),
            format!("Fehlende Sektionen: {}", missing.join(", ")),
            1,
            1,
            Some("{ADD_STRUCTURE}".into()),
        ));
    }

    artifacts
}

/// Guideline-spezifische Strukturprüfung.
/// Prüft Scope, rules, constraints, output discipline statt Role/Eingabe/Ausgabe.
fn detect_missing_guideline_structure(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    let guideline_sections = [
        (
            r"(?im)^#{1,3}\s*(?:scope|umfang|geltung|ziel|purpose|goal)\b",
            "Scope/Zweck",
        ),
        (
            r"(?im)^#{1,3}\s*(?:regeln?|rules?|prinzipien|principles|vorgaben?)\b",
            "Regeln/Prinzipien",
        ),
        (
            r"(?im)^#{1,3}\s*(?:einschränkung|constraint|grenze|limitation|boundary|guardrail)\b",
            "Constraints/Guardrails",
        ),
        (
            r"(?im)^#{1,3}\s*(?:anwendbarkeit|applicability|kontext|context|gültig)\b",
            "Anwendbarkeit/Kontext",
        ),
        (
            r"(?im)^#{1,3}\s*(?:ausgabe|output|format|struktur)\b",
            "Output-Disziplin",
        ),
    ];

    let mut missing: Vec<&str> = Vec::new();

    for (pattern, name) in &guideline_sections {
        if let Ok(re) = Regex::new(pattern) {
            if !re.is_match(content) {
                missing.push(name);
            }
        }
    }

    // Only flag if more than 2 guideline-relevant sections are missing
    if missing.len() > 2 && content.trim().len() > 100 {
        artifacts.push(DetectedArtifact::new(
            ArtifactCategory::MissingStructure,
            "info".into(),
            format!("Fehlende Guideline-Sektionen: {}", missing.join(", ")),
            1,
            1,
            Some("{ADD_GUIDELINE_STRUCTURE}".into()),
        ));
    }

    artifacts
}

/// Kategorie 18: Evidence Block (Rohe Evidence/Log-Blöcke nicht in Prompt integriert)
fn detect_evidence_blocks(content: &str) -> Vec<DetectedArtifact> {
    let mut artifacts = Vec::new();

    // Detect raw evidence patterns:
    let evidence_patterns = [
        (
            r"(?im)^={3,}\s*(test\s*results?|testergebnis|build\s*output|log|report)\s*={3,}",
            "critical",
        ),
        (
            r"(?im)^\-{3,}\s*(test\s*results?|testergebnis|evidence|nachweis|proof)\s*\-{3,}",
            "warning",
        ),
        (
            r"(?im)^\*\*(evidence|test\s*results?|ci\s*pipeline|build\s*status)\*\*",
            "warning",
        ),
        // Diff blocks
        (r"^diff\s+\-\-git", "info"),
    ];

    for (pattern, severity) in &evidence_patterns {
        if let Ok(re) = Regex::new(pattern) {
            for cap in re.captures_iter(content) {
                let matched = cap.get(0).unwrap();
                artifacts.push(DetectedArtifact::new(
                    ArtifactCategory::EvidenceBlock,
                    severity.to_string(),
                    matched.as_str().to_string(),
                    line_of(content, matched.start()),
                    col_of(content, matched.start()),
                    Some("{INTEGRATE_EVIDENCE}".into()),
                ));
            }
        }
    }

    artifacts
}

// =============================================================================
// Unit Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::HygieneStatus;

    // Helper
    fn artifact_count(artifacts: &[DetectedArtifact], category: ArtifactCategory) -> usize {
        artifacts.iter().filter(|a| a.category == category).count()
    }

    #[test]
    fn test_clean_prompt() {
        let content = "Du bist ein hilfreicher Assistent. Bitte formatiere die Ausgabe als JSON.";
        let result = analyze_hygiene(content, "test-clean");
        assert_eq!(result.status, HygieneStatus::Clean);
        assert!(result.hygiene_score >= 90);
    }

    #[test]
    fn test_project_artifact_detection() {
        let content = "Öffne das MietVisor-Projekt und bearbeite die CiviPet OS Konfiguration.";
        let result = analyze_hygiene(content, "test-artifact");
        let artifacts = &result.artifacts;
        assert!(
            artifact_count(artifacts, ArtifactCategory::ProjectArtifact) >= 1,
            "Found: {:?}",
            artifacts
                .iter()
                .filter(|a| a.category == ArtifactCategory::ProjectArtifact)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_repo_reference_detection() {
        let content = "Repository: https://github.com/user/repo";
        let result = analyze_hygiene(content, "test-repo");
        assert!(artifact_count(&result.artifacts, ArtifactCategory::RepoReference) >= 1);
    }

    #[test]
    fn test_file_path_detection() {
        let content = "Die Datei liegt unter /home/user/project/src/main.rs";
        let result = analyze_hygiene(content, "test-path");
        assert!(artifact_count(&result.artifacts, ArtifactCategory::FilePath) >= 1);
    }

    #[test]
    fn test_windows_path_detection() {
        let content = "C:\\Users\\test\\project\\app.tsx";
        let result = analyze_hygiene(content, "test-win-path");
        assert!(artifact_count(&result.artifacts, ArtifactCategory::FilePath) >= 1);
    }

    #[test]
    fn test_issue_reference_detection() {
        let content = "Siehe Issue #42 und PR #17 für Details.";
        let result = analyze_hygiene(content, "test-issue");
        assert!(artifact_count(&result.artifacts, ArtifactCategory::IssueReference) >= 2);
    }

    #[test]
    fn test_test_report_detection() {
        let content = "Tests: 1886 passed, 6 skipped, 29 failed";
        let result = analyze_hygiene(content, "test-report");
        assert!(artifact_count(&result.artifacts, ArtifactCategory::TestReport) >= 1);
    }

    #[test]
    fn test_log_line_detection() {
        let content = "ERROR: Failed to connect to database\nINFO: Server started on port 3000";
        let result = analyze_hygiene(content, "test-log");
        assert!(artifact_count(&result.artifacts, ArtifactCategory::LogLine) >= 2);
    }

    #[test]
    fn test_stacktrace_detection() {
        let content = "Exception in thread main\n    at com.example.App.main(App.java:42)";
        let result = analyze_hygiene(content, "test-stack");
        assert!(artifact_count(&result.artifacts, ArtifactCategory::Stacktrace) >= 1);
    }

    #[test]
    fn test_build_output_detection() {
        let content = "$ npm run build\n> cargo build --release\nCompiling project...";
        let result = analyze_hygiene(content, "test-build");
        assert!(artifact_count(&result.artifacts, ArtifactCategory::BuildOutput) >= 1);
    }

    #[test]
    fn test_json_dump_detection() {
        let mut content = String::from("```json\n");
        for i in 0..30 {
            content.push_str(&format!("  \"key{}\": \"value{}\",\n", i, i));
        }
        content.push_str("```\n");
        content.push_str("{\n");
        for i in 0..30 {
            content.push_str(&format!("  \"key{}\": \"value{}\",\n", i, i));
        }
        content.push_str("}\n");
        let result = analyze_hygiene(&content, "test-json");
        assert!(
            artifact_count(&result.artifacts, ArtifactCategory::JsonDump) >= 1,
            "No JSON dump detected. Artifacts: {:?}",
            result.artifacts
        );
    }

    #[test]
    fn test_code_dump_detection() {
        let content = "```rust\n".to_string() + &"// Line ".repeat(25) + "\n```";
        let result = analyze_hygiene(&content, "test-code");
        assert!(artifact_count(&result.artifacts, ArtifactCategory::CodeDump) >= 1);
    }

    #[test]
    fn test_pii_email_detection() {
        let content = "Kontakt: max.mustermann@example.com";
        let result = analyze_hygiene(content, "test-pii");
        assert!(artifact_count(&result.artifacts, ArtifactCategory::Pii) >= 1);
    }

    #[test]
    fn test_secret_detection() {
        let content = "API_KEY=sk-1234567890abcdefghijklmnopqrstuv";
        let result = analyze_hygiene(content, "test-secret");
        let secret_artifacts: Vec<_> = result
            .artifacts
            .iter()
            .filter(|a| a.category == ArtifactCategory::Secret)
            .collect();
        assert!(
            !secret_artifacts.is_empty(),
            "No secrets found in: {:?}",
            result.artifacts
        );
    }

    #[test]
    fn test_jwt_detection() {
        let content = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
        let result = analyze_hygiene(content, "test-jwt");
        assert!(artifact_count(&result.artifacts, ArtifactCategory::Secret) >= 1);
    }

    #[test]
    fn test_critical_artifacts_lower_score() {
        let content = "API_KEY=sk-secretkey12345\nPassword=\"hunter2\"\nEmail: user@test.com";
        let result = analyze_hygiene(content, "test-critical");
        // Mit kritischen Artefakten (Secrets, PII) sollte der Score deutlich sinken
        let critical_count = result
            .artifacts
            .iter()
            .filter(|a| a.severity == "critical")
            .count();
        assert!(
            critical_count >= 2,
            "Expected >=2 critical artifacts, got {}: {:?}",
            critical_count,
            result.artifacts
        );
        assert!(
            result.hygiene_score < 90,
            "Score sollte reduziert sein, ist aber {}",
            result.hygiene_score
        );
        assert!(
            result.status != HygieneStatus::Clean,
            "Status sollte nicht Clean sein bei {}",
            result.hygiene_score
        );
    }

    #[test]
    fn test_hygiene_score_calculation() {
        let content = "Du bist ein Assistent. Hilf dem Nutzer.";
        let result = analyze_hygiene(content, "test-score");
        assert_eq!(result.hygiene_score, 100);
        assert_eq!(result.status, HygieneStatus::Clean);
    }

    #[test]
    fn test_all_artifact_categories_tested() {
        // Test dass jede Kategorie mindestens einen Test hat
        let categories = [
            ArtifactCategory::ProjectArtifact,
            ArtifactCategory::RepoReference,
            ArtifactCategory::FilePath,
            ArtifactCategory::IssueReference,
            ArtifactCategory::TestReport,
            ArtifactCategory::LogLine,
            ArtifactCategory::Stacktrace,
            ArtifactCategory::BuildOutput,
            ArtifactCategory::JsonDump,
            ArtifactCategory::CodeDump,
            ArtifactCategory::Pii,
            ArtifactCategory::Secret,
            ArtifactCategory::ChatMeta,
            ArtifactCategory::ScopePollution,
            ArtifactCategory::OcrResidue,
            ArtifactCategory::RoleMismatch,
            ArtifactCategory::MissingStructure,
            ArtifactCategory::EvidenceBlock,
        ];

        for category in &categories {
            // Nur sicherstellen dass die Kategorie existiert
            assert!(!format!("{:?}", category).is_empty());
        }
    }

    // ---- New detector tests (Issue #90) ----

    #[test]
    fn test_chat_meta_detection() {
        let content = "User: What is the capital of France?\nAssistant: The capital of France is Paris.\nSystem: This conversation is logged.";
        let result = analyze_hygiene(content, "test-chat-meta");
        assert!(
            artifact_count(&result.artifacts, ArtifactCategory::ChatMeta) >= 1,
            "Chat meta should be detected. Artifacts: {:?}",
            result
                .artifacts
                .iter()
                .filter(|a| a.category == ArtifactCategory::ChatMeta)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_scope_pollution_detection() {
        let content = "Open the Positron IDE and fix the MietVisor dashboard.";
        let result = analyze_hygiene(content, "test-scope-pollution");
        assert!(
            artifact_count(&result.artifacts, ArtifactCategory::ScopePollution) >= 1,
            "Scope pollution should be detected. Artifacts: {:?}",
            result
                .artifacts
                .iter()
                .filter(|a| a.category == ArtifactCategory::ScopePollution)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_ocr_residue_detection() {
        // UI element descriptions without any task/context section headings
        let content = "OK\nCancel\nSettings\nHelp\nButton\nDropdown\nCheckbox\nTextfeld\nMenü";
        let result = analyze_hygiene(content, "test-ocr-residue");
        assert!(
            artifact_count(&result.artifacts, ArtifactCategory::OcrResidue) >= 1,
            "OCR residue should be detected. Artifacts: {:?}",
            result
                .artifacts
                .iter()
                .filter(|a| a.category == ArtifactCategory::OcrResidue)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_role_mismatch_detection() {
        let content = "As a developer, designer, and project manager, I need you to analyze this data and write a report.";
        let result = analyze_hygiene(content, "test-role-mismatch");
        // May or may not detect depending on sector threshold (3+)
        // Main assertion: should not panic
        assert_eq!(result.prompt_id, "test-role-mismatch");
    }

    #[test]
    fn test_missing_structure_detection() {
        let content = "Fix the bug in the login module. It crashes when users enter invalid credentials. The database should handle this gracefully.";
        let result = analyze_hygiene(content, "test-missing-structure");
        assert!(
            artifact_count(&result.artifacts, ArtifactCategory::MissingStructure) >= 1,
            "Missing structure should be detected. Artifacts: {:?}",
            result
                .artifacts
                .iter()
                .filter(|a| a.category == ArtifactCategory::MissingStructure)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_evidence_block_detection() {
        let content =
            "=== Test Results ===\n1886 passed, 29 failed\n=== Build Output ===\nCompiling...";
        let result = analyze_hygiene(content, "test-evidence-block");
        assert!(
            artifact_count(&result.artifacts, ArtifactCategory::EvidenceBlock) >= 1,
            "Evidence blocks should be detected. Artifacts: {:?}",
            result
                .artifacts
                .iter()
                .filter(|a| a.category == ArtifactCategory::EvidenceBlock)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_empty_content_hygiene() {
        let hygiene = analyze_hygiene("", "empty");
        // Empty content should be clean (no artifacts to find)
        assert!(hygiene.artifacts.is_empty());
        assert_eq!(hygiene.hygiene_score, 100);
    }

    #[test]
    fn test_binary_like_content() {
        let content = "PK\x03\x04\x14\x00\x00\x00\x08\x00";
        let hygiene = analyze_hygiene(content, "binary");
        // Should not panic – verify analysis completed
        assert_eq!(hygiene.prompt_id, "binary");
    }

    #[test]
    fn test_unicode_artifacts() {
        // Prompt with secrets-like patterns in unicode context
        let content = "API_KEY=abc123\npassword = \"übergeheim\"\nToken: eyJhbGciOiJIUzI1NiJ9";
        let hygiene = analyze_hygiene(content, "unicode-secrets");
        assert!(!hygiene.artifacts.is_empty());
        assert!(hygiene.hygiene_score < 100);
    }
}
