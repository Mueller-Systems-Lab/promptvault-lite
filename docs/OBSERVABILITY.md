# Admin Observability Mode

> Read-only runtime diagnostics for PromptVault Lite. Local, in-process, no telemetry export.

---

## Was ist Admin Observability?

Admin Observability ist ein **lokaler Diagnosemodus**, mit dem sich die reale Verarbeitung eines Prompts end-to-end nachvollziehen lässt. Die produktive Pipeline (Qualität, Hygiene, Context, Blueprint, Gate, Optimierung, Varianten, Tauri IPC, Rust) wird dabei **instrumentiert**, nicht nachgebaut: Jeder Verarbeitungsschritt wird als **Span** innerhalb eines **Trace** aufgezeichnet — mit Status, Reason Code, Dauer und optionaler Parent/Child-Korrelation.

Damit lassen sich stille No-Ops, falsche Zustandsübergänge, verlorene Daten, stale Ergebnisse und Fehler an Frontend-/Tauri-/Rust-Grenzen auf den verantwortlichen Schritt zurückführen — statt nur „irgendetwas funktioniert nicht“ zu sehen.

---

## Abgrenzung zu Developer Mode

| | Developer Mode | Admin Observability |
|---|---|---|
| Semantik | Capability-/Action-Gate | Diagnose-/Beobachtungs-Gate |
| Wirkung | Schaltet lokale Actions frei (Write-Actions mit Approval-Grenze) | Nur lesend — ändert nichts |
| Berechtigungen | Kann lokale Actions freischalten | Keine Write-Action, kein Approval-Bypass, kein automatischer Developer Mode |

Admin Observability darf **keine** Write-Action freischalten, keine Approval-Grenze umgehen und den Developer Mode nicht automatisch aktivieren. Beide Toggles sind strikt getrennt.

---

## Was wird sichtbar?

- **Trace** — eine logisch zusammengehörige Benutzeroperation (`traceId`)
- **Span** — ein einzelner Verarbeitungsschritt (`spanId`)
- **Parent/Child** — hierarchische Verschachtelung (`parentSpanId`)
- **Pipeline Stage** — `operation` / `stage`
- **Status** — `started`, `succeeded`, `failed`, `blocked`, `skipped`, `fallback`, `partial_failure`
- **Reason Code** — stabiler, maschinenlesbarer Code (z. B. `FEATURE_DISABLED`)
- **Duration** — `durationMs`
- **Backend-Korrelation** — Trace-Kontext wird über die Tauri-IPC-Grenze getragen und vom Rust-Backend in den DTOs zurückgespiegelt
- **Layer** — `ui`, `store`, `typescript`, `tauri-ipc`, `rust-command`, `rust-scanner`, `rust-parser`, `rust-analysis`, `persistence`
- **Invariant Violations** — erkannte Integritätsverletzungen (z. B. `ANALYZE_ALL_RESULT_LENGTH_MISMATCH`, `CONSTRAINT_LOST`)
- **Blocked / Skipped / Failed / Partial Failure** — als explizite Entscheidungen, nicht als stiller No-Op

Beispiel:

```text
TRACE analyze-selected
  ├─ prompt-resolved           succeeded
  ├─ evaluate-prompt           succeeded
  │   └─ tauri:evaluate_prompt succeeded
  │       └─ rust:quality       succeeded
  ├─ analyze-hygiene           succeeded
  ├─ context-evaluation        succeeded
  ├─ state-update              succeeded
  └─ missing-info-gate         skipped   FEATURE_DISABLED
```

---

## Datenschutz

Der Diagnostic Export ist eine **shareable Security-/Privacy-Boundary** und arbeitet
**fail-closed**: Unbekannte oder nicht freigegebene Daten werden **weggelassen** — nie
"best-effort redacted und behalten".

Standardmäßig werden **keine** dieser Inhalte erfasst oder exportiert:

- vollständiger Prompttext
- Secrets, Tokens, Passwörter, API-Keys
- private absolute Pfade (stattdessen `vault:`-relative Pfade oder `.../basename`)
- Clipboard-Inhalte
- Remote-Telemetrie

Statt Rohinhalten werden `content_length`, `content_fingerprint`, `prompt_id`, `basename`, Klassifikation, Scores, Zähler und Reason Codes verwendet.

- **Safe-Metadata-Allowlist:** Nur ausdrücklich freigegebene, begrenzte Diagnose-Metadaten dürfen den Export verlassen. Unbekannte Attribute, beliebige Strings, verschachtelte/untypisierte Werte und prompt-/user-content-förmige Felder werden entfernt (`omitted_attribute_count` dokumentiert, wie viel weggelassen wurde).
- **Kein Raw Error String:** Rohe Fehlermeldungen und Stacktraces werden nicht exportiert — nur `category` und `reasonCode` (bounded Enums) bleiben erhalten.
- **Kein Netzwerk:** Admin Observability ist `LOCAL ONLY`, `IN PROCESS`, `NO TELEMETRY EXPORT`, `NO NETWORK`. Es gibt keinen Sentry/Datadog/OTel-Collector oder ähnlichen Cloud-Export.
- **Redaction als Defense-in-Depth:** Secret-/Path-Redaction läuft zusätzlich für freigegebene Text-Metadaten, ersetzt aber **nicht** die Allowlist.

