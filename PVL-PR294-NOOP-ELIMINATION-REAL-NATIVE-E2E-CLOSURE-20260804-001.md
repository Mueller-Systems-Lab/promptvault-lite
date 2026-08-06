# RUN CARD — PR #294 No-op-Elimination und echte Native-E2E-Closure

**Run Card ID:** `PVL-PR294-NOOP-ELIMINATION-REAL-NATIVE-E2E-CLOSURE-20260804-001`
**Projekt:** PromptVault Lite
**Repository:** `xxammaxx/promptvault-lite`
**Pull Request:** `#294`
**Branch:** `fix/autonomous-test-harness-trust`
**Beobachteter Ausgangs-Head:** `3ec751071e29f10ab23a07703d801d4b1bfe8237`
**Startstatus:** `RED_FALSE_GREEN_PATHS_REMAIN_AND_REMOTE_CI_FAILED`

---

## 1. Auftrag

Schließe PR #294 endgültig, indem alle verbleibenden No-op-, Skip- und False-GREEN-Pfade entfernt werden.

Die KI muss PromptVault Lite tatsächlich Ende-zu-Ende bedienen:

```text
synthetisches Prompt-Archiv
→ echtes gebautes Tauri-Binary
→ echtes App-Fenster
→ sichtbare Benutzerinteraktionen
→ reale Tauri-IPC
→ reale Rust-Commands
→ reale Dateisystemwirkung
→ App-Neustart
→ Persistenzprüfung
```

Playwright bleibt das verpflichtende Werkzeug für:

```text
Renderer-Benutzerreisen
Browser-Matrix
Accessibility
Keyboard-Navigation
Fehlerpfade
visuelle Struktur
```

Für die reale native Tauri-WebView ist der Tauri-WebDriver-Weg zu verwenden:

```text
WebdriverIO
+ @wdio/tauri-service
+ echtes Tauri-Binary
```

Playwright darf nicht als WebDriver-Client für `tauri-driver` ausgegeben werden.

---

## 2. Verbindliches Abschlussziel

Nur folgende Klassifikation gilt als vollständiger Erfolg:

```text
GREEN_PR_294_REAL_E2E_ALL_GATES_EXECUTED_READY_FOR_OWNER_REVIEW
```

Dafür müssen gelten:

```text
20 von 20 Gates tatsächlich ausgeführt
20 PASS
0 RED
0 AMBER
0 YELLOW
0 NOOP
0 SKIPPED
0 NOT_EXECUTED
GitHub Actions vollständig grün
Independent Verifier vollständig grün
```

Ein Prozess, der nur mit Exit-Code `0` endet, ohne den Gate-Vertrag zu prüfen, ist kein bestandener Test.

---

## 3. Grenzen

Erlaubt:

* bestehende PR-Branch aktualisieren,
* Test-, Harness-, CI- und Dokumentationscode ändern,
* WebdriverIO und den offiziellen Tauri-Service als Dev-Dependencies ergänzen,
* synthetische Fixtures ergänzen,
* zusätzliche Commits pushen,
* PR-Beschreibung aktualisieren,
* lokale und Remote-Evidence erzeugen.

Nicht erlaubt:

* direkt auf `master` pushen,
* PR mergen,
* Auto-Merge aktivieren,
* Tag oder Release erstellen,
* echte Nutzerdateien lesen,
* Produktionsverhalten für Tests vortäuschen,
* kritische Gates optional machen,
* `skip`, `fixme`, pauschale Retries oder schwächere Assertions verwenden,
* No-op-Befehle als PASS zählen,
* rote CI durch erneutes Starten ohne Root-Cause-Fix behandeln.

---

# PHASE A — Reality Refresh

## 4. Live-Zustand ermitteln

Vor Änderungen live prüfen:

```text
aktueller master-SHA
aktueller PR-Head-SHA
aktueller PR-Merge-Ref
Working Tree
PR-Status
Reviews
Review-Threads
aktuelle CI-Läufe
aktuelle CI-Jobs
vollständige Fehlerlogs
Node-Version
pnpm-Version
Rust-Version
Cargo-Version
Tauri-Version
Playwright-Version
WebdriverIO-Version
@wdio/tauri-service-Version
WebKitWebDriver
tauri-driver
Display-Server
```

Pflichtdateien lesen:

```text
scripts/lib/gates.mjs
scripts/lib/runner.mjs
scripts/lib/verifier.mjs
scripts/verify-all.mjs
scripts/__tests__/harness-contract.test.js
scripts/__tests__/runner.test.js
playwright.config.ts
tests/e2e/core-flows.spec.ts
tests/e2e/accessibility.spec.ts
tests/e2e/native-tauri-e2e.spec.ts
src/__tests__/tauri-ipc-integration.test.ts
.github/workflows/ci.yml
package.json
src-tauri/tauri.conf.json
```

Ältere Abschlussberichte sind keine Source of Truth.

---

## 5. OS- und Shell-Preflight

Ermittle:

```text
OS
Distribution
Architektur
aktive Shell
Pfadkonventionen
Encoding
Repository-Dateisystem
Temp-Dateisystem
X11 oder Wayland
Headless-Fähigkeit
Paketmanager
```

Keine Linux-spezifischen Shell-Befehle in plattformneutralen Node-Harness-Komponenten, wenn Node-Bordmittel genügen.

---

# PHASE B — Skill Preflight

## 6. Vorhandene Skills inventarisieren

Erwartete Skills:

```text
playwright-best-practices
webapp-testing
testing-tauri-apps
verification-before-completion
systematic-debugging
test-driven-development
subagent-driven-development
```

Prüfe:

```text
Installationspfad
Source Repository
Source Commit
SKILL.md Blob
lokalen SHA-256
Discovery
Namenskollision
Ressourcenauflösung
Client-Kompatibilität
```

Keine Neuinstallation bei byte-identischem validiertem Stand.

Aktiviere für diesen Lauf mindestens:

```text
playwright-best-practices
webapp-testing
testing-tauri-apps
verification-before-completion
systematic-debugging
test-driven-development
```

Keine neuen selbst erzeugten Skills wie `nodejs-test-harness-patterns` automatisch als vertrauenswürdig einstufen.

Ein im vorherigen Lauf erzeugter Skill muss separat geprüft werden auf:

```text
Source
Scope
Inhalt
Toolberechtigungen
Kollisionen
Tests
Hash
Nutzen gegenüber bestehenden Skills
```

Ohne unabhängige Validierung nicht verwenden.

---

# PHASE C — No-op- und Skip-Invarianten

## 7. No-op-Gates technisch verbieten

Der Harness muss vor der Ausführung die Gate-Definitionen validieren.

Folgende Muster sind für reale Gates verboten:

```text
node -e process.exit(0)
command: true
echo PASS
skip: true bei Pflicht-Gates
leerer Callback
fehlender Executor
nicht vorhandene Testdatei
0 ausgeführte Tests
```

Implementiere beispielsweise:

```js
validateGateImplementation(gate)
```

Die Funktion muss prüfen:

```text
Gate besitzt realen Executor
Executor ist dem Gate-Typ zugeordnet
Command ist kein bekannter No-op
erwartete Testdatei existiert
Gate meldet executed=true
Gate meldet assertion_count oder artifact_count
Gate besitzt Start- und Endzeit
Gate besitzt Exit-Code
```

Bei Verstoß:

```text
RED_GATE_IMPLEMENTATION_NOOP
```

---

## 8. Gate-Ergebnis-Schema erweitern

Jedes Gate-Ergebnis benötigt mindestens:

```json
{
  "id": "E19",
  "name": "Native Tauri Real E2E",
  "executed": true,
  "executor": "webdriverio-tauri",
  "command": "pnpm test:e2e:native",
  "started_at": "...",
  "ended_at": "...",
  "exit_code": 0,
  "assertion_count": 12,
  "artifact_count": 4,
  "skipped": 0,
  "classification": "PASS"
}
```

`PASS` ist nur erlaubt, wenn:

```text
executed = true
exit_code = 0
assertion_count > 0 oder ein spezifischer überprüfter Contract vorliegt
kein Skip
kein No-op
```

---

## 9. Gate-Inventar testen

Kanonische Liste:

```text
E1–E20
```

Negative Tests:

1. E12 doppelt.
2. E13 fehlt.
3. E99 vorhanden.
4. E19 No-op.
5. E20 No-op.
6. Pflicht-Gate mit `skip: true`.
7. Testdatei fehlt.
8. Testlauf meldet null Tests.
9. Summary-Zahl weicht von Matrix ab.
10. Gate meldet PASS ohne `executed=true`.

Alle Fälle müssen rot sein.

---

# PHASE D — Bekannte Harness-Fehler

