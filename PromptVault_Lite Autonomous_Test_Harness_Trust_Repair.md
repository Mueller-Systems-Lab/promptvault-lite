# Corrective Run Card — PromptVault Lite Autonomous Test Harness Trust Repair

**Run Card ID:** `PVL-AUTONOMOUS-TEST-HARNESS-TRUST-REPAIR-20260803-001`
**Repository:** `https://github.com/xxammaxx/promptvault-lite`
**Betroffener Commit:** `918b81a7833e73335ea2dc9e77d964249b9c4601`
**Ausgangsklassifikation:** `RED_AUTONOMOUS_TEST_HARNESS_FALSE_GREEN_CAPABLE`

---

## 1. Auftrag

Repariere den persistenten Autonomous Test Harness so, dass er keine False-GREEN-Ergebnisse mehr erzeugen kann und sein dokumentierter Independent-Verifier-Vertrag tatsächlich technisch umgesetzt wird.

Der normale Produktionscode von PromptVault Lite ist nicht Gegenstand dieses Auftrags.

Arbeite von einem aktuellen Live-Scan aus. Ältere Reports und diese Run Card sind keine Source of Truth.

---

## 2. Zulässiger Git-Workflow

Erstelle vom aktuellen `master` einen isolierten Reparaturbranch:

```text
fix/autonomous-test-harness-trust
```

Bevorzugt:

```bash
hermes --worktree
```

Vorher die tatsächlich installierte Hermes-Version und Syntax mit folgenden Befehlen ermitteln:

```bash
hermes -h
hermes --help
```

Falls die native Worktree-Funktion nicht verfügbar ist, verwende einen normalen, nachweislich ignorierten Git-Worktree.

Erlaubt:

* Reparaturbranch erstellen
* lokale Commits erzeugen
* Branch nach vollständiger Verifikation pushen
* Draft-PR erstellen

Nicht erlaubt:

* direkt auf `master` schreiben
* PR mergen
* Auto-Merge aktivieren
* Tag oder Release erstellen
* Issues schließen
* Feature-Flag-Defaults ändern
* Produktionsfehler außerhalb des Harness-Auftrags reparieren

---

## 3. Reality Refresh und OS-Preflight

Ermittle vor Änderungen:

```text
OS und Version
Architektur
aktive Shell
Repository-Root
aktueller master-SHA
Working-Tree-Status
Git-Remote
Node- und pnpm-Version
Rust- und Cargo-Version
Python-Version
Hermes-Version
OpenCode-Version
Playwright-Version
verfügbare Browser
Dateisystem des Repositorys
Dateisystem des temporären Verzeichnisses
```

Prüfe den tatsächlichen Inhalt mindestens dieser Dateien:

```text
scripts/verify-all.mjs
scripts/lib/runner.mjs
scripts/__tests__/runner.test.js
docs/testing/autonomous-test-harness-contract.md
docs/TESTING.md
package.json
.gitignore
.github/workflows/ci.yml
```

---

## 4. Bestätigte Ausgangsfehler

Validiere jeden Fehler zunächst selbst. Nicht blind übernehmen.

### F1 — Independent-Modus erzeugt keinen unabhängigen Checkout

Der eingecheckte Modus prüft nur den aktuellen Checkout gegen `--target-sha`.

Er erzeugt derzeit nicht verbindlich:

* frischen Remote-Clone
* getrennte Dependency-Installation
* getrennte Build-Ausgaben
* eigenes Verifier-Evidence-Paket
* Primary-/Verifier-Delta
* Build-Chunk-Vergleich

### F2 — Feature-Flag-Gate meldet immer PASS

Die Prüfung muss die tatsächlichen Defaults validieren.

Zu prüfen:

```text
PROMPTVAULT_DIRECTION_PROFILES
PROMPTVAULT_MISSING_INFO_GATE
PROMPTVAULT_EMBEDDINGS
```

### F3 — Lockfile-Gate ignoriert Git-Exit-Codes

Zu prüfen:

```text
pnpm-lock.yaml
src-tauri/Cargo.lock
```

### F4 — Playwright wird als optional behandelt

Die Kern-E2E-Suite ist Pflicht.

Nur folgende Abdeckung darf optional bleiben:

```text
USB-Corpus ohne PROMPTVAULT_USB_CORPUS
nicht freigegebene visuelle Pixel-Baselines
nicht vorhandene Plattform-Build-Hosts
```

### F5 — Secret Scan ist unvollständig

Die lokale Prüfung muss mindestens dieselben Verträge wie CI abdecken:

* bekannte Secret-Muster
* eingecheckte `.env`-Dateien
* eingecheckte `.db`, `.db-shm`, `.db-wal` und `.db-journal`
* identische beziehungsweise gemeinsam genutzte Allowlist

