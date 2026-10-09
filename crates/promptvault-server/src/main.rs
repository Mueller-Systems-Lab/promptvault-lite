//! promptvault-server — HTTP entry point for Web/LAN mode (epic #97).

use promptvault_server::{build_router, load_config, AppState};

/// Resolve when the process is asked to stop.
///
/// SIGTERM must be handled as well as SIGINT: container runtimes send SIGTERM
/// first and force-kill after the grace period, so ctrl_c alone turns every
/// `docker stop` into a hard kill instead of a graceful shutdown.
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        match signal(SignalKind::terminate()) {
            Ok(mut sigterm) => {
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => {}
                    _ = sigterm.recv() => {}
                }
            }
            Err(_) => {
                let _ = tokio::signal::ctrl_c().await;
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
    log::info!("Shutdown-Signal empfangen");
}

fn main() {
    // Default to `info` so operators see startup/shutdown in `docker logs`.
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    let cfg = match load_config(&|k| std::env::var(k)) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("promptvault-server: {e}");
            std::process::exit(2);
        }
    };
    log::info!(
        "PromptVault Server: bind={} vault={} read_only={} scan_roots={}",
        cfg.bind_addr(),
        cfg.vault_path.display(),
        cfg.read_only,
        if cfg.allow_unrestricted_scan {
            "* (uneingeschränkt — vertrauenswürdiger Host)".to_string()
        } else {
            cfg.scan_roots
                .iter()
                .map(|r| r.display().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        }
    );

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Tokio-Runtime");
    runtime.block_on(async move {
        let db = promptvault_core::database::Database::new(
            AppState::default_db_path().to_str().expect("DB-Pfad"),
        )
        .expect("SQLite-Datenbank");
        let state = AppState::new(cfg.clone(), db);
        let listener = tokio::net::TcpListener::bind(cfg.bind_addr())
            .await
            .expect("Bind-Adresse");
        log::info!("Listening on {}", cfg.bind_addr());
        let app = build_router(state);
        axum::serve(listener, app)
            .with_graceful_shutdown(shutdown_signal())
            .await
            .expect("Server-Lauf");
        log::info!("Server beendet");
    });
}
