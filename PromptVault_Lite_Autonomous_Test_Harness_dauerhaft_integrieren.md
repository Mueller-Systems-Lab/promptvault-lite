# Prompt — PromptVault Lite Autonomous Test Harness dauerhaft integrieren

Du arbeitest am Repository:

```text
https://github.com/xxammaxx/promptvault-lite
```

Projekt: **PromptVault Lite**

Referenzstand des zuletzt validierten Harness-Laufs:

```text
6aa9e8f76b871df7ad75510994faae82f097ff2b
```

Diese SHA ist nur historische Referenz. Sie ist nicht automatisch der aktuelle Arbeitsstand.

---

# Auftrag

Überführe den bereits erfolgreich validierten autonomen Testprozess in eine dauerhaft wartbare, reproduzierbare und einfach aufrufbare Projektfunktion.

Ziel ist, dass künftig ein einzelner Befehl genügt, um:

1. den aktuellen Git-SHA zu erfassen,
2. alle Kern-Gates auszuführen,
3. Evidence strukturiert zu speichern,
4. Fehler korrekt zu klassifizieren,
5. optionale Hardware- und Plattformlücken getrennt auszuweisen,
6. einen frischen Independent Verifier zu starten,
7. einen maschinenlesbaren und menschenlesbaren Abschlussbericht zu erzeugen.

Zielbefehl, sofern keine bessere bestehende Projektkonvention erkannt wird:

```bash
pnpm verify:all
```

Zusätzlich sollen mindestens folgende Modi verfügbar sein:

```bash
pnpm verify:quick
pnpm verify:all
pnpm verify:independent
```

Die Lösung muss lokal unter Linux funktionieren und plattformneutral genug entworfen sein, um später auch unter Windows verwendet werden zu können.

---

# Verbindliche Grundregeln

## 1. Reality Refresh

Chatverläufe, Memory, ältere Run Cards, frühere Evidence und die Referenz-SHA sind nicht die aktuelle Source of Truth.

Führe zuerst einen vollständigen Live-Scan durch:

* aktueller Repository-Pfad
* Remotes
* aktueller Branch
* aktueller HEAD-SHA
* Status des Working Trees
* letzter Tag
* offene Pull Requests
* aktuelle GitHub-Actions-Workflows
* aktuelle Testskripte
* vorhandene Evidence
* vorhandene Agent Skills
* vorhandene Test-Orchestrierung
* Node-, pnpm-, Rust-, Cargo-, Python-, Git-, Hermes- und OpenCode-Versionen
* Playwright-Version und installierte Browser

Aktuelle Source of Truth:

1. Live-Repository
2. GitHub-Metadaten
3. aktuelle Test- und Build-Konfiguration
4. aktuelle Runtime-Ausgaben
5. frisch erzeugte Evidence

---

## 2. OS- und Shell-Preflight

Vor Änderungen feststellen:

```text
OS
OS-Version
Architektur
aktive Shell
Pfadkonvention
Encoding
Dateisystem
Paketmanager
Node-Version
pnpm-Version
Rust-Version
Cargo-Version
Python-Version
Git-Version
Hermes-Version
OpenCode-Version
Display-/Headless-Kontext
```

Keine Linux-, Windows- oder macOS-Befehle ungeprüft vermischen.

Der neue Runner soll möglichst mit Node.js-Bordmitteln umgesetzt werden, nicht als Bash-only-Skript.

---

## 3. NO_OP_HYPOTHESIS

Prüfe vor jeder Implementierung, ob bereits eine ausreichende Lösung existiert.

Suche unter anderem nach:

```text
package.json scripts
scripts/verify*
scripts/test*
scripts/ci*
Makefile
justfile
Taskfile.yml
.github/actions/
.github/workflows/
existing evidence runner
existing independent verifier
```

Falls der gewünschte Zustand bereits vollständig besteht:

```text
GREEN_ALREADY_SATISFIED_NO_CHANGE
```

Dann keine unnötigen Änderungen vornehmen.

---

## 4. Skill Preflight

Inventarisiere zuerst vorhandene Skills.

Erwartete, bereits validierte Fähigkeiten:

```text
verification-before-completion
systematic-debugging
test-driven-development
subagent-driven-development
webapp-testing
playwright-best-practices
```

Prüfe:

* Installationspfad
* Quelle
* Quellcommit
* Git-Blob
* SHA-256
* Discovery durch OpenCode
* Discovery beziehungsweise External Directory durch Hermes
* Namenskollisionen
* tote Symlinks
* fehlende Referenzdateien
* Upstream-Drift

Verwende vorhandene verifizierte Skills weiter.

Keine Neuinstallation bei identischem validierten Stand.

Keine Aktualisierung auf `latest`.

Keine zusätzlichen Skills ohne nachgewiesene konkrete Fähigkeitslücke.

Bei Upstream-Abweichung:

```text
AMBER_SKILL_UPSTREAM_DRIFT_REVIEW_REQUIRED
```

---

# Zielarchitektur

## A. Ein zentraler plattformbewusster Runner

Bevorzugter Pfad:

```text
scripts/verify-all.mjs
```

Alternativer Pfad nur, wenn die bestehende Projektarchitektur eindeutig eine andere Konvention vorgibt.

Der Runner darf keine Testlogik duplizieren. Er orchestriert ausschließlich die vorhandenen Projektbefehle.

Pflichtfunktionen:

```text
--quick
--full
--independent
--gate <name>
--evidence-dir <path>
--json-summary <path>
--target-sha <sha>
--no-color
```

Der Runner muss:

* Git-Root automatisch erkennen
* exakten HEAD-SHA erfassen
* schmutzigen Working Tree erkennen
* Branch und Tag erfassen
* OS- und Toolversionen speichern
* Commands ohne unsichere String-Verkettung starten
* Exit-Codes unverändert übernehmen
* stdout und stderr getrennt speichern
* Dauer jedes Gates messen
* Abbruchsignale korrekt behandeln
* Child-Prozesse zuverlässig beenden
* Logs auf Secrets prüfen beziehungsweise sensible Werte maskieren
* einen Evidence-Index erzeugen
* Fehlerklassen unterscheiden
* bei kritischem Gate korrekt abbrechen
* trotzdem bereits vorhandene Logs und Zusammenfassungen sichern

Kein `shell: true`, sofern es nicht zwingend erforderlich und sicher begründet ist.

Keine versteckten automatischen Retries.

---

## B. Package-Skripte

Ergänze geeignete Skripte in `package.json`.

Zielbild:

```json
{
  "scripts": {
    "verify:quick": "node scripts/verify-all.mjs --quick",
    "verify:all": "node scripts/verify-all.mjs --full",
    "verify:independent": "node scripts/verify-all.mjs --independent"
  }
}
```

Passe Namen an, wenn die bestehende Projektkonvention eine bessere, konsistente Benennung vorgibt.

Keine bestehenden Skripte brechen oder semantisch verändern.

---

## C. Quick Gate

Der Quick Gate ist für lokale Zwischenstände bestimmt.

Mindestens:

```text
git diff --check
ESLint
TypeScript
relevante schnelle Vitest-Suite oder vollständige Vitest-Suite, falls Laufzeit akzeptabel
Version Consistency
Feature-Flag Default Check
```

Der Quick Gate ersetzt niemals den Full Gate vor:

* PR-Freigabe
* Merge
* Tag
* Release
* Abschlussklassifikation

---

## D. Full Gate

Der Full Gate muss die aktuelle Projektmatrix aus der Live-Konfiguration ableiten.

Voraussichtliche Kern-Gates:

```text
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
cargo fmt --check --all
cargo test --workspace --locked
cargo clippy --workspace --locked -- -D warnings
Secret Scan entsprechend GitHub Actions
pnpm exec playwright test
git diff --check
Version Consistency
Lockfile Drift
Feature-Flag Default Check
```

Diese Befehle sind Kandidaten, keine blind zu kopierende Wahrheit.

Gleiche sie gegen die aktuelle Projektkonfiguration ab.

Keine Dependency-Aktualisierung.

Verboten:

```text
cargo update
cargo generate-lockfile
pnpm update
npm update
ungeprüfte Lockfile-Neuerzeugung
```

---

## E. Independent Verifier

Der Independent Verifier muss technisch unabhängig vom primären Lauf sein.

Pflichtanforderungen:

1. Ziel-SHA vor Beginn einfrieren.
2. Frischen Clone oder echten isolierten Worktree verwenden.
3. `git rev-parse HEAD` muss exakt dem Ziel-SHA entsprechen.
4. Keine übernommenen `dist`, `target`, Playwright-Ausgaben oder Testreports.
5. Dependency-Installation mit Lockfile-Gates.
6. Vollständige Full-Matrix erneut ausführen.
7. Eigene Evidence erzeugen.
8. Working Tree am Ende prüfen.
9. Ergebnisse gegen den primären Lauf vergleichen.
10. Build-Chunk-Hashes vergleichen, soweit deterministisch möglich.

Primärer Runner und Independent Verifier dürfen nicht denselben Abschlussbericht erzeugen oder gegenseitig überschreiben.

Bei Divergenz:

```text
AMBER_PRIMARY_VERIFIER_DIVERGENCE
```

Kein GREEN, bis die Abweichung erklärt ist.

---

## F. Evidence-Vertrag

Standardpfad:

```text
evidence/autonomous-test/<RUN_ID>/
```

Prüfe zuerst, ob dieser Pfad gitignoriert ist.

Keine Evidence versehentlich committen.

Pflichtstruktur:

```text
00-context-manifest.json
01-test-inventory.json
02-skill-state.json
03-primary-summary.json
04-primary-logs/
05-playwright-report/
06-screenshots/
07-traces/
08-flakiness-analysis.json
09-security-consistency.json
10-independent-summary.json
11-primary-verifier-delta.json
FINAL-REPORT.md
```

Jeder Gate-Eintrag enthält mindestens:

```json
{
  "gate": "vitest",
  "command": "pnpm test",
  "runner": "primary",
  "tested_git_sha": "...",
  "started_at": "...",
  "ended_at": "...",
  "duration_ms": 0,
  "exit_code": 0,
  "passed": 0,
  "failed": 0,
  "skipped": 0,
  "stdout_log": "...",
  "stderr_log": "...",
  "stdout_sha256": "...",
  "stderr_sha256": "...",
  "classification": "PASS"
}
```

Das System darf Testzahlen nicht aus freiem Text raten.

Wenn ein Framework strukturierte Reporter unterstützt, verwende sie.

Beispiele:

* Vitest JSON Reporter
* Playwright JSON oder JUnit Reporter
* Cargo maschinenlesbare Ausgabe, soweit stabil und sinnvoll
* eigene klar begrenzte Parser nur mit Tests

---

## G. Fehlerklassifikation

Verwende mindestens:

```text
PASS
RED_PRODUCT_FAILURE
RED_TEST_FAILURE
RED_INFRASTRUCTURE_FAILURE
AMBER_FLAKY_TEST
AMBER_ORDER_OR_STATE_LEAK
AMBER_ENVIRONMENT_DRIFT
YELLOW_OPTIONAL_HARDWARE_NOT_EXECUTED
YELLOW_VISUAL_BASELINE_MISSING
YELLOW_TRANSIENT_RUNNER_INVOCATION_ANOMALY
```

Ein fehlgeschlagener erster Lauf darf nicht durch einen erfolgreichen Retry gelöscht werden.

Beispiel:

```text
Erster Build: exit 126
Unveränderter Wiederholungslauf: PASS
Independent Verifier: PASS
```

Klassifikation:

```text
YELLOW_TRANSIENT_RUNNER_INVOCATION_ANOMALY
```

Der erste Fehler muss in der Evidence erhalten bleiben.

---

## H. Flakiness-Regeln

Bei einem Testfehler:

1. erstes vollständiges Fehlerlog sichern,
2. Test isoliert reproduzieren,
3. unverändert mindestens dreimal ausführen,
4. kritische E2E-Tests fünfmal prüfen,
5. Single Worker gegen Parallelbetrieb vergleichen,
6. Reihenfolgeeffekte untersuchen,
7. Shared-State-Leaks prüfen.

Ein späterer PASS macht einen früheren FAIL nicht unsichtbar.

Keine automatische Erhöhung von Retries.

Keine automatische Quarantäne.

Keine automatischen `skip`, `fixme` oder Snapshot-Updates.

---

## I. Playwright-Evidence

Bei E2E-Fehlern automatisch sichern:

* Trace
* Screenshot
* Video nur wenn konfiguriert oder für Diagnose erforderlich
* Browser-Konsole
* Page Errors
* fehlgeschlagene Netzwerkrequests
* aktueller DOM-Snapshot beziehungsweise relevante Ausschnitte
* Viewport
* Theme
* Testname
* Versuchszahl

