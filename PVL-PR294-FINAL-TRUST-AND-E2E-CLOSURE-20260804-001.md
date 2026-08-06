# RUN CARD — PR #294 Final Trust Closure + vollständige End-to-End-Testabdeckung

**Run Card ID:** `PVL-PR294-FINAL-TRUST-AND-E2E-CLOSURE-20260804-001`
**Projekt:** PromptVault Lite
**Repository:** `xxammaxx/promptvault-lite`
**Pull Request:** `#294`
**Arbeitsbranch:** `fix/autonomous-test-harness-trust`
**Historische Basis:** `918b81a7833e73335ea2dc9e77d964249b9c4601`
**Zu Beginn beobachteter Head:** `0e306fb7a98ce4f2df67eabd143abecfeee7df44`
**Startklassifikation:** `RED_HOLD_PR_294_CI_FAILED_AND_CONTRACT_GAPS`

Die angegebenen SHAs sind nur Einstiegsevidence. Ermittle den aktuellen Live-Stand vor jeder Änderung erneut.

---

# 1. Auftrag

Schließe die letzten Vertrauenslücken des autonomen Test-Harness und erweitere die Testabdeckung so, dass PromptVault Lite tatsächlich über seine relevanten Schichten hinweg Ende-zu-Ende geprüft wird:

```text
React-Oberfläche
→ Frontend-Zustand und Benutzerinteraktionen
→ Tauri-JavaScript-API
→ Tauri-IPC
→ Rust-Commands
→ Dateisystem- und native Desktop-Grenzen
→ gebautes Tauri-Binary
→ CI auf Linux und – soweit ohne Secrets möglich – Windows
```

Am Ende müssen gleichzeitig erfüllt sein:

1. keine bekannten False-GREEN-Pfade,
2. vollständige Unit-, Integration-, Browser- und Native-Desktop-Matrix,
3. Primary Runner auf eingefrorenem Candidate-SHA,
4. echter Independent Verifier auf einem frischen Remote-Clone,
5. identische kanonische Build-Artefakte,
6. GitHub Actions auf aktuellem PR-Merge-Ref grün,
7. mindestens ein echter Tauri-native-E2E-Canary auf Linux,
8. Windows-native-E2E in CI oder eine ehrlich belegte Plattformlücke,
9. vollständige Accessibility-, Fehlerpfad- und Persistenzabdeckung,
10. PR bleibt bis zur Owner-Freigabe Draft und ungemergt.

---

# 2. Grenzen

Erlaubt:

* bestehende Branch `fix/autonomous-test-harness-trust` aktualisieren,
* Harness-, Test-, CI- und Testdokumentationsdateien ändern,
* test-only Dev-Dependencies ergänzen, falls empirisch erforderlich,
* Tauri-native E2E-Infrastruktur ergänzen,
* zusätzliche Reparatur-Commits pushen,
* PR-Beschreibung aktualisieren,
* lokale und CI-Evidence erzeugen.

Nicht erlaubt:

* direkt auf `master` pushen,
* PR mergen oder Auto-Merge aktivieren,
* Tag oder Release erstellen,
* Issues schließen,
* Feature-Flag-Defaults verändern,
* Produktverhalten ändern, nur damit ein Test besteht,
* fehlgeschlagene Tests durch `skip`, `fixme`, pauschale Retries oder schwächere Assertions verstecken,
* Produktionscode außerhalb eines nachweislich notwendigen Testability-Fixes verändern,
* neue Testframeworks installieren, wenn vorhandene Werkzeuge dieselbe Aufgabe zuverlässig erfüllen.

Ein Testability-Fix im Produktionscode ist nur zulässig, wenn:

1. der reale E2E-Fehler vorher reproduziert wurde,
2. keine test-only Hintertür entsteht,
3. der Fix auch für reales Produktverhalten korrekt ist,
4. ein separater Regressionstest existiert,
5. der Independent Verifier ihn bestätigt.

---

# 3. Reality Refresh

Chatverläufe, Memory, ältere Run Cards und frühere Evidence sind nur advisory.

Ermittle live:

```text
repository_root
remote_origin
default_branch
master_sha
pr_294_state
pr_294_head_sha
pr_294_merge_ref_sha
pr_294_reviews
pr_294_review_threads
current_branch
working_tree_status
current_ci_runs
current_ci_jobs
current_ci_failure_steps
existing_test_frameworks
existing_playwright_configuration
existing_tauri_test_configuration
existing_e2e_directories
existing_accessibility_tests
existing_packaging_workflows
existing_skills
```