### F6 — Tests prüfen die Verträge nicht wirklich

Die bestehenden Tests enthalten mehrere Assertions über Hilfsfunktionen, ohne den tatsächlichen CLI-Kontrollfluss zu testen.

### F7 — Evidence- und Statusprobleme

Prüfe und repariere:

* Run-ID-Kollision zwischen separaten Prozessen
* Cross-Filesystem-Fehler beim atomischen Schreiben
* nicht verwendete Pfadvalidierung
* falsche Branch-Erkennung in ESM
* Verlust der ursprünglichen Fehlerklasse im Gesamtstatus
* gelbe Klassifikation trotz real fehlgeschlagenem optionalen Gate
* fehlende saubere Trennung von Pflicht-Gate und optionaler Coverage

---

## 5. Verification Contract vor Implementierung einfrieren

Aktualisiere den Verification Contract erst, nachdem Code und Live-Konfiguration verstanden wurden.

Definiere eindeutig:

### Pflicht-Gates

```text
Repository Hygiene
Frozen Dependency Install
Vitest
ESLint
TypeScript
Frontend Build
Rust Format
Rust Tests mit --locked
Rust Clippy mit --locked
vollständiger Secret Scan
Playwright Core E2E
Version Consistency
pnpm-lock.yaml Drift
Cargo.lock Drift
Feature-Flag Defaults
```

### Optionale Coverage

```text
USB-Corpus
visuelle Pixel-Baselines
Windows-Build
macOS-Build
AppImage-Build
```

Ein optionaler Coverage-Ausfall darf niemals einen realen Fehlschlag des zugehörigen Kern-Gates verdecken.

---

## 6. Test-first Reparatur

Vor Produktionsänderungen müssen echte Red-Tests erstellt werden.

### T1 — Echter Independent Clone

Erzeuge für den Test ein temporäres Bare-Remote-Repository.

Der Test muss beweisen:

1. Der Verifier erstellt einen neuen Clone.
2. Der Verifier hat ein anderes `.git`-Verzeichnis als der Primary Runner.
3. Nicht eingecheckte Markerdateien des Primary Checkouts fehlen.
4. Der Checkout steht exakt auf `--target-sha`.
5. Eigene Dependency-, Build- und Evidence-Verzeichnisse werden verwendet.
6. Ein SHA-Mismatch stoppt den Lauf.

### T2 — Primary-/Verifier-Divergenz

Seeded Fault:

* Primary-Gate PASS
* Verifier-Gate FAIL oder abweichender Build-Hash

Erwartung:

```text
AMBER_PRIMARY_VERIFIER_DIVERGENCE
```

Der Prozess muss ungleich null enden.

### T3 — Feature-Flag-Defaults

Für jedes Flag:

1. korrekter Default → PASS
2. Seeded Fault auf enabled → FAIL
3. fehlende Definition → FAIL
4. mehrdeutige widersprüchliche Definition → FAIL

Keine reine Suche nach einem Variablennamen.

### T4 — Lockfile Drift

Seeded Faults:

* `pnpm-lock.yaml` verändern → Gate muss fehlschlagen
* `src-tauri/Cargo.lock` verändern → Gate muss fehlschlagen
* unveränderte Lockfiles → PASS

Der Test muss den realen Exit-Code des Git-Befehls auswerten.

### T5 — Playwright-Kernfehler

Simuliere einen fehlgeschlagenen E11-Core-Lauf.

Erwartung:

```text
RED_TEST_FAILURE
```

Der Gesamtstatus darf nicht GREEN oder YELLOW sein.

Vier korrekt deklarierte USB-Skips bei ansonsten grüner Suite dürfen dagegen ergeben:

```text
YELLOW_OPTIONAL_HARDWARE_NOT_EXECUTED
```

### T6 — Secret Scan

Seeded Faults:

* Test-Token
* private-key header
* eingecheckte `.env`
* eingecheckte `.db`
* eingecheckte `.db-wal`

Jeder Fault muss das Gate rot machen.

Allowlist-Fälle müssen weiterhin grün bleiben.

### T7 — CLI-Pfadsicherheit

Teste die tatsächliche CLI, nicht nur eine unbenutzte Hilfsfunktion:

```text
--evidence-dir
--json-summary
```

Pfadtraversierung muss blockiert werden.

Zwei parallele Prozesse dürfen ihre Evidence nicht überschreiben.

### T8 — Atomisches Schreiben

Temporäre Datei im Zielverzeichnis anlegen und dort atomar umbenennen.

Kein Rename von `/tmp` auf ein möglicherweise anderes Dateisystem.

Der Test muss mindestens Zielverzeichnis und temporäre Datei auf demselben Mount bestätigen.

