# RUN CARD — PromptVault Lite echte Ende-zu-Ende-Verifikation

**Run Card ID:** `PVL-REAL-PLAYWRIGHT-E2E-AND-NATIVE-CLOSURE-20260804-001`
**Repository:** `xxammaxx/promptvault-lite`
**Pull Request:** `#294`
**Arbeitsbranch:** `fix/autonomous-test-harness-trust`
**Zu Beginn beobachteter Head:** `26f6ad9d92c59d4be10bd0dd30cddc10e74a6197`
**Ausgangsstatus:** `RED_E2E_CLAIM_NOT_PROVEN`

Die SHA ist nur der beobachtete Startpunkt. Ermittle den aktuellen Live-Stand vor Änderungen erneut.

---

# 1. Auftrag

Teste PromptVault Lite vollständig aus Sicht eines realen Benutzers.

Die KI muss die Anwendung selbst öffnen, bedienen und überprüfen. Es reicht nicht:

* Testdateien zu schreiben,
* Komponenten isoliert zu rendern,
* Tauri-IPC vollständig zu mocken,
* nur das Vorhandensein eines Binaries zu prüfen,
* nur einen ELF-Header zu lesen,
* oder Tests mit „kein Absturz“ und immer wahren Assertions bestehen zu lassen.

Die Zielkette lautet:

```text
synthetisches Prompt-Archiv auf echtem Dateisystem
→ gebautes Tauri-Binary
→ reales App-Fenster
→ reale Benutzerinteraktion
→ reale Tauri-IPC-Aufrufe
→ reale Rust-Commands
→ tatsächliche UI-Aktualisierung
→ Persistenz beziehungsweise Dateisystemwirkung
→ App-Neustart
→ erneute Verifikation
```

Playwright ist Pflicht für alle Browser-, UI-, Accessibility- und Benutzerflussprüfungen.

Für die native Tauri-WebView muss zusätzlich der offiziell unterstützte WebDriver-Weg eingesetzt werden. Playwright darf nicht fälschlich als Client für `tauri-driver` ausgegeben werden, da Playwright kein WebDriver-Client ist.

Bevorzugter nativer Weg:

```text
WebdriverIO
+ @wdio/tauri-service
+ echtes Tauri-Binary
```

Der native Runner ergänzt Playwright. Er ersetzt Playwright nicht.

---

# 2. Verbindliches Endergebnis

Nur folgender Status gilt als erfolgreicher Abschluss:

```text
GREEN_REAL_USER_JOURNEYS_AND_NATIVE_TAURI_E2E_VERIFIED
```

Dafür müssen gelten:

```text
0 RED
0 AMBER
0 YELLOW innerhalb der Core-Gate-Matrix
keine doppelte Gate-ID
keine fehlende Gate-ID
keine übersprungene kritische Benutzerreise
```

Optionale Hardwareabdeckung wie ein reales USB-Laufwerk wird außerhalb der Core-Gate-Matrix dokumentiert:

```text
OPTIONAL_COVERAGE_NOT_EXECUTED
```

Sie darf nicht als angeblich ausgeführtes Gate erscheinen.

---

# 3. Grenzen

Erlaubt:

* PR-Branch aktualisieren,
* Playwright-Tests verbessern,
* native Tauri-E2E-Infrastruktur ergänzen,
* synthetische Test-Fixtures erzeugen,
* CI-Workflows ergänzen,
* Test- und Harness-Code reparieren,
* notwendige testbezogene Dev-Dependencies ergänzen,
* Dokumentation und Evidence aktualisieren,
* Branch pushen.

Nicht erlaubt:

* direkt auf `master` pushen,
* PR mergen,
* Auto-Merge aktivieren,
* Tag oder Release erstellen,
* echte Nutzerdateien lesen,
* Screenshots mit echten Prompts erzeugen,
* Testfehler durch `skip`, `fixme` oder höhere Retries verstecken,
* Tests durch schwächere Assertions grün machen,
* echte Fehler mit `catch(() => {})` verschlucken,
* Controls optional behandeln, die laut Nutzerreise vorhanden sein müssen,
* Produktionsverhalten nur für Tests fälschen,
* Tauri-IPC in einem Native-E2E-Test mocken.

