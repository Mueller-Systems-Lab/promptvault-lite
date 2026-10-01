// file_scanner moved to promptvault-core (issue #104); the tauri-coupled
// watcher stays in this crate (uses tauri::AppHandle/Emitter).
pub use promptvault_core::scanner::{is_supported_prompt_extension, scan_directory};
