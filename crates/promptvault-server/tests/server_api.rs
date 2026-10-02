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
    std::fs::write(
        vault.path().join("demo.md"),
        "---\ntitle: Demo\n---\n\n# Rolle\nTester.",
    )
    .unwrap();
    let state = state_with(true);
    // scan directly via the service (path from THIS tempdir)
    let app = build_router(state.clone());
    let body = serde_json::json!({ "path": vault.path().to_str().unwrap() }).to_string();
    let (status, json) = call(app, "POST", "/api/scan", Some(body)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(json.as_array().map(|a| !a.is_empty()).unwrap_or(false));
    assert_eq!(state.prompts.lock().unwrap().len(), 1);
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