### T9 — Prozess- und Signalbehandlung

Starte einen Child-Prozess mit eigenem Unterprozess.

Bei Timeout oder SIGTERM müssen alle vom Harness erzeugten Prozesse beendet werden.

Keine verwaisten Testserver oder Browser.

### T10 — Tatsächliche Unknown-Gate-Ablehnung

```bash
node scripts/verify-all.mjs --gate __NONEXISTENT__
```

muss:

* ungleich null enden
* keine Gates ausführen
* eine strukturierte Fehlermeldung erzeugen

### T11 — Branch- und Kontextmanifest

Der Branch darf in einem normalen Branch-Checkout nicht `unknown` sein.

Detached HEAD muss ausdrücklich als detached dokumentiert werden.

### T12 — Fehlerklassifikation

Teste mindestens:

```text
RED_PRODUCT_FAILURE
RED_TEST_FAILURE
RED_INFRASTRUCTURE_FAILURE
AMBER_FLAKY_TEST
AMBER_PRIMARY_VERIFIER_DIVERGENCE
YELLOW_OPTIONAL_HARDWARE_NOT_EXECUTED
YELLOW_VISUAL_BASELINE_MISSING
YELLOW_TRANSIENT_RUNNER_INVOCATION_ANOMALY
```

Die Run-Level-Klassifikation darf die Gate-Fehlerklasse nicht pauschal überschreiben.

---

## 7. Independent Verifier korrekt implementieren

`pnpm verify:independent` muss selbstständig:

1. `--target-sha` verlangen.
2. Origin-URL aus dem Live-Repository lesen.
3. ein kryptografisch beziehungsweise exklusiv eindeutiges temporäres Verzeichnis erzeugen.
4. einen frischen Clone erstellen.
5. den exakten SHA in detached HEAD auschecken.
6. `git rev-parse HEAD` verifizieren.
7. prüfen, dass keine Build-Ausgaben oder Evidence aus dem Primary Checkout übernommen wurden.
8. die vollständige Pflichtmatrix ausführen.
9. eigenes Evidence mit `runner: independent` erzeugen.
10. den Working Tree nach dem Lauf kontrollieren.
11. Primary- und Verifier-Ergebnisse vergleichen.
12. Build-Dateien rekursiv inventarisieren und deren SHA-256 vergleichen.
13. bei Divergenz AMBER plus Exit-Code ungleich null erzeugen.
14. den temporären Clone bei Fehlern für Diagnose erhalten oder seinen Pfad dokumentieren.
15. bei erfolgreichem Lauf kontrolliert aufräumen.

Kein rekursiver Aufruf von `verify:independent` innerhalb des Verifier-Clones.

---

## 8. Gate-Reparaturen

### Feature Flags

Bevorzugt beobachtbares Verhalten oder vorhandene Feature-Flag-Tests prüfen.

Wenn statische Prüfung erforderlich ist:

* exakte Quellstellen definieren,
* Syntax kontrolliert parsen,
* Defaultwert auswerten,
* widersprüchliche Definitionen blockieren.

### Lockfiles

Nach allen Dependency-, Rust- und Build-Gates:

```bash
git diff --exit-code -- pnpm-lock.yaml src-tauri/Cargo.lock
```

Den tatsächlichen Exit-Code auswerten.

Zusätzlich prüfen:

```bash
git status --short -- pnpm-lock.yaml src-tauri/Cargo.lock
```

### Rust

Verwende, soweit mit der Live-Struktur kompatibel:

```bash
cargo test --workspace --locked
cargo clippy --workspace --locked --all-targets -- -D warnings
```

### Playwright

E11 bleibt Pflicht.

USB-Abdeckung aus dem Playwright-Ergebnis separat extrahieren; nicht die gesamte Suite optional machen.

### Secret Scan

Bevorzugt eine einzige gemeinsame, plattformbewusste Implementierung, die lokal und in GitHub Actions genutzt werden kann.

Falls CI geändert wird:

* bestehende Semantik bewahren,
* keine Scan-Abdeckung reduzieren,
* Workflow-Gates vollständig erneut prüfen.

---

## 9. Evidence-Reparatur

Pflichtdateien:

```text
00-context-manifest.json
01-test-inventory.json
02-skill-state.json
03-primary-summary.json
04-primary-logs/
05-playwright-report/
06-independent-summary.json
07-primary-verifier-delta.json
08-build-hashes-primary.json
09-build-hashes-independent.json
FINAL-REPORT.md
```

Jede Evidence-Datei:

* atomar im Zielverzeichnis schreiben,
* SHA-256 erhalten,
* mit Ziel-SHA und Runner-Rolle versehen,
* keine Secrets enthalten.