Pflichtbefehle:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/master
git remote -v
git log --oneline --decorate -10
git diff --check
```

GitHub live prüfen:

* PR weiterhin offen und Draft,
* aktueller Head-SHA,
* Mergeability,
* Merge-Ref-SHA,
* Reviews und Threads,
* aktuelle GitHub-Actions-Läufe,
* fehlgeschlagene Jobs und vollständige Logs.

Wenn der Head nicht mehr `0e306fb…` ist, ausschließlich mit dem aktuellen Head weiterarbeiten.

---

# 4. OS-, Shell- und Runtime-Preflight

Ermittle vor Änderungen:

```text
OS und Version
Architektur
aktive Shell
Pfadseparator
Encoding
Repository-Dateisystem
Temp-Dateisystem
Display-Server
X11/Wayland
Headless-Fähigkeit
Node
pnpm
Rust
Cargo
Git
Python
Playwright
installierte Browser
Tauri CLI
WebKitWebDriver
tauri-driver
Edge/EdgeDriver auf Windows
Hermes
OpenCode
```

Zusätzlich:

```bash
hermes -h
hermes skills -h
npx skills --help
```

Keine Linux-, Windows- oder macOS-Befehle ungeprüft vermischen.

Bevorzugt Node-Dateisystem- und Prozess-APIs statt:

```text
bash -c
find
grep
xargs
Shell-Redirection
fest verdrahtete Home-Pfade
```

wenn plattformneutrale Bordmittel genügen.

---

# 5. Skill Preflight

## 5.1 Grundregel

Vor Installation zuerst inventarisieren:

```text
.agents/skills/
.agents/skills-lock.json
Hermes External Skill Directories
OpenCode Skill Discovery
projektlokale Skill-Manifeste
Symlinks
Kollisionen
```

Vorhandene, byte-identische und verifizierte Skills nicht neu installieren.

Keine Aktualisierung auf `latest`.

Jede Installation benötigt:

```text
Repository
Source Commit
SKILL.md Git Blob
lokalen SHA-256
Abhängigkeiten
enthaltene Skripte
Auditstatus
Namenskollisionen
Client-Kompatibilität
Discovery
Aktivierung
Ressourcenauflösung
```

---

## 5.2 Erwartete vorhandene Skills

Wiederverwenden, wenn Lock und Installation korrekt sind:

```text
verification-before-completion
systematic-debugging
test-driven-development
subagent-driven-development
webapp-testing
playwright-best-practices
```

Erwartete Aufgaben:

| Skill                          | Aufgabe                                             |
| ------------------------------ | --------------------------------------------------- |
| verification-before-completion | keine Abschlussbehauptung ohne frischen Nachweis    |
| systematic-debugging           | Root Cause vor Änderungen                           |
| test-driven-development        | RED → GREEN → REFACTOR                              |
| subagent-driven-development    | getrennte Builder-/Verifier-Rollen                  |
| webapp-testing                 | lokaler Server-Lifecycle und Browser-Reconnaissance |
| playwright-best-practices      | Browser-E2E, Flakiness, A11y, Security und CI       |

Bei vorhandenem validem Lock:

```text
GREEN_SKILL_REUSED_NO_REINSTALL
```

---

## 5.3 Neu freigegebener Skill

### testing-tauri-apps

```text
Repository:
dchuk/claude-code-tauri-skills

Source commit:
855352dfbc2527f5a7e4ed307782d2a487bffd66

Repository path:
tauri/tauri-testing/SKILL.md

Expected Git blob:
00865927db70a1c42c0d6ca1c114fb1cd329a35e

skills.sh name:
testing-tauri-apps

Purpose:
Tauri-v2-Mocks, IPC-Integration, native WebDriver-E2E,
tauri-driver, WebKitWebDriver, Linux-/Windows-CI
```

Nur installieren, wenn nicht bereits byte-identisch vorhanden.

Installationsbefehl:

```bash
export DISABLE_TELEMETRY=1

npx skills add \
  https://github.com/dchuk/claude-code-tauri-skills \
  --skill testing-tauri-apps \
  -a opencode \
  -y
```

Falls die lokale CLI `-a opencode` nicht unterstützt, zuerst deren reale Syntax aus `npx skills --help` ableiten.

Nach Installation:

```bash
find .agents/skills -type f -name SKILL.md -print
```

Den tatsächlichen Pfad bestimmen und prüfen:

```bash
git hash-object <INSTALLIERTER_SKILL_PFAD>/SKILL.md
```

Erwartung:

```text
00865927db70a1c42c0d6ca1c114fb1cd329a35e
```

Bei Abweichung:

```text
AMBER_SKILL_UPSTREAM_DRIFT_REVIEW_REQUIRED
```

Dann nicht verwenden und keine Testarchitektur darauf aufbauen.

---

## 5.4 Vorhandenen Playwright-Skill erneut prüfen

Erwarteter validierter Stand:

```text
Repository:
currents-dev/playwright-best-practices-skill

Source commit:
283d5cbc5d11aac1abda058b16ad22c317d54dc0

