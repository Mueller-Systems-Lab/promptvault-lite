---
title: Testing
description: Tests ausführen, Struktur verstehen und neue Tests ergänzen.
version: 1.9.0
last_updated: 2026-08-12
---

# Testing

## Übersicht der Test-Gates

| Gate              | Command                                                    |
| ----------------- | ---------------------------------------------------------- |
| Frontend Tests    | `pnpm test`                                                |
| ESLint            | `pnpm lint`                                                |
| TypeScript Check  | `pnpm exec tsc --noEmit`                                   |
| Frontend Build    | `pnpm build`                                               |
| Rust Format Check | `cargo fmt --check --all`                                  |
| Rust Clippy       | `cargo clippy --workspace --all-targets -- -D warnings`    |
| Rust Tests        | `cargo test --workspace`                                   |
| Whitespace Check  | `git diff --check`                                         |
| MkDocs Build      | `mkdocs build --strict` (optional, tool gap on some hosts) |
| Playwright E2E    | `pnpm exec playwright test` (core gate: mandatory) |

## Rust-Tests ausführen

Aus dem Repository-Root:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Oder als workspace:

```bash
cargo test --workspace
```

## Frontend-Tests ausführen

```bash
pnpm test
```

Der Script-Eintrag nutzt Vitest mit @testing-library/react und jsdom.

## Teststruktur

### Rust

Die meisten Tests liegen direkt in den Modulen als `#[cfg(test)]`-Einheiten:

- Scanner: `src-tauri/src/scanner/file_scanner.rs`
- Frontmatter: `src-tauri/src/parser/frontmatter.rs`
- Markdown-Struktur: `src-tauri/src/parser/markdown.rs`
- Qualitätsanalyse: `src-tauri/src/analysis/quality.rs`
- Hygieneanalyse: `src-tauri/src/analysis/hygiene.rs`
- JSON-Cache: `src-tauri/src/database/cache.rs`
- SQLite: `src-tauri/src/database/sqlite.rs`
- Integration: `src-tauri/tests/command_errors.rs`
- Regex Regression: `src-tauri/tests/quality_regex_regression.rs`
- Real Corpus Validation: `src-tauri/tests/real_corpus_validation.rs`

### Frontend

- **34+ Test-Dateien** mit Vitest + @testing-library/react + jsdom
- Übliche Pfade sind `src/**/__tests__/*.test.ts` oder `*.test.tsx`
- Store-/Hook-Logik separat testen
- Tauri-Aufrufe mocken, wenn das Verhalten isoliert geprüft werden soll

### Admin Observability

- `src/observability/__tests__/trace.test.ts` — Trace/Span-Lifecycle
- `src/observability/__tests__/events.test.ts` — Ring-Buffer-Limits und Event-Bus
- `src/observability/__tests__/diagnostics.test.ts` — Reason-Code-Katalog/-Klassifikation
- `src/observability/__tests__/invariants.test.ts` — Integritätsprüfungen
- `src/observability/__tests__/redaction.test.ts` — Secret-/Pfad-Redaction
- `src/observability/__tests__/privacy.test.ts` — kein Promptvolltext/Secrets im Export
- `src/observability/__tests__/privacySentinel.test.ts` — Sentinel-Secret darf nicht exportiert werden
- `src/observability/__tests__/offOnEquivalence.test.ts` — Observability ON/OFF liefert identische Resultate
- Rust: `src-tauri/tests/observability_correlation.rs` — Frontend↔Backend-Korrelation

### Native E2E (Windows, WebdriverIO)

- `e2e-tests/specs/admin-observability.native.spec.js` — realer nativer Pfad: UI → Tauri IPC → Rust → Verarbeitung → Observability-Korrelation → UI-Diagnostics
- `e2e-tests/wdio.conf.windows.mjs` — WebdriverIO-Konfiguration für Windows (WebView2)
- Beweist Observability auf dem **echten nativen Pfad** (nicht nur Vite/JSdom/Mock-Bridge)

## Optional: Playwright E2E

### Standard Run

```bash
pnpm test:e2e
# or
pnpm exec playwright test
```

Standard run executes app-shell smoke tests. These are mandatory core gates in the autonomous test harness (E11).

### USB Corpus Run (Requires Local Corpus)

```bash
PROMPTVAULT_USB_CORPUS="/path/to/corpus" pnpm test:e2e:usb
```

USB corpus integration tests require:

- A local directory with `.md`/`.markdown`/`.txt` files.
- The `PROMPTVAULT_USB_CORPUS` environment variable set to that directory.

