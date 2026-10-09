//! Server-Integrationstestharness (issue #112 / D3) + API-Tests (E1–E5).
//!
//! Nutzt `tower::ServiceExt::oneshot` auf dem vollen Router — kein echter
//! Netzwerk-Bind nötig, deterministisch und parallelisierbar.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

use promptvault_server::{build_router, AppState};

use promptvault_core::database::Database;
use promptvault_core::models::PromptItem;

fn make_prompt(id: &str, title: &str, content: &str, vault: &str) -> PromptItem {
    PromptItem {
        id: id.to_string(),
        file_path: format!("{vault}/{id}.md"),
        file_name: format!("{id}.md"),
        title: title.to_string(),
        description: String::new(),
        category: "tasks".to_string(),
        version: "1.0".to_string(),
        tags: vec![],
        content: content.to_string(),
        raw_frontmatter: serde_json::json!({}),
        created_at: "2026-01-01T00:00:00Z".to_string(),
        updated_at: "2026-01-01T00:00:00Z".to_string(),
        is_favorite: false,
    }
}

fn state_with(config_read_only: bool) -> AppState {
    let dir = tempfile::tempdir().unwrap();
    let cfg = promptvault_server::load_config(&|k: &str| match k {
        "PROMPTVAULT_SERVER_VAULT" => Ok(dir.path().to_str().unwrap().to_string()),
        "PROMPTVAULT_SERVER_READ_ONLY" if !config_read_only => Ok("0".to_string()),
        _ => Err(std::env::VarError::NotPresent),
    })
    .expect("config");
    let db = Database::new_in_memory().expect("db");
    AppState::new(cfg, db)
}

/// State whose configured vault is `vault` and whose scan-authorization policy
/// is explicit: `None` = default (only the vault), `Some("*")` = unrestricted,
/// `Some(list)` = those roots.
fn state_for_vault(vault: &std::path::Path, scan_roots: Option<&str>) -> AppState {
    let cfg = promptvault_server::load_config(&|k: &str| match k {
        "PROMPTVAULT_SERVER_VAULT" => Ok(vault.to_str().unwrap().to_string()),
        "PROMPTVAULT_SERVER_SCAN_ROOTS" => match scan_roots {
            Some(v) => Ok(v.to_string()),
            None => Err(std::env::VarError::NotPresent),
        },
        _ => Err(std::env::VarError::NotPresent),
    })
    .expect("config");
    let db = Database::new_in_memory().expect("db");
    AppState::new(cfg, db)
}

/// Write a minimal scannable prompt into `dir`.
fn write_prompt(dir: &std::path::Path, name: &str) {
    std::fs::write(
        dir.join(name),
        "---\ntitle: Fixture\n---\n\n# Rolle\nTester.",
    )
    .unwrap();
}

async fn call(
    app: axum::Router,
    method: &str,
    uri: &str,
    body: Option<String>,
) -> (StatusCode, serde_json::Value) {
    let builder = Request::builder().method(method).uri(uri);
    let req = match body {
        Some(b) => builder
            .header("content-type", "application/json")
            .body(Body::from(b))
            .unwrap(),
        None => builder.body(Body::empty()).unwrap(),
    };
    let resp = app.oneshot(req).await.expect("response");
    let status = resp.status();
    let bytes = resp.into_body().collect().await.expect("body").to_bytes();
    let json = if bytes.is_empty() {
        serde_json::Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null)
    };
    (status, json)
}

fn state_with_prompts(read_only: bool) -> (AppState, tempfile::TempDir) {
    let state = state_with(read_only);
    let vault = tempfile::tempdir().unwrap();
    let p = make_prompt(
        "p1",
        "Erster Prompt",
        "# Rolle\nTester.\n\n# Ziel\nPrüfen.",
        vault.path().to_str().unwrap(),
    );
    *state.prompts.lock().unwrap() = vec![p];
    (state, vault)
}

// --- E1 (#113) ---------------------------------------------------------------

#[tokio::test]
async fn health_reports_status_version_and_read_only() {
    let app = build_router(state_with(true));
    let (status, json) = call(app, "GET", "/api/health", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["status"], "ok");
    assert_eq!(json["read_only"], true);
    assert!(json["version"].is_string());
}

// --- E2 (#114) ---------------------------------------------------------------