Repository path:
playwright-best-practices/SKILL.md

Expected Git blob:
0da736253c343081ab8c0cb9802729a707c23196

Skill version:
1.2
```

Nur bei fehlender Installation:

```bash
export DISABLE_TELEMETRY=1

npx skills add \
  https://github.com/currents-dev/playwright-best-practices-skill \
  --skill playwright-best-practices \
  -a opencode \
  -y
```

Bei vorhandener korrekter Installation keine Neuinstallation.

---

## 5.5 Bestehende Kernskills nur bei Fehlen installieren

```bash
export DISABLE_TELEMETRY=1

npx skills add \
  https://github.com/obra/superpowers \
  --skill verification-before-completion \
  --skill systematic-debugging \
  --skill test-driven-development \
  --skill subagent-driven-development \
  -a opencode \
  -y

npx skills add \
  https://github.com/anthropics/skills \
  --skill webapp-testing \
  -a opencode \
  -y
```

Diese Befehle nur für tatsächlich fehlende Fähigkeiten verwenden.

---

## 5.6 Nicht installieren

### a11y-testing / accessibility

Nicht installieren, solange Identität, Installationsname und Client-Kompatibilität zwischen skills.sh und aktuellem Repository nicht eindeutig übereinstimmen.

Accessibility wird über folgende vorhandene Werkzeuge abgedeckt:

```text
playwright-best-practices
Playwright
axe-core beziehungsweise @axe-core/playwright
Testing Library
manuelle Keyboard-Flow-Canaries
```

### playwright-cli

Nicht installieren, solange dessen skills.sh-Audits nicht vollständig grün sind und keine konkrete Fähigkeitslücke besteht.

### gh-fix-ci

Nicht pauschal installieren.

Eine bereits vorhandene native oder Plugin-Version darf verwendet werden, wenn:

```text
Herkunft geprüft
Skripte lokal gelesen
keine unerwarteten Schreiboperationen
gh-Authentifizierung gültig
Repository-/Workflow-Scopes angemessen
```

Bei Neuinstallationsbedarf wegen fehlender CI-Analysefähigkeit:

```text
AMBER_OPTIONAL_SKILL_REVIEW_REQUIRED
```

Zuerst Owner-Review, weil der aktuelle Snyk-Auditstatus nicht vollständig grün ist.

---

## 5.7 Skill-Discovery verifizieren

Prüfe nach Installation:

```bash
hermes skills -h
hermes skills list
```

oder die durch `hermes skills -h` ermittelte reale Syntax.

Zusätzlich OpenCode-Discovery prüfen.

Pflicht-Negativtests:

1. Skill-Verzeichnis temporär umbenennen → Discovery muss fehlschlagen.
2. Zwei Skills mit gleichem Namen simulieren → Kollision muss erkannt werden.
3. Referenzdatei entfernen → Ressourcenauflösung muss fehlschlagen.
4. Skill wiederherstellen → Discovery erneut grün.

Aktualisiere `.agents/skills-lock.json` nur mit:

```text
name
repository
source_commit
source_path
git_blob
local_sha256
installed_at
client
audit_status
```

Keine Skill-Dateien verändern.

---

# 6. NO_OP_HYPOTHESIS

Vor Änderungen prüfen, ob der gewünschte Zustand bereits besteht.

Inventarisieren:

```text
package.json scripts
vitest.config.*
playwright.config.*
tests/
e2e/
e2e-tests/
src/**/__tests__/
src-tauri/**/tests/
.github/workflows/
scripts/verify-all.mjs
scripts/lib/gates.mjs
scripts/lib/verifier.mjs
```

Falls ein Contract bereits vollständig implementiert und real getestet ist:

```text
GREEN_ALREADY_SATISFIED_NO_CHANGE
```

Keine zweite Testinfrastruktur parallel aufbauen.

---

# 7. E2E-Abdeckungsmodell

Erstelle vor Codeänderungen:

```text
evidence/e2e-coverage/00-current-coverage-map.json
```

Ordne jede kritische Nutzerreise mindestens einer Ebene zu:

| Ebene                  | Werkzeug                                     |
| ---------------------- | -------------------------------------------- |
| reine Logik            | Vitest / Rust Unit Tests                     |
| React-Komponente       | Testing Library                              |
| Web-App-Integration    | Playwright                                   |
| Tauri-JS-API           | `@tauri-apps/api/mocks`                      |
| IPC-Contract           | Frontend-Wrapper + Rust-Commandtests         |
| natives Desktop-Binary | `tauri-driver` + WebKitWebDriver/WebDriverIO |
| Packaging              | Tauri Build + Installationsartefaktprüfung   |
| Remote CI              | GitHub Actions                               |
| Accessibility          | Playwright + axe + Keyboard-Canary           |
| Security               | Secret Scan + Capability-/Pfadgrenzen        |

Keine kritische Nutzerreise darf ausschließlich durch Mocks abgedeckt sein.

---

# 8. Kritische Nutzerreisen

Leite die reale Liste aus Produktcode, README, Tests und UI ab.

Mindestens prüfen:

## 8.1 App-Start

```text
Binary startet
Hauptfenster erscheint
kein Crash
keine ungefangene JS-Ausnahme
keine Rust-Panic
korrekte Version sichtbar beziehungsweise abrufbar
```

## 8.2 Prompt-Archiv öffnen

```text
gültiges Archiv auswählen
Dateibaum erscheint
Prompt öffnen
Titel, Inhalt, Metadaten und Tags sichtbar
```

## 8.3 Ungültiger Pfad

```text
nicht vorhandener Pfad
nicht lesbarer Pfad
Pfadtraversierung
Datei statt Verzeichnis
leeres Archiv
```

Erwartung:

```text
kontrollierte Fehlermeldung
kein Crash
kein Datenleck
kein Zustandsschaden
```

## 8.4 Prompt analysieren

```text
Prompt auswählen
Analyse starten
Klassifikation erscheint
Warnungen erscheinen
Ergebnis bleibt dem ausgewählten Prompt zugeordnet
```

## 8.5 Prompt optimieren

```text
normalen Prompt öffnen
Optimizer starten
Ergebnis erzeugen
Original bleibt unverändert
Copy-Funktion kopiert nur das erwartete Ergebnis
Dialog lässt sich schließen
```

## 8.6 Blocking Sensitive Content

```text
sensitiven Test-Prompt öffnen
Rohinhalt wird nicht in verbotenen Bereichen angezeigt
Optimizer bleibt blockiert
Blueprint-Optimizer bleibt blockiert
Variantenerzeugung bleibt blockiert
keine sensitiven Daten in Konsole, Trace oder Screenshot
```

## 8.7 Missing Info Gate

```text
Feature Flag standardmäßig aus
Flag kontrolliert im Test aktivieren
REQUIRED-Session erzeugen
Gate öffnen
Antworten erfassen
Skip-Verhalten prüfen
Abschlusszustand prüfen
```

## 8.8 Direction Profiles und Varianten

```text
Feature Flag standardmäßig aus
kontrolliert aktivieren
Profil wählen
Varianten erzeugen
Reihenfolge und Kennzeichnung prüfen
kein Zustandsleck zwischen Prompts
```

## 8.9 Einstellungen und Theme

```text
Dark Mode
Light Mode
System Mode
Persistenz nach Neustart
Tastaturbedienung
sichtbarer Fokus
```

## 8.10 Zwischenablage

```text
erwarteten Inhalt kopieren
kein Originalinhalt bei blockiertem Prompt
Fehlerpfad bei verweigerter Clipboard-Berechtigung
```

## 8.11 Persistenz

```text
Einstellung ändern
App schließen
App neu starten
Zustand wiederhergestellt
keine temporären Testdaten außerhalb Testverzeichnis
```

## 8.12 Import-/Export-/USB-Pfade

Sofern vorhanden:

```text
synthetischer Corpus
gültige Dateien
ungültige Dateien
Duplikate
große Datei
Unicode-Dateiname
Windows- und POSIX-Pfade
entfernter Datenträger
```

Ohne reales USB-Corpus:

```text
YELLOW_OPTIONAL_HARDWARE_NOT_EXECUTED
```

Nicht als PASS melden.

---

# 9. Browser-E2E mit Playwright

Playwright bleibt Kern-Gate.

Pflichtprojekte mindestens:

```text
chromium
firefox
webkit
```

Nur reduzieren, wenn die aktuelle Projektkonfiguration oder Tauri-WebView-Realität eine belastbare Begründung liefert.

Pflichtregeln:

```text
semantische Locators
keine willkürlichen sleeps
web-first assertions
isolierte Fixtures
keine gemeinsam veränderlichen Testdaten
Trace bei erstem Retry
Screenshot nur bei Fehler oder Evidence-Lauf
Konsole und pageerror erfassen
fehlgeschlagene Requests erfassen
```

Core-E2E-Fehler:

```text
RED_TEST_FAILURE
```

Vier USB-Skips bei ansonsten grüner Core-Suite:

```text
YELLOW_OPTIONAL_HARDWARE_NOT_EXECUTED
```

---

# 10. Accessibility-Gate

Nutze vorhandenen Playwright-Skill; keine zusätzliche Skill-Installation.

Prüfe mindestens:

```text
axe-core critical/serious violations
Landmarks
Heading-Hierarchie
Form Labels
Button-Namen
Dialog-Rollen
aria-modal
Focus Trap
Focus Restoration
Escape zum Schließen
Tab-Reihenfolge
Keyboard-only Navigation
sichtbarer Fokus
prefers-reduced-motion
Zoom auf 200 %
Kontrast, soweit automatisierbar
```

Automatisierte Accessibility-Prüfung ersetzt keine Keyboard-Canaries.

Klassifikation:

```text
RED_ACCESSIBILITY_REGRESSION
```

wenn ein im Scope liegendes kritisches oder schweres Problem reproduzierbar ist.

Bestehende Baseline-Probleme separat dokumentieren, nicht pauschal ignorieren.

---

# 11. Tauri-API- und IPC-Integrationstests

Nutze `@tauri-apps/api/mocks` nur für Frontend-Integrationstests.

Prüfe:

```text
invoke-Aufrufname
Argumentnamen
Serialisierung
Erfolgsantwort
strukturierte Fehlerantwort
abgewiesene Berechtigung
Event-Listener
Listener-Cleanup
Clipboard-Plugin
Dialog-Plugin
Filesystem-Plugin
Shell-Plugin, falls verwendet
```

Mocks müssen nach jedem Test zurückgesetzt werden.

Zusätzlich müssen Rust-seitige Tests dieselben Command-Contracts prüfen.

Erzeuge eine maschinenlesbare IPC-Contract-Liste:

```text
evidence/e2e-coverage/01-ipc-contract-map.json
```

Für jeden Command:

```json
{
  "command": "example",
  "frontend_wrapper_test": true,
  "rust_test": true,
  "native_e2e": false,
  "error_paths": ["invalid-input", "permission-denied"]
}
```

Mindestens die geschäftskritischen Commands benötigen einen Native-E2E-Nachweis.

---

# 12. Native Tauri-E2E auf Linux

## 12.1 Toolchain-Preflight

Prüfen:

```bash
command -v WebKitWebDriver
command -v xvfb-run
command -v tauri-driver
cargo tauri --version
```

Fehlende Systemwerkzeuge dürfen nur nach OS-Erkennung installiert werden.

Für Debian-/Ubuntu-basierte Systeme typischer Kandidat:

```bash
sudo apt-get update
sudo apt-get install -y webkit2gtk-driver xvfb
cargo install tauri-driver --locked
```

Keine Installation blind auf anderen Distributionen ausführen.

## 12.2 Framework-Auswahl

Zuerst bestehende native E2E-Infrastruktur suchen.

Falls keine vorhanden ist, bevorzuge die kleinste wartbare Lösung:

```text
tauri-driver
+
WebdriverIO oder Selenium
+
vorhandenes Node-Ökosystem
```

Keine zweite vollständige Browser-Testarchitektur neben Playwright erstellen.

Native Tests sollen ausschließlich Szenarien prüfen, die Playwright nicht beweisen kann:

```text
echtes Tauri-Binary
echte WebView
echtes IPC
native Plugins
Fenster-Lifecycle
Persistenz nach Neustart
Dateidialog-/Filesystem-Grenzen
```

## 12.3 Linux Native Canary

Mindestens:

1. Debug-Binary bauen.
2. `tauri-driver` starten.
3. App über WebDriver öffnen.
4. Hauptfenster nachweisen.
5. einen Prompt laden oder synthetisches Testarchiv öffnen.
6. mindestens einen echten Rust-Command über die UI auslösen.
7. Antwort in der UI verifizieren.
8. App schließen.
9. Child-Prozesse und WebDriver vollständig beenden.
10. Testverzeichnis aufräumen.

Kein Zugriff auf reale Nutzerdaten.

---

# 13. Windows-native E2E

Prüfe, ob GitHub Actions einen Windows-Runner bereitstellt und ob der Test ohne Secrets ausführbar ist.

Ziel:

```text
Windows Server Runner
Edge WebDriver
tauri-driver
gebautes Windows-Debug-Binary
mindestens Native Smoke + IPC Canary
```

Der Workflow darf keine Release-Signierung benötigen.

Falls Edge-/Driver-Kompatibilität oder Runner-Infrastruktur nicht zuverlässig verfügbar ist:

```text
AMBER_WINDOWS_NATIVE_E2E_INFRASTRUCTURE_GAP
```

mit:

```text
konkretem Fehler
Runner-Version
Edge-Version
Driver-Version
vollständigem Log
Reproduktionsanleitung
```

Nicht als Produktfehler klassifizieren, solange die Ursache eindeutig Infrastruktur ist.

---

# 14. macOS

Native Tauri-WebDriver-Abdeckung nicht vortäuschen.

Prüfe aktuelle Tauri-Testmöglichkeiten live.

Falls kein belastbarer nativer WebDriver-Pfad verfügbar ist:

```text
YELLOW_MACOS_NATIVE_E2E_NOT_SUPPORTED_BY_CURRENT_DRIVER_STACK
```

Trotzdem zulässig:

```text
cargo check
cargo test
Tauri build
Packaging-Validierung
Artefaktstruktur
```

Keine GREEN-Aussage für native macOS-Interaktion ohne realen Test.

---

# 15. PR-#294-CI-Blocker

## 15.1 Detached HEAD

Die Branch-Erkennung muss unterscheiden:

```text
normaler Checkout -> Branchname
detached HEAD     -> "detached HEAD"
kein Git-Repo     -> Infrastrukturfehler
```

Test mit isolierten temporären Repositories.

Nicht den Branchzustand der aktuellen Testumgebung voraussetzen.

## 15.2 Synthetische Secrets

Vollständige Secret-Signaturen nicht als statische Strings einchecken.

Zur Laufzeit zusammensetzen:

```js
const token = ["gh", "p_", partA, partB].join("");
```

Verboten:

```text
Testverzeichnis pauschal allowlisten
Regex abschwächen
CI-Scanner umgehen
```

---

# 16. Independent-Verifier-Vertrag

Der Verifier muss:

1. Ziel-SHA einfrieren.
2. Origin-URL live lesen.
3. frischen Remote-Clone erstellen.
4. exakten SHA detached auschecken.
5. inherited artifacts ausschließen.
6. `pnpm install --frozen-lockfile` fail-closed prüfen.
7. komplette Kernmatrix ausführen.
8. Rolle `independent` in jeder Evidence tragen.
9. eigene Logs verwenden.
10. Primary-Summary unverändert lassen.
11. Gate-Sets vergleichen.
12. kanonische Build-Artefakte vergleichen.
13. Working Tree prüfen.
14. Clone bei Fehler behalten.
15. Clone bei Erfolg aufräumen.

Unbekannte Runner-Rolle blockieren.

---

# 17. Kanonischer Buildvergleich

Eine gemeinsame Funktion für Primary und Verifier verwenden:

```text
collectBuildArtifactHashes(root)
```

Nur echte Build-Artefakte:

```text
dist/
relevante Tauri-Binaries
relevante Bundles
keine Caches
keine Quelltexte
kein node_modules
keine .git-Dateien
```

Jeder Eintrag:

```json
{
  "relative_path": "dist/assets/index.js",
  "size": 12345,
  "sha256": "..."
}
```

Divergenz bei:

```text
nur im Primary
nur im Verifier
abweichender Hash
abweichende Größe
fehlender Build-Pfad
leeres Manifest trotz PASS
```

Erwartung:

```text
AMBER_PRIMARY_VERIFIER_DIVERGENCE
```

Exit-Code ungleich null.

---

# 18. Gate-Set-Vergleich

Vergleiche gegen die erwartete Live-Gate-Menge.

Divergenz bei:

```text
Gate fehlt im Primary
Gate fehlt im Verifier
unerwartetes Gate
andere Mandatory-/Optional-Einstufung
```

Fehlende Gates dürfen nicht nur protokolliert werden.

---

# 19. Output-Pfad-Sicherheit

Erlaubte öffentliche CLI-Ziele:

```text
relative Pfade im Repository
absolute Pfade im Repository
intern verifiziertes Temp-Staging des Verifiers
```

Blockieren:

```text
../-Traversal
absolute Außenpfade
Windows-Systempfade
UNC-Außenpfade
Symlink-Escape
```

Prüfen mit:

```text
resolve
relative
realpath
lstat
```

Nicht nur auf die Zeichenfolge `..` testen.

---

# 20. Atomisches Evidence-Schreiben

Temporäre Datei im Zielverzeichnis erstellen und dort umbenennen.

Kein Cross-Filesystem-Rename aus einem allgemeinen `/tmp`.

Bei zwei parallelen Runs:

```text
keine identische Run-ID
keine Logüberschreibung
keine Summary-Überschreibung
```

---

# 21. Optional-Gate-Klassifikation

Priorität:

1. realer Test-/Produkt-/Infrastrukturfehler,
2. Divergenz,
3. optional nicht ausgeführt,
4. PASS.

Beispiele:

```text
Visual-Test nicht ausgeführt, keine Baseline
-> YELLOW_VISUAL_BASELINE_MISSING