## 10. Detached-HEAD-Test reparieren

Der aktuelle CI-Fehler muss zuerst mit einem echten Red-Test reproduziert werden.

Branch-Kontext unterscheiden:

```text
normaler Branch
detached HEAD
kein Git-Repository
Git-Befehl fehlgeschlagen
```

Erwartung:

```text
normaler Branch → tatsächlicher Name
detached HEAD → "detached HEAD"
kein Repository → RED_TEST_INFRASTRUCTURE_FAILURE
```

Teste mit isolierten temporären Git-Repositories.

Nicht den aktuellen Testprozess-Branch direkt abfragen und pauschal als normalen Checkout annehmen.

---

## 11. Feature-Flag-Gate reparieren

E14 darf nicht nur das Vorhandensein einer Testdatei prüfen.

Zu prüfen:

```text
PROMPTVAULT_DIRECTION_PROFILES
PROMPTVAULT_MISSING_INFO_GATE
PROMPTVAULT_EMBEDDINGS
```

Pflichtfälle je Flag:

```text
Default aus → PASS
Default an → RED
Definition fehlt → RED
widersprüchliche Definitionen → RED
ungültiger Wert → RED
```

Bevorzugt bestehende Feature-Flag-Tests wirklich ausführen.

Das Fehlen einer Testdatei darf niemals PASS ergeben.

---

## 12. Version-, Lockfile- und Secret-Sonderpfade

Entferne irreführende No-op-Kommandos aus den Gate-Definitionen.

Statt:

```text
skip: true
node -e process.exit(0)
```

verwende explizite Executor-Typen:

```text
executor: version-consistency
executor: lockfile-drift
executor: feature-flag-defaults
executor: secret-scan
```

Der Runner muss für jeden Executor nachweisen, dass die reale Funktion aufgerufen wurde.

Negative Contract-Tests:

```text
Executor fehlt
Executor unbekannt
Executor wirft Fehler
Executor gibt kein Ergebnis zurück
Executor meldet null Prüfungen
```

---

## 13. Rust-Lock-Vertrag

E8:

```bash
cargo test --workspace --locked
```

E9:

```bash
cargo clippy --workspace --locked --all-targets -- -D warnings
```

Lockfile-Veränderungen nach diesen Befehlen blockieren.

---

# PHASE E — Playwright vollständig machen

## 14. E11 auf alle Browser erweitern

Der lokale Full Harness muss E11 auf derselben Matrix wie CI ausführen:

```text
Chromium
Firefox
WebKit
```

Keine reine Chromium-Ausführung als vollständiges E11-PASS.

Ergebnis muss pro Browser ausweisen:

```text
passed
failed
skipped
duration
browser version
```

Ein roter Browser macht E11 rot.

---

## 15. Schwache Playwright-Assertions vollständig entfernen

Repositoryweit suchen nach:

```text
expect(true).toBe(true()
toBeGreaterThanOrEqual(0)
catch(() => {})
if (count > 0)
may or may not
no crash
informational
```

Jede kritische Benutzerreise muss scheitern, wenn das Element oder Verhalten fehlt.

---

## 16. Reale Renderer-Benutzerreisen R2–R5

Mit synthetischem Archiv prüfen:

### R2 — Archiv laden

```text
Archivaktion sichtbar
Archiv ausgewählt
exakte erwartete Dateien sichtbar
verschachtelte Datei sichtbar
Unicode-Dateiname sichtbar
```

### R3 — Prompt öffnen

```text
korrekter Titel
korrekter Inhalt
korrekte Tags
korrekte Kategorie
richtiger Auswahlzustand
```

### R4 — Analyse

```text
Analyse-Button sichtbar
Loading State
Score
Kriterien
Empfehlungen
korrekte Prompt-Zuordnung
```

### R5 — Optimierung

```text
Optimizer öffnet
Original unverändert
Ergebnis sichtbar
Copy enthält ausschließlich optimierten Text
Dialog schließt
```

Renderer-Suite darf Tauri für deterministische Browserprüfung mocken, muss aber klar als Renderer-E2E bezeichnet bleiben.

---

# PHASE F — Accessibility als Core Gate

## 17. E16 verpflichtend machen

E16:

```text
mandatory: true
isOptional: false
```

Pflicht:

```text
axe critical = 0
axe serious = 0
Keyboard-only Navigation
sichtbarer Fokus
Dialog Focus Trap
Focus Restoration
Escape
zugängliche Namen
Form Labels
Landmarks
Heading-Hierarchie
200-%-Zoom
prefers-reduced-motion
```

