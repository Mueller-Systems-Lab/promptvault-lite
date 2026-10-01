//! Server configuration (issue #110 / D1).
//!
//! Loaded from environment variables with fail-closed validation:
//! - `PROMPTVAULT_SERVER_HOST` — bind address (default `127.0.0.1`; LAN
//!   exposure requires an explicit override, never default-public)
//! - `PROMPTVAULT_SERVER_PORT` — TCP port (default `8080`)
//! - `PROMPTVAULT_SERVER_VAULT` — absolute path of the prompt vault directory
//!   (required; the server refuses to start without it)
//! - `PROMPTVAULT_SERVER_READ_ONLY` — `1`/`true` enforces read-only mode
//!   (**default: read-only**; write endpoints are disabled unless explicitly
//!   opted out, and even then only after the approval work in the security
//!   issues J1–J5)
//!
//! No credentials are ever read from the environment or stored.

use std::net::IpAddr;
use std::path::{Path, PathBuf};

/// Validated server configuration.
#[derive(Debug, Clone, PartialEq)]
pub struct ServerConfig {
    pub host: IpAddr,
    pub port: u16,
    pub vault_path: PathBuf,
    pub read_only: bool,
}

impl ServerConfig {
    /// Bind socket address derived from host + port.
    pub fn bind_addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

#[derive(Debug, Clone)]
pub struct ConfigError {
    pub field: &'static str,
    pub reason: String,
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "config error [{}]: {}", self.field, self.reason)
    }
}

/// Load and validate configuration from an environment-like source
/// (injectable for tests; the binary passes `std::env::var`).
pub fn load_config(
    get: &dyn Fn(&str) -> Result<String, std::env::VarError>,
) -> Result<ServerConfig, ConfigError> {
    let host = match get("PROMPTVAULT_SERVER_HOST") {
        Ok(v) if !v.trim().is_empty() => v.parse::<IpAddr>().map_err(|e| ConfigError {
            field: "PROMPTVAULT_SERVER_HOST",
            reason: format!("ungültige IP-Adresse: {e}"),
        })?,
        _ => "127.0.0.1".parse().expect("statischer Standardwert"),
    };
    let port = match get("PROMPTVAULT_SERVER_PORT") {
        Ok(v) if !v.trim().is_empty() => v.parse::<u16>().map_err(|e| ConfigError {
            field: "PROMPTVAULT_SERVER_PORT",
            reason: format!("ungültiger Port: {e}"),
        })?,
        _ => 8080,
    };
    let vault_raw = get("PROMPTVAULT_SERVER_VAULT").map_err(|_| ConfigError {
        field: "PROMPTVAULT_SERVER_VAULT",
        reason: "Pflichtvariable fehlt — der Server startet ohne Vault-Pfad nicht (fail-closed)"
            .to_string(),
    })?;
    let vault_path = PathBuf::from(vault_raw.trim());
    validate_vault_path(&vault_path).map_err(|reason| ConfigError {
        field: "PROMPTVAULT_SERVER_VAULT",
        reason,
    })?;
    let read_only = match get("PROMPTVAULT_SERVER_READ_ONLY") {
        Ok(v) => !matches!(v.trim(), "0" | "false" | "FALSE" | "False"),
        Err(_) => true,
    };
    Ok(ServerConfig {
        host,
        port,
        vault_path,
        read_only,
    })
}

/// Fail-closed path validation: must exist, be a directory and be absolute
/// (relative paths would make the effective vault depend on the process CWD).
fn validate_vault_path(path: &Path) -> Result<(), String> {
    if !path.is_absolute() {
        return Err("Vault-Pfad muss absolut sein".to_string());
    }
    if !path.exists() {
        return Err("Vault-Pfad existiert nicht".to_string());
    }
    if !path.is_dir() {
        return Err("Vault-Pfad ist kein Verzeichnis".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn env_of(vars: &[(&str, &str)]) -> impl Fn(&str) -> Result<String, std::env::VarError> {
        let map: std::collections::HashMap<String, String> = vars
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        move |k: &str| map.get(k).cloned().ok_or(std::env::VarError::NotPresent)
    }

    #[test]
    fn defaults_are_loopback_and_read_only() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = load_config(&env_of(&[(
            "PROMPTVAULT_SERVER_VAULT",
            dir.path().to_str().unwrap(),
        )]))
        .unwrap();
        assert_eq!(cfg.host, "127.0.0.1".parse::<IpAddr>().unwrap());
        assert_eq!(cfg.port, 8080);
        assert!(cfg.read_only, "read-only ist der Default");
        assert_eq!(cfg.bind_addr(), "127.0.0.1:8080");
    }

    #[test]
    fn missing_vault_is_fail_closed() {
        let err = load_config(&env_of(&[])).unwrap_err();
        assert_eq!(err.field, "PROMPTVAULT_SERVER_VAULT");
    }

    #[test]
    fn relative_vault_path_is_rejected() {
        let err =
            load_config(&env_of(&[("PROMPTVAULT_SERVER_VAULT", "relative/path")])).unwrap_err();
        assert!(err.reason.contains("absolut"));
    }

    #[test]
    fn nonexistent_vault_path_is_rejected() {
        let err = load_config(&env_of(&[(
            "PROMPTVAULT_SERVER_VAULT",
            "/definitiv/nicht/vorhanden/pfad",
        )]))
        .unwrap_err();
        assert!(err.reason.contains("existiert nicht"));
    }

    #[test]
    fn explicit_lan_bind_requires_opt_in() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = load_config(&env_of(&[
            ("PROMPTVAULT_SERVER_VAULT", dir.path().to_str().unwrap()),
            ("PROMPTVAULT_SERVER_HOST", "0.0.0.0"),
            ("PROMPTVAULT_SERVER_READ_ONLY", "0"),
        ]))
        .unwrap();
        assert_eq!(cfg.host, "0.0.0.0".parse::<IpAddr>().unwrap());
        assert!(!cfg.read_only);
    }

    #[test]
    fn vault_must_be_a_directory() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("datei.txt");
        fs::write(&file, "x").unwrap();
        let err = load_config(&env_of(&[(
            "PROMPTVAULT_SERVER_VAULT",
            file.to_str().unwrap(),
        )]))
        .unwrap_err();
        assert!(err.reason.contains("kein Verzeichnis"));
    }
}
