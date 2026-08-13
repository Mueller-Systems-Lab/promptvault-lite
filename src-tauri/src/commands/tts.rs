// =============================================================================
// PromptVault Lite — Local-Only TTS (Text-to-Speech) Adapter
// =============================================================================
// Native providers (piper, spd-say, espeak-ng) are invoked only through
// controlled Tauri commands. Prompt text is passed as process *data* (stdin or
// a single argv element), never interpolated into a shell command.
//
// No cloud TTS, no external speech API, no telemetry, no automatic model
// download. Piper uses a manually installed local ONNX model.
// =============================================================================

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

const MAX_TTS_TEXT_LENGTH: usize = 600;
const PIPER_MODEL_RELATIVE_PATH: &str = "tts/piper/de_DE-thorsten-high.onnx";

#[derive(Default)]
pub struct TtsState {
    active_process: Mutex<Option<Child>>,
}

#[derive(Debug, Serialize)]
pub struct NativeTtsStatus {
    pub available: bool,
    pub provider: String,
    pub neural: bool,
    pub model_installed: bool,
    pub message: String,
}

fn piper_model_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App-Datenverzeichnis nicht verfügbar: {e}"))?
        .join(PIPER_MODEL_RELATIVE_PATH))
}

fn executable_available(executable: &str, probe: &str) -> bool {
    Command::new(executable)
        .arg(probe)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn valid_text(text: &str) -> Result<String, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Kein Text für die Sprachausgabe vorhanden.".to_string());
    }
    if text.len() > MAX_TTS_TEXT_LENGTH {
        return Err(format!(
            "Der Text für die Sprachausgabe ist zu lang (maximal {MAX_TTS_TEXT_LENGTH} Zeichen)."
        ));
    }
    Ok(trimmed.to_string())
}

fn unique_temp_wav(app: &AppHandle) -> Result<PathBuf, String> {
    let temp_dir = app
        .path()
        .temp_dir()
        .map_err(|e| format!("Temporäres Verzeichnis nicht verfügbar: {e}"))?;
    fs::create_dir_all(&temp_dir).map_err(|e| format!("TTS-Temp-Verzeichnis fehlt: {e}"))?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Systemzeit nicht verfügbar: {e}"))?
        .as_nanos();
    Ok(temp_dir.join(format!("promptvault-tts-{nonce}.wav")))
}

fn clear_process(state: &State<'_, TtsState>) {
    if let Ok(mut active) = state.active_process.lock() {
        *active = None;
    }
}

fn stop_process(state: &State<'_, TtsState>) -> Result<(), String> {
    let mut process = state
        .active_process
        .lock()
        .map_err(|e| format!("TTS-Prozessstatus nicht verfügbar: {e}"))?
        .take();

    if let Some(ref mut child) = process {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

fn wait_for_process(state: &State<'_, TtsState>) -> Result<(), String> {
    loop {
        let finished = {
            let mut active = state
                .active_process
                .lock()
                .map_err(|e| format!("TTS-Prozessstatus nicht verfügbar: {e}"))?;
            let Some(child) = active.as_mut() else {
                return Err("Sprachausgabe wurde gestoppt.".to_string());
            };
            match child.try_wait() {
                Ok(Some(status)) => Some(status),
                Ok(None) => None,
                Err(e) => return Err(format!("TTS-Prozess konnte nicht überwacht werden: {e}")),
            }
        };

        if let Some(status) = finished {
            clear_process(state);
            if status.success() {
                return Ok(());
            }
            return Err(format!("TTS-Prozess beendet mit Status {status}."));
        }
        thread::sleep(Duration::from_millis(10));
    }
}

fn start_process(state: &State<'_, TtsState>, mut child: Child, text: &str) -> Result<(), String> {
    if let Some(mut stdin) = child.stdin.take() {
        if let Err(error) = stdin.write_all(text.as_bytes()) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "TTS-Eingabe konnte nicht geschrieben werden: {error}"
            ));
        }
    }
    state
        .active_process
        .lock()
        .map_err(|e| format!("TTS-Prozessstatus nicht verfügbar: {e}"))?
        .replace(child);
    wait_for_process(state)
}

