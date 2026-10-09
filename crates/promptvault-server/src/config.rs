//! Server configuration (issue #110 / D1).
//!
//! Loaded from environment variables with fail-closed validation:
//! - `PROMPTVAULT_SERVER_HOST` — bind address (default `127.0.0.1`; LAN
//!   exposure requires an explicit override, never default-public)
//! - `PROMPTVAULT_SERVER_PORT` — TCP port (default `8080`)
//! - `PROMPTVAULT_SERVER_VAULT` — absolute path of the prompt vault directory
//!   (required; the server refuses to start without it)
//! - `PROMPTVAULT_SERVER_SCAN_ROOTS` — directories `POST /api/scan` may scan
//!   (**default: the configured vault**). Colon-separated absolute paths on
//!   Unix (`;` on Windows). The special value `*` disables the restriction and
//!   restores the pre-1.13.2 behaviour where a trusted-LAN client may scan any
//!   server-readable absolute path.
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
    /// Canonicalized directories a client may ask `POST /api/scan` to scan.
    /// Empty exactly when [`ServerConfig::allow_unrestricted_scan`] is set.
    pub scan_roots: Vec<PathBuf>,
    /// Explicit operator opt-in (`PROMPTVAULT_SERVER_SCAN_ROOTS=*`): any
    /// server-readable absolute directory may be scanned. This is the
    /// documented trusted-host escape hatch, never the default.
    pub allow_unrestricted_scan: bool,
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

    // Scan authorization policy. Default = least privilege: only the
    // configured vault. `*` is the explicit operator opt-in that restores
    // unrestricted scanning (documented trusted-LAN mode).
    let (scan_roots, allow_unrestricted_scan) = match get("PROMPTVAULT_SERVER_SCAN_ROOTS") {
        Ok(v) if v.trim() == "*" => (Vec::new(), true),
        Ok(v) if v.trim().is_empty() => (vec![canonical_root(&vault_path)?], false),
        Ok(v) => {
            let mut roots = Vec::new();
            // `split_paths` uses the platform's path-list separator (`:` on
            // Unix, `;` on Windows) — splitting on '/' would shred every
            // absolute path.
            for raw in std::env::split_paths(v.trim()) {
                if raw.as_os_str().is_empty() {
                    continue;
                }
                roots.push(canonical_root(&raw)?);
            }
            if roots.is_empty() {
                return Err(ConfigError {
                    field: "PROMPTVAULT_SERVER_SCAN_ROOTS",
                    reason: "keine gültigen Wurzeln — leer lassen (Default: Vault) oder '*' setzen"
                        .to_string(),
                });
            }
            (roots, false)
        }
        Err(_) => (vec![canonical_root(&vault_path)?], false),
    };

    Ok(ServerConfig {
        host,
        port,
        vault_path,
        read_only,
        scan_roots,
        allow_unrestricted_scan,
    })
}