Ein Fehler ergibt:

```text
RED_ACCESSIBILITY_REGRESSION
```

Nicht YELLOW.

---

# PHASE G — E18 Build Artifact Integrity

## 18. E18 real und verpflichtend

E18 bleibt:

```text
Build Artifact Integrity
```

Es prüft real:

```text
Tauri-Binary vorhanden
ausführbar
korrektes Binärformat
Version korrekt
Größe plausibel
Paketartefakte vorhanden
Binary-Hash erfasst
keine Testfixtures enthalten
keine Evidence enthalten
keine Secrets enthalten
```

E18 ist Pflicht:

```text
mandatory: true
isOptional: false
```

Das Fehlen des Binaries ist RED, nicht YELLOW.

---

# PHASE H — E19 echtes Native Tauri E2E

## 19. Native Testinfrastruktur

Installiere nur nach Live-Kompatibilitätsprüfung:

```text
webdriverio
@wdio/cli
@wdio/local-runner
@wdio/mocha-framework oder vorhandenes Framework
@wdio/spec-reporter
@wdio/tauri-service
```

Verwende Versionen, die mit der installierten Node-, Tauri- und WebdriverIO-Version kompatibel sind.

Lockfile aktualisieren und vollständig prüfen.

---

## 20. E19 darf kein Playwright-Mock verwenden

Im Native-E2E-Lauf verboten:

```text
window.__TAURI_INTERNALS__ ersetzen
Tauri invoke mocken
scan_directory simulieren
Frontend über Vite laden
Rust-Antworten fälschen
```

Erforderlich:

```text
echtes Tauri-Binary
echte WebView
echte Tauri-IPC
echte Rust-Commands
echtes temporäres Dateisystem
sichtbare UI-Interaktion
```

---

## 21. Native Testfixture

Vor jedem Lauf ein temporäres Archiv erzeugen:

```text
clean/basic-prompt.md
clean/blueprint-prompt.md
clean/missing-info-prompt.md
blocked/sensitive-prompt.md
nested/deep/nested-prompt.md
unicode/äöü-测试-prompt.md
invalid/malformed-frontmatter.md
empty/empty-prompt.md
```

Marker:

```text
PVL_NATIVE_E2E_CLEAN
PVL_NATIVE_E2E_BLUEPRINT
PVL_NATIVE_E2E_BLOCKED
PVL_NATIVE_E2E_UNICODE
```

Keine realen Nutzerdaten.

---

## 22. Native Pflichtreise

E19 muss mindestens folgende vollständige Reise ausführen:

```text
Tauri-Binary starten
→ Hauptfenster sichtbar
→ synthetisches Archiv über reale UI laden
→ Explorer zeigt erwartete Dateien
→ Clean Prompt auswählen
→ realen Rust-Command auslösen
→ reales Ergebnis in UI prüfen
→ Theme oder Einstellung ändern
→ App schließen
→ App neu starten
→ Persistenz verifizieren
```

Zusätzlich:

```text
Backend-Logs erfassen
keine Rust-Panic
keine ungefangene JS-Ausnahme
kein sensitiver Marker in Logs
kein verwaister Prozess
```

---

## 23. Native Sicherheitsreise

Mit `PVL_NATIVE_E2E_BLOCKED`:

```text
Rohinhalt nicht sichtbar
Optimizer blockiert
Blueprint-Optimizer blockiert
Varianten blockiert
Marker nicht in Logs
Marker nicht in Screenshot
Marker nicht in Evidence
```

---

## 24. E19-Seeded-Faults

Mindestens:

```text
Binary fehlt
WebDriver nicht erreichbar
App-Fenster öffnet nicht
IPC-Command nicht registriert
Rust-Command liefert Fehler
Explorer zeigt Fixture nicht
Persistenz fehlt
App-Prozess bleibt nach Test aktiv
```

Jeder Fault muss E19 rot machen.

---

# PHASE I — E20 Packaging Smoke

## 25. Reale Paketprüfung

E20 darf kein No-op sein.

Ermittle live erzeugte Formate:

```text
.deb
.rpm
AppImage
weitere konfigurierte Bundles
```

Mindestens das tatsächlich erzeugte Linux-Paket prüfen.

Für `.deb`:

```bash
dpkg-deb --info <PAKET>
dpkg-deb --contents <PAKET>
```