---

# 4. Reality Refresh

Ermittle live:

```text
Repository-Root
aktueller Branch
Working Tree
master-SHA
PR-Head-SHA
PR-Merge-Ref-SHA
aktuelle PR-Kommentare und Reviews
aktuelle CI-Läufe
Node-/pnpm-Version
Rust-/Cargo-Version
Tauri-Version
Playwright-Version
WebdriverIO-Version
@wdio/tauri-service-Version
installierte Browser
Display-Server
WebKitGTK-Version
vorhandene Testverzeichnisse
vorhandene Skills
```

Prüfe insbesondere:

```text
playwright.config.ts
tests/e2e/core-flows.spec.ts
tests/e2e/accessibility.spec.ts
tests/e2e/native-tauri-e2e.spec.ts
src/__tests__/tauri-ipc-integration.test.ts
scripts/lib/gates.mjs
scripts/verify-all.mjs
.github/workflows/ci.yml
package.json
src-tauri/tauri.conf.json
src-tauri/src/
```

Alte Abschlussmeldungen und verspätete Prozessausgaben sind keine Source of Truth.

---

# 5. Skill Preflight

Inventarisiere zuerst die vorhandenen Skills.

Erwartete Fähigkeiten:

```text
playwright-best-practices
webapp-testing
testing-tauri-apps
test-driven-development
systematic-debugging
verification-before-completion
subagent-driven-development
```

Keine Neuinstallation bei bereits geprüftem und byte-identischem Stand.

Aktiviere mindestens:

```text
playwright-best-practices
webapp-testing
testing-tauri-apps
verification-before-completion
systematic-debugging
```

Prüfe:

```text
Installationspfad
Source Repository
Source Commit
Git Blob
lokalen SHA-256
Namenskollision
Discovery durch OpenCode
Discovery durch Hermes
Ressourcenauflösung
```

Bei Abweichung:

```text
AMBER_SKILL_UPSTREAM_DRIFT_REVIEW_REQUIRED
```

Keine Aktualisierung auf `latest`.

---

# 6. Aktuell bestätigte Scheintests

Validiere diese Befunde selbst gegen den aktuellen Head.

## 6.1 Gemocktes Browser-E2E

`core-flows.spec.ts` ersetzt das Tauri-Backend vollständig durch einen JavaScript-Mock.

Diese Tests dürfen bestehen bleiben, müssen aber korrekt bezeichnet werden als:

```text
Renderer Integration Tests
```

Sie dürfen nicht als Native-End-to-End-Nachweis gezählt werden.

## 6.2 Binary- statt Native-E2E

Der aktuelle native Test prüft lediglich:

```text
Datei vorhanden
Datei ausführbar
Dateigröße
ELF-Magic
```

Das ist:

```text
Build Artifact Integrity
```

Es ist kein Native-E2E-Test.

## 6.3 Schwache Assertions

Suche mindestens nach:

```text
expect(true).toBe(true()
toBeGreaterThanOrEqual(0)
catch(() => {})
if (count > 0)
may or may not
no crash
informational
waitForTimeout
```

Jede solche Stelle prüfen.

Ein Test muss scheitern, wenn das erwartete Produktverhalten fehlt.

---

# 7. Gate-Inventar reparieren

Definiere eine einzige kanonische Gate-Liste.

Mindestens:

```text
E1  Repo Hygiene
E2  Dependency Integrity
E3  Frontend Unit/Integration
E4  ESLint
E5  TypeScript
E6  Frontend Build
E7  Rust Format
E8  Rust Tests
E9  Rust Clippy
E10 Secret Scan
E11 Playwright Renderer E2E
E12 Version Consistency
E13 Lockfile Drift
E14 Feature-Flag Defaults
E15 Visual Structural Evidence
E16 Accessibility
E17 Tauri IPC Contract Integration
E18 Build Artifact Integrity
E19 Native Tauri Real E2E
E20 Packaging Smoke
```

Verbindliche Invarianten:

```text
jede Gate-ID exakt einmal
jede erwartete Gate-ID vorhanden
keine unbekannte Gate-ID
Summary-Zählung entspricht der Matrix
Gate-ID und Gate-Name eindeutig
```

Seeded Tests:

1. E12 doppelt → Run muss rot werden.
2. E13 fehlt → Run muss rot werden.
3. unbekanntes E99 → Run muss rot werden.
4. Summary-Zahl stimmt nicht mit Einträgen überein → Run muss rot werden.

Klassifikation:

```text
RED_GATE_INVENTORY_INVALID
```

---

# 8. Synthetisches Testarchiv

Erzeuge für jeden Lauf ein neues temporäres Archiv.

Keine echten Nutzerpfade verwenden.

Pflichtdateien:

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

Die Fixtures müssen bekannte, eindeutige Marker enthalten.

Beispiel:

```text
PVL_E2E_CLEAN_MARKER
PVL_E2E_BLUEPRINT_MARKER
PVL_E2E_BLOCKED_MARKER
```

Nach dem Lauf:

* keine Datei außerhalb des temporären Verzeichnisses verändern,
* Testarchiv löschen,
* App-Prozesse beenden,
* Driver-Prozesse beenden.

---

# 9. Playwright-Reconnaissance durch die KI

Bevor Tests geschrieben oder geändert werden, muss die KI die Anwendung selbst mit Playwright öffnen und untersuchen.

Mindestens:

1. App beziehungsweise Vite-Renderer starten.
2. Accessibility Snapshot lesen.
3. reale Rollen, Namen und Labels erfassen.
4. Toolbar, Explorer, Details, Settings und Statusbar identifizieren.
5. einen Prompt über die UI auswählen.
6. Dialoge öffnen und schließen.
7. Tastaturfluss durchlaufen.
8. Console Errors und Page Errors erfassen.

Die Erkenntnisse speichern unter:

```text
evidence/e2e-reconnaissance/playwright-ui-map.json
```

Keine CSS-Selektoren raten.

Bevorzugte Locators:

```text
getByRole
getByLabel
getByText bei eindeutigem Text
getByTestId nur bei stabiler semantischer Notwendigkeit
```

Keine langen CSS-Ketten.

---

# 10. Playwright Renderer-E2E

Diese Suite läuft gegen den Vite-Renderer und darf Tauri-IPC für deterministische UI-Tests kontrolliert simulieren.

Sie muss auf:

```text
Chromium
Firefox
WebKit
```

laufen.

Sie ist kein Ersatz für E19.

## 10.1 Strenge Regeln

Verboten:

```ts
expect(true).toBe(true();
expect(count).toBeGreaterThanOrEqual(0);
await action.catch(() => {});
```

Verboten ist auch:

```ts
if (await button.count()) {
  await button.click();
}
```

wenn der Button laut Nutzerreise vorhanden sein muss.

Stattdessen:

```ts
await expect(button).toBeVisible();
await expect(button).toBeEnabled();
await button.click();
```

## 10.2 Pflichtflüsse

### R1 — App-Start

Nachweisen:

```text
App-Container sichtbar
Toolbar sichtbar
Explorer sichtbar
Statusbar sichtbar
Version korrekt
keine pageerror
keine unerwartete console.error
```

### R2 — Archiv laden

Nach UI-Aktion:

```text
exakte Anzahl erwarteter Testprompts
Clean Marker sichtbar
verschachtelte Datei sichtbar
Unicode-Dateiname sichtbar
```

Kein `nodeCount >= 0`.

### R3 — Prompt auswählen

Nach Auswahl:

```text
korrekter Titel
korrekter Inhalt
korrekte Tags
korrekter Pfad
richtiger ausgewählter Zustand
```

### R4 — Analyse

Nach Klick auf Analyse:

```text
Loading State erscheint
Analyse endet
Score erscheint
Kriterien erscheinen
Empfehlungen erscheinen
Ergebnis gehört zum ausgewählten Prompt
```

### R5 — Optimierung

Nach Klick:

```text
Optimizer öffnet
Originaltext bleibt unverändert
optimierter Text erscheint
Copy kopiert nur optimierten Text
Dialog schließt korrekt
```

### R6 — Blocking Sensitive Content

Für `PVL_E2E_BLOCKED_MARKER`:

```text
Rohinhalt nicht sichtbar
Optimizer nicht zugänglich
Blueprint-Optimizer nicht zugänglich
Varianten nicht zugänglich
Marker nicht in DOM
Marker nicht in Console
Marker nicht in Trace
Marker nicht in Screenshot
```

### R7 — Missing Info Gate

Mit kontrolliert aktiviertem Flag:

```text
Gate erscheint
Required-Frage sichtbar
Antwort eingeben
Weiter navigieren
Abschluss ausführen
Optimizer öffnet erst danach
```

### R8 — Direction Profiles

Mit kontrolliert aktiviertem Flag:

```text
Profilwahl sichtbar
Profil auswählen
Varianten erzeugen
gewähltes Profil erscheint
Varianten sind unterscheidbar
kein Zustandsleck beim Promptwechsel
```

### R9 — Einstellungen und Theme

```text
Settings öffnen
Dark Mode wählen
DOM-/Theme-Zustand ändert sich
App neu laden
Theme bleibt erhalten
Light Mode wählen
erneut verifizieren
```

### R10 — Tastatur

```text
nur per Tastatur Settings öffnen
Fokus sichtbar
Dialog-Fokus bleibt im Dialog
Escape schließt
Fokus kehrt zum Auslöser zurück
```

### R11 — Fehlerpfade

Simuliere kontrolliert:

```text
scan_directory Fehler
evaluate_prompt Fehler
Clipboard-Verweigerung
ungültige Antwort
Timeout
```

Jeweils:

```text
sichtbare Fehlermeldung
kein stiller Erfolg
kein hängender Loading State
kein Datenverlust
```

---

# 11. Accessibility

E16 ist kein optionales YELLOW-Gate mehr.

Pflicht:

```text
axe critical = 0
axe serious = 0
vollständige Keyboard-Canaries
sichtbarer Fokus
Dialog-Rollen
zugängliche Namen
korrekte Labels
Heading-Hierarchie
Landmarks
reduced-motion
200-%-Zoom
```

Ein echter Accessibility-Fehler ergibt:

```text
RED_ACCESSIBILITY_REGRESSION
```

Nicht:

```text
YELLOW_OPTIONAL
```

---

# 12. Reale Tauri-End-to-End-Suite

## 12.1 Technische Vorgabe

Playwright steuert weiterhin sämtliche Renderer- und UI-Browserflüsse.

Für die reale Tauri-WebView wird der offizielle Tauri-WebDriver-Weg verwendet:

```text
WebdriverIO
@wdio/tauri-service
echtes gebautes Tauri-Binary
```

Nicht versuchen:

```text
Playwright page.goto("http://127.0.0.1:4444")
```

`tauri-driver` stellt keinen normalen Webserver und keinen Playwright-Endpunkt bereit.

## 12.2 Native Test darf nicht mocken

Im E19-Lauf verboten:

```text
window.__TAURI_INTERNALS__ ersetzen
invoke mocken
scan_directory mocken
Rust-Antworten simulieren
Frontend an Vite statt im Tauri-Binary öffnen
```

## 12.3 Testaufbau

1. synthetisches Archiv erzeugen,
2. Tauri-Debug-Binary frisch bauen,
3. WebDriver-Service starten,
4. echtes App-Fenster öffnen,
5. App- und Backend-Logs erfassen,
6. Benutzeraktionen ausführen,
7. reale IPC-Wirkung prüfen,
8. App schließen,
9. Prozessbaum kontrollieren,
10. Testdaten entfernen.

Setup darf Testdaten auf dem Dateisystem erzeugen.

Setup darf nicht das zu testende Produktverhalten vorwegnehmen.

## 12.4 Native Pflichtreise

Mindestens eine vollständige Reise muss real sein:

```text
App-Binary starten
→ synthetisches Archiv verfügbar machen
→ Archiv durch die App laden
→ realen Prompt in Explorer sehen
→ Prompt auswählen
→ reale Analyse oder einen anderen geschäftskritischen Rust-Command auslösen
→ reale Rust-Antwort in UI sehen
→ Einstellung ändern
→ App schließen
→ App neu starten
→ Persistenz prüfen
```

Dabei nachweisen:

```text
echtes Binary
echte WebView
echtes IPC
echter Rust-Command
echtes Dateisystem
echter Neustart
```

## 12.5 Setup-Hilfe

`browser.tauri.execute()` darf ausschließlich für:

```text
Fixture-Setup
Logabfrage
kontrolliertes Teardown
```

verwendet werden.

Es darf nicht verwendet werden, um die eigentliche Benutzerreise zu ersetzen.

Die eigentlichen Aktionen müssen über sichtbare UI-Elemente erfolgen.

---

# 13. Build Artifact Integrity

Die bisherigen E18-Prüfungen werden nicht gelöscht, sondern korrekt umbenannt:

```text
E18 Build Artifact Integrity
```

Prüfen:

```text
Binary vorhanden
ausführbar
korrektes Dateiformat
Version
Paket vorhanden
Paket enthält erwartetes Binary
keine unerwarteten Testdateien im Paket
```

Das Gate darf nicht `Native E2E` heißen.

---

# 14. Packaging Smoke

E20 prüft das erzeugte `.deb`-Paket in isolierter Umgebung, soweit praktikabel.

Mindestens:

```text
Paket lesbar
Metadaten korrekt
Version korrekt
Binary enthalten
Desktop-Datei enthalten
Icon enthalten
keine Evidence
keine Test-Fixtures
keine Secrets
```

Eine Installation in einem temporären Container ist bevorzugt, wenn die Umgebung dies sicher erlaubt.

---

# 15. CI

Aktualisiere GitHub Actions so, dass klar getrennt wird:

```text
Frontend Unit/Integration
Playwright Renderer E2E
Accessibility
Rust
Secret Scan
Build Artifact Integrity
Native Tauri E2E
Packaging Smoke
```

## Playwright

Pflicht:

```text
Chromium
Firefox
WebKit
```

## Native Tauri

Pflicht auf Linux:

```text
echtes Binary
WebdriverIO Tauri Service
echte Native-E2E-Reise
```

Kein Job darf „Native Tauri E2E“ heißen, wenn er nur:

```text
test -f
test -x
file
ls -lh
```

ausführt.

## Remote Gate

Der aktuelle PR-Merge-Ref muss vollständig grün sein.

Ein lokales GREEN bei roter GitHub Action ergibt:

```text
RED_REMOTE_CI_FAILED
```

---

# 16. Verspätete Prozessausgaben

Jeder Lauf erhält:

```text
RUN_ID
Candidate SHA
PID
Startzeit
Endzeit
```

Jede Evidence und jeder Logeintrag enthält diese Werte.

Eine verspätete Meldung darf nur berücksichtigt werden, wenn:

```text
RUN_ID stimmt
Candidate SHA stimmt
Prozess gehört zum aktuellen Lauf
Ergebnis wurde vor Finalisierung abgeschlossen
```

Ausgaben früherer Build- oder Playwright-Prozesse sind historische Evidence und dürfen den aktuellen Status weder verbessern noch verschlechtern.

Vor Abschluss:

```text
keine laufenden cargo-build-Prozesse
kein Vite-Testserver
kein Playwright-Browser
kein WebDriverIO-Prozess
kein tauri-driver
kein Tauri-Testbinary
```

---

# 17. Test-Quality-Gate

Für jeden neuen E2E-Test:

1. Seeded Fault erzeugen.
2. Test muss RED sein.
3. Fault entfernen beziehungsweise Produkt korrekt reparieren.
4. Test muss GREEN sein.
5. Unabhängiger Verifier wiederholt den Test.

Pflicht-Seeded-Faults:

```text
Explorer fehlt
Settings-Button fehlt
Analyse liefert keine Antwort
Optimizer kopiert Original
Blocking Marker erscheint im DOM
Focus Trap fehlt
Theme wird nicht persistiert
Rust-Command liefert Fehler
Tauri-Binary startet nicht
Native IPC ist getrennt
E13 fehlt aus Gate-Matrix
E12 ist doppelt
```

