# RUN CARD — PromptVault Lite Autonomous Testing Harness

**Run Card ID:** `PVL-AUTONOMOUS-TEST-HARNESS-20260803-001`
**Projekt:** PromptVault Lite
**Betriebsmodell:** Hermes Agent + OpenCode
**Ziel:** Wiederkehrende Test-, Diagnose- und Evidence-Arbeit weitgehend an KI-Agenten delegieren
**Startmodus:** Read-only Test Audit
**Änderungsmodus:** Nur nach reproduziertem Fehler und gemäß den unten definierten Gates
**Owner:** Raik Müller

---

## 1. Zielzustand

Baue und validiere einen wiederholbaren KI-gesteuerten Testprozess für PromptVault Lite.

Der Prozess muss künftig mit einem einzelnen Agentenauftrag:

1. den aktuellen Repository-Zustand erfassen,
2. benötigte Skills sicher inventarisieren und installieren,
3. die vollständige Testmatrix ausführen,
4. Fehler autonom untersuchen,
5. Evidence erzeugen,
6. einen unabhängigen Verifier auf einem frischen Checkout starten,
7. einen belastbaren Abschlussstatus liefern.

Das Ziel ist nicht, Tests blind erneut auszuführen. Das Ziel ist ein vertrauenswürdiger Test-Harness, der Fehler erkennt, korrekt klassifiziert, Flakiness nicht als GREEN versteckt und nur mit frischer Evidence Erfolg meldet.

---

## 2. Nichtziele und Grenzen

Diese Run Card autorisiert nicht:

* Push direkt auf `master`
* Merge oder Auto-Merge
* Tag oder Release
* Änderung von Feature-Flag-Defaults
* Schließung von Issues
* Produktionscode-Fixes ohne reproduzierenden Red-Test
* automatische Aktualisierung visueller Snapshot-Baselines
* Änderung eingefrorener Tests, um Produktionsfehler zu kaschieren
* Installation beliebiger zusätzlicher Skills
* globale Installation der Skills
* ungeprüfte Übernahme neuer Skill-Versionen
* Ausführung realer USB-Tests ohne freigegebenes Testgerät beziehungsweise Testkorpus
* Behauptung von Windows-, macOS- oder Hardware-Abdeckung ohne reale Umgebung

Subjektive UX-Fragen und absichtliche visuelle Änderungen bleiben Owner-Entscheidungen.

---

## 3. Verbindliche Arbeitsregeln

### 3.1 Reality Refresh

Chat-, Memory-, Run-Card- und Dokumentationsinformationen sind nur Hinweise.

Aktuelle Source of Truth:

1. Live-Repository
2. aktueller Git-Branch und exakter SHA
3. aktuelle Testkonfigurationen
4. `package.json`
5. `Cargo.toml` und `Cargo.lock`
6. Playwright-Konfiguration
7. GitHub-Actions-Workflows
8. aktuelle Issues und Pull Requests
9. bestehende Evidence-Dateien
10. installierte Tool- und Runtime-Versionen

Keine Testbefehle aus älteren Berichten ungeprüft übernehmen.

### 3.2 OS- und Shell-Preflight

Vor jedem Befehl feststellen:

* Betriebssystem und Version
* Architektur
* aktive Shell
* Pfadkonvention
* Dateisystem- und Encoding-Verhalten
* Node-, pnpm-, npm-, Rust-, Cargo-, Python- und Git-Version
* Hermes- und OpenCode-Version
* Display-/Wayland-/X11-/Headless-Kontext
* vorhandene Browser und Playwright-Binaries
* verfügbarer Speicherplatz und RAM
* Paketmanager
* verfügbare native Worktree-Funktion

Linux-, macOS- und Windows-Befehle nicht vermischen.

### 3.3 Evidence vor Aussagen

Kein `PASS`, `GREEN`, „funktioniert“ oder „fertig“, ohne:

* frisch ausgeführten vollständigen Befehl,
* Exit-Code,
* Testanzahl,
* Fehleranzahl,
* exakten geprüften SHA,
* gespeichertes Log.