Prüfen:

```text
Paket lesbar
Name korrekt
Version korrekt
Architektur korrekt
Binary enthalten
Desktop-Datei enthalten
Icon enthalten
keine Testfixtures
keine Evidence
keine .env
keine Datenbankdateien
keine Secret-Muster
```

Bevorzugt zusätzlich in isoliertem Container installieren und starten.

---

## 26. Packaging-Seeded-Faults

```text
Binary fehlt im Paket
falsche Version
Desktop-Datei fehlt
Testfixture enthalten
Evidence enthalten
Secret-Marker enthalten
beschädigtes Paket
```

Jeder Fault muss E20 rot machen.

E20:

```text
mandatory: true
isOptional: false
```

---

# PHASE J — E15 ohne Yellow schließen

## 27. Visual Structural Evidence

E15 darf keine fehlende Pixelbaseline benötigen, wenn das Gate als „Structural Evidence“ bezeichnet wird.

Prüfe stattdessen deterministisch:

```text
Toolbar sichtbar und im Viewport
Explorer sichtbar
Detailsbereich sichtbar
Statusbar vollständig sichtbar
kein horizontales Abschneiden
keine Überlappung kritischer Controls
Dialog vollständig im Viewport
Dark Mode strukturell korrekt
Light Mode strukturell korrekt
1280×800
1920×1080
kleiner unterstützter Viewport
```

Optional erzeugte Screenshots werden Evidence, aber nicht automatisch als neue Pixelbaseline akzeptiert.

E15 wird Pflicht und muss PASS oder RED liefern.

Pixelgenaue Regression bleibt ein separater, außerhalb der Core-Matrix dokumentierter Owner-Review-Prozess.

---

# PHASE K — CI

## 28. GitHub-Actions-Jobs

Erforderlich:

```text
Frontend Unit/Integration
Rust
Secret Scan
Playwright Chromium
Playwright Firefox
Playwright WebKit
Accessibility
Build Artifact Integrity
Native Tauri Real E2E
Packaging Smoke
```

Der Jobname `Tauri Native Linux E2E` darf nur verwendet werden, wenn die App wirklich über WebDriver bedient wird.

Ein Job mit ausschließlich:

```text
test -f
test -x
file
ls
```

muss `Build Artifact Integrity` heißen.

---

## 29. Aktuellen Detached-HEAD-Fehler schließen

Nach dem Fix muss der Test auf dem PR-Merge-Ref bestehen.

Pflichtnachweis:

```text
lokaler Branch-Checkout PASS
lokaler Detached-HEAD-Checkout PASS
GitHub PR-Merge-Ref PASS
Independent Clone Detached HEAD PASS
```

---

# PHASE L — Test-Quality-Gate

## 30. Red-first-Vertrag

Für jeden neuen oder reparierten Gate-Contract:

```text
Seeded Fault
→ Test RED
→ minimaler Fix
→ Test GREEN
→ Independent Verifier wiederholt
```

Keine reine Nachher-Testbehauptung.

Pflicht-Fault-Matrix:

```text
E19 No-op
E20 No-op
E16 optional
E11 nur Chromium
Feature-Flag-Datei fehlt
Feature-Flag aktiv
Detached HEAD
Native IPC getrennt
Packaging Binary fehlt
E12 doppelt
E13 fehlt
PASS ohne executed=true
null ausgeführte Tests
```

---

# PHASE M — Lokale Vollverifikation

## 31. Candidate einfrieren

Nach Änderungen:

```bash
git diff --check
git status --short
```

Dann Commit erzeugen und Final-SHA erfassen.

Keine Abschlussprüfung auf uncommitted Änderungen.

---

## 32. Vollständige Matrix

Mindestens:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build

cargo fmt --check --all
cargo test --workspace --locked
cargo clippy --workspace --locked --all-targets -- -D warnings