#[tokio::test]
async fn scan_rejects_relative_paths() {
    let app = build_router(state_with(true));
    let (status, json) = call(
        app,
        "POST",
        "/api/scan",
        Some(r#"{ "path": "relative/path" }"#.to_string()),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(json["error"]["code"], "bad_request");
}

#[tokio::test]
async fn scan_rejects_path_traversal() {
    let app = build_router(state_with(true));
    let (status, json) = call(
        app,
        "POST",
        "/api/scan",
        Some(r#"{ "path": "/tmp/../../etc" }"#.to_string()),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(json["error"]["message"].as_str().unwrap().contains("'..'"));
}

#[tokio::test]
async fn scan_accepts_real_directory_and_fills_cache() {
    let vault = tempfile::tempdir().unwrap();
    write_prompt(vault.path(), "demo.md");
    // The vault is the default scan root, so scanning it needs no extra config.
    let state = state_for_vault(vault.path(), None);
    let app = build_router(state.clone());
    let body = serde_json::json!({ "path": vault.path().to_str().unwrap() }).to_string();
    let (status, json) = call(app, "POST", "/api/scan", Some(body)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(json.as_array().map(|a| !a.is_empty()).unwrap_or(false));
    assert_eq!(state.prompts.lock().unwrap().len(), 1);
}

// --- J1 (#132) / v1.13.2: authorized-root selection --------------------------
//
// Path *traversal* (malformed `..`) is a different problem from *authorized
// root selection* (a well-formed path outside the allowed roots). The first is
// 400, the second 403. These tests pin both, plus the opt-in that restores the
// pre-1.13.2 unrestricted behaviour.

#[tokio::test]
async fn scan_allows_a_subdirectory_of_an_allowed_root() {
    let root = tempfile::tempdir().unwrap();
    let sub = root.path().join("category");
    std::fs::create_dir(&sub).unwrap();
    write_prompt(&sub, "nested.md");

    let state = state_for_vault(root.path(), None);
    let app = build_router(state.clone());
    let body = serde_json::json!({ "path": sub.to_str().unwrap() }).to_string();
    let (status, json) = call(app, "POST", "/api/scan", Some(body)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json.as_array().map(|a| a.len()).unwrap_or(0), 1);
}

#[tokio::test]
async fn scan_denies_a_sibling_directory_of_the_root() {
    // `/tmp/x` and `/tmp/x-other` share a textual prefix but no path component:
    // containment must be component-wise, not a string prefix.
    let root = tempfile::tempdir().unwrap();
    let sibling = tempfile::tempdir().unwrap();
    write_prompt(sibling.path(), "outside.md");

    let state = state_for_vault(root.path(), None);
    let app = build_router(state.clone());
    let body = serde_json::json!({ "path": sibling.path().to_str().unwrap() }).to_string();
    let (status, json) = call(app, "POST", "/api/scan", Some(body)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(json["error"]["code"], "forbidden");
    // The denied scan must not populate the cache.
    assert!(state.prompts.lock().unwrap().is_empty());
}

#[tokio::test]
async fn scan_denies_the_parent_of_the_root() {
    let root = tempfile::tempdir().unwrap();
    let parent = root.path().parent().unwrap();
    let state = state_for_vault(root.path(), None);
    let app = build_router(state.clone());
    let body = serde_json::json!({ "path": parent.to_str().unwrap() }).to_string();
    let (status, _) = call(app, "POST", "/api/scan", Some(body)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn scan_denies_a_symlink_that_escapes_the_root() {
    // A symlink placed inside the root but pointing outside it: the request
    // path looks harmless, the canonical path is not.
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    write_prompt(outside.path(), "secret.md");

    let link = root.path().join("escape");
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path(), &link).unwrap();
    #[cfg(not(unix))]
    if std::os::windows::fs::symlink_dir(outside.path(), &link).is_err() {
        return; // no symlink privilege on this machine: skip
    }

    let state = state_for_vault(root.path(), None);
    let app = build_router(state.clone());
    let body = serde_json::json!({ "path": link.to_str().unwrap() }).to_string();
    let (status, _) = call(app, "POST", "/api/scan", Some(body)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn scan_supports_multiple_allowed_roots() {
    let vault = tempfile::tempdir().unwrap();
    let extra = tempfile::tempdir().unwrap();
    let forbidden = tempfile::tempdir().unwrap();
    write_prompt(extra.path(), "extra.md");
    write_prompt(forbidden.path(), "no.md");

    let roots = std::env::join_paths([vault.path(), extra.path()])
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let state = state_for_vault(vault.path(), Some(&roots));
    let app = build_router(state.clone());
    let body = serde_json::json!({ "path": extra.path().to_str().unwrap() }).to_string();
    let (status, json) = call(app, "POST", "/api/scan", Some(body)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json.as_array().map(|a| a.len()).unwrap_or(0), 1);

    let app2 = build_router(state);
    let body = serde_json::json!({ "path": forbidden.path().to_str().unwrap() }).to_string();
    let (status, _) = call(app2, "POST", "/api/scan", Some(body)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn scan_unrestricted_mode_accepts_any_readable_directory() {
    // Explicit operator opt-in (`*`): the pre-1.13.2 behaviour, for a trusted
    // host that intentionally scans arbitrary directories.
    let vault = tempfile::tempdir().unwrap();
    let anywhere = tempfile::tempdir().unwrap();
    write_prompt(anywhere.path(), "anywhere.md");

    let state = state_for_vault(vault.path(), Some("*"));
    let app = build_router(state.clone());
    let body = serde_json::json!({ "path": anywhere.path().to_str().unwrap() }).to_string();
    let (status, json) = call(app, "POST", "/api/scan", Some(body)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json.as_array().map(|a| a.len()).unwrap_or(0), 1);
}

#[tokio::test]
async fn scan_malformed_path_is_bad_request_not_forbidden() {
    // Shape problems stay 400 — they must not be folded into the permission
    // error, or a traversal fix would silently "cover" the root problem.
    let vault = tempfile::tempdir().unwrap();
    let app = build_router(state_for_vault(vault.path(), None));
    for body in [r#"{ "path": "" }"#, r#"{ "path": "relative/dir" }"#] {
        let (status, _) = call(app.clone(), "POST", "/api/scan", Some(body.to_string())).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "for body {body}");
    }
}

#[tokio::test]
async fn scan_denies_arbitrary_absolute_path_by_default() {
    // Container/bare-metal default: only the configured vault is scannable.
    let vault = tempfile::tempdir().unwrap();
    let elsewhere = tempfile::tempdir().unwrap();
    let state = state_for_vault(vault.path(), None);
    let app = build_router(state);
    let body = serde_json::json!({ "path": elsewhere.path().to_str().unwrap() }).to_string();
    let (status, json) = call(app, "POST", "/api/scan", Some(body)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(json["error"]["code"], "forbidden");
}

// --- E3 (#115) ---------------------------------------------------------------

#[tokio::test]
async fn get_prompt_returns_cached_item_or_404() {
    let (state, _vault) = state_with_prompts(true);
    let app = build_router(state.clone());
    let (status, json) = call(app.clone(), "GET", "/api/prompts/p1", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["id"], "p1");
    let (status, _) = call(app, "GET", "/api/prompts/missing", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn analyze_runs_deterministic_core_analysis() {
    let (state, _vault) = state_with_prompts(true);
    let app = build_router(state);
    let (status, json) = call(app, "POST", "/api/prompts/p1/analyze", None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(json["evaluation"]["overall_score"].is_number());
    assert_eq!(json["hygiene"]["prompt_id"], "p1");
}

// --- E4 (#116) ---------------------------------------------------------------

#[tokio::test]
async fn context_projection_returns_structural_signals() {
    let (state, _vault) = state_with_prompts(true);
    let app = build_router(state);
    let (status, json) = call(app, "GET", "/api/prompts/p1/context", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["prompt_id"], "p1");
    assert!(json["missing_sections"].is_array());
}

#[tokio::test]
async fn favorites_write_is_fail_closed_in_read_only_mode() {
    let (state, _vault) = state_with_prompts(true);
    let app = build_router(state);
    let (status, json) = call(app, "POST", "/api/favorites/p1/toggle", None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(json["error"]["code"], "forbidden");
}

#[tokio::test]
async fn favorites_toggle_works_in_write_mode() {
    let (state, _vault) = state_with_prompts(false);
    // DB muss den Prompt kennen (Save), sonst toggle → "not found"
    {
        let db = state.db.lock().unwrap();
        let prompts = state.prompts.lock().unwrap().clone();
        db.save_prompts(&prompts).unwrap();
    }
    let app = build_router(state);
    let (status, json) = call(app, "POST", "/api/favorites/p1/toggle", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["is_favorite"], true);
}

#[tokio::test]
async fn favorites_list_returns_favorited_prompts() {
    let (state, _vault) = state_with_prompts(false);
    {
        let db = state.db.lock().unwrap();
        let prompts = state.prompts.lock().unwrap().clone();
        db.save_prompts(&prompts).unwrap();
        db.toggle_favorite("p1").unwrap();
    }
    let app = build_router(state);
    let (status, json) = call(app, "GET", "/api/favorites", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json.as_array().unwrap().len(), 1);
}

// --- E5 (#117) ---------------------------------------------------------------

#[tokio::test]
async fn evidence_read_returns_real_hygiene_artifacts() {
    // J1-nahe Verstärkung: das Fixture enthält ein bekanntes Artefakt
    // (Dateipfad-Referenz) — die Hygiene darf NICHT „perfekt" melden.
    let (state, _vault) = state_with_prompts(true);
    {
        let mut prompts = state.prompts.lock().unwrap();
        prompts[0].content = "# Rolle\nTester.\n\nLog: /var/log/app/error.log\n".to_string();
    }
    let app = build_router(state);
    let (status, json) = call(app, "GET", "/api/evidence/p1", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["prompt_id"], "p1");
    assert!(json["hygiene_score"].is_number());
    assert!(
        json["hygiene_score"].as_i64().unwrap() < 100,
        "bekanntes Artefakt muss den Hygiene-Score senken (Argument-Reihenfolge-Regression)"
    );
    assert!(!json["artifacts"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn export_is_fail_closed_in_read_only_mode() {
    let (state, _vault) = state_with_prompts(true);
    let app = build_router(state);
    let (status, _) = call(
        app.clone(),
        "POST",
        "/api/export",
        Some(r#"{"format":"json"}"#.to_string()),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn export_json_and_markdown_in_write_mode() {
    let (state, _vault) = state_with_prompts(false);
    let app = build_router(state);
    let (status, json) = call(
        app.clone(),
        "POST",
        "/api/export",
        Some(r#"{"format":"json"}"#.to_string()),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["format"], "json");
    assert_eq!(json["count"], 1);
    let (status, json) = call(
        app.clone(),
        "POST",
        "/api/export",
        Some(r#"{"format":"markdown"}"#.to_string()),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(json["content"]
        .as_str()
        .unwrap()
        .contains("# Erster Prompt"));
    let (status, _) = call(
        app,
        "POST",
        "/api/export",
        Some(r#"{"format":"zip"}"#.to_string()),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// --- Fallback ----------------------------------------------------------------

#[tokio::test]
async fn unknown_api_route_is_404() {
    let app = build_router(state_with(true));
    let (status, _) = call(app, "GET", "/api/nonsense", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// --- J1 (#132): Symlink-Escape — kanonischer Pfad wird aufgelöst -------------

#[tokio::test]
async fn scan_resolves_symlinked_vault_without_escape() {
    // Realer Vault + Symlink darauf: der Scan folgt dem kanonischen Pfad
    // (kein Verlassen durch client-kontrollierte Segmente möglich, da '..'
    // und relative Pfade hart abgelehnt werden).
    //
    // Der Symlink liegt AUSSERHALB der Wurzel, zeigt aber AUF sie. Er muss
    // akzeptiert werden: die Autorisation entscheidet auf dem kanonischen
    // Pfad, nicht auf der Textform des Requests.
    let vault = tempfile::tempdir().unwrap();
    std::fs::write(vault.path().join("link-fixture.md"), "# Rolle\nTest.").unwrap();
    let link_dir = tempfile::tempdir().unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(vault.path(), link_dir.path().join("link")).unwrap();
    #[cfg(not(unix))]
    if std::os::windows::fs::symlink_dir(vault.path(), link_dir.path().join("link")).is_err() {
        return;
    }
    let linked = link_dir.path().join("link");

    let state = state_for_vault(vault.path(), None);
    let app = build_router(state.clone());
    let body = serde_json::json!({ "path": linked.to_str().unwrap() }).to_string();
    let (status, json) = call(app, "POST", "/api/scan", Some(body)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(json.as_array().map(|a| !a.is_empty()).unwrap_or(false));
    // Kanonischer Pfad ist der reale Vault (kein Escape in fremde Verzeichnisse)
    let cached = state.prompts.lock().unwrap().clone();
    let canonical_vault = dunce::canonicalize(vault.path()).unwrap();
    assert!(cached
        .iter()
        .all(|p| std::path::Path::new(&p.file_path).starts_with(&canonical_vault)));
}

#[tokio::test]
async fn scan_allows_dotdot_prefixed_names_but_rejects_dotdot_segments() {
    // "..hidden" ist KEIN Traversal-Segment — nur exakte ".."-Segmente sind verboten
    let vault = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(vault.path().join("..hidden")).unwrap();
    std::fs::write(
        vault.path().join("..hidden").join("fixture.md"),
        "# Rolle\nTest.",
    )
    .unwrap();

    // Positivfall: ..hidden/ ist ein gültiges Verzeichnis und wird gescannt
    let state = state_for_vault(vault.path(), None);
    let app = build_router(state);
    let body =
        serde_json::json!({ "path": format!("{}/..hidden", vault.path().to_str().unwrap()) })
            .to_string();
    let (status, json) = call(app, "POST", "/api/scan", Some(body)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(json.as_array().map(|a| !a.is_empty()).unwrap_or(false));

    // Negativfall: echtes ".."-Segment bleibt verboten
    let app2 = build_router(state_for_vault(vault.path(), None));
    let body =
        serde_json::json!({ "path": format!("{}/..", vault.path().to_str().unwrap()) }).to_string();
    let (status, _) = call(app2, "POST", "/api/scan", Some(body)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}
