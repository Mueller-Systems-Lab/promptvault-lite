use crate::models::PromptItem;
use crate::parser::frontmatter::parse_frontmatter;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Canonicalize a path using dunce. On Windows, this strips the `\\?\` verbatim
/// prefix before canonicalizing. On non-Windows platforms, it behaves like
/// `std::fs::canonicalize`. Requires the path to exist (returns Err for
/// non-existent paths).
fn canonicalize(path: &Path) -> Result<PathBuf, std::io::Error> {
    let canonical = dunce::canonicalize(path)?;
    Ok(canonical)
}

/// Maximum file size (in bytes) for supported prompt files.
/// Files exceeding this limit are skipped with a warning to avoid
/// accidentally ingesting model files, archives, exports, or oversized
/// prompt dumps.
const MAX_PROMPT_FILE_SIZE_BYTES: u64 = 1_048_576; // 1 MiB

/// Check if a file path has a supported prompt extension (.md, .markdown, .txt).
/// Matching is case-insensitive. This is the single source of truth for
/// extension filtering used by both the scanner and file watcher.
pub fn is_supported_prompt_extension(path: &Path) -> bool {
    path.extension().is_some_and(|ext| {
        let ext_lower = ext.to_str().unwrap_or_default().to_ascii_lowercase();
        ext_lower == "md" || ext_lower == "markdown" || ext_lower == "txt"
    })
}

/// Gescannter Datei-Eintrag vor dem Parsing
#[derive(Debug, Clone)]
struct ScannedFile {
    path: PathBuf,
    file_name: String,
    #[allow(dead_code)]
    size: u64,
    modified: String,
}

/// Rekursives Scannen eines Verzeichnisses nach Prompt-Textdateien (.md, .markdown, .txt)
///
/// # Arguments
/// * `dir_path` - Absoluter Pfad zum zu scannenden Verzeichnis
///
/// # Returns
/// * `Vec<PromptItem>` - Liste aller gefundenen und geparsten Prompts
///
/// # Errors
/// * Unlesbare Verzeichnisse/Dateien werden geloggt aber nicht als Fehler zurückgegeben
pub fn scan_directory(dir_path: &str) -> Result<Vec<PromptItem>, String> {
    // Reject null bytes in path (security: prevents path truncation attacks)
    if dir_path.contains('\0') {
        return Err("Pfad enthält ungültige Null-Bytes".to_string());
    }

    let root = Path::new(dir_path);

    if !root.exists() {
        return Err(format!("Verzeichnis existiert nicht: {}", dir_path));
    }

    if !root.is_dir() {
        return Err(format!("Pfad ist kein Verzeichnis: {}", dir_path));
    }

    // Canonicalize root for symlink containment checks
    let canonical_root = match canonicalize(root) {
        Ok(cr) => cr,
        Err(e) => {
            return Err(format!(
                "Konnte kanonischen Pfad nicht auflösen: {}: {}",
                dir_path, e
            ));
        }
    };

    let mut scanned_files: Vec<ScannedFile> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    // Rekursives Durchlaufen mit walkdir
    for entry in WalkDir::new(root)
        .follow_links(true)
        .max_depth(50) // Schutz vor zu tiefer Rekursion
        .into_iter()
        .filter_map(|e| match e {
            Ok(entry) => {
                // Symlink-Tiefe prüfen
                if entry.path_is_symlink() {
                    if let Ok(link_depth) = symlink_depth(entry.path()) {
                        if link_depth > 5 {
                            log::warn!(
                                "Symlink-Tiefe > 5, überspringe: {}",
                                entry.path().display()
                            );
                            return None;
                        }
                    }
                }
                Some(entry)
            }
            Err(err) => {
                if let Some(path) = err.path() {
                    log::warn!("Fehler beim Lesen von '{}': {}", path.display(), err);
                    errors.push(format!("Lesefehler bei '{}': {}", path.display(), err));
                }
                None
            }
        })
    {
        // Nur unterstuetzte Textdateien (.md, .markdown, .txt) — case-insensitive
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();

        // Symlink-Containment: canonicalize and verify file is within vault root
        let canonical_file = match canonicalize(path) {
            Ok(cf) => cf,
            Err(e) => {
                log::warn!(
                    "Konnte kanonischen Pfad nicht auflösen für '{}': {}",
                    path.display(),
                    e
                );
                continue;
            }
        };

        if !canonical_file.starts_with(&canonical_root) {
            log::warn!(
                "Symlink außerhalb des Vaults übersprungen: {}",
                path.display()
            );
            continue;
        }

        // Use canonical_file for all subsequent operations (TOCTOU-safe after containment check)
        if is_supported_prompt_extension(&canonical_file) {
            match fs::metadata(&canonical_file) {
                Ok(meta) => {
                    let file_size = meta.len();

                    // Skip very large prompt files to avoid accidentally
                    // ingesting model files, archives, exports, or oversized
                    // prompt dumps.
                    if file_size > MAX_PROMPT_FILE_SIZE_BYTES {
                        log::warn!(
                            "Prompt-Datei zu groß ({} bytes, Limit: {} bytes), überspringe: {}",
                            file_size,
                            MAX_PROMPT_FILE_SIZE_BYTES,
                            canonical_file.display()
                        );
                        continue;
                    }

                    let modified = meta
                        .modified()
                        .ok()
                        .and_then(|t| {
                            chrono::DateTime::from_timestamp(
                                t.duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_secs() as i64,
                                0,
                            )
                        })
                        .map(|dt| dt.to_rfc3339())
                        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

                    scanned_files.push(ScannedFile {
                        path: canonical_file.clone(),
                        file_name: canonical_file
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string(),
                        size: file_size,
                        modified,
                    });
                }
                Err(err) => {
                    log::warn!(
                        "Konnte Metadaten nicht lesen für '{}': {}",
                        path.display(),
                        err
                    );
                }
            }
        }
    }

    // Scanned-Files in PromptItems umwandeln
    let mut prompts: Vec<PromptItem> = Vec::with_capacity(scanned_files.len());

    for file in &scanned_files {
        match fs::read_to_string(&file.path) {
            Ok(content) => {
                let frontmatter_result = parse_frontmatter(&content);

                // Titel: Frontmatter > Dateiname (ohne .md / .markdown / .txt)
                let title = frontmatter_result
                    .metadata
                    .get("title")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| {
                        let name = &file.file_name;
                        let lower = name.to_ascii_lowercase();
                        if lower.ends_with(".markdown") {
                            name[..name.len() - ".markdown".len()].to_string()
                        } else if lower.ends_with(".md") {
                            name[..name.len() - ".md".len()].to_string()
                        } else if lower.ends_with(".txt") {
                            name[..name.len() - ".txt".len()].to_string()
                        } else {
                            name.to_string()
                        }
                    });

                // Kategorie: Frontmatter > Ordnername
                let category = frontmatter_result
                    .metadata
                    .get("category")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| {
                        file.path
                            .parent()
                            .and_then(|p| p.file_name())
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_else(|| "Uncategorized".to_string())
                    });

                // Beschreibung
                let description = frontmatter_result
                    .metadata
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_default();

                // Version
                let version = frontmatter_result
                    .metadata
                    .get("version")
                    .and_then(|v| {
                        if let Some(s) = v.as_str() {
                            Some(s.to_string())
                        } else {
                            v.as_f64().map(|n| n.to_string())
                        }
                    })
                    .unwrap_or_else(|| "1.0".to_string());

                // Tags
                let tags = frontmatter_result
                    .metadata
                    .get("tags")
                    .map(|v| match v {
                        serde_json::Value::Array(arr) => arr
                            .iter()
                            .filter_map(|t| t.as_str().map(|s| s.to_string()))
                            .collect(),
                        serde_json::Value::String(s) => vec![s.clone()],
                        _ => Vec::new(),
                    })
                    .unwrap_or_default();

                // Datum aus Frontmatter oder Dateisystem
                let created_at = frontmatter_result
                    .metadata
                    .get("created")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| file.modified.clone());

                let updated_at = frontmatter_result
                    .metadata
                    .get("updated")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| file.modified.clone());

                let prompt = PromptItem {
                    // Deterministische ID aus dem kanonischen Pfad (uuid v5).
                    // Random-IDs (new_v4) pro Scan machen Favoriten/Persistenz
                    // über Neustarts hinweg unmöglich — die DB referenziert die
                    // ID, nicht den Pfad. v5 ist pfadstabil und kollisionsfrei.
                    id: uuid::Uuid::new_v5(
                        &uuid::Uuid::NAMESPACE_URL,
                        file.path.to_string_lossy().as_bytes(),
                    )
                    .to_string(),
                    file_path: file.path.to_string_lossy().to_string(),
                    file_name: file.file_name.clone(),
                    title,
                    description,
                    category,
                    version,
                    tags,
                    content: frontmatter_result.content,
                    raw_frontmatter: frontmatter_result.metadata,
                    created_at,
                    updated_at,
                    is_favorite: false,
                };

                prompts.push(prompt);
            }
            Err(err) => {
                log::error!(
                    "Konnte Datei nicht lesen '{}': {}",
                    file.path.display(),
                    err
                );
                errors.push(format!("Lesefehler bei '{}': {}", file.path.display(), err));
            }
        }
    }

    // Sortiere: Ordner-Struktur erhalten (nach Pfad sortieren)
    prompts.sort_by(|a, b| a.file_path.cmp(&b.file_path));

    if !errors.is_empty() {
        log::warn!(
            "Scan abgeschlossen mit {} Warnungen bei {} Prompts",
            errors.len(),
            prompts.len()
        );
    }

    Ok(prompts)
}

/// Berechnet die Tiefe einer Symlink-Kette
fn symlink_depth(path: &Path) -> Result<usize, std::io::Error> {
    let mut depth = 0;
    let mut current = path.to_path_buf();

    while depth < 10 {
        if !current.is_symlink() {
            break;
        }
        let target = fs::read_link(&current)?;
        current = if target.is_absolute() {
            target
        } else {
            current.parent().unwrap_or(Path::new("/")).join(target)
        };
        depth += 1;
    }

    Ok(depth)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn create_test_file(dir: &Path, name: &str, content: &str) {
        let file_path = dir.join(name);
        let mut file = fs::File::create(&file_path).unwrap();
        file.write_all(content.as_bytes()).unwrap();
    }

    #[test]
    fn test_scan_empty_directory() {
        let dir = TempDir::new().unwrap();
        let result = scan_directory(dir.path().to_str().unwrap());
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 0);
    }

    #[test]
    fn test_scan_single_md_file() {
        let dir = TempDir::new().unwrap();
        create_test_file(dir.path(), "test.md", "# Test Prompt\n\nHello World");

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "test");
        assert_eq!(result[0].file_name, "test.md");
        assert_eq!(
            result[0].category,
            dir.path().file_name().unwrap().to_str().unwrap()
        );
    }

    /// Regression (E19-Native-Reise): Prompt-IDs müssen pfadstabil sein,
    /// sonst überleben Favoriten keinen App-Neustart (DB referenziert die ID).
    #[test]
    fn test_prompt_ids_are_deterministic_across_scans() {
        let dir = TempDir::new().unwrap();
        create_test_file(dir.path(), "stable.md", "# Stable\n\nInhalt");

        let first = scan_directory(dir.path().to_str().unwrap()).unwrap();
        let second = scan_directory(dir.path().to_str().unwrap()).unwrap();

        assert_eq!(first[0].id, second[0].id);
        // uuid v5 ist ein gültiges UUID-Format
        assert!(uuid::Uuid::parse_str(&first[0].id).is_ok());
    }

    #[test]
    fn test_scan_with_frontmatter() {
        let dir = TempDir::new().unwrap();
        let content = "---\ntitle: My Prompt\ncategory: coding\nversion: \"2.0\"\ntags:\n  - rust\n  - testing\ndescription: A test prompt\n---\n\n# Prompt\n\nContent here";
        create_test_file(dir.path(), "prompt.md", content);

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "My Prompt");
        assert_eq!(result[0].category, "coding");
        assert_eq!(result[0].version, "2.0");
        assert_eq!(result[0].tags, vec!["rust", "testing"]);
        assert_eq!(result[0].description, "A test prompt");
        assert!(!result[0].content.contains("---"));
        assert!(result[0].content.contains("# Prompt"));
    }

    #[test]
    fn test_scan_nested_directories() {
        let dir = TempDir::new().unwrap();
        let sub_dir = dir.path().join("sub");
        fs::create_dir(&sub_dir).unwrap();

        create_test_file(dir.path(), "root.md", "# Root");
        create_test_file(&sub_dir, "nested.md", "# Nested");

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 2);

        let titles: Vec<&str> = result.iter().map(|p| p.title.as_str()).collect();
        assert!(titles.contains(&"root"));
        assert!(titles.contains(&"nested"));
    }

    #[test]
    fn test_ignores_unsupported_file_types() {
        let dir = TempDir::new().unwrap();
        create_test_file(dir.path(), "prompt.md", "# Prompt");
        // Erstelle eine nicht-unterstützte Datei (kein .md/.markdown/.txt)
        let mut tmp_file = fs::File::create(dir.path().join("notes.tmp")).unwrap();
        tmp_file.write_all(b"Not a prompt").unwrap();

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].file_name, "prompt.md");
    }

    #[test]
    fn test_nonexistent_directory() {
        let result = scan_directory("/nonexistent/path/12345");
        assert!(result.is_err());
    }

    #[test]
    fn test_missing_frontmatter_fallback() {
        let dir = TempDir::new().unwrap();
        let content = "# Just a prompt\n\nNo frontmatter here";
        create_test_file(dir.path(), "simple.md", content);

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "simple");
        assert_eq!(result[0].description, "");
        assert_eq!(result[0].version, "1.0");
        assert!(result[0].tags.is_empty());
    }

    // =========================================================================
    // Plattform-Pfad-Tests (Phase 3)
    // =========================================================================

    #[test]
    fn test_path_traversal_in_root_is_blocked() {
        // Passing `..` in the root path scans the resolved parent directory.
        // This test documents current behavior: OS-resolved paths are accepted.
        // A future hardening step should canonicalize and enforce containment.
        let dir = TempDir::new().unwrap();
        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        create_test_file(&sub, "inside.md", "# Inside");

        // Construct a path with .. that resolves to the same temp dir
        let traversed = sub.join("..").join("sub");
        let result = scan_directory(traversed.to_str().unwrap()).unwrap();

        // Currently accepted — OS resolves the path
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "inside");
    }

    #[test]
    fn test_windows_backslash_path_stored_as_is() {
        // File paths from Windows may contain backslashes.
        // The scanner stores the OS-native representation.
        let dir = TempDir::new().unwrap();
        let sub = dir.path().join("coding").join("rust");
        fs::create_dir_all(&sub).unwrap();
        create_test_file(&sub, "advanced.md", "# Advanced Rust");

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);

        // On Linux, the stored path uses forward slashes.
        // On Windows, it would contain backslashes.
        let path = &result[0].file_path;
        assert!(path.contains("coding"));
        assert!(path.contains("rust"));
        assert!(path.ends_with("advanced.md"));
    }

    #[test]
    fn test_mixed_path_separators_handled_gracefully() {
        // The scanner uses std::path which normalizes separators per platform.
        // This test ensures paths are stored correctly regardless of input format.
        let dir = TempDir::new().unwrap();
        let sub = dir.path().join("folder").join("nested");
        fs::create_dir_all(&sub).unwrap();
        create_test_file(&sub, "prompt.md", "# Mixed test");

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        // Category fallback is the immediate parent directory name
        assert_eq!(result[0].category, "nested");
        assert_eq!(result[0].file_name, "prompt.md");
    }

    #[test]
    fn test_deeply_nested_paths_documented() {
        // Verify the scanner handles deep nesting (>5 levels) correctly.
        // max_depth is 50, so this should work.
        let dir = TempDir::new().unwrap();
        let mut current = dir.path().to_path_buf();
        let levels = ["a", "b", "c", "d", "e", "f", "g", "h"];
        for level in &levels {
            current = current.join(level);
            fs::create_dir(&current).unwrap();
        }
        create_test_file(&current, "deep.md", "# Deep prompt");

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        // file_path should contain all levels
        let path = &result[0].file_path;
        for level in &levels {
            assert!(
                path.contains(level),
                "Expected path to contain '{}', got: {}",
                level,
                path
            );
        }
    }

    #[test]
    fn test_symlink_outside_vault_not_scanned() {
        // Phase 4: Symlink-Containment — external symlinks are blocked
        let dir = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        create_test_file(outside.path(), "secret.md", "# External file");

        // Create symlink inside vault pointing outside
        let link_path = dir.path().join("link_to_outside");
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(outside.path(), &link_path).unwrap();
        }
        #[cfg(not(unix))]
        {
            if std::os::windows::fs::symlink_dir(outside.path(), &link_path).is_err() {
                return;
            }
        }

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        // External file MUST NOT be scanned (containment enforcement)
        let secret_found = result.iter().any(|p| p.file_name == "secret.md");
        assert!(
            !secret_found,
            "Externer Symlink wurde gescannt — Containment sollte dies blockieren"
        );
    }

    #[test]
    fn test_symlink_inside_vault_is_scanned() {
        // Legitimate internal symlinks within the vault are allowed
        let dir = TempDir::new().unwrap();
        let sub = dir.path().join("subdir");
        fs::create_dir(&sub).unwrap();

        let prompt_path = sub.join("internal.md");
        create_test_file(&sub, "internal.md", "# Internal prompt");

        // Create symlink inside vault pointing to another file inside vault
        let link_path = dir.path().join("link_to_internal");
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&prompt_path, &link_path).unwrap();
        }
        #[cfg(not(unix))]
        {
            if std::os::windows::fs::symlink_file(&prompt_path, &link_path).is_err() {
                return;
            }
        }

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        // Internal symlink should be scanned
        assert!(
            result.iter().any(|p| p.file_name == "internal.md"),
            "Interner Symlink sollte gescannt werden"
        );
    }

    #[test]
    fn test_symlink_loop_detected() {
        // Symlink cycle A→B→A inside vault is detected via symlink_depth()
        let dir = TempDir::new().unwrap();
        let sub_a = dir.path().join("cycle_a");
        let sub_b = dir.path().join("cycle_b");
        fs::create_dir(&sub_a).unwrap();
        fs::create_dir(&sub_b).unwrap();

        create_test_file(&sub_a, "prompt_a.md", "# Prompt A");

        // Create cycle: A/link → B, B/link → A
        let link_a_to_b = sub_a.join("link_to_b");
        let link_b_to_a = sub_b.join("link_to_a");

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&sub_b, &link_a_to_b).unwrap();
            std::os::unix::fs::symlink(&sub_a, &link_b_to_a).unwrap();
        }
        #[cfg(not(unix))]
        {
            if std::os::windows::fs::symlink_dir(&sub_b, &link_a_to_b).is_err()
                || std::os::windows::fs::symlink_dir(&sub_a, &link_b_to_a).is_err()
            {
                return;
            }
        }

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        // The scan must complete without infinite loop / stack overflow.
        // prompt_a.md should be found (not in the cycle chain).
        assert!(
            result.iter().any(|p| p.file_name == "prompt_a.md"),
            "Datei außerhalb des Symlink-Zyklus sollte gescannt werden"
        );
    }

    #[test]
    fn test_symlink_directory_outside_vault_not_traversed() {
        // Symlinked directory pointing outside the vault — traversal must be blocked.
        let dir = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let outside_sub = outside.path().join("secrets");
        fs::create_dir(&outside_sub).unwrap();
        create_test_file(&outside_sub, "secret.md", "# External secret");

        // Create symlink inside vault pointing to outside directory
        let link_path = dir.path().join("link_to_outside_dir");
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&outside_sub, &link_path).unwrap();
        }
        #[cfg(not(unix))]
        {
            if std::os::windows::fs::symlink_dir(&outside_sub, &link_path).is_err() {
                return;
            }
        }

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        // External directory contents must NOT appear in results
        let secret_found = result.iter().any(|p| p.file_name == "secret.md");
        assert!(
            !secret_found,
            "Externes Verzeichnis via Symlink wurde traversiert — Containment sollte blockieren"
        );
    }

    // =========================================================================
    // Phase 5: NAS markdown folder ingestion tests
    // =========================================================================

    #[test]
    fn test_null_byte_in_path_blocked() {
        let result = scan_directory("/valid/path\0hidden");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("Null-Bytes"),
            "Expected null-byte rejection, got: {}",
            err
        );
    }

    #[test]
    fn test_markdown_extension_supported() {
        let dir = TempDir::new().unwrap();
        create_test_file(dir.path(), "prompt.markdown", "# Markdown Extension");
        create_test_file(dir.path(), "regular.md", "# Regular MD");

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(
            result.len(),
            2,
            "Both .md and .markdown files should be scanned"
        );
        let names: Vec<&str> = result.iter().map(|p| p.file_name.as_str()).collect();
        assert!(names.contains(&"prompt.markdown"));
        assert!(names.contains(&"regular.md"));
    }

    #[test]
    fn test_markdown_extension_title_fallback() {
        // .md and .markdown files without frontmatter title should
        // derive the title from the filename with extension stripped.
        let dir = TempDir::new().unwrap();
        create_test_file(dir.path(), "example.md", "# No frontmatter title");
        create_test_file(dir.path(), "example.markdown", "# Also no title");
        create_test_file(dir.path(), "nested.markdown", "# Nested markdown");

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 3);

        // Find each prompt by file_name and verify title
        let md_prompt = result.iter().find(|p| p.file_name == "example.md").unwrap();
        assert_eq!(md_prompt.title, "example");

        let markdown_prompt = result
            .iter()
            .find(|p| p.file_name == "example.markdown")
            .unwrap();
        assert_eq!(markdown_prompt.title, "example");

        let nested_prompt = result
            .iter()
            .find(|p| p.file_name == "nested.markdown")
            .unwrap();
        assert_eq!(nested_prompt.title, "nested");
    }

    #[test]
    fn test_extension_case_insensitive_matching() {
        // Extension check is case-insensitive — .MD, .MARKDOWN, .TXT are all matched
        let dir = TempDir::new().unwrap();
        create_test_file(dir.path(), "prompt.md", "# Lowercase");
        let mut file_upper_md = fs::File::create(dir.path().join("UPPERCASE.MD")).unwrap();
        file_upper_md
            .write_all(b"# Uppercase MD extension")
            .unwrap();
        let mut file_upper_markdown = fs::File::create(dir.path().join("NOTES.MARKDOWN")).unwrap();
        file_upper_markdown
            .write_all(b"# Uppercase MARKDOWN extension")
            .unwrap();
        let mut file_upper_txt = fs::File::create(dir.path().join("README.TXT")).unwrap();
        file_upper_txt
            .write_all(b"# Uppercase TXT extension")
            .unwrap();

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 4, "All case variations should be matched");
        let names: Vec<&str> = result.iter().map(|p| p.file_name.as_str()).collect();
        assert!(names.contains(&"prompt.md"));
        assert!(names.contains(&"UPPERCASE.MD"));
        assert!(names.contains(&"NOTES.MARKDOWN"));
        assert!(names.contains(&"README.TXT"));
    }

    #[test]
    fn test_unreadable_file_in_readable_dir_no_crash() {
        // Verify that a readable directory with one problematic file
        // does not cause a crash. The problematic file may be skipped
        // (Unix: unreadable) or scanned (Windows: read-only is still readable).
        let dir = TempDir::new().unwrap();
        create_test_file(dir.path(), "good.md", "# Good prompt");

        let bad_path = dir.path().join("bad.md");
        {
            let mut f = fs::File::create(&bad_path).unwrap();
            f.write_all(b"# Problematic").unwrap();
        }

        // Make the file unreadable (Unix) or read-only (Windows)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&bad_path).unwrap().permissions();
            perms.set_mode(0o000); // No permissions — file becomes unreadable
            fs::set_permissions(&bad_path, perms).unwrap();
        }
        #[cfg(not(unix))]
        {
            // Windows: read-only files are still readable, so the scanner
            // will return both files. This verifies no crash, not a count.
            let mut perms = fs::metadata(&bad_path).unwrap().permissions();
            perms.set_readonly(true);
            fs::set_permissions(&bad_path, perms).unwrap();
        }

        let result = scan_directory(dir.path().to_str().unwrap());
        // The scan must complete without Err (no crash)
        assert!(result.is_ok(), "Scan should not crash on problematic files");
        let prompts = result.unwrap();

        // Good file should always be scanned
        assert!(
            prompts.iter().any(|p| p.file_name == "good.md"),
            "Good file should always be scanned"
        );

        // On Unix, unreadable file is skipped (1 prompt).
        // On Windows, read-only file is still readable (2 prompts).
        #[cfg(unix)]
        {
            assert_eq!(prompts.len(), 1, "Unix: unreadable file should be skipped");
        }
        #[cfg(not(unix))]
        {
            assert_eq!(
                prompts.len(),
                2,
                "Windows: read-only file is still readable"
            );
        }

        // Restore permissions for cleanup
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&bad_path).unwrap().permissions();
            perms.set_mode(0o644);
            let _ = fs::set_permissions(&bad_path, perms);
        }
    }

    #[test]
    fn test_large_folder_robustness() {
        // Verify that scanning 500+ .md files completes without error
        let dir = TempDir::new().unwrap();

        for i in 0..550 {
            let name = format!("prompt_{:04}.md", i);
            let content = format!("# Prompt {}\n\nContent for prompt {}", i, i);
            create_test_file(dir.path(), &name, &content);
        }
        // Also add some unsupported files to filter
        for i in 0..50 {
            let name = format!("notes_{:04}.tmp", i);
            let mut file = fs::File::create(dir.path().join(&name)).unwrap();
            file.write_all(b"Not a prompt").unwrap();
        }

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(
            result.len(),
            550,
            "All 550 .md files should be scanned, unsupported files ignored"
        );

        // Verify sorting: prompts should be sorted by file_path
        let sorted: Vec<&str> = result.iter().map(|p| p.file_name.as_str()).collect();
        let mut expected: Vec<String> = (0..550).map(|i| format!("prompt_{:04}.md", i)).collect();
        expected.sort();
        assert_eq!(
            sorted,
            expected.iter().map(|s| s.as_str()).collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_unc_like_path_handled() {
        // UNC paths (\\server\share\folder) should work on Windows.
        // On non-Windows, UNC-like paths behave as regular paths.
        let dir = TempDir::new().unwrap();
        create_test_file(dir.path(), "prompt.md", "# UNC Test");

        // Use the temp dir path directly — UNC handling is verified
        // by the dunce::canonicalize integration which normalizes paths
        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].file_name, "prompt.md");

        // Verify the stored path does NOT contain verbatim prefix (\\?\)
        let path = &result[0].file_path;
        assert!(
            !path.starts_with(r"\\?\"),
            "Path should not contain verbatim \\\\?\\ prefix: {}",
            path
        );
    }

    #[test]
    fn test_hidden_and_temp_files_ignored() {
        // Hidden files (starting with .) and temp files (~*) should be
        // passed through WalkDir but filtered by the extension check
        let dir = TempDir::new().unwrap();

        // Hidden .md file — has .md extension, should be scanned
        create_test_file(dir.path(), ".hidden.md", "# Hidden but md");
        // Temp file with unsupported extension — should be ignored
        let mut tmp = fs::File::create(dir.path().join("temp~file.tmp")).unwrap();
        tmp.write_all(b"Not a prompt").unwrap();
        // Backup file without .md extension
        let mut bak = fs::File::create(dir.path().join("prompt.md.bak")).unwrap();
        bak.write_all(b"Backup").unwrap();
        // Regular .md file
        create_test_file(dir.path(), "visible.md", "# Visible");

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(
            result.len(),
            2,
            "Only files ending with .md should be scanned"
        );
        let names: Vec<&str> = result.iter().map(|p| p.file_name.as_str()).collect();
        assert!(
            names.contains(&".hidden.md"),
            "Hidden .md files should be scanned"
        );
        assert!(names.contains(&"visible.md"));
    }

    #[test]
    fn test_offline_mount_error_message() {
        // Simulates an offline NAS mount: the directory doesn't exist
        let result = scan_directory("/mnt/offline-nas-mount");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("existiert nicht"),
            "Expected 'existiert nicht' error for offline mount, got: {}",
            err
        );
    }

    #[test]
    fn test_empty_folder_returns_empty_vec() {
        let dir = TempDir::new().unwrap();
        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert!(
            result.is_empty(),
            "Empty folder should return empty Vec, not error"
        );
    }

    // =========================================================================
    // .txt support tests (Issue #167)
    // =========================================================================

    #[test]
    fn test_scans_txt_prompt_file() {
        let dir = TempDir::new().unwrap();
        create_test_file(
            dir.path(),
            "prompt.txt",
            "# A Text Prompt\n\nThis is content.",
        );
        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].file_name, "prompt.txt");
        assert_eq!(result[0].title, "prompt");
        assert!(result[0].content.contains("# A Text Prompt"));
    }

    #[test]
    fn test_scans_uppercase_txt_extension() {
        let dir = TempDir::new().unwrap();
        let mut file = fs::File::create(dir.path().join("UPPERCASE.TXT")).unwrap();
        file.write_all(b"# Uppercase TXT extension test\n\nContent.")
            .unwrap();
        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].file_name, "UPPERCASE.TXT");
        assert_eq!(result[0].title, "UPPERCASE");
    }

    #[test]
    fn test_scans_mixed_markdown_and_txt_folder() {
        let dir = TempDir::new().unwrap();
        create_test_file(dir.path(), "prompt.md", "# MD Prompt");
        create_test_file(dir.path(), "notes.markdown", "# Markdown Notes");
        create_test_file(dir.path(), "instructions.txt", "# TXT Instructions");
        let mut file = fs::File::create(dir.path().join("README.TXT")).unwrap();
        file.write_all(b"# README").unwrap();

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(
            result.len(),
            4,
            "All .md, .markdown, .txt, .TXT should be scanned"
        );
        let names: Vec<&str> = result.iter().map(|p| p.file_name.as_str()).collect();
        assert!(names.contains(&"prompt.md"));
        assert!(names.contains(&"notes.markdown"));
        assert!(names.contains(&"instructions.txt"));
        assert!(names.contains(&"README.TXT"));
    }

    #[test]
    fn test_empty_txt_consistent_with_empty_md() {
        // Empty .txt and .md files are both scanned (treated consistently).
        // The scanner does not filter by file size — both produce PromptItems
        // with empty content.
        let dir = TempDir::new().unwrap();
        create_test_file(dir.path(), "empty.txt", "");
        create_test_file(dir.path(), "empty.md", "");
        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(
            result.len(),
            2,
            "Both empty .txt and .md should be included"
        );
        let names: Vec<&str> = result.iter().map(|p| p.file_name.as_str()).collect();
        assert!(names.contains(&"empty.txt"));
        assert!(names.contains(&"empty.md"));
        // Both have empty content
        for prompt in &result {
            assert!(
                prompt.content.is_empty(),
                "Empty file '{}' should have empty content",
                prompt.file_name
            );
        }
    }

    // =========================================================================
    // File-size limit tests (Issue #171)
    // =========================================================================

    #[test]
    fn test_skips_large_md_file() {
        // Large .md files exceeding MAX_PROMPT_FILE_SIZE_BYTES are skipped
        // with a warning log — no crash, no content read.
        let dir = TempDir::new().unwrap();
        let large_content = "x".repeat(MAX_PROMPT_FILE_SIZE_BYTES as usize + 100);
        create_test_file(dir.path(), "large.md", &large_content);
        // Normal file alongside to verify scan still works
        create_test_file(dir.path(), "normal.md", "# Small prompt");
        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1, "Large .md should be skipped");
        assert_eq!(result[0].file_name, "normal.md");
    }

    #[test]
    fn test_skips_large_markdown_file() {
        // Large .markdown files are skipped — same limit as .md and .txt.
        let dir = TempDir::new().unwrap();
        let large_content = "x".repeat(MAX_PROMPT_FILE_SIZE_BYTES as usize + 100);
        create_test_file(dir.path(), "large.markdown", &large_content);
        create_test_file(dir.path(), "normal.markdown", "# Small markdown");
        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1, "Large .markdown should be skipped");
        assert_eq!(result[0].file_name, "normal.markdown");
    }

    #[test]
    fn test_skips_large_txt_file() {
        // Large .txt files are skipped — same limit as .md and .markdown.
        let dir = TempDir::new().unwrap();
        let large_content = "x".repeat(MAX_PROMPT_FILE_SIZE_BYTES as usize + 100);
        create_test_file(dir.path(), "large.txt", &large_content);
        create_test_file(dir.path(), "normal.txt", "# Small text");
        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1, "Large .txt should be skipped");
        assert_eq!(result[0].file_name, "normal.txt");
    }

    #[test]
    fn test_scans_file_at_size_limit() {
        // Files exactly at the limit are still scanned.
        let dir = TempDir::new().unwrap();
        let content = "x".repeat(MAX_PROMPT_FILE_SIZE_BYTES as usize);
        create_test_file(dir.path(), "at_limit.md", &content);
        create_test_file(dir.path(), "at_limit.txt", &content);
        create_test_file(dir.path(), "at_limit.markdown", &content);
        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 3, "All files at size limit should be scanned");
        let names: Vec<&str> = result.iter().map(|p| p.file_name.as_str()).collect();
        assert!(names.contains(&"at_limit.md"));
        assert!(names.contains(&"at_limit.txt"));
        assert!(names.contains(&"at_limit.markdown"));
    }

    #[test]
    fn test_large_unsupported_file_remains_unsupported() {
        // Large files with unsupported extensions must NOT be treated as
        // prompt files — they are ignored by extension filter, not by size.
        let dir = TempDir::new().unwrap();
        let large_content = "x".repeat(MAX_PROMPT_FILE_SIZE_BYTES as usize + 100);
        let mut f = fs::File::create(dir.path().join("large.gguf")).unwrap();
        f.write_all(large_content.as_bytes()).unwrap();
        create_test_file(dir.path(), "normal.md", "# Small prompt");
        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1, "Large unsupported files should be ignored");
        assert_eq!(result[0].file_name, "normal.md");
    }

    #[test]
    fn test_size_limit_does_not_change_empty_file_behavior() {
        // Empty (0-byte) supported files still appear in scan results.
        let dir = TempDir::new().unwrap();
        create_test_file(dir.path(), "empty.md", "");
        create_test_file(dir.path(), "empty.txt", "");
        create_test_file(dir.path(), "empty.markdown", "");
        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 3, "Empty files should still be scanned");
        let names: Vec<&str> = result.iter().map(|p| p.file_name.as_str()).collect();
        assert!(names.contains(&"empty.md"));
        assert!(names.contains(&"empty.txt"));
        assert!(names.contains(&"empty.markdown"));
    }

    #[test]
    fn test_title_fallback_strips_txt_extension() {
        // .txt and .TXT files without frontmatter title should derive the
        // title from the filename with extension stripped (case-insensitive).
        let dir = TempDir::new().unwrap();
        create_test_file(
            dir.path(),
            "lowercase.txt",
            "# No Frontmatter\n\nJust content.",
        );
        // Use different base names — Windows filesystem is case-insensitive
        let mut file = fs::File::create(dir.path().join("UPPERCASE.TXT")).unwrap();
        file.write_all(b"# Uppercase extension test").unwrap();

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 2);

        let prompt = result
            .iter()
            .find(|p| p.file_name == "lowercase.txt")
            .unwrap();
        assert_eq!(prompt.title, "lowercase", "lowercase .txt title fallback");

        let uppercase = result
            .iter()
            .find(|p| p.file_name == "UPPERCASE.TXT")
            .unwrap();
        assert_eq!(
            uppercase.title, "UPPERCASE",
            "uppercase .TXT title fallback"
        );
    }

    #[test]
    fn test_txt_does_not_break_existing_md_scan() {
        // Adding .txt support must not change existing .md scan behavior.
        let dir = TempDir::new().unwrap();
        let md_content = "---\ntitle: My MD Prompt\ncategory: rust\ntags:\n  - example\n---\n\n# MD Content\n\nHello world.";
        create_test_file(dir.path(), "existing.md", md_content);
        create_test_file(
            dir.path(),
            "new.txt",
            "# A TXT Prompt\n\nThis is text content.",
        );

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 2);

        // Verify .md behavior unchanged
        let md_prompt = result
            .iter()
            .find(|p| p.file_name == "existing.md")
            .unwrap();
        assert_eq!(md_prompt.title, "My MD Prompt");
        assert_eq!(md_prompt.category, "rust");
        assert_eq!(md_prompt.tags, vec!["example"]);
        assert!(!md_prompt.content.contains("---"));
        assert!(md_prompt.content.contains("# MD Content"));

        // Verify .txt is scanned correctly alongside
        let txt_prompt = result.iter().find(|p| p.file_name == "new.txt").unwrap();
        assert_eq!(txt_prompt.title, "new");
        assert!(txt_prompt.content.contains("# A TXT Prompt"));
        assert!(!txt_prompt.content.contains("---"));
    }

    #[test]
    fn test_txt_in_nested_subdirectory() {
        // .txt files in nested directories should be found via recursive scan.
        let dir = TempDir::new().unwrap();
        let sub = dir.path().join("nested").join("deep");
        fs::create_dir_all(&sub).unwrap();
        create_test_file(&sub, "deep_prompt.txt", "# Deep nested prompt");

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].file_name, "deep_prompt.txt");
        assert!(result[0].file_path.contains("nested"));
        assert!(result[0].file_path.contains("deep"));
    }

    // =========================================================================
    // Supported extension helper unit tests (Issue #169)
    // =========================================================================

    #[test]
    fn test_is_supported_prompt_extension_accepts_expected_cases() {
        // All supported lower/upper/mixed-case extensions should be accepted.
        let dir = TempDir::new().unwrap();
        let cases = [
            ("prompt.md", true),
            ("PROMPT.MD", true),
            ("Prompt.Md", true),
            ("notes.markdown", true),
            ("NOTES.MARKDOWN", true),
            ("Notes.Markdown", true),
            ("instructions.txt", true),
            ("INSTRUCTIONS.TXT", true),
            ("Instructions.Txt", true),
        ];
        for (name, expected) in &cases {
            let path = dir.path().join(name);
            // Create the file so extension() can resolve
            let mut f = fs::File::create(&path).unwrap();
            f.write_all(b"test").unwrap();
            assert_eq!(
                is_supported_prompt_extension(&path),
                *expected,
                "Unexpected result for '{}'",
                name
            );
        }
    }

    #[test]
    fn test_is_supported_prompt_extension_rejects_unsupported_cases() {
        // Non-prompt extensions must be rejected.
        let dir = TempDir::new().unwrap();
        let cases = [
            "notes.pdf",
            "document.docx",
            "image.png",
            "data.tmp",
            "archive.zip",
            "model.gguf",
            "script.py",
            "config.json",
            "readme",
            "backup.md.bak",
        ];
        for name in &cases {
            let path = dir.path().join(name);
            let mut f = fs::File::create(&path).unwrap();
            f.write_all(b"test").unwrap();
            assert!(
                !is_supported_prompt_extension(&path),
                "Extension for '{}' should be rejected",
                name
            );
        }
    }

    #[test]
    fn test_txt_with_yaml_frontmatter() {
        // .txt files with YAML frontmatter should parse metadata correctly.
        let dir = TempDir::new().unwrap();
        let content = "---\ntitle: My TXT Prompt\ncategory: writing\nversion: \"3.0\"\ntags:\n  - prose\n  - creative\ndescription: A text prompt with frontmatter\ncreated: 2026-01-15\nupdated: 2026-06-01\n---\n\n# Prompt Content\n\nThis is the body.";
        create_test_file(dir.path(), "creative.txt", content);

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "My TXT Prompt");
        assert_eq!(result[0].category, "writing");
        assert_eq!(result[0].version, "3.0");
        assert_eq!(result[0].tags, vec!["prose", "creative"]);
        assert_eq!(result[0].description, "A text prompt with frontmatter");
        assert_eq!(result[0].file_name, "creative.txt");
        assert!(!result[0].content.contains("---"));
        assert!(result[0].content.contains("# Prompt Content"));
    }

    #[test]
    fn test_multi_dot_txt_title_fallback() {
        // Multi-dot filenames like my.prompt.v1.txt should only strip
        // the last extension segment for the title fallback.
        let dir = TempDir::new().unwrap();
        // No frontmatter — title falls back to filename minus extension
        create_test_file(dir.path(), "my.prompt.v1.txt", "# Multi-dot test");
        create_test_file(dir.path(), "config.v2.md", "# MD multi-dot test");
        create_test_file(
            dir.path(),
            "template.final.markdown",
            "# Markdown multi-dot test",
        );

        let result = scan_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 3);

        let txt = result
            .iter()
            .find(|p| p.file_name == "my.prompt.v1.txt")
            .unwrap();
        assert_eq!(
            txt.title, "my.prompt.v1",
            "Multi-dot .txt: only last extension should be stripped"
        );

        let md = result
            .iter()
            .find(|p| p.file_name == "config.v2.md")
            .unwrap();
        assert_eq!(
            md.title, "config.v2",
            "Multi-dot .md: only last extension should be stripped"
        );

        let markdown = result
            .iter()
            .find(|p| p.file_name == "template.final.markdown")
            .unwrap();
        assert_eq!(
            markdown.title, "template.final",
            "Multi-dot .markdown: only last extension should be stripped"
        );
    }
}
