//! promptvault-server — HTTP entry point for Web/LAN mode (epic #97).
//!
//! PR scope note (issue #100/A3 + #110/D1): this change delivers the binary
//! crate with fail-closed configuration. The HTTP endpoints (D2/E1–E5) follow
//! in the next change; the binary reports its configuration and exits with a
//! clear error when the configuration is invalid.

mod config;

use config::ServerConfig;

fn main() {
    env_logger::init();
    match load() {
        Ok(cfg) => {
            log::info!(
                "PromptVault Server konfiguriert: bind={} vault={} read_only={}",
                cfg.bind_addr(),
                cfg.vault_path.display(),
                cfg.read_only
            );
            // D2/E1–E5 (HTTP-Stack) folgen im nächsten Change; bis dahin
            // beendet sich der Binärteil nach validierter Konfiguration.
            println!(
                "promptvault-server: Konfiguration gültig (bind={}, read_only={})",
                cfg.bind_addr(),
                cfg.read_only
            );
        }
        Err(e) => {
            log::error!("{e}");
            eprintln!("promptvault-server: {e}");
            std::process::exit(2);
        }
    }
}

fn load() -> Result<ServerConfig, config::ConfigError> {
    config::load_config(&|k| std::env::var(k))
}