Without the variable, USB corpus tests are **skipped automatically** (no fail).

### Privacy Rules for USB Corpus Testing

- **Never** commit corpus files to the repository.
- **Never** commit screenshots, traces, or videos with real content.
- **Never** log real filenames or prompt contents.
- **Never** post private paths in GitHub issues/PRs/comments.
- Test data injected into the browser is **100% synthetic** — only aggregate counts reflect the real corpus.
- All Playwright output (`test-results/`, `playwright-report/`) is gitignored.

### Configuration

- Root-level `playwright.config.ts` starts Vite dev server automatically.
- Tests use Chromium headless by default.
- Screenshots, traces, and video recording are **off** by default (privacy-safe).
- Enable for debugging only: `--screenshot on --trace on`.

### Skip Behavior

When `PROMPTVAULT_USB_CORPUS` is not set:

- USB corpus tests are skipped automatically.
- Standard app-shell smoke tests run normally.
- No error, no failure.

Playwright ist ein Kern-Gate (E11) im Autonomous Test Harness. Nur die USB-Corpus-Abdeckung und visuelle Baselines bleiben optional.

## Optional: MkDocs

```bash
mkdocs build --strict
```

MkDocs ist auf einigen Hosts nicht installiert (Tool Gap). Dieser Check ist nicht blockierend.

## Autonomous Test Harness

Der Autonomous Test Harness (`scripts/verify-all.mjs`) orchestriert alle Kern-Gates in einem einzigen Durchlauf und erzeugt strukturierte Evidence unter `evidence/autonomous-test/<RUN_ID>/`.

### Schnell-Check (lokal, Pre-Commit)

```bash
pnpm verify:quick
```

Führt aus: `git diff --check`, ESLint, TypeScript, Vitest, Version Consistency, Feature Flag Defaults.

### Vollständige Verifikation (Pre-PR, Pre-Release)

```bash
pnpm verify:all
```

Führt die komplette Gate-Matrix aus:

| Gate | Befehl |
|------|--------|
| E1 | `git diff --check` |
| E2 | `pnpm install --frozen-lockfile` |
| E3 | `pnpm test` (Vitest) |
| E4 | `pnpm lint` (ESLint) |
| E5 | `pnpm exec tsc --noEmit` |
| E6 | `pnpm build` |
| E7 | `cargo fmt --check --all` |
| E8 | `cargo test --workspace` |
| E9 | `cargo clippy --workspace --all-targets -- -D warnings` |
| E10 | Secret Scan (CI-Patterns) |
| E11 | `pnpm exec playwright test` |
| E12 | Version Consistency |
| E13 | Lockfile Drift |
| E14 | Feature Flag Defaults |
| E15 | Visual Evidence (optional) |

### Independent Verifier

```bash
pnpm verify:independent -- --target-sha <SHA>
```

Klont das Repository frisch, checkt den Ziel-SHA aus und führt die vollständige Matrix erneut aus. Vergleicht Build-Chunk-Hashes zwischen Primär- und Verifier-Lauf.

### Evidence

Evidence wird unter `evidence/autonomous-test/<RUN_ID>/` abgelegt (gitignoriert):

- `00-context-manifest.json` — OS, Tool-Versionen, SHA
- `03-primary-summary.json` — Strukturierte Gate-Ergebnisse
- `04-primary-logs/` — stdout/stderr pro Gate
- `FINAL-REPORT.md` — Menschlbarer Abschlussbericht

### Status-Klassifikationen

Siehe `docs/testing/autonomous-test-harness-contract.md` für das vollständige Statusmodell.

## Remote-CI

GitHub Actions / Remote-CI ist `REMOTE_CI_INFRA_BLOCKED` (Issue #154).
Lokale Gates sind der autoritative Qualitäts-Gate.
Remote-CI-Reruns nicht ohne Owner-Approval auslösen.

## Neue Tests schreiben

### Rust

1. Test in das betroffene Modul unter `#[cfg(test)]` einfügen.
2. Für Dateisystem-Tests `tempfile` verwenden.
3. Reproduzierbare Fixtures nutzen.
4. Erwartete Scores, Artefakte und Fallbacks explizit prüfen.

### Frontend

1. Neue Testdatei neben Komponente oder Hook in `__tests__/` ablegen.
2. React Testing Library und jsdom verwenden.
3. Store-/Hook-Logik separat testen.
4. Tauri-Aufrufe mocken, wenn das Verhalten isoliert geprüft werden soll.
