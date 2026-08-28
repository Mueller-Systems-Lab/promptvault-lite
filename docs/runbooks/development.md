---
title: Development-Runbook
description: Entwicklungsumgebung, Commands, Workflows und Troubleshooting für PromptVault Lite.
version: 1.7.0
---

# Development-Runbook

> Vollständige Anleitung für die tägliche Entwicklungsarbeit an PromptVault Lite.

## Dev-Umgebung einrichten

```bash
# Repository klonen
git clone https://github.com/Mueller-Systems-Lab/promptvault-lite.git
cd promptvault-lite

# Abhängigkeiten installieren
pnpm install

# Im Entwicklungsmodus starten (Tauri-Desktop-Fenster)
pnpm tauri dev
```

**Voraussetzungen:**

- Rust 1.77+ (`rustup install stable`)
- Node.js LTS
- pnpm (`npm install -g pnpm`)
- Plattformspezifische Build-Tools (siehe `INSTALL.md` — _noch nicht migriert_)

## Alle Entwicklungs-Commands

| Befehl                         | Beschreibung                                          |
| ------------------------------ | ----------------------------------------------------- |
| `pnpm dev`                     | Vite-Dev-Server starten (nur Frontend, Port 1420)     |
| `pnpm tauri dev`               | Vollständige Tauri-App im Dev-Modus (Frontend + Rust) |
| `pnpm build`                   | TypeScript-Prüfung + Vite-Produktions-Build           |
| `pnpm tauri build`             | Tauri-Produktions-Build (installierbare App)          |
| `pnpm test`                    | Frontend-Tests (Vitest, jsdom)                        |
| `pnpm test:watch`              | Frontend-Tests im Watch-Modus                         |
| `pnpm lint`                    | ESLint Strict-TypeChecked (0 Warnings)                |
| `pnpm format`                  | Prettier-Formatierung (`src/**/*.{ts,tsx,css}`)       |
| `pnpm preview`                 | Vite-Preview des Builds                               |
| `cargo test` (in `src-tauri/`) | Rust-Tests (lib + integration)                        |
| `cargo clippy`                 | Rust-Linter (0 Warnings)                              |
| `cargo fmt`                    | Rust-Formatierung                                     |
| `cargo build`                  | Rust-Kompilierung (Debug)                             |
| `tsc --noEmit`                 | TypeScript-Typprüfung (separat)                       |

## Code-Organisation

| Bereich               | Wo zu finden                                                    |
| --------------------- | --------------------------------------------------------------- |
| **React-Komponenten** | `src/components/{explorer,details,analysis,common,blueprints}/` |
| **Zustand-Stores**    | `src/stores/appStore.ts`, `src/stores/blueprintStore.ts`        |
| **Tauri-API-Wrapper** | `src/lib/tauri.ts`                                              |
| **Type-Definitionen** | `src/types/index.ts`                                            |
| **React-Hooks**       | `src/hooks/` (useExport, useKeyboardShortcuts)                  |
| **Rust-Commands**     | `src-tauri/src/commands/`                                       |
| **Analyselogik**      | `src-tauri/src/analysis/`                                       |
| **Parser**            | `src-tauri/src/parser/`                                         |
| **Scanner**           | `src-tauri/src/scanner/`                                        |
| **Datenbank**         | `src-tauri/src/database/`                                       |
| **Datenmodelle**      | `src-tauri/src/models/`                                         |

## Test-Workflow

Vor jedem Commit/PR:

```bash
# 1. Frontend-Tests
pnpm test

# 2. Rust-Tests
cargo test --manifest-path src-tauri/Cargo.toml

# 3. TypeScript-Prüfung
tsc --noEmit

# 4. Linting
pnpm lint          # ESLint
cargo clippy       # Rust-Lint

# 5. Format-Prüfung
pnpm format        # Prettier (schreibt)
cargo fmt --check  # Rust-Format (prüft nur)
```

Der CI-Workflow (`.github/workflows/ci.yml`) führt alle diese Schritte automatisch aus.

## Commit-Convention

Das Projekt verwendet **Conventional Commits** gemäß CHANGELOG-Stil:

```
type(scope): description
```

Typen: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `security`, `style`
Scope: `frontend`, `backend`, `docs`, `deps`, `ci`

**Beispiele:**

- `feat(frontend): add score filter to FilterPanel`
- `fix(backend): handle empty frontmatter gracefully`
- `docs(architecture): add ADR-002 for docs-as-code`

## Branch-Strategie