Ein Test, der beim Seeded Fault weiterhin besteht, ist ungültig.

---

# 18. Vollständige lokale Verifikation

Auf einem sauberen Candidate-Commit:

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
pnpm verify:all
```

Die tatsächlichen Skriptnamen aus `package.json` ableiten.

Keine erfundenen Befehle verwenden.

---

# 19. Independent Verifier

Nach Push des finalen Candidate-SHA:

```bash
pnpm verify:independent -- --target-sha <FINAL_SHA>
```

Der Independent Verifier muss:

```text
frischen Remote-Clone erstellen
exakten SHA detached auschecken
Dependencies neu installieren
Playwright Browser bereitstellen
Tauri-Binary neu bauen
Playwright-Suite ausführen
Native-WebDriver-Suite ausführen
Gate-Inventar prüfen
Build-Artefakte vergleichen
eigenständige Evidence schreiben
Working Tree prüfen
```

Primary und Verifier müssen dieselbe Gate-Menge und denselben Candidate-SHA verwenden.

---

# 20. Evidence

Erzeuge:

```text
evidence/autonomous-test/<RUN_ID>/
├── 00-context-manifest.json
├── 01-gate-inventory.json
├── 02-skill-state.json
├── 03-primary-summary.json
├── 04-primary-logs/
├── 05-playwright-renderer-report/
├── 06-playwright-traces/
├── 07-accessibility-report.json
├── 08-ipc-contract-report.json
├── 09-build-artifact-report.json
├── 10-native-tauri-e2e-report.json
├── 11-native-app-logs/
├── 12-independent-summary.json
├── 13-primary-verifier-delta.json
├── 14-remote-ci.json
├── 15-seeded-fault-matrix.json
└── FINAL-REPORT.md
```

Evidence muss:

```text
gitignored
SHA-gebunden
RUN-ID-gebunden
secret-bereinigt
atomar geschrieben
maschinenlesbar
```

sein.

---

# 21. Abschlussbericht

Berichte:

```text
Status
Base SHA
Final Candidate SHA
PR Merge-Ref SHA
Branch
Commits
geänderte Dateien
Gate-Inventar
doppelte Gate-IDs
fehlende Gate-IDs
Frontend-Testzahl
Rust-Testzahl
Playwright Chromium
Playwright Firefox
Playwright WebKit
Accessibility
IPC Contracts
Build Artifact Integrity
Native Tauri Real E2E
Packaging Smoke
Seeded Faults
Primary Run
Independent Run
Remote CI
Prozess-Cleanup
Evidence-Pfad
offene externe Hardwareabdeckung
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

# 22. Zulässige Endklassifikationen

## Vollständiger Erfolg

```text
GREEN_REAL_USER_JOURNEYS_AND_NATIVE_TAURI_E2E_VERIFIED
```

## Browser vollständig, Native fehlt

```text
RED_NATIVE_TAURI_E2E_NOT_EXECUTED
```

## Native Test prüft nur Binary

```text
RED_NATIVE_E2E_FALSE_CLAIM
```

## Playwright verwendet schwache Assertions

```text
RED_PLAYWRIGHT_TEST_QUALITY_INSUFFICIENT
```

## Gate-Inventar ungültig

```text
RED_GATE_INVENTORY_INVALID
```

## Remote CI rot

```text
RED_REMOTE_CI_FAILED
```

## Primary-/Verifier-Abweichung

```text
AMBER_PRIMARY_VERIFIER_DIVERGENCE
```

Ein Status mit YELLOW ist nicht „alle Gates grün“.

---

# 23. Stop-Bedingung

Stoppe mit offenem Draft-PR.

Nicht:

```text
PR als Ready markieren
approven
mergen
Auto-Merge aktivieren
Tag erstellen
Release erstellen
Branch löschen
Issues schließen
```

Die nächste Aktion bleibt eine ausdrückliche Owner-Entscheidung.