### 3.4 Builder/Verifier-Trennung

Der primäre Test-Orchestrator darf seinen eigenen Abschluss nicht allein bestätigen.

Der Independent Verifier verwendet:

* frischen Remote-Checkout,
* eigenes Verzeichnis oder isolierten Worktree,
* eigene Build-Ausgaben,
* keine übernommenen Caches, soweit dadurch Ergebnisse verfälscht werden könnten,
* denselben exakten Ziel-SHA.

### 3.5 NO_OP_HYPOTHESIS

Vor dem Erstellen neuer Skripte prüfen, ob bereits ein vollständiger Test-Runner existiert.

Zulässiger Endstatus:

`GREEN_ALREADY_SATISFIED_NO_CHANGE`

Neue Testinfrastruktur nur bei nachgewiesener Lücke erstellen.

---

## 4. Phase A — Repository- und Test-Reality-Refresh

Ermittle und speichere:

```text
repository_root
remote_url
default_branch
current_branch
HEAD_SHA
working_tree_status
latest_tag
package_manager
node_version
pnpm_version
rustc_version
cargo_version
python_version
hermes_version
opencode_version
playwright_version
```

Prüfe:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git remote -v
git log -10 --oneline
git diff --check
git submodule status
```

Inventarisiere alle Tests und Gates aus:

* `package.json`
* `.github/workflows/`
* `playwright.config.*`
* `vitest.config.*`
* `Cargo.toml`
* `README.md`
* `docs/TESTING.md`
* vorhandenen Shell-, PowerShell-, Node- oder Python-Testskripten

Erzeuge:

```text
evidence/autonomous-test/<RUN_ID>/00-context-manifest.json
evidence/autonomous-test/<RUN_ID>/01-test-inventory.md
```

Evidence-Verzeichnis lokal halten und gitignorieren, sofern das Projekt keinen anderen verbindlichen Evidence-Vertrag besitzt.

---

## 5. Phase B — Skill Preflight

### 5.1 Bestehende Skills inventarisieren

Suche mindestens in:

```text
.agents/skills/
.opencode/skills/
.claude/skills/
.codex/skills/
~/.config/opencode/
Hermes external skill directories
```

Führe die verfügbaren nativen Discovery-Befehle aus.

Vor Hermes-Unterbefehlen immer zuerst:

```bash
hermes -h
hermes skills -h
```

Keine Hermes-Syntax erfinden.

Für jeden vorhandenen Skill erfassen:

```text
name
path
source
source_commit
SKILL.md git blob
SHA-256 aller Dateien
discovery_status
load_status
agent_compatibility
```

Wenn ein passender Skill bereits korrekt installiert und verifiziert ist, nicht erneut installieren.

### 5.2 Telemetrie deaktivieren

Für alle `skills`-CLI-Aufrufe:

```bash
export DISABLE_TELEMETRY=1
```

Unter PowerShell äquivalent:

```powershell
$env:DISABLE_TELEMETRY = "1"
```

### 5.3 Skills zunächst nur untersuchen

Vor Installation:

```bash
npx skills add <SOURCE> --list
```

Quellrepository in ein temporäres Audit-Verzeichnis laden oder über die vorhandenen Werkzeuge vollständig untersuchen.

Prüfen:

* Repository-Eigentümer
* aktueller Commit
* Lizenz
* `SKILL.md`
* alle referenzierten Skripte
* ausführbare Dateien
* Paketabhängigkeiten
* Shell-Befehle
* Netzwerkzugriffe
* Credential-Zugriffe
* Schreibpfade
* Installationshooks
* Symlinks
* Prompt-Injection-artige Anweisungen
* Kollisionen mit vorhandenen Skills
* Kompatibilität mit OpenCode und Hermes

### 5.4 Freigegebenes Skill-Manifest

#### verification-before-completion

```yaml
source: https://github.com/obra/superpowers
skill: verification-before-completion
expected_skill_md_git_blob: 7d45333cc4a49c57a80df6c1fe2fa777a207afbc
required: true
```

#### systematic-debugging

```yaml
source: https://github.com/obra/superpowers
skill: systematic-debugging
expected_skill_md_git_blob: 095d194ac041502905f15b01d22d294fb94db8b2
required: true
```

#### test-driven-development

```yaml
source: https://github.com/obra/superpowers
skill: test-driven-development
expected_skill_md_git_blob: 4320d8879a639d0536c2239bb80c9d7257ad8947
required: true
```

#### subagent-driven-development

```yaml
source: https://github.com/obra/superpowers
skill: subagent-driven-development
expected_skill_md_git_blob: 6c0b8349d27bf91aaf4ec8ad93cad2f2f38ef5b2
required: true
```

#### webapp-testing

```yaml
source: https://github.com/anthropics/skills
skill: webapp-testing
expected_skill_md_git_blob: 4726215301db64a0cc4d41fc3219c61f37a30f4a
expected_with_server_git_blob: 431f2eba16b268b7f3e2ae4daae9db41c0289b6d
required: true
```

#### playwright-best-practices

```yaml
source: https://github.com/currents-dev/playwright-best-practices-skill
skill: playwright-best-practices
expected_metadata_version: "1.2"
expected_skill_md_git_blob: 0da736253c343081ab8c0cb9802729a707c23196
required: true
```

#### using-git-worktrees

```yaml
source: https://github.com/obra/superpowers
skill: using-git-worktrees
expected_skill_md_git_blob: 1381dacb3516b94382dd6ec736ede21ee8ede2b3
required: false
conditional_reason: install only when no native Hermes/OpenCode worktree mechanism is usable
security_note: skills.sh Snyk warning requires local audit
```

Wenn ein erwarteter Git-Blob nicht mehr übereinstimmt:

1. Installation stoppen.
2. neuen Upstream-Commit und vollständigen Diff untersuchen.
3. keine automatische Freigabe aufgrund desselben Skill-Namens.
4. Status:

```text
AMBER_SKILL_UPSTREAM_DRIFT_REVIEW_REQUIRED
```

### 5.5 Explizit ausgeschlossener Skill

Nicht installieren:

```yaml
source: https://github.com/microsoft/playwright-cli
skill: playwright-cli
reason: current public Snyk audit is failing; no concrete capability gap remains
```

### 5.6 Installation

Erst nach erfolgreichem Audit projektspezifisch für OpenCode installieren:

```bash
export DISABLE_TELEMETRY=1

