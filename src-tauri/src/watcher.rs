use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

// file_scanner lives in promptvault-core since the workspace split (#104)
use promptvault_core::scanner::is_supported_prompt_extension;

/// Payload für watcher:changed Tauri Event
#[derive(Clone, serde::Serialize)]
pub struct ChangedPayload {
    pub added: Vec<String>,
    pub modified: Vec<String>,
    pub removed: Vec<String>,
}

/// Debounced File Watcher
pub struct DebouncedWatcher {
    watcher: Option<RecommendedWatcher>,
    debounce_map: Arc<Mutex<HashMap<PathBuf, Instant>>>,
    debounce_duration: Duration,
    watched_path: Option<PathBuf>,
}

impl Default for DebouncedWatcher {
    fn default() -> Self {
        Self::new()
    }
}

impl DebouncedWatcher {
    pub fn new() -> Self {
        Self {
            watcher: None,
            debounce_map: Arc::new(Mutex::new(HashMap::new())),
            debounce_duration: Duration::from_millis(500),
            watched_path: None,
        }
    }

    pub fn start_watching(&mut self, path: &str, app_handle: AppHandle) -> Result<(), String> {
        let watch_path = PathBuf::from(path);
        if !watch_path.exists() {
            return Err(format!("Pfad existiert nicht: {}", path));
        }
        if !watch_path.is_dir() {
            return Err(format!("Pfad ist kein Verzeichnis: {}", path));
        }

        // Stop existing watcher first
        self.stop_watching();
        self.watched_path = Some(watch_path.clone());

        let debounce_map = self.debounce_map.clone();
        let debounce_duration = self.debounce_duration;

        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            match res {
                Ok(event) => {
                    // Only care about .md, .markdown, and .txt files
                    let is_supported = event.paths.iter().any(|p| is_supported_prompt_extension(p));
                    if !is_supported {
                        return;
                    }

                    let now = Instant::now();
                    let mut map = debounce_map.lock().unwrap();
                    let mut triggered = false;

                    for path in &event.paths {
                        let canonical = path.canonicalize().unwrap_or_else(|_| path.clone());

                        // Skip non-supported files
                        if !is_supported_prompt_extension(&canonical) {
                            continue;
                        }

                        let last = map.get(&canonical).copied().unwrap_or(Instant::now());
                        if now.duration_since(last) >= debounce_duration {
                            map.insert(canonical.clone(), now);
                            triggered = true;
                        }
                    }

                    drop(map);

                    if triggered {
                        // Collect changes
                        let mut changed = ChangedPayload {
                            added: vec![],
                            modified: vec![],
                            removed: vec![],
                        };

                        match event.kind {
                            EventKind::Create(_) => {
                                for p in &event.paths {
                                    if let Some(s) = p.to_str() {
                                        changed.added.push(s.to_string());
                                    }
                                }
                            }
                            EventKind::Modify(_) => {
                                for p in &event.paths {
                                    if let Some(s) = p.to_str() {
                                        changed.modified.push(s.to_string());
                                    }
                                }
                            }
                            EventKind::Remove(_) => {
                                for p in &event.paths {
                                    if let Some(s) = p.to_str() {
                                        changed.removed.push(s.to_string());
                                    }
                                }
                            }
                            _ => {}
                        }

                        if !changed.added.is_empty()
                            || !changed.modified.is_empty()
                            || !changed.removed.is_empty()
                        {
                            let _ = app_handle.emit("watcher:changed", changed);
                        }
                    }
                }
                Err(e) => {
                    log::error!("Watcher-Fehler: {}", e);
                }
            }
        })
        .map_err(|e| format!("Watcher konnte nicht gestartet werden: {}", e))?;

        watcher
            .watch(&watch_path, RecursiveMode::Recursive)
            .map_err(|e| format!("Verzeichnis-Überwachung fehlgeschlagen: {}", e))?;

        self.watcher = Some(watcher);
        log::info!("Watcher gestartet für: {}", path);
        Ok(())
    }

    pub fn watched_path(&self) -> Option<&PathBuf> {
        self.watched_path.as_ref()
    }

    pub fn stop_watching(&mut self) {
        self.watcher = None;
        self.watched_path = None;
        log::info!("Watcher gestoppt");
    }
}