/// Canonicalize a configured scan root. Fail-closed: a root that is not an
/// absolute, resolvable directory aborts server startup. Canonicalization is
/// required so containment is decided on resolved paths (a symlinked root must
/// still match a canonicalized request path).
fn canonical_root(path: &Path) -> Result<PathBuf, ConfigError> {
    if !path.is_absolute() {
        return Err(ConfigError {
            field: "PROMPTVAULT_SERVER_SCAN_ROOTS",
            reason: format!("Wurzel muss absolut sein: {}", path.display()),
        });
    }
    let canonical = dunce::canonicalize(path).map_err(|e| ConfigError {
        field: "PROMPTVAULT_SERVER_SCAN_ROOTS",
        reason: format!("Wurzel nicht auflösbar ({}): {}", path.display(), e),
    })?;
    if !canonical.is_dir() {
        return Err(ConfigError {
            field: "PROMPTVAULT_SERVER_SCAN_ROOTS",
            reason: format!("Wurzel ist kein Verzeichnis: {}", path.display()),
        });
    }
    Ok(canonical)
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

    // --- Scan-Autorisation (v1.13.2) -----------------------------------------

    #[test]
    fn scan_roots_default_to_the_vault() {
        // Least privilege: ohne explizite Konfiguration ist nur der Vault
        // scanbar — nicht das gesamte Server-Dateisystem.
        let dir = tempfile::tempdir().unwrap();
        let cfg = load_config(&env_of(&[(
            "PROMPTVAULT_SERVER_VAULT",
            dir.path().to_str().unwrap(),
        )]))
        .unwrap();
        assert!(!cfg.allow_unrestricted_scan);
        // Same canonicalizer as production (`canonical_root`): on Windows
        // `std::fs::canonicalize` keeps the `\\?\` verbatim prefix and the
        // assertions would differ from the server's own value.
        let expected = dunce::canonicalize(dir.path()).unwrap();
        assert_eq!(cfg.scan_roots, vec![expected]);
    }

    #[test]
    fn scan_roots_accept_an_explicit_list() {
        let vault = tempfile::tempdir().unwrap();
        let extra = tempfile::tempdir().unwrap();
        let roots = std::env::join_paths([vault.path(), extra.path()]).unwrap();
        let cfg = load_config(&env_of(&[
            ("PROMPTVAULT_SERVER_VAULT", vault.path().to_str().unwrap()),
            ("PROMPTVAULT_SERVER_SCAN_ROOTS", roots.to_str().unwrap()),
        ]))
        .unwrap();
        assert!(!cfg.allow_unrestricted_scan);
        assert_eq!(
            cfg.scan_roots,
            vec![
                dunce::canonicalize(vault.path()).unwrap(),
                dunce::canonicalize(extra.path()).unwrap()
            ]
        );
    }

    #[test]
    fn scan_roots_star_is_the_explicit_unrestricted_opt_in() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = load_config(&env_of(&[
            ("PROMPTVAULT_SERVER_VAULT", dir.path().to_str().unwrap()),
            ("PROMPTVAULT_SERVER_SCAN_ROOTS", "*"),
        ]))
        .unwrap();
        assert!(cfg.allow_unrestricted_scan);
        assert!(cfg.scan_roots.is_empty(), "'*' braucht keine Wurzeln");
    }

    #[test]
    fn scan_root_must_be_absolute() {
        let dir = tempfile::tempdir().unwrap();
        let err = load_config(&env_of(&[
            ("PROMPTVAULT_SERVER_VAULT", dir.path().to_str().unwrap()),
            ("PROMPTVAULT_SERVER_SCAN_ROOTS", "relative/root"),
        ]))
        .unwrap_err();
        assert_eq!(err.field, "PROMPTVAULT_SERVER_SCAN_ROOTS");
        assert!(err.reason.contains("absolut"), "{}", err.reason);
    }

    #[test]
    fn scan_root_must_exist() {
        // Fail-closed: eine nicht auflösbare Wurzel darf den Server nicht
        // stillschweigend mit einer leeren Policy starten.
        let dir = tempfile::tempdir().unwrap();
        let err = load_config(&env_of(&[
            ("PROMPTVAULT_SERVER_VAULT", dir.path().to_str().unwrap()),
            (
                "PROMPTVAULT_SERVER_SCAN_ROOTS",
                "/definitiv/nicht/vorhanden",
            ),
        ]))
        .unwrap_err();
        assert_eq!(err.field, "PROMPTVAULT_SERVER_SCAN_ROOTS");
    }

    #[test]
    fn empty_scan_roots_falls_back_to_the_vault() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = load_config(&env_of(&[
            ("PROMPTVAULT_SERVER_VAULT", dir.path().to_str().unwrap()),
            ("PROMPTVAULT_SERVER_SCAN_ROOTS", ""),
        ]))
        .unwrap();
        assert_eq!(
            cfg.scan_roots,
            vec![dunce::canonicalize(dir.path()).unwrap()]
        );
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