npx skills add https://github.com/obra/superpowers \
  --skill verification-before-completion \
  --skill systematic-debugging \
  --skill test-driven-development \
  --skill subagent-driven-development \
  -a opencode \
  -y

npx skills add https://github.com/anthropics/skills \
  --skill webapp-testing \
  -a opencode \
  -y

npx skills add https://github.com/currents-dev/playwright-best-practices-skill \
  --skill playwright-best-practices \
  -a opencode \
  -y
```

`using-git-worktrees` nur bei bestätigter Lücke:

```bash
npx skills add https://github.com/obra/superpowers \
  --skill using-git-worktrees \
  -a opencode \
  -y
```

Keine Option `-g` verwenden.

### 5.7 Installation validieren

Nach Installation:

* Skills im erwarteten Projektpfad vorhanden
* `SKILL.md` lesbar
* alle Referenzen auflösbar
* Helper-Skripte vorhanden
* keine toten Symlinks
* keine Namenskollision
* OpenCode Discovery erfolgreich
* Hermes Discovery erfolgreich oder External Directory korrekt registriert
* Skill lässt sich gezielt laden
* Skill wird bei fachfremdem Auftrag nicht fälschlich aktiviert
* Skill wird bei passendem Auftrag aktiviert

Negativtests:

1. Skill-Verzeichnis temporär umbenennen → Discovery muss fehlschlagen.
2. Wiederherstellen → Discovery muss wieder funktionieren.
3. Hash verändern → Lockprüfung muss fehlschlagen.
4. Zweiten Skill mit gleichem Namen simulieren → Collision Gate muss blockieren.

Erzeuge:

```text
skills-lock.json
evidence/autonomous-test/<RUN_ID>/02-skill-audit.json
evidence/autonomous-test/<RUN_ID>/03-skill-discovery.md
```

`skills-lock.json` muss enthalten:

```json
{
  "source": "...",
  "source_commit": "...",
  "skill": "...",
  "files": {
    "SKILL.md": {
      "git_blob": "...",
      "sha256": "..."
    }
  },
  "installed_path": "...",
  "validated_at": "...",
  "agent": "opencode",
  "discovery": "PASS"
}
```

---

## 6. Phase C — Test-Orchestrator entwerfen

### 6.1 Bestehenden Runner bevorzugen

Prüfe zunächst auf:

```text
scripts/verify*
scripts/test*
Makefile
justfile
Taskfile.yml
package.json aggregate scripts
CI composite actions
```

Wenn bereits ein vollständiger, deterministischer Runner existiert, verwende und validiere ihn.

### 6.2 Fehlende Orchestrierung

Nur bei nachgewiesener Lücke darf auf einem separaten Branch ein plattformbewusster Runner erstellt werden.

Bevorzugtes Format:

```text
scripts/verify-all.mjs
```

Warum Node:

* bereits Projektabhängigkeit
* Linux- und Windows-fähig
* robuste Prozess- und Exit-Code-Behandlung
* strukturierte JSON-Ausgabe möglich
* keine Bash-only-Annahmen

Der Runner darf keine Testlogik duplizieren. Er orchestriert ausschließlich vorhandene Befehle.

Pflichtfunktionen:

* exakten Git-SHA erfassen
* schmutzigen Arbeitsbaum erkennen
* OS und Toolversionen erfassen
* Befehle sequenziell ausführen
* Start-, Endzeit und Dauer erfassen
* stdout/stderr getrennt speichern
* Exit-Code erhalten
* bei kritischem Gate stoppen
* Evidence-Index erzeugen
* Secrets in Logs maskieren
* optional einzelne Gates auswählen
* `--full`
* `--quick`
* `--gate <name>`
* `--evidence-dir <path>`
* `--json-summary <path>`

Keine neue Laufzeitabhängigkeit hinzufügen, wenn Node-Bordmittel ausreichen.

---

## 7. Phase D — Agentenrollen

### 7.1 Controller

Verantwortlich für:

* Reality Refresh
* Skill-Auswahl
* Testmanifest
* Ressourcenplanung
* Agentendispatch
* Evidence-Index
* finale Klassifikation

Der Controller verändert keinen Produktionscode.

### 7.2 Frontend Test Agent

Führt aus:

* Vitest
* ESLint
* TypeScript
* Frontend-Build

Analysiert:

* Testanzahl
* Warnungen
* unhandled rejections
* offene Handles
* Snapshot-Differenzen
* langsame Tests

### 7.3 Rust Test Agent

Führt aus:

* Formatprüfung
* Cargo Tests
* Clippy
* Lockfile-Prüfung

Keine Dependency-Aktualisierung.

### 7.4 Browser/E2E Agent

Verwendet:

* `webapp-testing`
* `playwright-best-practices`

Führt aus:

* Playwright-Suite
* responsive Viewports
* Light/Dark
* Konsolenfehler
* Netzwerkfehler
* Traces
* Screenshots bei Fehlern
* visuelle Vergleiche, falls Baselines vorhanden

Snapshot-Baselines niemals automatisch aktualisieren.

### 7.5 Security/Consistency Agent

Führt aus:

* Secret Scan exakt wie CI
* Version Consistency
* Lockfile Drift
* `git diff --check`
* untracked-sensitive-file scan
* Dependency-Datei-Diff
* Feature-Flag-Default-Prüfung

### 7.6 Independent Verifier

Verwendet frischen Remote-Checkout des exakten Ziel-SHA.

Erhält nur:

* Repository
* Ziel-SHA
* Testmanifest
* unveränderliche Gate-Befehle
* Output-Vertrag

Er erhält keine Erfolgseinschätzung des Controllers.

---

## 8. Phase E — Testmatrix

Befehle nicht blind übernehmen. Zuerst mit der Live-Konfiguration abgleichen.

Voraussichtliche PromptVault-Lite-Matrix:

### E1 — Repository Hygiene

```bash
git status --short
git diff --check
git rev-parse HEAD
```

### E2 — Dependency Integrity

```bash
pnpm install --frozen-lockfile
cargo metadata --locked --format-version 1
```

Kein:

```bash
cargo update
cargo generate-lockfile
pnpm update
```

### E3 — Frontend Unit/Integration

```bash
pnpm test
```

Erwartete Testzahl aus dem aktuellen Repository ableiten, nicht fest codieren.

### E4 — Lint

```bash
pnpm lint
```

### E5 — TypeScript

```bash
pnpm exec tsc --noEmit
```

### E6 — Frontend Build

```bash
pnpm build
```

### E7 — Rust Format

```bash
cargo fmt --check --all
```

### E8 — Rust Tests

```bash
cargo test --workspace --locked
```

Falls das Projekt `--locked` aktuell nicht unterstützt oder absichtlich anders dokumentiert ist, begründet den realen Projektbefehl verwenden.

### E9 — Rust Clippy

```bash
cargo clippy --workspace --locked -- -D warnings
```

Keine neuen Feature-Kombinationen erfinden.

### E10 — Secret Scan

Exakt denselben Scanner, dieselben Regexe und dieselben Ausschlüsse wie GitHub Actions verwenden.

Kein abweichender lokaler „ähnlicher“ Scan.

### E11 — Playwright

```bash
pnpm exec playwright test
```

Primärlauf:

* keine automatischen Retries zum Kaschieren
* Trace bei erstem Retry beziehungsweise entsprechend Live-Konfiguration
* Screenshots nur bei Fehler oder bestehendem visuellen Vertrag
* HTML- und JUnit-Report sichern

USB-Corpus-Skips separat ausweisen:

```text
OPTIONAL_HARDWARE_COVERAGE_NOT_EXECUTED
```

Nicht als Produktfehler und nicht als vollständige Hardwareabdeckung klassifizieren.

### E12 — Version Consistency

Prüfe mindestens:

* `package.json`
* `src-tauri/Cargo.toml`
* lokales Paket in `Cargo.lock`
* `src-tauri/tauri.conf.json`
* aktiver Changelog
* aktive Statusdokumente
* Tag beziehungsweise Zielversion im Release-Kontext

### E13 — Lockfile Drift

Vergleiche Lockfiles gegen den gewählten Basis-SHA.

Unbeabsichtigte Dependency-Aktualisierungen blockieren.

### E14 — Feature-Flag Defaults

Prüfe:

```text
PROMPTVAULT_DIRECTION_PROFILES = default disabled
PROMPTVAULT_MISSING_INFO_GATE = default disabled
PROMPTVAULT_EMBEDDINGS = default disabled
```

### E15 — Visual Evidence

Für kritische Oberflächen:

* 600 px Höhe
* 768 px Höhe
* 900 px Höhe
* Light Theme
* Dark Theme
* Settings Modal
* Explorer/Details/Analyse
* blockierter sensitiver Prompt
* langer Windows-Pfad als synthetische Fixture

Wenn keine freigegebenen Baselines existieren:

* Screenshots als Evidence erzeugen
* `YELLOW_VISUAL_BASELINE_MISSING`
* nicht automatisch als visuelle Regression bewerten

---

## 9. Phase F — Flakiness-Regeln

Ein fehlgeschlagener Test darf nicht durch einen erfolgreichen Retry zu GREEN werden.

Bei erstem Fehlschlag:

1. vollständiges erstes Log sichern,
2. Test isoliert reproduzieren,
3. unverändert mindestens dreimal ausführen,
4. bei kritischen E2E-Tests fünfmal ausführen,
5. Reihenfolge- und Shared-State-Effekte prüfen,
6. Parallelität gegen Single-Worker vergleichen.

Klassifikation:

```text
reproduzierbar immer fehlgeschlagen -> RED_PRODUCT_OR_TEST_FAILURE
wechselnd PASS/FAIL -> AMBER_FLAKY_TEST
nur bei kompletter Suite -> AMBER_ORDER_OR_STATE_LEAK
nur in CI -> AMBER_ENVIRONMENT_OR_TIMING_DRIFT
nicht reproduzierbar -> YELLOW_INSUFFICIENT_REPRODUCTION_EVIDENCE
```

Flaky Tests dürfen nicht quarantined, geskipped oder mit zusätzlichen Retries versehen werden, ohne Evidence und Owner-Entscheidung.

---

## 10. Phase G — Fehlerbehandlung

Bei jedem Fehler:

1. keine Änderungen vornehmen,
2. vollständige Fehlermeldung und Stacktrace sichern,
3. Root Cause mit `systematic-debugging` untersuchen,
4. Fehlerklasse bestimmen:

   * Produkt
   * Test
   * Flaky
   * Infrastruktur
   * Umgebung
   * fehlende optionale Hardware
5. minimalen Reproduktionsbefehl dokumentieren,
6. betroffenen Commitbereich untersuchen,
7. keine pauschalen Reparaturen.

Wenn ein Produktfix notwendig erscheint:

* neuen Reparaturbranch beziehungsweise Issue-Vorschlag vorbereiten,
* `test-driven-development` aktivieren,
* Red-Test schreiben,
* Red-Zustand nachweisen,
* noch keinen Produktionsfix ohne ausdrücklichen Reparaturauftrag durchführen.

Zulässiger Ausgang:

```text
RED_REPRODUCIBLE_PRODUCT_FAILURE_REPAIR_APPROVAL_REQUIRED
```

Test-Harness-Fehler dürfen auf einem separaten Branch repariert werden, wenn:

* kein Produktverhalten verändert wird,
* Red/Green-Evidence vorhanden ist,
* der gesamte Testlauf anschließend erneut erfolgt.

---

## 11. Phase H — Test-Quality-Gate

Für neue oder geänderte Tests:

* Test muss vor dem Fix korrekt fehlschlagen.
* Test muss nach dem Fix bestehen.
* Revert des Fixes muss den Test erneut brechen.
* Assertion muss beobachtbares Verhalten prüfen.
* Test darf nicht nur Mock-Aufrufe prüfen.
* keine test-only Methoden im Produktionscode.
* keine schwachen Assertions wie ausschließlich `toBeTruthy`, wenn ein präziser Contract möglich ist.
* keine versteckten Sleeps als Synchronisation.
* keine Änderung eingefrorener Verifier durch den Builder.

Für besonders kritische Änderungen:

* gezielter Seeded Fault,
* Mutation eines relevanten Vergleichs beziehungsweise Branches,
* Nachweis, dass der Test die Mutation erkennt.

Kein flächendeckendes Mutation Testing erzwingen, wenn Kosten und Nutzen nicht passen.

---

## 12. Phase I — Ressourcen- und Zeitoptimierung

Die KI soll Zeit sparen, nicht nur mehr Tests erzeugen.

Regeln:

* Quick Gate für lokale Zwischenstände.
* Full Gate vor Abschluss, PR, Merge oder Release.
* unveränderte, read-only Testgruppen dürfen nur bei ausreichenden Ressourcen parallel laufen.
* Rust- und Node-Builds nicht parallel starten, wenn RAM oder CPU knapp sind.
* Browser-Tests nach erfolgreichem Build.
* vollständige Logs auf Disk, nur komprimierte Zusammenfassung im Agentenkontext.
* Stacktraces niemals wegkomprimieren.
* Test-Caches dürfen Geschwindigkeit erhöhen, aber nicht den Independent Verifier verfälschen.
* keine Wiederholung grüner Gates ohne Code-, Tool-, Lockfile- oder Umgebungsänderung, außer im Independent Verifier.

---

## 13. Phase J — Independent Verification

Nach erfolgreichem primären Lauf:

1. Ziel-SHA einfrieren.
2. frischen Remote-Checkout erstellen.
3. SHA vor Testbeginn prüfen.
4. Skills aus dem geprüften `skills-lock.json` laden.
5. vollständige Matrix erneut ausführen.
6. keinerlei Produktionsänderung zulassen.
7. Arbeitsbaum am Ende auf Clean prüfen.
8. Ergebnisse mit dem primären Lauf vergleichen.

Drift zwischen primärem Lauf und Verifier:

```text
AMBER_PRIMARY_VERIFIER_DIVERGENCE
```

Kein GREEN, bis die Abweichung erklärt ist.

---

## 14. Phase K — Evidence-Paket

Erzeuge:

```text
00-context-manifest.json
01-test-inventory.md
02-skill-audit.json
03-skill-discovery.md
04-primary-gates.json
05-primary-command-logs/
06-playwright-report/
07-screenshots/
08-traces/
09-flakiness-analysis.md
10-security-consistency.json
11-independent-verifier.json
12-delta-analysis.md
FINAL-REPORT.md
```

Jeder Gate-Eintrag enthält:

```json
{
  "gate": "cargo-test",
  "command": "cargo test --workspace --locked",
  "started_at": "...",
  "ended_at": "...",
  "duration_seconds": 0,
  "exit_code": 0,
  "passed": 0,
  "failed": 0,
  "ignored": 0,
  "log_sha256": "...",
  "tested_git_sha": "...",
  "runner": "primary|independent-verifier"
}
```

Evidence auf Secrets, Tokens, private Pfade und persönliche Daten prüfen.

---

## 15. Abschlussklassifikationen

### Vollständig grün

```text
GREEN_AUTONOMOUS_TEST_HARNESS_VALIDATED
```

Erfordert:

* Skill-Installation und Discovery verifiziert
* alle Pflichtgates grün
* primärer Lauf grün
* Independent Verifier grün
* gleicher exakter Git-SHA
* keine unerklärte Flakiness
* keine unbeabsichtigte Repository-Änderung
* Evidence vollständig

### Grün mit optionaler Abdeckungslücke

```text
GREEN_CORE_GATES_AMBER_OPTIONAL_PLATFORM_OR_HARDWARE_COVERAGE
```

Nur zulässig, wenn:

* alle Kernfunktionen grün,
* fehlende Tests ausschließlich reale USB-Hardware oder nicht vorhandene Plattform-Build-Hosts betreffen,
* die Lücke eindeutig dokumentiert ist.

### Flaky

```text
AMBER_FLAKY_TESTS_BLOCK_COMPLETION_CLAIM
```

### Testabdeckungslücke

```text
YELLOW_TEST_COVERAGE_GAP
```

### Infrastruktur

```text
RED_TEST_INFRASTRUCTURE_FAILURE
```

### Produktfehler

```text
RED_REPRODUCIBLE_PRODUCT_FAILURE
```

### Skill-Drift

```text
AMBER_SKILL_UPSTREAM_DRIFT_REVIEW_REQUIRED
```

### Bereits vorhanden

```text
GREEN_ALREADY_SATISFIED_NO_CHANGE
```

---

## 16. Final Report

Der Abschlussbericht muss enthalten:

* geprüfter Repository-SHA
* Branch
* OS und Shell
* installierte und wiederverwendete Skills
* Quellcommits und Datei-Hashes
* Discovery-Nachweise
* vollständige Gate-Matrix
* Testzahlen
* Laufzeiten
* Skips mit Begründung
* Flaky-Analyse
* Fehlerklassifikation
* Independent-Verifier-Ergebnis
* Evidence-Pfad
* Working-Tree-Endstatus
* offene manuelle Aufgaben
* klare Aussage, welche Plattformen und Hardware tatsächlich geprüft wurden

Keine allgemeinen Formulierungen wie:

```text
Tests sehen gut aus.
Sollte funktionieren.
Die wichtigsten Tests sind grün.
```

Nur evidenzgestützte Aussagen.

---

## 17. Stop-Bedingung

Stoppe nach Testausführung, Diagnose, Skill-Verifikation und Final Report.

Keine selbstständige Ausführung von:

* Produktionsfixes
* Commit
* Push
* PR
* Merge
* Tag
* Release

Lege bei einem Produktfehler stattdessen ein separates Repair Packet vor.