USB-Corpus-Tests ohne gesetztes:

```text
PROMPTVAULT_USB_CORPUS
```

werden klassifiziert als:

```text
YELLOW_OPTIONAL_HARDWARE_NOT_EXECUTED
```

Sie dürfen den Kernstatus nicht fälschlich RED machen.

Sie dürfen aber auch nicht als getestet gemeldet werden.

---

## J. Visuelle Baselines

Bestehende Privacy-Entscheidung respektieren.

Keine visuellen Snapshot-Baselines automatisch erzeugen oder committen.

Wenn keine freigegebenen Baselines existieren:

* Screenshots nur als lokale Evidence erzeugen
* keine automatische visuelle Regression behaupten
* klassifizieren als:

```text
YELLOW_VISUAL_BASELINE_MISSING
```

Eine spätere Baseline-Einführung benötigt eine separate Owner-Freigabe.

---

# Test-Quality-Gate für den neuen Runner

Die neue Orchestrierung selbst muss getestet werden.

Mindestens folgende Runner-Tests erstellen:

1. erfolgreicher Command wird korrekt als PASS gespeichert
2. Exit-Code wird unverändert übernommen
3. stdout und stderr werden getrennt gespeichert
4. fehlender Befehl wird korrekt klassifiziert
5. Exit 126 bleibt als ursprünglicher Fehler sichtbar
6. Signalabbruch beendet Child-Prozesse
7. Target-SHA-Mismatch blockiert den Lauf
8. schmutziger Working Tree wird erkannt
9. Evidence-Pfad kann keine Pfadtraversierung durchführen
10. Secrets werden im Report maskiert
11. optionaler USB-Skip wird nicht als Kernfehler gezählt
12. Primary-/Verifier-Divergenz blockiert GREEN
13. unbekannter Gate-Name wird abgelehnt
14. Evidence-Dateien werden atomar geschrieben
15. zwei parallele Runs überschreiben sich nicht

Für jeden neuen Test:

* Test zuerst schreiben
* RED-Zustand nachweisen
* minimale Implementierung
* GREEN-Zustand nachweisen
* relevante Mutation oder Seeded Fault prüfen

Keine test-only Hintertüren im Produktionsrunner.

---

# Sicherheitsanforderungen

Der Runner darf:

* lokale Testbefehle starten
* lokale Evidence schreiben
* temporäre Verzeichnisse erstellen
* einen frischen Clone beziehungsweise Worktree erstellen
* Read-only GitHub-Metadaten abfragen

Der Runner darf nicht:

* Secrets ausgeben
* `.env` vollständig loggen
* SSH-Schlüssel lesen
* GitHub-Tokens anzeigen
* Credential Stores durchsuchen
* Änderungen pushen
* PRs erstellen
* Branches löschen
* Tags erstellen
* Releases erstellen
* Issues verändern
* Feature Flags verändern
* Produktionsdateien automatisch reparieren

---

# CI-Integration

Prüfe die bestehende GitHub-Actions-Struktur.

Erweitere sie nur, wenn dadurch keine bestehende zuverlässige Matrix dupliziert wird.

Bevorzugtes Ziel:

## Pull Requests

```text
Quick beziehungsweise bestehende Kernjobs
```

## Manuell oder Nightly

```text
Full autonomous verification
```

## Vor Release

```text
Full Gate + Independent Verifier
```

Ein Nightly-Workflow darf vorbereitet werden, aber:

* keine übermäßigen Kosten erzeugen,
* keine Release-Artefakte veröffentlichen,
* keine Issues automatisch schließen,
* keine Fehler automatisch reparieren,
* Logs und Reports als Workflow-Artefakte speichern,
* bei Fehlern klaren Status liefern.

Falls ein Nightly-Workflow erhebliche neue Infrastruktur oder GitHub-Kosten verursacht, nur einen Vorschlag erstellen und nicht aktivieren.

---

# Evolution Health Gate

Bewerte nicht nur, ob die neuen Tests grün sind.

Prüfe zusätzlich das Delta bei:

```text
Architektur
Komplexität
Duplikation
Abhängigkeiten
Testlaufzeit
Wartbarkeit
CI-Laufzeit
Evidence-Größe
Fehlerdiagnose
plattformabhängige Sonderlogik
```

Ein lokal grüner Runner darf bei übermäßiger Komplexität nicht als vollständig GREEN gelten.

