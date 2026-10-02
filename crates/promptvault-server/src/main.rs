//! promptvault-server — HTTP entry point for Web/LAN mode (epic #97).

use promptvault_server::{build_router, load_config, AppState};

fn main() {
    env_logger::init();
    let cfg = match load_config(&|k| std::env::var(k)) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("promptvault-server: {e}");
            std::process::exit(2);
        }
    };
    log::info!(
        "PromptVault Server: bind={} vault={} read_only={}",
        cfg.bind_addr(),
        cfg.vault_path.display(),
        cfg.read_only
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
            .with_graceful_shutdown(async {
                let _ = tokio::signal::ctrl_c().await;
                log::info!("Shutdown-Signal empfangen");
            })
            .await
            .expect("Server-Lauf");
    });
}