#[tauri::command]
pub fn detect_local_tts(app: AppHandle) -> NativeTtsStatus {
    let model_installed = piper_model_path(&app)
        .map(|path| path.is_file())
        .unwrap_or(false);

    if model_installed && executable_available("piper", "--help") {
        return NativeTtsStatus {
            available: true,
            provider: "piper".to_string(),
            neural: true,
            model_installed: true,
            message: "Lokale natürliche Stimme verfügbar.".to_string(),
        };
    }

    if executable_available("spd-say", "--version") {
        return NativeTtsStatus {
            available: true,
            provider: "speech_dispatcher".to_string(),
            neural: false,
            model_installed,
            message: "Lokale Sprachausgabe verfügbar.".to_string(),
        };
    }

    if executable_available("espeak-ng", "--version") {
        return NativeTtsStatus {
            available: true,
            provider: "espeak_ng".to_string(),
            neural: false,
            model_installed,
            message: "Lokale Fallback-Sprachausgabe verfügbar.".to_string(),
        };
    }

    NativeTtsStatus {
        available: false,
        provider: "none".to_string(),
        neural: false,
        model_installed,
        message: "Keine lokale Sprachausgabe eingerichtet.".to_string(),
    }
}

#[tauri::command]
pub fn synthesize_piper(
    text: String,
    app: AppHandle,
    state: State<'_, TtsState>,
) -> Result<Vec<u8>, String> {
    let text = valid_text(&text)?;
    let model = piper_model_path(&app)?;
    if !model.is_file() {
        return Err(format!(
            "Piper-Modell fehlt. Erwartet wird eine lokale Datei unter {}.",
            model.display()
        ));
    }
    if !executable_available("piper", "--help") {
        return Err("Piper ist nicht verfügbar.".to_string());
    }

    stop_process(&state)?;
    let output_path = unique_temp_wav(&app)?;
    let child = Command::new("piper")
        .arg("--model")
        .arg(&model)
        .arg("--output_file")
        .arg(&output_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Piper konnte nicht gestartet werden: {e}"))?;

    let result = start_process(&state, child, &text).and_then(|_| {
        fs::read(&output_path).map_err(|e| format!("Piper-Audio konnte nicht gelesen werden: {e}"))
    });
    let _ = fs::remove_file(&output_path);
    result
}

#[tauri::command]
pub fn speak_system_tts(
    provider: String,
    text: String,
    state: State<'_, TtsState>,
) -> Result<(), String> {
    let text = valid_text(&text)?;
    stop_process(&state)?;

    let child = match provider.as_str() {
        "speech_dispatcher" => Command::new("spd-say")
            .args(["--wait", "--language", "de"])
            .arg(&text)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn(),
        "espeak_ng" => Command::new("espeak-ng")
            .args(["-v", "de", "--stdin"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn(),
        _ => return Err("Unbekannter lokaler TTS-Provider.".to_string()),
    }
    .map_err(|e| format!("Lokaler TTS-Provider konnte nicht gestartet werden: {e}"))?;

    start_process(&state, child, &text)
}

#[tauri::command]
pub fn stop_local_tts(state: State<'_, TtsState>) -> Result<(), String> {
    stop_process(&state)
}

#[cfg(test)]
mod tests {
    use super::{valid_text, MAX_TTS_TEXT_LENGTH};

    #[test]
    fn rejects_empty_text() {
        assert!(valid_text(" \n\t").is_err());
    }

    #[test]
    fn rejects_oversized_text() {
        assert!(valid_text(&"x".repeat(MAX_TTS_TEXT_LENGTH + 1)).is_err());
    }

    #[test]
    fn accepts_max_length_text() {
        assert!(valid_text(&"x".repeat(MAX_TTS_TEXT_LENGTH)).is_ok());
    }

    #[test]
    fn keeps_shell_syntax_as_data() {
        let input = "hello; touch pwned && echo $(whoami)";
        assert_eq!(valid_text(input).expect("valid text"), input);
    }

    #[test]
    fn keeps_quotes_pipes_ampersands_as_data() {
        let input = "a \"quoted\" 'single' | pipe & ampersand `backtick`";
        assert_eq!(valid_text(input).expect("valid text"), input);
    }

    #[test]
    fn keeps_unicode_as_data() {
        let input = "Hëllo Wörld — 你好, Привет, مرحبا 🎵";
        assert_eq!(valid_text(input).expect("valid text"), input);
    }

    #[test]
    fn keeps_newlines_as_data() {
        let input = "line one\nline two\r\nline three";
        assert_eq!(valid_text(input).expect("valid text"), input);
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(
            valid_text("  hallo welt  ").expect("valid text"),
            "hallo welt"
        );
    }
}