pnpm exec playwright test
pnpm run test:e2e:native
pnpm run test:package
pnpm verify:all
```

Die tatsächlichen Skriptnamen aus `package.json` verwenden.

---

# PHASE N — Independent Verifier

## 33. Vollständiger frischer Clone

Nach Push:

```bash
pnpm verify:independent -- --target-sha <FINAL_SHA>
```

Der Verifier muss im frischen Remote-Clone:

```text
Dependencies installieren
alle Playwright-Browser bereitstellen
Tauri-Binary bauen
Renderer-E2E ausführen
Accessibility ausführen
Native-E2E ausführen
Paket bauen
Packaging Smoke ausführen
Gate-Inventar prüfen
Build-Hashes vergleichen
Working Tree prüfen
```

Primary und Verifier müssen denselben SHA und dieselben 20 Gates verwenden.

---

# PHASE O — Remote Verification

## 34. GitHub Actions

Der aktuelle PR-Head und der daraus erzeugte PR-Merge-Ref müssen vollständig grün sein.

Ein lokales GREEN bei roter CI ergibt:

```text
RED_REMOTE_CI_FAILED
```

Ein neuer Commit invalidiert alle älteren Ergebnisse.

Keine Wiederholung eines roten Jobs ohne Ursachenanalyse.

---

# PHASE P — Evidence

## 35. Evidence-Struktur

```text
evidence/autonomous-test/<RUN_ID>/
├── 00-context-manifest.json
├── 01-gate-inventory.json
├── 02-skill-state.json
├── 03-noop-audit.json
├── 04-primary-summary.json
├── 05-primary-logs/
├── 06-playwright-browser-matrix.json
├── 07-accessibility-report.json
├── 08-build-artifact-report.json
├── 09-native-tauri-e2e-report.json
├── 10-native-app-logs/
├── 11-packaging-smoke-report.json
├── 12-seeded-fault-matrix.json
├── 13-independent-summary.json
├── 14-primary-verifier-delta.json
├── 15-remote-ci.json
├── 16-process-cleanup.json
└── FINAL-REPORT.md
```

Jede Evidence enthält:

```text
RUN_ID
Candidate SHA
Runner-Rolle
Startzeit
Endzeit
Executor
Exit-Code
Assertion Count
Artifact Count
Log-Hashes
```

---

# PHASE Q — Evolution Health

## 36. Wartbarkeitsprüfung

Bewerte:

```text
Harness-LOC
größte Datei
Gate-Definitionen
Executor-Abstraktion
duplizierte Command-Logik
Playwright-Laufzeit
Native-E2E-Laufzeit
Packaging-Laufzeit
CI-Gesamtlaufzeit
Flakiness
Evidence-Größe
Diagnosequalität
```

Keine neue monolithische Testdatei.

Zieltrennung:

```text
Playwright → Renderer und Benutzerreisen
WebdriverIO/Tauri → reale native Grenze
Vitest → Unit und Integration
Cargo → Rust-Verträge
Packaging Executor → Paketartefakte
Harness → Orchestrierung und Evidence
```

---

# PHASE R — Abschluss

## 37. Zulässige Endklassifikationen

### Vollständiger Erfolg

```text
GREEN_PR_294_REAL_E2E_ALL_GATES_EXECUTED_READY_FOR_OWNER_REVIEW
```

### No-op verbleibt

```text
RED_GATE_IMPLEMENTATION_NOOP
```

### Native E2E nicht ausgeführt

```text
RED_NATIVE_TAURI_E2E_NOT_EXECUTED
```

### Packaging nicht ausgeführt

```text
RED_PACKAGING_SMOKE_NOT_EXECUTED
```

### Accessibility optional oder gelb

```text
RED_ACCESSIBILITY_CORE_GATE_NOT_ENFORCED
```

### Remote CI rot

```text
RED_REMOTE_CI_FAILED
```

### Primary-/Verifier-Abweichung

```text
AMBER_PRIMARY_VERIFIER_DIVERGENCE
```

---

## 38. Final Report

Berichte:

```text
Status
Base SHA
Ausgangs-Head
Final Candidate SHA
PR-Merge-Ref-SHA
Commits
geänderte Dateien
Skill-Status
No-op-Audit
Gate-Inventar
20-Gate-Matrix
Frontend-Testzahl
Rust-Testzahl
Playwright Chromium
Playwright Firefox
Playwright WebKit
Accessibility
Build Artifact Integrity
Native Tauri Real E2E
Packaging Smoke
Seeded Faults
Primary Run
Independent Run
GitHub Actions
Prozess-Cleanup
Evidence-Pfad
Evolution Health
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

## 39. Stop-Bedingung

Stoppe mit offenem Draft-PR.

Nicht selbstständig:

```text
PR als Ready markieren
Review approven
PR mergen
Auto-Merge aktivieren
Tag erstellen
Release erstellen
Branch löschen
Issues schließen
```

Die nächste Aktion bleibt die ausdrückliche Owner-Entscheidung.

