use std::io::Write;
use std::path::{Component, Path};

use crate::commands::AppState;
use crate::models::{PromptEvaluation, PromptHygiene, PromptItem};
use tauri::Emitter;

// =============================================================================
// export_json
// =============================================================================

/// Baut den JSON-Export-String aus Prompt-Daten und Analyse-Scores.
/// Kernlogik — ohne Datei-I/O für Testbarkeit.
pub fn build_json_export_string(
    selected: &[PromptItem],
    eval_map: &std::collections::HashMap<&str, &PromptEvaluation>,
    hygiene_map: &std::collections::HashMap<&str, &PromptHygiene>,
) -> String {
    #[derive(serde::Serialize)]
    struct ExportEntry {
        #[serde(flatten)]
        prompt: PromptItem,
        #[serde(skip_serializing_if = "Option::is_none")]
        quality_score: Option<u8>,
        #[serde(skip_serializing_if = "Option::is_none")]
        hygiene_score: Option<u8>,
    }

    #[derive(serde::Serialize)]
    struct ExportDocument {
        export_date: String,
        version: String,
        prompts: Vec<ExportEntry>,
    }

    let entries: Vec<ExportEntry> = selected
        .iter()
        .map(|p| ExportEntry {
            prompt: p.clone(),
            quality_score: eval_map.get(p.id.as_str()).map(|e| e.overall_score),
            hygiene_score: hygiene_map.get(p.id.as_str()).map(|h| h.hygiene_score),
        })
        .collect();

    let doc = ExportDocument {
        export_date: chrono::Utc::now().to_rfc3339(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        prompts: entries,
    };

    serde_json::to_string_pretty(&doc).unwrap_or_else(|_| "{}".to_string())
}

/// Exportiert ausgewählte Prompts als JSON-Datei.
///
/// Erzeugt eine Datei `promptvault-export.json` im angegebenen Verzeichnis.
/// Die JSON-Struktur enthält ein Export-Datum, die Version und alle
/// Prompt-Daten inklusive optionaler Analyse-Scores.
#[tauri::command]
pub fn export_json(
    prompt_ids: Vec<String>,
    export_path: String,
    evaluations: Vec<PromptEvaluation>,
    hygiene: Vec<PromptHygiene>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    // Validierung: leere Liste
    if prompt_ids.is_empty() {
        return Err("Keine Prompts zum Exportieren ausgewählt".into());
    }

    // Zielverzeichnis prüfen und canonicalisieren (Path-Traversal-Schutz)
    let export_dir = Path::new(&export_path);
    if !export_dir.exists() {
        return Err(format!("Export-Pfad existiert nicht: {}", export_path));
    }
    if !export_dir.is_dir() {
        return Err(format!("Export-Pfad ist kein Verzeichnis: {}", export_path));
    }
    let export_dir = export_dir
        .canonicalize()
        .map_err(|e| format!("Ungültiger Pfad: {}", e))?;

    // Lookup-Maps für Analyse-Scores aufbauen
    let eval_map: std::collections::HashMap<&str, &PromptEvaluation> = evaluations
        .iter()
        .map(|e| (e.prompt_id.as_str(), e))
        .collect();
    let hygiene_map: std::collections::HashMap<&str, &PromptHygiene> =
        hygiene.iter().map(|h| (h.prompt_id.as_str(), h)).collect();

    // Prompts aus State laden
    let prompts = state
        .prompts
        .lock()
        .map_err(|e| format!("Lock-Fehler: {}", e))?;

    let total = prompt_ids.len();
    let mut selected: Vec<PromptItem> = Vec::with_capacity(total);

    for (i, pid) in prompt_ids.iter().enumerate() {
        match prompts.iter().find(|p| p.id == *pid) {
            Some(prompt) => {
                selected.push(prompt.clone());
            }
            None => {
                log::warn!("Prompt mit ID {} nicht gefunden, wird übersprungen", pid);
            }
        }
        // Fortschritt melden
        let _ = app_handle.emit(
            "export:progress",
            serde_json::json!({
                "current": i + 1,
                "total": total,
                "format": "json"
            }),
        );
    }

    if selected.is_empty() {
        return Err("Keine gültigen Prompts zum Exportieren gefunden".into());
    }

    let json_str = build_json_export_string(&selected, &eval_map, &hygiene_map);

    // Datei schreiben
    let file_path = export_dir.join("promptvault-export.json");
    std::fs::write(&file_path, json_str)
        .map_err(|e| format!("Fehler beim Erstellen der Exportdatei: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

// =============================================================================
// export_markdown
// =============================================================================

/// Baut den Markdown-Export-String aus Prompt-Daten und Analyse-Scores.
/// Kernlogik — ohne Datei-I/O für Testbarkeit.
pub fn build_markdown_export_string(
    selected: &[PromptItem],
    eval_map: &std::collections::HashMap<&str, &PromptEvaluation>,
    hygiene_map: &std::collections::HashMap<&str, &PromptHygiene>,
) -> String {
    let mut output = String::new();

    for (i, prompt) in selected.iter().enumerate() {
        // YAML-Frontmatter aus PromptItem-Feldern aufbauen
        let tags_yaml: String = if prompt.tags.is_empty() {
            "[]".to_string()
        } else {
            serde_json::to_string(&prompt.tags).unwrap_or_else(|_| "[]".to_string())
        };

        let escaped_title = escape_yaml_value(&prompt.title);
        let escaped_desc = escape_yaml_value(&prompt.description);
        let escaped_cat = escape_yaml_value(&prompt.category);
        let escaped_version = escape_yaml_value(&prompt.version);

        // Analyse-Scores aus Lookup-Maps holen (als Kommentar im YAML)
        let quality_str = eval_map
            .get(prompt.id.as_str())
            .map(|e| e.overall_score.to_string())
            .unwrap_or_else(|| "—".to_string());
        let hygiene_str = hygiene_map
            .get(prompt.id.as_str())
            .map(|h| h.hygiene_score.to_string())
            .unwrap_or_else(|| "—".to_string());

        let frontmatter = format!(
            "---\n\
             title: \"{}\"\n\
             description: \"{}\"\n\
             category: \"{}\"\n\
             version: \"{}\"\n\
             tags: {}\n\
             created_at: \"{}\"\n\
             updated_at: \"{}\"\n\
             # quality_score: {}\n\
             # hygiene_score: {}\n\
             ---\n\
             \n\
             {}",
            escaped_title,
            escaped_desc,
            escaped_cat,
            escaped_version,
            tags_yaml,
            prompt.created_at,
            prompt.updated_at,
            quality_str,
            hygiene_str,
            prompt.content,
        );

        if i > 0 {
            output.push_str("\n---\n\n");
        }
        output.push_str(&frontmatter);
    }

    output
}

/// Exportiert ausgewählte Prompts als einzelne Markdown-Datei.
///
/// Jeder Prompt wird als `---`-getrennter Block mit YAML-Frontmatter und
/// vollständigem Prompt-Inhalt exportiert. Analyse-Scores werden als
/// Kommentare im Frontmatter vermerkt.
#[tauri::command]
pub fn export_markdown(
    prompt_ids: Vec<String>,
    export_path: String,
    evaluations: Vec<PromptEvaluation>,
    hygiene: Vec<PromptHygiene>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    // Validierung: leere Liste
    if prompt_ids.is_empty() {
        return Err("Keine Prompts zum Exportieren ausgewählt".into());
    }

    // Zielverzeichnis prüfen und canonicalisieren (Path-Traversal-Schutz)
    let export_dir = Path::new(&export_path);
    if !export_dir.exists() {
        return Err(format!("Export-Pfad existiert nicht: {}", export_path));
    }
    if !export_dir.is_dir() {
        return Err(format!("Export-Pfad ist kein Verzeichnis: {}", export_path));
    }
    let export_dir = export_dir
        .canonicalize()
        .map_err(|e| format!("Ungültiger Pfad: {}", e))?;

    // Lookup-Maps für Analyse-Scores aufbauen
    let eval_map: std::collections::HashMap<&str, &PromptEvaluation> = evaluations
        .iter()
        .map(|e| (e.prompt_id.as_str(), e))
        .collect();
    let hygiene_map: std::collections::HashMap<&str, &PromptHygiene> =
        hygiene.iter().map(|h| (h.prompt_id.as_str(), h)).collect();

    // Prompts aus State laden
    let prompts = state
        .prompts
        .lock()
        .map_err(|e| format!("Lock-Fehler: {}", e))?;

    let total = prompt_ids.len();
    let mut selected: Vec<PromptItem> = Vec::with_capacity(total);

    for (i, pid) in prompt_ids.iter().enumerate() {
        match prompts.iter().find(|p| p.id == *pid) {
            Some(prompt) => {
                selected.push(prompt.clone());
            }
            None => {
                log::warn!("Prompt mit ID {} nicht gefunden, wird übersprungen", pid);
            }
        }
        // Fortschritt melden
        let _ = app_handle.emit(
            "export:progress",
            serde_json::json!({
                "current": i + 1,
                "total": total,
                "format": "markdown"
            }),
        );
    }

    if selected.is_empty() {
        return Err("Keine gültigen Prompts zum Exportieren gefunden".into());
    }

    let output = build_markdown_export_string(&selected, &eval_map, &hygiene_map);

    // Datei schreiben
    let file_path = export_dir.join("promptvault-export.md");
    std::fs::write(&file_path, output)
        .map_err(|e| format!("Fehler beim Schreiben der Exportdatei: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

// =============================================================================
// export_zip
// =============================================================================

/// Baut die ZIP-Inhaltsdaten aus Prompt-Daten und Analyse-Scores.
/// Gibt die rekonstruierten .md-Dateien, metadata.json und index.json als Vec<(filename, content)> zurück.
/// Kernlogik — ohne Datei-I/O für Testbarkeit.
fn build_zip_export_data(
    selected: &[PromptItem],
    eval_map: &std::collections::HashMap<&str, &PromptEvaluation>,
    hygiene_map: &std::collections::HashMap<&str, &PromptHygiene>,
) -> (Vec<(String, String)>, String, String) {
    // Hilfsfunktion: sicheres Ableiten des ZIP-Pfads
    let derive_zip_path = |file_path: &str| -> String {
        let path = Path::new(file_path);
        let components: Vec<&str> = path
            .components()
            .filter_map(|c| match c {
                Component::Normal(os_str) => os_str.to_str(),
                Component::Prefix(_)
                | Component::RootDir
                | Component::CurDir
                | Component::ParentDir => None,
            })
            .collect();

        if components.is_empty() {
            path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown.md")
                .replace("..", "_")
        } else {
            components
                .iter()
                .map(|c| c.replace("..", "_"))
                .collect::<Vec<_>>()
                .join("/")
        }
    };

    // Rekonstruiere original .md-Dateien und baue Index
    let mut files: Vec<(String, String)> = Vec::new();
    let mut index_map = serde_json::Map::new();

    for prompt in selected {
        let zip_rel_path = derive_zip_path(&prompt.file_path);
        let md_content = reconstruct_markdown_file(prompt);
        files.push((zip_rel_path.clone(), md_content));
        index_map.insert(prompt.id.clone(), serde_json::Value::String(zip_rel_path));
    }

    // metadata.json bauen
    #[derive(serde::Serialize)]
    struct MetadataEntry {
        #[serde(flatten)]
        prompt: PromptItem,
        #[serde(skip_serializing_if = "Option::is_none")]
        quality_score: Option<u8>,
        #[serde(skip_serializing_if = "Option::is_none")]
        hygiene_score: Option<u8>,
    }

    #[derive(serde::Serialize)]
    struct MetadataDoc {
        prompts: Vec<MetadataEntry>,
    }

    let metadata_entries: Vec<MetadataEntry> = selected
        .iter()
        .map(|p| MetadataEntry {
            prompt: p.clone(),
            quality_score: eval_map.get(p.id.as_str()).map(|e| e.overall_score),
            hygiene_score: hygiene_map.get(p.id.as_str()).map(|h| h.hygiene_score),
        })
        .collect();

    let metadata_doc = MetadataDoc {
        prompts: metadata_entries,
    };
    let metadata_json =
        serde_json::to_string_pretty(&metadata_doc).unwrap_or_else(|_| "{}".to_string());

    let index_json = serde_json::to_string_pretty(&serde_json::Value::Object(index_map))
        .unwrap_or_else(|_| "{}".to_string());

    (files, metadata_json, index_json)
}

/// Exportiert ausgewählte Prompts als ZIP-Archiv.
///
/// Das Archiv enthält:
/// - Die originalen Markdown-Dateien (rekonstruiert aus Frontmatter + Inhalt)
/// - Eine `metadata.json` mit allen Prompt-Daten plus Analyse-Scores
/// - Eine `index.json` mit Prompt-ID → Dateipfad-Mapping
#[tauri::command]
pub fn export_zip(
    prompt_ids: Vec<String>,
    export_path: String,
    evaluations: Vec<PromptEvaluation>,
    hygiene: Vec<PromptHygiene>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    // Validierung: leere Liste
    if prompt_ids.is_empty() {
        return Err("Keine Prompts zum Exportieren ausgewählt".into());
    }

    // Zielverzeichnis prüfen und canonicalisieren (Path-Traversal-Schutz)
    let export_dir = Path::new(&export_path);
    if !export_dir.exists() {
        return Err(format!("Export-Pfad existiert nicht: {}", export_path));
    }
    if !export_dir.is_dir() {
        return Err(format!("Export-Pfad ist kein Verzeichnis: {}", export_path));
    }
    let export_dir = export_dir
        .canonicalize()
        .map_err(|e| format!("Ungültiger Pfad: {}", e))?;

    // Lookup-Maps für Analyse-Scores aufbauen
    let eval_map: std::collections::HashMap<&str, &PromptEvaluation> = evaluations
        .iter()
        .map(|e| (e.prompt_id.as_str(), e))
        .collect();
    let hygiene_map: std::collections::HashMap<&str, &PromptHygiene> =
        hygiene.iter().map(|h| (h.prompt_id.as_str(), h)).collect();

    // Prompts aus State laden
    let prompts = state
        .prompts
        .lock()
        .map_err(|e| format!("Lock-Fehler: {}", e))?;

    let total = prompt_ids.len();
    let mut selected: Vec<PromptItem> = Vec::with_capacity(total);

    for (i, pid) in prompt_ids.iter().enumerate() {
        match prompts.iter().find(|p| p.id == *pid) {
            Some(prompt) => {
                selected.push(prompt.clone());
            }
            None => {
                log::warn!("Prompt mit ID {} nicht gefunden, wird übersprungen", pid);
            }
        }
        let _ = app_handle.emit(
            "export:progress",
            serde_json::json!({
                "current": i + 1,
                "total": total,
                "format": "zip"
            }),
        );
    }

    if selected.is_empty() {
        return Err("Keine gültigen Prompts zum Exportieren gefunden".into());
    }

    let (files, metadata_json, index_json) =
        build_zip_export_data(&selected, &eval_map, &hygiene_map);

    // ZIP-Datei erstellen
    let zip_path = export_dir.join("promptvault-export.zip");
    let file = std::fs::File::create(&zip_path)
        .map_err(|e| format!("Fehler beim Erstellen der ZIP-Datei: {}", e))?;

    let mut zip = zip::ZipWriter::new(file);
    let options =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for (rel_path, content) in &files {
        zip.start_file(rel_path.as_str(), options)
            .map_err(|e| format!("Fehler beim Erstellen des ZIP-Eintrags: {}", e))?;
        zip.write_all(content.as_bytes())
            .map_err(|e| format!("Fehler beim Schreiben in ZIP: {}", e))?;
    }

    zip.start_file("metadata.json", options)
        .map_err(|e| format!("Fehler beim Erstellen des ZIP-Eintrags: {}", e))?;
    zip.write_all(metadata_json.as_bytes())
        .map_err(|e| format!("Fehler beim Schreiben in ZIP: {}", e))?;

    zip.start_file("index.json", options)
        .map_err(|e| format!("Fehler beim Erstellen des ZIP-Eintrags: {}", e))?;
    zip.write_all(index_json.as_bytes())
        .map_err(|e| format!("Fehler beim Schreiben in ZIP: {}", e))?;

    zip.finish()
        .map_err(|e| format!("Fehler beim Abschließen der ZIP-Datei: {}", e))?;

    Ok(zip_path.to_string_lossy().to_string())
}

// =============================================================================
// Hilfsfunktionen
// =============================================================================

/// Rekonstruiert eine Markdown-Datei aus einem PromptItem
/// (Frontmatter + Content), wie sie ursprünglich eingelesen wurde.
fn reconstruct_markdown_file(prompt: &PromptItem) -> String {
    let frontmatter = build_frontmatter_block(&prompt.raw_frontmatter);
    if frontmatter.is_empty() {
        prompt.content.clone()
    } else {
        format!("---\n{}---\n\n{}", frontmatter, prompt.content)
    }
}

/// Baut YAML-Frontmatter aus rohem serde_json::Value.
fn build_frontmatter_block(raw: &serde_json::Value) -> String {
    if raw.is_null() {
        return String::new();
    }
    if let Some(obj) = raw.as_object() {
        if obj.is_empty() {
            return String::new();
        }
    }
    // Nutze serde_yaml zur Serialisierung
    serde_yaml::to_string(raw).unwrap_or_default()
}

/// Escaped Sonderzeichen in einem YAML-Wert.
/// Einfache Implementierung: ersetzt Backslashes und Anführungszeichen.
fn escape_yaml_value(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{HygieneStatus, PromptEvaluation, PromptHygiene, PromptItem};
    use std::collections::HashMap;

    // --- Test-Helfer ---

    fn make_prompt(id: &str, title: &str, content: &str) -> PromptItem {
        PromptItem {
            id: id.to_string(),
            file_path: format!("/test/{}.md", id),
            file_name: format!("{}.md", id),
            title: title.to_string(),
            description: format!("Description for {}", id),
            category: "testing".to_string(),
            version: "1.0".to_string(),
            tags: vec!["test".to_string(), "export".to_string()],
            content: content.to_string(),
            raw_frontmatter: serde_json::json!({"title": title}),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-06-01T00:00:00Z".to_string(),
            is_favorite: false,
        }
    }

    fn make_eval(prompt_id: &str, score: u8) -> PromptEvaluation {
        PromptEvaluation {
            id: format!("eval-{}", prompt_id),
            prompt_id: prompt_id.to_string(),
            overall_score: score,
            criteria: vec![],
            missing_sections: vec![],
            recommendations: vec![],
            evaluated_at: "2026-06-01T00:00:00Z".to_string(),
            backend_span: None,
        }
    }

    fn make_hygiene(prompt_id: &str, score: u8) -> PromptHygiene {
        PromptHygiene {
            id: format!("hyg-{}", prompt_id),
            prompt_id: prompt_id.to_string(),
            hygiene_score: score,
            status: HygieneStatus::Clean,
            artifacts: vec![],
            analyzed_at: "2026-06-01T00:00:00Z".to_string(),
            backend_span: None,
        }
    }

    fn build_maps<'a>(
        evals: &'a [PromptEvaluation],
        hygiene: &'a [PromptHygiene],
    ) -> (
        HashMap<&'a str, &'a PromptEvaluation>,
        HashMap<&'a str, &'a PromptHygiene>,
    ) {
        let eval_map: HashMap<&str, &PromptEvaluation> =
            evals.iter().map(|e| (e.prompt_id.as_str(), e)).collect();
        let hygiene_map: HashMap<&str, &PromptHygiene> =
            hygiene.iter().map(|h| (h.prompt_id.as_str(), h)).collect();
        (eval_map, hygiene_map)
    }

    // ==================================================================
    // export_json Tests
    // ==================================================================

    #[test]
    fn test_json_export_basic_structure() {
        let p1 = make_prompt("p1", "Alpha Prompt", "# Alpha\n\nContent here.");
        let p2 = make_prompt("p2", "Beta Prompt", "# Beta\n\nMore content.");
        let evals = vec![make_eval("p1", 85), make_eval("p2", 60)];
        let hyg = vec![make_hygiene("p1", 100), make_hygiene("p2", 75)];
        let (eval_map, hygiene_map) = build_maps(&evals, &hyg);

        let selected = vec![p1.clone(), p2.clone()];
        let json_str = build_json_export_string(&selected, &eval_map, &hygiene_map);

        let doc: serde_json::Value =
            serde_json::from_str(&json_str).expect("sollte valides JSON sein");

        assert!(doc.get("export_date").is_some(), "export_date fehlt");
        let version = doc
            .get("version")
            .expect("version fehlt")
            .as_str()
            .expect("version kein String");
        assert!(!version.is_empty(), "version sollte nicht leer sein");

        let prompts = doc
            .get("prompts")
            .expect("prompts array fehlt")
            .as_array()
            .expect("prompts sollte ein Array sein");
        assert_eq!(prompts.len(), 2);

        // p1 hat Scores
        let entry0 = &prompts[0];
        assert_eq!(
            entry0.get("title").unwrap().as_str().unwrap(),
            "Alpha Prompt"
        );
        assert_eq!(entry0.get("quality_score").unwrap().as_u64().unwrap(), 85);
        assert_eq!(entry0.get("hygiene_score").unwrap().as_u64().unwrap(), 100);

        // p2 hat Scores
        let entry1 = &prompts[1];
        assert_eq!(
            entry1.get("title").unwrap().as_str().unwrap(),
            "Beta Prompt"
        );
        assert_eq!(entry1.get("quality_score").unwrap().as_u64().unwrap(), 60);
        assert_eq!(entry1.get("hygiene_score").unwrap().as_u64().unwrap(), 75);
    }

    #[test]
    fn test_json_export_missing_scores() {
        let p1 = make_prompt("px", "No Scores", "# No scores here.");
        let selected = vec![p1];
        let eval_map: HashMap<&str, &PromptEvaluation> = HashMap::new();
        let hygiene_map: HashMap<&str, &PromptHygiene> = HashMap::new();

        let json_str = build_json_export_string(&selected, &eval_map, &hygiene_map);
        let doc: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        let prompts = doc.get("prompts").unwrap().as_array().unwrap();
        let entry = &prompts[0];

        // quality_score und hygiene_score sollten fehlen (skip_serializing_if)
        assert!(entry.get("quality_score").is_none());
        assert!(entry.get("hygiene_score").is_none());
    }

    #[test]
    fn test_json_export_empty_prompt_list_is_valid() {
        let selected: Vec<PromptItem> = vec![];
        let eval_map: HashMap<&str, &PromptEvaluation> = HashMap::new();
        let hygiene_map: HashMap<&str, &PromptHygiene> = HashMap::new();

        let json_str = build_json_export_string(&selected, &eval_map, &hygiene_map);
        let doc: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        let prompts = doc.get("prompts").unwrap().as_array().unwrap();
        assert!(prompts.is_empty());
    }

    // ==================================================================
    // export_markdown Tests
    // ==================================================================

    #[test]
    fn test_markdown_export_frontmatter_blocks() {
        let p1 = make_prompt("m1", "Markdown One", "# Hello\n\nWorld.");
        let p2 = make_prompt("m2", "Markdown Two", "# Goodbye\n\nMoon.");
        let evals = vec![make_eval("m1", 90), make_eval("m2", 40)];
        let hyg = vec![make_hygiene("m1", 95), make_hygiene("m2", 50)];
        let (eval_map, hygiene_map) = build_maps(&evals, &hyg);

        let selected = vec![p1, p2];
        let md = build_markdown_export_string(&selected, &eval_map, &hygiene_map);

        // Jeder Promptstart beginnt mit ---
        assert!(
            md.starts_with("---"),
            "sollte mit YAML-Frontmatter beginnen"
        );

        // Enthält Frontmatter-Felder
        assert!(md.contains("title: \"Markdown One\""));
        assert!(md.contains("title: \"Markdown Two\""));
        assert!(md.contains("category: \"testing\""));
        assert!(md.contains("tags: [\"test\",\"export\"]"));

        // Enthält Score-Kommentare
        assert!(md.contains("# quality_score: 90"));
        assert!(md.contains("# hygiene_score: 95"));
        assert!(md.contains("# quality_score: 40"));

        // Trennung zwischen Prompts
        assert!(
            md.contains("\n---\n\n---"),
            "Prompts sollten durch --- getrennt sein"
        );

        // Content ist vorhanden
        assert!(md.contains("# Hello"));
        assert!(md.contains("# Goodbye"));
    }

    #[test]
    fn test_markdown_export_single_prompt_no_trailing_separator() {
        let p1 = make_prompt("single", "Single", "# Solo.");
        let (eval_map, hygiene_map) = build_maps(&[], &[]);

        let selected = vec![p1];
        let md = build_markdown_export_string(&selected, &eval_map, &hygiene_map);

        // Ein Prompt → kein vorangestelltes "\n---\n\n"
        assert!(md.starts_with("---"));
        // Sollte nur einen Frontmatter-Block haben (2x "---" insgesamt)
        let separator_count = md.matches("---").count();
        assert_eq!(
            separator_count, 2,
            "nur 2 --- (Anfang + Ende des Frontmatter)"
        );
    }

    #[test]
    fn test_markdown_export_missing_scores_shows_emdash() {
        let p1 = make_prompt("noscores", "No Scores", "# None.");
        let eval_map: HashMap<&str, &PromptEvaluation> = HashMap::new();
        let hygiene_map: HashMap<&str, &PromptHygiene> = HashMap::new();

        let selected = vec![p1];
        let md = build_markdown_export_string(&selected, &eval_map, &hygiene_map);

        assert!(md.contains("# quality_score: —"));
        assert!(md.contains("# hygiene_score: —"));
    }

    // ==================================================================
    // export_zip Tests
    // ==================================================================

    #[test]
    fn test_zip_export_file_list() {
        let p1 = make_prompt("z1", "Zip Alpha", "# Alpha content.");
        let p2 = make_prompt("z2", "Zip Beta", "# Beta content.");
        let evals = vec![make_eval("z1", 88), make_eval("z2", 33)];
        let hyg = vec![make_hygiene("z1", 100), make_hygiene("z2", 60)];
        let (eval_map, hygiene_map) = build_maps(&evals, &hyg);

        let selected = vec![p1, p2];
        let (files, metadata_json, index_json) =
            build_zip_export_data(&selected, &eval_map, &hygiene_map);

        // 2 .md Dateien rekonstruiert
        assert_eq!(files.len(), 2);

        // Dateien enthalten Frontmatter + Content
        for (path, content) in &files {
            assert!(
                path.ends_with(".md"),
                "Jede Datei sollte .md Endung haben: {}",
                path
            );
            assert!(
                !content.is_empty(),
                "Rekonstruierte .md sollte nicht leer sein"
            );
        }

        // metadata.json enthält beide Prompts
        let metadata: serde_json::Value =
            serde_json::from_str(&metadata_json).expect("metadata.json sollte valides JSON sein");
        let prompts = metadata.get("prompts").unwrap().as_array().unwrap();
        assert_eq!(prompts.len(), 2);

        // Scores sind in metadata enthalten
        assert_eq!(
            prompts[0].get("quality_score").unwrap().as_u64().unwrap(),
            88
        );
        assert_eq!(
            prompts[1].get("hygiene_score").unwrap().as_u64().unwrap(),
            60
        );

        // index.json enthält Prompt-ID → Pfad Mapping
        let index: serde_json::Value =
            serde_json::from_str(&index_json).expect("index.json sollte valides JSON sein");
        let idx_obj = index.as_object().expect("index sollte ein Object sein");
        assert_eq!(idx_obj.len(), 2);
        assert!(idx_obj.contains_key("z1"));
        assert!(idx_obj.contains_key("z2"));
    }

    #[test]
    fn test_zip_export_empty_prompts() {
        let selected: Vec<PromptItem> = vec![];
        let eval_map: HashMap<&str, &PromptEvaluation> = HashMap::new();
        let hygiene_map: HashMap<&str, &PromptHygiene> = HashMap::new();

        let (files, metadata_json, index_json) =
            build_zip_export_data(&selected, &eval_map, &hygiene_map);

        assert!(files.is_empty());

        let metadata: serde_json::Value = serde_json::from_str(&metadata_json).unwrap();
        let prompts = metadata.get("prompts").unwrap().as_array().unwrap();
        assert!(prompts.is_empty());

        let index: serde_json::Value = serde_json::from_str(&index_json).unwrap();
        assert!(index.as_object().unwrap().is_empty());
    }

    #[test]
    fn test_zip_export_md_content_has_frontmatter() {
        let p1 = PromptItem {
            id: "fm-test".to_string(),
            file_path: "/vault/my-prompt.md".to_string(),
            file_name: "my-prompt.md".to_string(),
            title: "Frontmatter Test".to_string(),
            description: "Checks frontmatter in zip".to_string(),
            category: "testing".to_string(),
            version: "2.0".to_string(),
            tags: vec!["zip".to_string()],
            content: "Prompt body here.".to_string(),
            raw_frontmatter: serde_json::json!({
                "title": "Frontmatter Test",
                "version": "2.0",
            }),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            is_favorite: false,
        };
        let eval_map: HashMap<&str, &PromptEvaluation> = HashMap::new();
        let hygiene_map: HashMap<&str, &PromptHygiene> = HashMap::new();

        let selected = vec![p1];
        let (files, _metadata, _index) = build_zip_export_data(&selected, &eval_map, &hygiene_map);

        assert_eq!(files.len(), 1);
        let (path, content) = &files[0];
        assert_eq!(path, "vault/my-prompt.md", "ZIP-pfad sollte relativ sein");
        assert!(
            content.starts_with("---"),
            "rekonstruierte .md sollte mit --- beginnen"
        );
        assert!(
            content.contains("Prompt body here."),
            "Prompt-Body sollte im rekonstruierten Inhalt sein"
        );
    }
}
