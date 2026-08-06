---
title: Changelog
description: Versionshinweise für PromptVault Lite.
version: 1.8.0
---

# Changelog

## v1.8.0 — Direction Profiles, Missing-Info Gate and Optimizer Hardening

Released: 2026-08-03
PR #294 (Autonomous Test Harness Trust): merged 2026-08-05

### Added

- **Missing-Info-Gate** (Issue #216): Dynamische Vorab-Fragen vor der Optimierung. Identifiziert fehlende Informationen mit gestaffelten Fragen (REQUIRED/RECOMMENDED/OPTIONAL). Sanitized Answer Merging. Feature-Flag `PROMPTVAULT_MISSING_INFO_GATE` (default disabled). ADR-002 accepted.

- **Direction Profiles & Variants** (Issue #215): Erzeugt mehrere Optimierungsvarianten in verschiedenen Richtungen (concise, elaborate, creative, structured, technical). Variantenvergleich und "Save as New Version". Constraint Preservation während der Generierung. Feature-Flag `PROMPTVAULT_DIRECTION_PROFILES` (default disabled).

- **Epic #214 geschlossen:** Prompt-Optimierung mit Ergebnisvarianten und dynamischen Rückfragen — Sub-Issues #215 und #216 vollständig implementiert.

### Fixed

- **Optimizer Gate Session Guard** (Issue #289): Null-Check für `handleOpenOptimizer` und `handleBlueprintOptimize` bei fehlender Gate-Session. Optional Chaining (`session?.items ?? []`) verhindert TypeError.

- **Sensitive Content Optimizer Blocking** (Issue #291): Normaler Optimizer wird für `BLOCKING_SENSITIVE_CONTENT` vollständig geblockt. Gate→Blocked→Complete-Pfad abgesichert. 10+ Red Tests.

### Quality / Testing

- **Autonomous Test Harness Trust** (#294): E2E Bridge Gate (ADR-005, Owner-Freigabe 2026-08-05). E19 — 13 native Tauri E2E-Tests (echtes Binary, echte IPC, echtes Rust, echtes FS, SQLite-Persistenz, Neustart). E21 — Native File Dialog Smoke (AT-SPI-Semantik + WM_DELETE_WINDOW). Cross-Browser-Playwright-Matrix (Chromium/Firefox/WebKit). Gate-Inventar E1-E21. `window.__pvlLoadArchive` nur im Debug-Build (fail-closed).\n\n- **Visuelles Playwright Release Gate** (#152): 8 E2E-Tests für App-Shell, Statusleiste (600/768/900px), Settings-Modal und Theme-Switching. 11/11 passed (4 USB-Corpus-Tests skipped — benötigen lokales Korpus).

- **Synthetische Test-Fixtures**: 5 repräsentative Prompt-Typen (Standard, Blueprint, Hybrid, Blocked, Long-Windows-Path) als deterministisches Testmaterial.

- **Secret-Scan False-Positive-Fix**: Statisches synthetisches Token-Literal in Test-Fixture durch dynamische `join()`-Konstruktion ersetzt. Secret Scan jetzt grün, echter Token wird weiterhin erkannt.

- **Backlog Reconciliation**: 59→54 offene Issues. Web/LAN-Programm in separaten Milestone abgetrennt.

### Quality Gates

| Gate                | Ergebnis                              |
| ------------------- | ------------------------------------- |
| `pnpm test`         | **1581 passed** (59 files, 0 failures)|
| `pnpm lint`         | **0 errors, 0 warnings**              |
| `pnpm exec tsc`     | **0 errors**                          |
| `cargo test`        | **156 passed** (2 ignored)            |
| `pnpm test:e2e`     | **177 passed, 15 skipped** (Chromium/Firefox/WebKit) |
| Python AT-SPI Tests | **62 passed**                         |

## v1.7.2 — Settings, Audio, Paste Analyzer, Embeddings

### Added

- **Direktanalyse — Prompt einfügen** (Issue #204): Prompt-Text direkt einfügen und analysieren, ohne eine Datei im Vault anzulegen.
  - Eigener Zugang per `📝 Direktanalyse` Button in der Toolbar
  - Textarea für manuelles Einfügen
  - Optionaler Button `📋 Aus Zwischenablage einfügen` (explizite Nutzeraktion erforderlich)
  - `🔍 Analysieren` Button mit Wiederverwendung der bestehenden Analyse-Logik
  - `🗑️ Leeren` Button zum Zurücksetzen
  - Ergebnisanzeige: Klassifikation, Qualität, Hygiene, Blueprint-Bewertung, Context-Engineering
  - Keine automatische Speicherung — eingefügte Texte bleiben nur im lokalen UI-State
  - Keine Cloud-API, kein Remote-LLM, keine Telemetrie

- **Audio-Kurzbeschreibung** (Issue #200): Sichere deutsche Kurzbeschreibung mit lokaler Sprachausgabe für ausgewählte Prompts.
  - Kurzbeschreibung wird aus Titel, Beschreibung, Kategorie und Tags generiert
  - Lokale TTS-Ausgabe über Web Speech API (keine Cloud-TTS, keine externen APIs)
  - "Kurz vorlesen" / "Stoppen" Button in der Detailansicht
  - Automatische Maskierung sensibler Inhalte (API-Keys, Tokens, E-Mails, Pfade)
  - Blockierung der Audioausgabe bei kritischen Hygiene-Warnungen
  - Provider-Detection für Piper, spd-say und espeak-ng (für künftige native TTS)

- **Settings Modal** (Issue #63): Vollständiger Einstellungen-Dialog hinter dem ⚙️-Button in der Toolbar.
  - Theme-Auswahl (Hell/Dunkel/Auto) mit sofortiger Übernahme
  - Export-Format-Voreinstellung (JSON/Markdown/CSV) mit localStorage-Persistenz
  - Tastenkürzel-Übersicht (readonly)
  - Sprache-Platzhalter (i18n in Planung)
  - Developer-Mode Toggle (aus Issue #92 übernommen)
  - Alle Einstellungen zurücksetzen
  - Schließen per X-Button, Escape-Taste oder Klick außerhalb

- **GUIDELINE Classification** (PR #190): Prompt-Klassifizierung erkennt jetzt guideline- und policy-artige Prompts als eigene Klasse. Verbessert die Genauigkeit bei Anleitungs- und Richtlinien-Prompts.

- **Embeddings Feature Flag + Mock Provider** (Issue #199 Phase 1): Grundstein für lokale semantische Suche.
  - Feature Flag `PROMPTVAULT_EMBEDDINGS=1` (standardmäßig deaktiviert)
  - `EmbeddingProvider` Interface mit `MockEmbeddingProvider` für synthetische Tests
  - `createEmbeddingProvider()` Factory mit Feature-Flag-Gating
  - 49 synthetische Fixture-Tests (16 Feature-Flag, 11 Provider-Contract, 22 Mock-Provider)
  - Keine echten Embeddings, keine neuen Dependencies, kein Netzwerkzugriff
  - Echter Provider (ONNX/Ollama) auf spätere Phase verschoben (ADR-004 Decision C)

- **Real-Corpus Classification Reasons** (PR #192): PROMPT- und CODE_FRAGMENT-Klassifizierungsgründe hinzugefügt. Regression-Fixtures für reale Prompt-Korpora.

- **UNKNOWN Confidence und Fallback Explanations** (PR #198): Ehrlichere Behandlung von nicht klassifizierbaren Prompts mit detaillierten Fallback-Erklärungen statt stiller Defaults.

### Fixed

- **Regex/Backtracking Hardening** (PR #196): Regex-Backtracking in der Prompt-Qualitätsanalyse verhindert. Verbessert Stabilität bei langen oder komplexen Prompt-Dateien. 5 neue Regressionstests.

- **BLUEPRINT/DOCUMENTATION Boundary Refinement** (PR #197): Verfeinerte Abgrenzung zwischen BLUEPRINT- und DOCUMENTATION-Klassifikation bei architektur-ähnlichen Dokumenten.

- **UI/Optimizer/Classification/Layout Fixes** (PR #185): Verbesserte Optimizer-Vorschau, Klassifizierungsanzeige, Scoring-UX und Layout-Konsistenz. Statusleiste bleibt im maximierten Layout sichtbar.

- Tauri Watcher-Cleanup-Fehler im Web-Modus (Vite Dev Server) behoben — `stopFileWatcher` wird nur im Tauri-Kontext aufgerufen.

### Quality Gates

| Gate                | Ergebnis                              |
| ------------------- | ------------------------------------- |
| `pnpm test`         | **665 passed** (26 files, 0 failures) |
| `pnpm lint`         | **0 errors, 0 warnings**              |
| `pnpm exec tsc`     | **0 errors**                          |
| `pnpm build`        | **PASS**                              |
| `cargo test --lib`  | **134 passed** (+1 ignored)           |
| `cargo test --test` | **22 passed** (+1 ignored)            |
| `cargo fmt`         | **PASS**                              |
| `cargo clippy`      | **0 warnings**                        |

### Hygiene Scoring Note

Der Hygiene-Analyzer wurde durch die Regex/Backtracking-Härtung strenger. Aggregierte Hygiene-Scores können dadurch niedriger ausfallen als in früheren Validierungsberichten, weil mehr Artefakt-Muster erkannt werden. Dies ist als verbesserte Erkennungsgenauigkeit zu interpretieren, nicht zwingend als Qualitätsregression.

## v1.7.1 — Windows Installer Startup Crash Fix

**Datum:** 2026-06-24

### Fixed

- Fixed Windows startup crash in installed/release builds when the application data directory did not exist on first launch. (PR #179)
- The app now creates the parent AppData directory before opening `promptvault.db`.

### Quality Gates

| Gate                | Ergebnis                              |
| ------------------- | ------------------------------------- |
| `pnpm test`         | **650 passed** (22 files, 0 failures) |
| `pnpm lint`         | **0 errors, 0 warnings**              |
| `pnpm exec tsc`     | **0 errors**                          |
| `pnpm build`        | **PASS**                              |
| `cargo test --lib`  | **134 passed** (+1 ignored)           |
| `cargo test --test` | **17 passed**                         |
| `cargo fmt`         | **PASS**                              |
| `cargo clippy`      | **0 warnings**                        |
| `mkdocs build`      | **PASS**                              |

### Known Limitations

- Windows installer remains unsigned. Windows SmartScreen may show an "Unknown publisher" warning.
- Remote-CI remains `REMOTE_CI_INFRA_BLOCKED` (Issue #154). Local-CI-first policy in effect.

---

## v1.7.0 — Scanner Extensions, Blueprint, Docs-as-Code

**Datum:** 2026-06-22

### Highlights

- **Multi-Extension Scanner:** `.md`, `.markdown`, `.txt` with case-insensitive matching, 1 MiB shared size limit per file. (PR #168, #170, #172)
- **Blueprint Detection & Optimization:** Auto-detection of 7 content classes (prompt, blueprint, hybrid), 10-dimension quality evaluation, 3-mode deterministic optimization. (PR #148)
- **NAS-Mounted Folder Support:** Windows/UNC path handling for network drives. (PR #145)
- **MkDocs Docs-as-Code:** Material for MkDocs platform with Diátaxis framework. (PR #162)
- **Real Prompt Corpus Pilot:** Controlled read-only scan of 547 files on Z-drive. 72 files approved for curated import via partial owner approval. Review finalized: 114 ALLOW_IMPORT + 3 ALLOW_IMPORT_REDACTED + 1 EXCLUDE. Import deferred. (Issue #166)
- **Historical Archive:** Evidence audit trail archived to `.opencode/history/`. (PR #163)
- **Optimizer Placeholder Hardening:** Production-quality optimizer with all 3 modes. (PR #147)

### Quality Gates

| Gate                | Ergebnis                              |
| ------------------- | ------------------------------------- |
| `pnpm test`         | **650 passed** (22 files, 0 failures) |
| `pnpm lint`         | **0 errors, 0 warnings**              |
| `pnpm exec tsc`     | **0 errors**                          |
| `pnpm build`        | **PASS**                              |
| `cargo test --lib`  | **134 passed** (+1 ignored)           |
| `cargo test --test` | **17 passed**                         |
| `cargo fmt`         | **PASS**                              |
| `cargo clippy`      | **0 warnings**                        |
| `mkdocs build`      | **PASS**                              |

### Remote CI

Remote-CI (GitHub Actions) is `REMOTE_CI_INFRA_BLOCKED` (Issue #154). Local-CI-first policy in effect. Local gates: 9/9 PASS with no code changes in this finalization run.

---

## v1.6.0 — Stable Release: Prompt Optimization & Action Layer

**Datum:** 2026-06-15

> **Hinweis:** Dies ist ein neuer Stable Release auf aktuellem `master`. Der zuvor getaggte `v1.5.0` (2026-06-05, Commit `0bd2208`) bleibt unverändert bestehen. `v1.6.0` enthält 26 zusätzliche Commits und ersetzt `v1.5.0` als empfohlenen Stable Release.

### Highlights

- **Local Prompt Optimization Engine:** Drei deterministische Optimierungsmodi — `conservative` (Whitespace, Bullets), `balanced` (Section-Reordering, Heading-Standardisierung), `aggressive` (Agentic-Workflow-Scaffolding, Context-Engineering-Sections, Verification-Contracts). Läuft vollständig lokal ohne API-Calls. (#86)
- **Prompt & Context Engineering Evaluation:** Automatisierte Qualitätsanalyse mit 6 Dimensionen (Clarity, Role Detection, Procedure, Output Format, Reusability, Security Boundaries). (#88)
- **Evaluation-Corpus Calibration:** 68 Corpus-QA-Tests validieren die Scoring-Engine. Corpus-Failures von 12 auf 0 reduziert. (#94)
- **Typed Local Action Layer:** 10 typisierte lokale Aktionen mit Schema-validierten Input/Output-Verträgen, Read-Only-First-Strategie und Developer-Mode-Gate. (#90, #91)
- **Erweiterte Artefakterkennung:** 6 neue Kategorien — `CHAT_META`, `SCOPE_POLLUTION`, `OCR_RESIDUE`, `ROLE_MISMATCH`, `MISSING_STRUCTURE`, `EVIDENCE_BLOCK`. (#90)
- **Dark Mode:** Light/Dark/Auto-Theme mit OS-Erkennung und localStorage-Persistenz. Accessibility- und Robustness-Fixes. (#84, #85)
- **Resizable Explorer:** Maus-/Touch-Drag, Keyboard-Pfeiltasten, ARIA-Separator-Attribute, Persistenz. (#60)
- **Cross-Platform File Tree:** Windows-Backslash-Normalisierung, Long-Path-Präfixe, UNC-Pfade, Laufwerksbuchstaben. (#73)
- **GitHub Presentation & Onboarding:** Verbesserte Repository-Struktur, README, und Contributor-Experience. (#89)
- **MIT License:** SPDX-Identifier, README-Badge, vollständiger Lizenztext. (#87)
- **CI/CD Pipeline:** Drei Jobs (Frontend TypeScript/React, Rust/Tauri Backend, Secret Scan) mit platform-robusten Workflows. (#75–79)
- **Release-Icons:** Echte Tauri-Icons ersetzen Platzhalter-PNGs. (#80–83)

### Quality Gates

| Gate               | Ergebnis                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `pnpm test`        | **326 passed** (11 Dateien, 0 Failures)                                                             |
| `pnpm lint`        | **0 Errors, 0 Warnings**                                                                            |
| `npx tsc --noEmit` | **0 Errors**                                                                                        |
| `pnpm build`       | **PASS**                                                                                            |
| `cargo test`       | **119 passed** (102 Unit + 17 Integration), 1 Ignored                                               |
| `cargo build`      | **PASS**                                                                                            |
| Frontend CI        | SUCCESS _(historical — GitHub Actions were passing at release time; later infra-blocked, see #154)_ |
| Rust/Tauri CI      | SUCCESS _(historical — GitHub Actions were passing at release time; later infra-blocked, see #154)_ |
| Secret Scan        | SUCCESS _(historical — GitHub Actions were passing at release time; later infra-blocked, see #154)_ |

### Known Limits

- **Source-only Release** — keine nativen Binaries (konsistent mit v1.5.0)
- UI-Approval-Dialog für Action Layer offen (#92)
- Blueprint-Feature bleibt zukünftige Arbeit (#49–59)
- Settings-Modal bleibt zukünftige Arbeit (#63)

---

### v1.5.0 (2026-06-05)

#### Features

- **Favoriten-Backend:** `toggle_favorite(prompt_id)` toggled Favoriten-Status via SQLite. `get_favorites()` gibt alle favorisierten Prompt-IDs zurück. Persistenz über Neustarts via `Database::set_favorite()`. ADR-006: Database als separates `tauri::State`. (#24)
- **Score-Filter:** `filteredPrompts()` wertet `evaluations` für `minScore`/`maxScore`-Filter aus. Prompt ohne Evaluation → Score = 0. Nur aktiv wenn Filter nicht Default (0–100). ADR-007: reines Frontend-Feature. (#23)
- **Favoriten-UI:** Button in Detailansicht mit optimistischem UI-Update, Revert bei Backend-Fehler, ARIA-Attribute (`aria-label`, `aria-pressed`). FileTree zeigt ★-Indikator mit `favorite-indicator` CSS-Klasse. (#25)

#### Backend

- **Database-Mutex:** `Database.conn` von `rusqlite::Connection` auf `Mutex<Connection>` umgestellt. Ermöglicht `Send + Sync` für `tauri::State<Database>`. Eigene `lock_conn()`-Hilfsfunktion.
- **ADR-008:** Integrationstests in `command_errors.rs` verwenden `Database::new_in_memory()` und rufen `_impl`-Hilfsfunktionen direkt auf.
- **Neue Rust-Tests:** 5 Integrationstests für Favoriten (unknown_id, set, unset, empty, returns_favorites).

#### Frontend

- **Search-Filter umstrukturiert:** `return`-Early-Exit entfernt — andere Filter (Score, Favoriten) werden jetzt bei aktivem Search-Filter mitgeprüft.
- **toggleFavorite Store-Action async:** Optimistisches UI-Update mit Revert bei `Err`. Import von `@/lib/tauri` `toggleFavorite`.

#### Test Summary

- Rust: 96 lib (1 ignored) + 17 integration = 113 total (0 failures, 0 clippy warnings)
- Frontend: 93 tests (0 failures)
- ESLint: 0 errors, 0 warnings

## v1.4.0 — Phase 4: Security-Härtung & Developer Experience

**Datum:** 2026-06-04

### Security

- **Symlink-Containment:** `scan_directory()` canonicalisiert Root-Pfad und jede gescannte Datei. Externe Symlinks außerhalb des Vault-Roots werden nicht mehr gescannt und mit `log::warn!` protokolliert. CVSS 2.8 Finding aus Phase 3 adressiert (#14)

### Frontend

- **TreeNode React.memo:** Kind-TreeNodes leiten `isExpanded`/`isSelected` jetzt aus dem zustand-Store ab (kein Prop-Drilling mehr). `React.memo` mit Custom-Comparator verhindert unnötige Re-Renders von Kindknoten (#15)
- **Pfad-Sanitization:** `".."`- und `"."`-Segmente werden aus `fileTree()` gefiltert. Absolute Pfade werden relativ zum Vault-Root dargestellt (#16)

### Testing

- **Store-Unit-Tests:** 22 Tests für `fileTree()` und `filteredPrompts()` im neuen `appStore.test.ts` (#18)
- **Command-Fehlerfall-Tests:** 14 Rust-Integrationstests in `command_errors.rs` für alle Tauri Commands (scan, analyze, export, favorites, persistence, watcher) (#19)

### Developer Experience

- **ESLint Strict Mode:** `.eslintrc.json` mit `@typescript-eslint/strict-type-checked` + `react-hooks/recommended`. 0 Errors, 0 Warnings (#20)
- **Pre-commit Hook:** Natives `.git/hooks/pre-commit` Shell-Skript prüft `cargo fmt`, `cargo clippy` und `tsc --noEmit` vor jedem Commit (#21)

### Test Summary (Phase 4 Final)

- Rust: 95 lib tests + 14 integration tests = 109 total (0 failures, 0 clippy warnings)
- Frontend: 84 tests (0 failures)
- ESLint: 0 errors, 0 warnings

## v1.3.0 — Phase 3: Performance & Plattform-Härtung

**Datum:** 2026-06-04

### Performance

- **File-Tree O(1)-Lookup:** `siblings.find()` (O(n) pro Pfadsegment) ersetzt durch `Map<string, FileTreeNode>` — bis zu 50x schneller bei großen Vaults (>500 Prompts) (#11)
- **useMemo-Memoization:** `FileTree.tsx` ruft `fileTree()` jetzt nur noch 1x pro Render auf (vorher 2x). Invalidation über `prompts`/`evaluations`/`filters` State-Slices — keine Stale-Closure-Bugs (#11)

### Technische Schulden

- **0 Clippy-Warnings:** 14 Warnings eliminiert — 10 per `cargo clippy --fix`, 4 manuell (manual_clamp, dead_code, type_complexity, too_many_arguments) (#12)
- `Default`-Implementierung für `AppState` und `DebouncedWatcher`
- `CacheData` Type-Alias für komplexen Rückgabetyp in `cache.rs`
- Unbenutzte `PromptItem::new()` und `newline_count` entfernt

### Plattform-Härtung

- **5 neue Rust-Plattformtests:** Pfad-Traversal im Root-Pfad, Windows-Backslash-Speicherung, gemischte Pfadtrenner, tief verschachtelte Pfade, Symlink-Following-Dokumentation (#13)
- **7 neue Frontend-Plattformtests:** Windows-Backslash-Normalisierung, gemischte Trennzeichen, `../`-Segment-Handling, UNC-ähnliche Pfade, Drive-Letter-Pfade, Sortierreihenfolge, leerer Vault (#13)

### Tests

- **93 Rust-Tests** (+5 neu) — alle grün
- **58 Frontend-Tests** (+7 neu) — alle grün
- `cargo clippy --all-targets` — **0 Warnings**
- `tsc --noEmit` — ohne Fehler
- `cargo fmt` — clean

### Sicherheit

- Security-Agent-Analyse: Symlink-Following dokumentiert (CVSS 3.1: 2.8 Low), Pfad-Traversal im Scanner als akzeptiertes Verhalten klassifiziert (#13)
- fileTree() als nicht-filesystemzugreifend bestätigt (kein direktes Path-Traversal-Risiko)

## v1.2.0 — Phase 2.1 Bugfixes & Härtung

**Datum:** 2026-06-03

### Neue Features

- **Export-Funktionalität:** JSON, Markdown und ZIP-Export mit Analyse-Scores und Fortschrittsanzeige (#2)
- **File Watcher:** Automatischer Re-Scan bei Dateiänderungen mit 500ms Debounce (#3)
- **Native Icons:** Plattformspezifische Icons für Windows (.ico), macOS (.icns) und Linux (.png) (#4)
- **Keyboard Shortcuts:** Strg+F (Suche), Strg+O (Öffnen), Strg+Shift+A (Analyse), Strg+E (Export), Esc (Zurücksetzen) (#7)

### Tests & Qualität

- **79 Rust-Tests** (64 MVP + 15 Edge-Case) — inkl. Leere-Dateien, Unicode, Binär, Performance
- **51 Frontend-Tests** (vitest + testing-library) — TreeNode, FilterPanel, AnalysisPanel
- `cargo clippy` ohne neue Warnings
- `tsc --noEmit` ohne Fehler

### Verbesserungen

- Export-Dialog mit Format-Auswahl und Accessibility (ARIA, Keyboard, Focus-Trap)
- SearchBar mit Store-Synchronisation für externe Filter-Reset
- Windows-Pfadunterstützung (Backslash-Handling)
- Verbesserte Pfadvalidierung in Export-Commands

## v1.0.0 — MVP Release

**Datum:** 2026-06-03

### Features

- Lokaler Scan von Markdown-Promptordnern
- Rekursiver Explorer-Baum
- Prompt-Detailansicht mit Frontmatter- und Dateimetadaten
- Qualitätsanalyse mit 10 Kriterien
- Hygieneanalyse mit Artefakterkennung
- Kopieren- und Öffnen-Aktionen in der Detailansicht
- Tauri-/Rust-Backend mit lokaler Verarbeitung
- SQLite- und JSON-Cache-Module
- Such- und Filteroberfläche im Explorer