---

## Persistenz

- **Session-only** — Events und Traces liegen nur im Speicher.
- **Bounded Ring Buffer** — maximal `100` Traces und `2000` Events; ältere Einträge werden verworfen.
- **Kein Cloud-/Datei-Export ohne explizite Nutzeraktion** — ein Export ist nur ein manueller, lokaler Download/Clipboard-Vorgang.
- **ON-Flag** wird in `localStorage` gemerkt (`promptvault.observability`); **Deep Diagnostics wird NICHT persistiert** und ist bei jedem App-Neustart aus.

---

## Bedienung

1. **Einstellungen** öffnen (⚙️).
2. Unter **Entwickler-Werkzeuge** den Schalter **Admin Observability** aktivieren.
3. Optional **Deep Diagnostics** aktivieren (erweiterte Rohdaten, session-only).
4. In der Toolbar erscheint ein 🔍-Button → **Diagnostics Panel** öffnen.
5. Eine Verarbeitung erneut ausführen (z. B. Prompt analysieren).
6. Im Panel den fehlgeschlagenen/übersprungenen Schritt ansehen (Status, Reason Code, Dauer).

Das Panel bietet: Übersicht (aktive Traces, Fehler, Warnungen, Invariant Violations, Blocked, Partial Failures), Trace-Timeline, Detailansicht eines Spans sowie einen Status-Filter.

---

## Export

- **Export Diagnostics** — erzeugt ein redigiertes JSON-Bundle (`schema_version`, `diagnostic_export_policy`, `export_policy_version`, `app_version`, `platform`, `feature_flags`, `traces`, `events`, `invariant_violations`, `omitted_attribute_count`, `omitted_event_attribute_count`). Der Export folgt dem **fail-closed Safe-Metadata-Modell** (`safe-metadata-v1`): unbekannte Attribute, beliebige/nested Strings, Prompt-/User-Content, Secrets, private absolute Pfade und rohe Fehlermeldungen werden entfernt. `app_version` stammt aus der kanonischen Build-Version (nie hartcodiert).
- **Copy for Debugging** — kompakte, KI-/Issue-lesbare Zusammenfassung: Operation, Trace, Status, fehlgeschlagener Schritt, Reason, letzter erfolgreicher Schritt, Invariant Violations, relevante Laufzeiten, Fehlerkategorie — plus die Bestätigung `Sensitive data exposed: NO`.

---

## Grenzen

- **Level 1 (Admin Observability)** ist release-sicher und zeigt Metadaten, Scores, Klassifikationen, Status und Reason Codes — aber **keinen vollständigen Prompttext**.
- **Level 2 (Deep Diagnostics)** ist ein separater, explizit zu aktivierender, **session-only**-Modus für umfangreichere diagnostische Metadaten. Er bleibt **privacy-safe und export-sicher**: kein Prompt-Body, kein raw Clipboard, keine raw Answers, keine arbitrary Instrumentation-Attribute, keine Secrets, keine privaten Pfade, keine untypisierten nested Inhalte. Es gibt **keinen** "dangerous raw mode". Er ist standardmäßig aus und wird nie heimlich persistiert.
- Die **Privacy Boundary** des Projekts (local-first, keine Telemetrie) wird durch Admin Observability **nicht** erweitert.

---

## Entwickler-Dokumentation

### Trace Contract

Der Vertrag ist typisiert und versioniert: `OBSERVABILITY_SCHEMA_VERSION = 1` in `src/observability/contracts.ts`. Ein `DiagnosticEvent` trägt `schemaVersion`, `traceId`, `spanId`, `parentSpanId`, `timestamp`, `durationMs`, `layer`, `operation`, `stage`, `status`, optional `category`, `reasonCode`, `inputFingerprint`, `outputFingerprint`, `attributes`, `error` und `invariantViolations`.

### Reason Codes

Reason Codes sind zentral in `src/observability/diagnostics.ts` katalogisiert (Code + Beschreibung + Default-Kategorie). Beispiele:

```text
FEATURE_DISABLED
BLOCKING_SENSITIVE_CONTENT
ANALYSIS_DATA_MISSING
REQUIRED_ANSWERS_MISSING
GATE_SESSION_MISSING
WATCHER_RESCAN_FAILED
TAURI_INVOKE_FAILED
ANALYZE_ALL_RESULT_LENGTH_MISMATCH
STALE_ANALYSIS_RESULT
CONSTRAINT_LOST
PARTIAL_SAVE_FAILURE
```