1. Jede Arbeit beginnt mit einem GitHub Issue.
2. Feature-Branch von `main` erstellen: `git checkout -b feat/issue-XX-kurzbeschreibung`
3. Änderungen in atomaren Commits umsetzen.
4. PR mit Template erstellen (`.github/pull_request_template.md`).
5. CI muss grün sein.
6. Reviewer-Checkliste durchlaufen.
7. Human Approval einholen.
8. Merge per GitHub-UI (kein direkter Push auf `main`).

## Pre-Commit-Hooks

Das Repository enthält ein natives Pre-Commit-Hook-Skript (`.git/hooks/pre-commit`), das vor jedem Commit prüft:

- `cargo fmt` — Rust-Formatierung
- `cargo clippy` — Rust-Linting
- `tsc --noEmit` — TypeScript-Typprüfung

**Aktivierung:** Das Skript ist bereits platziert. Falls nicht vorhanden, kann es aus der CHANGELOG-Phase-4-Beschreibung rekonstruiert werden.

> **Annahme:** Das Pre-Commit-Skript ist nach `pnpm install` aktiv. Bei Problemen `chmod +x .git/hooks/pre-commit` auf Linux/macOS ausführen.

## Troubleshooting

| Problem                            | Lösung                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **`pnpm tauri dev` startet nicht** | `pnpm install` erneut ausführen. Tauri-Build-Tools prüfen (Linux: `libwebkit2gtk-4.1-dev`, Windows: Visual Studio Build Tools).    |
| **Windows-Path-Probleme**          | Der Store normalisiert Backslashes zu Forward-Slashes. Lange Pfade (`\\?\`) werden bereinigt. Teste mit Pfaden ohne Leerzeichen.   |
| **Rust-Kompilierungsfehler**       | `rustup update stable`. Bei `rusqlite`-Fehlern: `libsqlite3-dev` auf Linux installieren.                                           |
| **`vite`-Fehler bei Dev-Start**    | `node_modules` löschen (`rm -rf node_modules`) und `pnpm install` neu ausführen.                                                   |
| **Scan findet keine Dateien**      | Nur `.md`-Dateien werden gescannt. Maximale Tiefe: 50 Ebenen. Symlinks außerhalb des Vault-Roots werden blockiert.                 |
| **Pre-Commit-Hook schlägt fehl**   | Einzelschritte manuell ausführen (`cargo fmt`, `cargo clippy`, `tsc --noEmit`). Hook ggf. deaktivieren (`git commit --no-verify`). |

## Neue Tauri-Commands hinzufügen

1. Rust-Funktion in `src-tauri/src/commands/` definieren (z. B. `mein_command.rs`).
2. Funktion mit `#[tauri::command]` annotieren.
3. Modul in `commands/mod.rs` registrieren.
4. Command in `lib.rs` im Tauri-Builder mit `.invoke_handler(tauri::generate_handler![...])` registrieren.
5. TypeScript-Wrapper in `src/lib/tauri.ts` hinzufügen.
6. Tests in `src-tauri/tests/command_errors.rs` ergänzen.
7. Rust-Tests ausführen: `cargo test --manifest-path src-tauri/Cargo.toml`.

## Neue Frontend-Komponenten hinzufügen

1. Komponente in das passende Unterverzeichnis von `src/components/` legen.
2. Typdefinition in `src/types/index.ts` ergänzen (falls nötig).
3. Store-Action in `src/stores/appStore.ts` ergänzen (falls nötig).
4. Testdatei im `__tests__/`-Unterverzeichnis der Komponente anlegen.
5. TypeScript-Typprüfung: `tsc --noEmit`.
6. Frontend-Tests: `pnpm test`.

## Dokumentation aktualisieren

Bei Code-Änderungen müssen folgende Dokumente geprüft und ggf. aktualisiert werden:

| Änderung                     | Betroffene Docs                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Neue Komponente/Datei        | `docs/reference/project-structure.md`                                            |
| Neue Rust-Funktion/Command   | `ARCHITECTURE.md`, `docs/reference/project-structure.md` _(noch nicht migriert)_ |
| Neue Tastaturkürzel          | `USER_GUIDE.md` _(noch nicht migriert)_                                          |
| Neue Abhängigkeit            | `INSTALL.md` _(noch nicht migriert)_                                             |
| Neue Architekturentscheidung | `docs/adr/` (neues ADR) + `ARCHITECTURE.md` _(noch nicht in MkDocs)_             |
| Neue Analyse-Kriterien       | `USER_GUIDE.md`, `docs/glossary.md` _(teils noch nicht migriert)_                |
| Geänderte Build-Schritte     | `docs/runbooks/development.md`                                                   |
| Neuer Workflow-Schritt       | `AI_WORKFLOW.md`, `docs/runbooks/development.md` _(teils noch nicht migriert)_   |
| Neue Version/Release         | `CHANGELOG.md` _(noch nicht migriert)_                                           |