Run-ID muss über separate Prozesse hinweg kollisionssicher sein, beispielsweise durch:

```text
UTC timestamp with milliseconds + PID + random suffix
```

oder durch exklusive Verzeichniserstellung mit Retry.

---

## 10. Evolution Health Gate

Der aktuelle CLI-Runner umfasst 828 Zeilen.

Prüfe, ob der Code ohne neue Abstraktionsschicht sinnvoll zerlegt werden kann, beispielsweise:

```text
scripts/verify-all.mjs          CLI und Orchestrierung
scripts/lib/runner.mjs          sichere Prozessausführung
scripts/lib/gates.mjs           Gate-Definitionen
scripts/lib/evidence.mjs        Evidence und Hashes
scripts/lib/verifier.mjs        Fresh-Clone-Verifier und Delta
```

Keine künstliche Modulzerlegung.

Ziele:

* klare Verantwortlichkeiten
* keine duplizierte Gate-Logik
* keine Datei mit unnötig hoher kognitiver Komplexität
* keine zusätzliche Runtime-Dependency, sofern Node-Bordmittel genügen
* Testbarkeit des realen Kontrollflusses
* plattformbewusste Ausführung

Bei schleichender Verschlechterung:

```text
AMBER_ARCHITECTURAL_EROSION
```

---

## 11. Vollständige Verifikation

Nach der Reparatur:

### Primärer Lauf

Auf einem eingefrorenen Candidate-SHA:

```bash
pnpm verify:all
```

### Tatsächlicher Independent Verifier

Aus dem Primary Checkout:

```bash
pnpm verify:independent -- --target-sha <CANDIDATE_SHA>
```

Der Befehl selbst muss den frischen Clone erzeugen.

### Negative Canary-Matrix

Zusätzlich kontrollierte Seeded Faults ausführen:

```text
Feature Flag enabled
pnpm-lock drift
Cargo.lock drift
Secret token
.env file
.db file
Playwright core failure
SHA mismatch
Primary-/Verifier-Build-Divergenz
Evidence path traversal
```

Jeder Fault muss die erwartete rote oder amberfarbene Klassifikation erzeugen.

Faults anschließend vollständig entfernen und Full Gate erneut ausführen.

---

## 12. Remote-Verifikation

Nach lokalem GREEN:

1. lokalen Candidate-Commit auf Reparaturbranch erzeugen,
2. Branch pushen,
3. Draft-PR gegen `master` erstellen,
4. GitHub Actions auf dem exakten Candidate-SHA abwarten,
5. CI-Status und Logs prüfen,
6. denselben SHA mit `verify:independent` aus einem frischen Remote-Clone prüfen.

Nicht mergen.

---

## 13. Abschlusskriterien

Nur zulässig:

```text
GREEN_AUTONOMOUS_TEST_HARNESS_PERSISTENT_AND_VALIDATED
```

wenn:

* alle Red-Tests zuerst nachweislich fehlschlugen,
* alle reparierten Tests grün sind,
* Feature-Flag- und Lockfile-Seeded-Faults erkannt werden,
* Secret Scan vollständig ist,
* Playwright-Core-Fehler GREEN blockiert,
* Independent-Verifier-Befehl einen echten frischen Clone erzeugt,
* Primary-/Verifier-Delta implementiert ist,
* Build-Hashes verglichen werden,
* parallele Runs nicht kollidieren,
* Evidence atomar funktioniert,
* Candidate-SHA lokal und remote identisch ist,
* GitHub Actions grün sind,
* keine Produkt-, Dependency- oder Feature-Flag-Änderung erfolgte.

Optional verbleibende USB- oder Baseline-Lücken ergeben:

```text
GREEN_CORE_GATES_AMBER_OPTIONAL_PLATFORM_OR_HARDWARE_COVERAGE
```

aber nur nach erfüllten Kernkriterien.

---

## 14. Final Report

Berichte:

```text
Status
Base SHA
Candidate SHA
Branch
Draft PR
geänderte Dateien
Architekturdelta
Red-Test-Evidence
Runner-Testzahlen
Projekt-Testzahlen
Primary Gate Matrix
Independent Gate Matrix
Fresh-Clone-Nachweis
Primary-/Verifier-Delta
Build-Hash-Vergleich
Seeded-Fault-Matrix
Remote CI
Evidence-Pfad
Working Tree Status
offene optionale Coverage
Rollback-Plan
```

Zusätzlich:

```bash
git diff --stat <BASE_SHA>..<CANDIDATE_SHA>
git diff --check <BASE_SHA>..<CANDIDATE_SHA>
git status --short
```

Stoppe mit offenem Draft-PR.

Kein Merge, kein Tag, kein Release und keine Branch-Löschung.
6
