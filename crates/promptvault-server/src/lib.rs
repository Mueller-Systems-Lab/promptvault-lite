//! Library surface of the server crate (testable without spawning the
//! binary). The binary (`main.rs`) uses these modules.

pub mod config;

pub use config::{load_config, ServerConfig};