Mögliche Klassifikation:

```text
AMBER_ARCHITECTURAL_EROSION
```

Der Runner soll klein, transparent und leicht entfernbar bleiben.

Keine neue Testplattform im Projekt nachbauen.

---

# Erwarteter Implementierungsablauf

## Phase 1 — Reality Refresh

Nur lesen und inventarisieren.

## Phase 2 — Verification Contract

Erstelle vor Codeänderungen:

```text
docs/testing/autonomous-test-harness-contract.md
```

Oder einen besser passenden bestehenden Dokumentationspfad.

Der Contract beschreibt:

* Gate-Namen
* Befehle
* Pflicht- und optionale Gates
* Statusmodell
* Evidence-Schema
* Independent-Verifier-Vertrag
* Flakiness-Regeln
* Sicherheitsgrenzen

## Phase 3 — Red Tests

Runner-Tests zuerst erstellen und korrekt fehlschlagen lassen.

## Phase 4 — Minimal Implementation

Nur die kleinste notwendige Orchestrierung implementieren.

## Phase 5 — Primäre Verifikation

Führe die komplette neue Matrix auf dem Candidate-SHA aus.

## Phase 6 — Independent Verifier

Frischer Clone, gleicher Candidate-SHA, vollständige Matrix.

## Phase 7 — Evolution Health Review

Komplexitäts- und Wartbarkeitsdelta prüfen.

## Phase 8 — Dokumentation

Mindestens dokumentieren:

```text
pnpm verify:quick
pnpm verify:all
pnpm verify:independent
Evidence-Pfad
Statuscodes
optionale USB-Abdeckung
visuelle Baseline-Grenze
```

## Phase 9 — Final Report

Stoppe vor Commit, Push oder PR.

---

# Erforderlicher Abschlussbericht

Der Bericht muss enthalten:

```text
STATUS
Repository
Branch
Base SHA
Candidate SHA
Working Tree vorher
Working Tree nachher
geänderte Dateien
neue Dateien
entfernte Dateien
Skills verwendet
Skills neu installiert
Skill-Hashes
Testmatrix
Runner-Tests
Primärer Lauf
Independent Verifier
Primary-/Verifier-Delta
Laufzeiten
Evidence-Pfad
optionale Lücken
Evolution-Health-Bewertung
Security-Bewertung
empfohlener Commit
empfohlener PR-Titel
Rollback-Plan
```

Zusätzlich:

```text
git diff --stat
git diff --check
git status --short
```

---

# Zulässige Abschlussklassifikationen

## Vollständig implementiert

```text
GREEN_AUTONOMOUS_TEST_HARNESS_PERSISTENT_AND_VALIDATED
```

Erfordert:

* einheitliche Ein-Kommando-Schnittstelle
* Runner-Tests grün
* vollständige Kernmatrix grün
* Independent Verifier grün
* keine unerklärte Divergenz
* keine unbeabsichtigte Dependency-Änderung
* keine Architekturerosion
* Evidence vollständig

## Bereits vorhanden

```text
GREEN_ALREADY_SATISFIED_NO_CHANGE
```

## Optionale Plattform-/Hardwarelücke

```text
GREEN_CORE_GATES_AMBER_OPTIONAL_PLATFORM_OR_HARDWARE_COVERAGE
```

## Flakiness

```text
AMBER_FLAKY_TESTS_BLOCK_COMPLETION_CLAIM
```

## Architekturproblem

```text
AMBER_ARCHITECTURAL_EROSION
```

## Skill-Drift

```text
AMBER_SKILL_UPSTREAM_DRIFT_REVIEW_REQUIRED
```

## Infrastrukturfehler

```text
RED_TEST_INFRASTRUCTURE_FAILURE
```

## Produktfehler

```text
RED_REPRODUCIBLE_PRODUCT_FAILURE
```

---

# Stop-Bedingung

Nach Implementierung, primärer Verifikation, Independent Verifier und Abschlussbericht stoppen.

Nicht selbstständig:

* committen
* pushen
* PR erstellen
* mergen
* Tag setzen
* Release erstellen
* Branch löschen
* Issues schließen
* visuelle Baselines übernehmen
* Produktionsfehler reparieren, die außerhalb des Runner-Auftrags liegen

Lege die Änderungen und Evidence zur Owner-Prüfung vor.