Visual-Test ausgeführt und fehlgeschlagen
-> RED_TEST_FAILURE

USB-Corpus fehlt, Core-E2E grün
-> YELLOW_OPTIONAL_HARDWARE_NOT_EXECUTED

Core-Playwright oder Native-Tauri-Test rot
-> RED_TEST_FAILURE
```

---

# 22. Test-first Closure-Matrix

Alle neuen Tests zuerst RED nachweisen.

| ID  | Fault                   | Erwartung                |
| --- | ----------------------- | ------------------------ |
| C1  | Detached HEAD           | Manifest meldet detached |
| C2  | statisches Secret       | Repo-Scanner rot         |
| C3  | Laufzeit-Secret-Fixture | Maskierung funktioniert  |
| C4  | Verifier-Rolle          | `independent`            |
| C5  | Installationsfehler     | fail-closed              |
| C6  | Build nur Primary       | Divergenz                |
| C7  | Build nur Verifier      | Divergenz                |
| C8  | Hash verändert          | Divergenz                |
| C9  | Gate fehlt Verifier     | Divergenz                |
| C10 | Gate fehlt Primary      | Divergenz                |
| C11 | Außenpfad               | blockiert                |
| C12 | Symlink-Escape          | blockiert                |
| C13 | Visual-Befehl rot       | rot, nicht gelb          |
| C14 | parallele Runs          | kollisionsfrei           |
| C15 | Primary-Evidence        | unverändert              |
| E1  | Tauri-Mock-IPC          | korrekter Contract       |
| E2  | Rust-Commandfehler      | strukturierter Fehler    |
| E3  | Native Binary Start     | Fenster verfügbar        |
| E4  | Native IPC Canary       | UI → Rust → UI           |
| E5  | Neustart                | Persistenz korrekt       |
| E6  | Keyboard Flow           | vollständig bedienbar    |
| E7  | axe critical            | null Verstöße            |
| E8  | blockierter Inhalt      | kein Datenleck           |

Für jeden Fix:

```text
RED beobachten
minimal implementieren
GREEN beobachten
Seeded Fault erneut ausführen
```

---

# 23. Primary Full Matrix

Nach allen Änderungen:

1. Commit erstellen.
2. Working Tree clean.
3. Candidate-SHA erfassen.
4. Branch pushen.
5. Keine weitere Änderung ohne neuen SHA.

Dann:

```bash
pnpm verify:all
```

Pflicht-Gates mindestens:

```text
E1  Repo Hygiene
E2  Frozen Dependency Install
E3  vollständiges Vitest
E4  ESLint
E5  TypeScript
E6  Frontend Build
E7  Rust Format
E8  Rust Tests --locked
E9  Rust Clippy --locked
E10 vollständiger Secret Scan
E11 Playwright Core E2E
E12 Version Consistency
E13 pnpm- und Cargo-Lockfile
E14 Feature-Flag Defaults
E15 Visual Evidence
E16 Accessibility
E17 Tauri IPC Integration
E18 Tauri Native Linux E2E
```

Ergänze E16–E18 nur einmal und ohne bestehende Gate-IDs semantisch zu brechen.

Alle Gates müssen im Summary erscheinen.

---

# 24. Independent Full Run

Nach Push des Candidate-SHA:

```bash
pnpm verify:independent -- --target-sha <FINAL_CANDIDATE_SHA>
```

Nachweis:

```text
frischer Remote-Clone
exakter SHA
detached HEAD
eigene Installation
eigene Browser-/Native-Testprozesse
runner = independent
isolierte Evidence
gleiches Gate-Set
identische Build-Artefakte
cleaner Working Tree
```

Primary und Verifier müssen denselben Final-SHA prüfen.

---

# 25. Remote CI

GitHub Actions auf dem aktuellen PR-Merge-Ref müssen mindestens enthalten:

```text
Frontend
Rust
Secret Scan
Playwright E2E
Tauri Native Linux E2E
```

Windows Native E2E ergänzen, wenn die Live-Toolchain dies zuverlässig erlaubt.

Frontend:

```text
Install
TypeScript
Lint
Vitest
Build
```

Rust:

```text
Format
Clippy --locked
Tests --locked
Build
```

Secret Scan:

```text
Pattern Scan
.env Scan
DB Scan
```

Tauri Native Linux:

```text
System Dependencies
WebKitWebDriver
Xvfb
tauri-driver
Build
Native Smoke
IPC Canary
Process Cleanup
```

Ein neuer Commit invalidiert alle älteren CI-Ergebnisse.

---

# 26. Negative Canary Matrix

Kontrolliert prüfen:

```text
Detached HEAD
statisches Secret
committete .env
committete .db
pnpm-lock drift
Cargo.lock drift
Dependency-Install-Fehler
Playwright-Core-Fehler
Native-Tauri-Startfehler
IPC-Fehler
Accessibility-Verstoß
fehlendes Gate
fehlendes Build-Artefakt
zusätzliches Build-Artefakt
abweichender Hash
Evidence-Außenpfad
Symlink-Escape
verwaister tauri-driver
verwaister App-Prozess
```

Danach sämtliche Faults entfernen und vollständige Matrix erneut ausführen.

---

# 27. Evolution Health Gate

Bewerte:

```text
Harness-LOC
größte Datei
Anzahl Module
duplizierte Prozessrunner
duplizierte Hashlogik
duplizierte Gate-Definitionen
neue Dev-Dependencies
CI-Laufzeit
Native-E2E-Laufzeit
Flakiness
plattformabhängige Logik
Evidence-Größe
Diagnosequalität
```

Kein zweites E2E-System für Browserlogik aufbauen.

Zieltrennung:

```text
Playwright    -> Web-/UI-Verhalten
tauri-driver  -> echte native Tauri-Grenze
Vitest        -> Logik und Komponenten
Cargo         -> Rust-Contracts
```

Bei unnötiger Erosion:

```text
AMBER_ARCHITECTURAL_EROSION
```

---

# 28. Evidence

```text
evidence/autonomous-test/<RUN_ID>/
├── 00-context-manifest.json
├── 01-test-inventory.json
├── 02-skill-state.json
├── 03-primary-summary.json
├── 04-primary-logs/
├── 05-playwright-report/
├── 06-independent-summary.json
├── 06-independent-logs/
├── 07-primary-verifier-delta.json
├── 08-build-hashes-primary.json
├── 09-build-hashes-independent.json
├── 10-negative-canary-matrix.json
├── 11-remote-ci.json
├── 12-evolution-health.md
├── 13-e2e-coverage-map.json
├── 14-ipc-contract-map.json
├── 15-native-linux-e2e.json
├── 16-accessibility-report.json
└── FINAL-REPORT.md
```

Evidence muss:

```text
gitignored
SHA-gebunden
rollengetrennt
atomar geschrieben
gehasht
secret-bereinigt
maschinenlesbar
```

sein.

---

# 29. Abschlussklassifikationen

## Vollständig bereit zur Owner-Review

```text
GREEN_PR_294_FULL_E2E_AND_TRUST_REPAIR_READY_FOR_OWNER_REVIEW
```

Erfordert:

* alle Harness-Tests grün,
* vollständige Projektmatrix grün,
* Playwright Core grün,
* Accessibility grün,
* Tauri IPC Integration grün,
* Linux Native Tauri E2E grün,
* Primary und Independent Verifier auf identischem SHA,
* keine Gate- oder Build-Divergenz,
* aktuelle GitHub Actions grün,
* keine False-GREEN-Pfade,
* vollständige Evidence,
* akzeptables Evolution-Health-Delta.

## Kern grün, optionale Plattform-/Hardwarelücke

```text
GREEN_CORE_GATES_AMBER_OPTIONAL_PLATFORM_OR_HARDWARE_COVERAGE
```

Nur zulässig für:

```text
USB-Corpus
visuelle Baselines
Windows Native E2E bei belegter Runner-/Driver-Lücke
macOS Native WebDriver
```

Nicht zulässig für fehlende Linux-Native-E2E-, Playwright-, IPC- oder Accessibility-Kerngates.

## Weitere Zustände

```text
RED_REMOTE_CI_FAILED
RED_FALSE_GREEN_PATH_REMAINS
RED_NATIVE_E2E_CORE_FAILURE
RED_TEST_INFRASTRUCTURE_FAILURE
AMBER_PRIMARY_VERIFIER_DIVERGENCE
AMBER_SKILL_UPSTREAM_DRIFT_REVIEW_REQUIRED
AMBER_ARCHITECTURAL_EROSION
AMBER_WINDOWS_NATIVE_E2E_INFRASTRUCTURE_GAP
```

---

# 30. Final Report

Berichte:

```text
Status
Repository
PR
Base SHA
Ausgangs-Head
Final Candidate SHA
PR Merge-Ref SHA
Branch
Working Tree vorher/nachher
Commits
geänderte Dateien
installierte Skills
wiederverwendete Skills
Skill-Commits und Blobs
Skill-Discovery
Red-Test-Evidence
Harness-Testzahl
Projekt-Testzahl
Playwright-Matrix
Accessibility-Ergebnis
IPC-Contract-Abdeckung
Native Linux E2E
Windows Native E2E
Primary Gate Matrix
Independent Gate Matrix
Fresh-Clone-Nachweis
Gate-Set-Delta
Build-Artefakt-Delta
Negative Canaries
CI-Jobs und Steps
Evolution Health
Evidence-Pfad
optionale Lücken
Rollback-Plan
Owner-Aktion
```

Zusätzlich:

```bash
git diff --stat 918b81a7833e73335ea2dc9e77d964249b9c4601..<FINAL_SHA>
git diff --check 918b81a7833e73335ea2dc9e77d964249b9c4601..<FINAL_SHA>
git status --short
```

---

# 31. Stop-Bedingung

Stoppe mit offenem Draft-PR.

Nicht selbstständig:

```text
PR als Ready markieren
Review approven
mergen
Auto-Merge aktivieren
Tag setzen
Release erstellen
Branch löschen
Issues schließen
```

Die nächste Aktion bleibt eine ausdrückliche Owner-Entscheidung.
6