Fehlerklassen (`ErrorClass`) trennen `EXPECTED_BLOCK`/`EXPECTED_SKIP` von echten Fehlern (`PROCESSING_ERROR`, `INVARIANT_VIOLATION`, `SECURITY_BLOCK`, …).

### Backend-Korrelation

Das Frontend erzeugt `traceId`/`spanId`. Über `src-tauri/src/observability/mod.rs` (`TraceContext`/`BackendSpan`) wird der Trace-Kontext als optionaler, rückwärtskompatibler Kontext über die IPC-Grenze getragen und in den Antwort-DTOs zurückgespiegelt. Das Rust-Backend behauptet dabei **nie** eigenständig „Analyse erfolgreich“ — es meldet nur, dass der Invoke erfolgreich war; der Backend-Span trägt lediglich den Kontext + Zeitstempel/Dauer.

### OFF/ON Equivalence

Der kanonische Verarbeitungspfad wird beobachtet, nicht dupliziert. `emitDiagnosticEvent`/`recordTrace` sind bei deaktiviertem Modus No-Ops (`if (!enabled) return`). Für dieselben Inputs und Feature-Flags müssen die fachlichen Resultate identisch bleiben — abgesichert durch `offOnEquivalence.test.ts`. Observability darf Scores, Klassifikationen, Optimierung, Gate-Verhalten, Varianten oder Reihenfolgen nicht verändern.

### Redaction Rules

`src/observability/redaction.ts`:

- **Fail-closed Export Policy** (`safe-metadata-v1`): `SAFE_ATTRIBUTE_KEYS`-Allowlist — unbekannte Attribute und untypisierte/nested Werte werden entfernt (nie "redact and keep"). Secret-/Path-Redaction ist Defense-in-Depth für freigegebene Text-Metadaten.
- `stripSecrets` — Regex für API-Keys, Tokens, Passwörter, PEM-Private-Keys, GitHub/Slack/OpenAI/JWT-Token-Muster.
- `redactPath` — absolute Pfade werden zu `vault:`-relativen Pfaden oder `.../basename`.
- `contentFingerprint` — nicht-kryptografischer `length:hash`-Fingerprint (Deduplizierung, **keine** Sicherheitsgarantie).
- **Rohe Fehlermeldungen/Stacks** werden beim Export entfernt; nur `category` + `reasonCode` bleiben erhalten.

### Ring Buffer

`src/observability/events.ts`: `MAX_TRACES = 100`, `MAX_EVENTS = 2000`. Session-only, im Speicher, keine SQLite-Migration.

### Neue Spans hinzufügen

`src/observability/trace.ts` stellt `createTrace`, `openSpan` und `completeTrace` bereit. Trace-/Span-ID-Factories und Clock sind per `injectTraceIdFactory`/`injectSpanIdFactory`/`injectClock`/`injectPerformanceNow` injizierbar — Tests bleiben deterministisch. Instrumentiere den **kanonischen** Pfad (nicht einen zweiten Diagnosepfad) und beende jeden Span mit einem terminalen Status.

### Neue Reason Codes hinzufügen

Einen Code zu `ReasonCode` in `src/observability/contracts.ts` **und** zu `ALL_REASON_CODES` **und** zu `REASON_CODES` in `src/observability/diagnostics.ts` (mit Beschreibung + Default-Kategorie) hinzufügen. Keine frei erfundenen wechselnden Fehlerstrings als Primäridentifikation.

### Native E2E Proof

Der reale native Pfad (UI → Tauri IPC → Rust → Verarbeitung → Observability-Korrelation → UI-Diagnostics) ist per WebdriverIO auf Windows bewiesen: `e2e-tests/specs/admin-observability.native.spec.js` + `e2e-tests/wdio.conf.windows.mjs`. Rust-Korrelationstests liegen in `src-tauri/tests/observability_correlation.rs`.

### Privacy Tests

- `redaction.test.ts` — Secret-/Pfad-Redaction + Fail-Closed-Attribut/Error-Handling
- `privacy.test.ts` — kein Promptvolltext/Secrets/pfade im Bundle; unbekannte/nested Attribute weggelassen
- `privacySentinel.test.ts` — Sentinel-Secret darf im Export nicht auftauchen; Deep Diagnostics bleibt fail-closed
- `exportPolicy.test.ts` — realer Exportpfad (Event → Store → Builder → JSON) bleibt fail-closed
- `offOnEquivalence.test.ts` — Observability ON/OFF liefert identische Resultate

Künftige Features dürfen die Observability **nicht umgehen**: neue Verarbeitungspfade sollen instrumentiert und ihre stille No-Ops als explizite Entscheidung (Status + Reason Code) sichtbar werden.
