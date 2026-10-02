//! Bind-Regressionstests (Defekt aus dem finalen UI-Verifikationslauf:
//! das Binary validierte nur die Config und beendete sich, ohne zu servieren;
//! E1–E5 waren dadurch nicht erreichbar).

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use promptvault_core::database::Database;
use promptvault_server::{build_router, AppState};

fn temp_vault() -> PathBuf {
    let d = tempfile::tempdir().expect("tempdir");
    let p = d.path().to_path_buf();
    std::mem::forget(d); // Pfad muss für die Config-Validierung bestehen bleiben
    p
}

fn config_for(vault: &std::path::Path) -> promptvault_server::ServerConfig {
    promptvault_server::load_config(&|k: &str| match k {
        "PROMPTVAULT_SERVER_VAULT" => Ok(vault.to_str().unwrap().to_string()),
        _ => Err(std::env::VarError::NotPresent),
    })
    .expect("config")
}

fn raw_get(addr: std::net::SocketAddr, path: &str) -> (String, String) {
    let mut stream = TcpStream::connect(addr).expect("connect");
    stream
        .write_all(
            format!("GET {path} HTTP/1.1\r\nhost: localhost\r\nconnection: close\r\n\r\n")
                .as_bytes(),
        )
        .expect("write");
    let mut buf = String::new();
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .unwrap();
    stream.read_to_string(&mut buf).expect("read");
    let (head, body) = buf.split_once("\r\n\r\n").unwrap_or((buf.as_str(), ""));
    (head.to_string(), body.to_string())
}

/// Der volle Router antwortet auf einem echten Ephemeral-Bind.
#[tokio::test(flavor = "multi_thread")]
async fn router_binds_and_answers_health() {
    let vault = temp_vault();
    let cfg = config_for(&vault);
    let db = Database::new_in_memory().expect("db");
    let app = build_router(AppState::new(cfg, db));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind");
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, app).await.expect("serve") });

    // kurz warten, bis der Akzeptor steht
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut connected = false;
    while Instant::now() < deadline {
        if TcpStream::connect(addr).is_ok() {
            connected = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    assert!(connected, "Server hat nicht gebunden");

    let (head, body) = raw_get(addr, "/api/health");
    assert!(head.contains("200"), "health antwortete: {head}");
    assert!(
        body.contains("\"status\":\"ok\""),
        "status ok erwartet: {body}"
    );
    assert!(body.contains("\"read_only\":true"), "Read-only-Default");

    server.abort();
}

/// DER Defekt-Regressionstest: das kompilierte Binary selbst muss servieren
/// (vorher: Config-Validierung + sofortiges Ende, /api/health nie erreichbar).
#[test]
fn binary_serves_health_endpoint() {
    let vault = temp_vault();
    let bin = env!("CARGO_BIN_EXE_promptvault-server");
    let port = 18099; // fester Test-Port, kein Konflikt mit 8080
    let mut child = Command::new(bin)
        .env("PROMPTVAULT_SERVER_VAULT", &vault)
        .env("PROMPTVAULT_SERVER_HOST", "127.0.0.1")
        .env("PROMPTVAULT_SERVER_PORT", port.to_string())
        .env("PROMPTVAULT_SERVER_READ_ONLY", "1")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("binary starten");

    let addr = format!("127.0.0.1:{port}");
    let deadline = Instant::now() + Duration::from_secs(15);
    let mut head = String::new();
    let mut body = String::new();
    while Instant::now() < deadline {
        if let Ok(mut stream) = TcpStream::connect(addr.as_str()) {
            stream
                .write_all(
                    b"GET /api/health HTTP/1.1\r\nhost: localhost\r\nconnection: close\r\n\r\n",
                )
                .unwrap();
            let mut buf = String::new();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            if stream.read_to_string(&mut buf).is_ok() && !buf.is_empty() {
                let (h, b) = buf.split_once("\r\n\r\n").unwrap_or(("", buf.as_str()));
                head = h.to_string();
                body = b.to_string();
                break;
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    assert!(head.contains("200"), "health nicht erreichbar: {head}");
    assert!(body.contains("\"read_only\":true"), "body: {body}");
    assert!(body.contains("\"status\":\"ok\""), "body: {body}");
    let _ = child.kill();
    child.wait().expect("child aufräumen");
}
