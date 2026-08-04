# RUN CARD — PR #294 Final Trust Closure

**Run Card ID:** `PVL-PR294-FINAL-TRUST-CLOSURE-20260803-001`
**Projekt:** PromptVault Lite
**Repository:** `xxammaxx/promptvault-lite`
**Pull Request:** `#294`
**Branch:** `fix/autonomous-test-harness-trust`
**Aktuelle Basis:** `918b81a7833e73335ea2dc9e77d964249b9c4601`
**Aktueller Ausgangs-Head:** `0e306fb7a98ce4f2df67eabd143abecfeee7df44`
**Startstatus:** `RED_HOLD_PR_294_CI_FAILED_AND_CONTRACT_GAPS`

---

## 1. Ziel

Schließe die letzten nachgewiesenen Vertrauenslücken des autonomen Test-Harness und bringe PR #294 in einen nachweislich mergebereiten Zustand.

Am Ende müssen gleichzeitig erfüllt sein:

1. alle Harness- und Projekt-Kern-Gates lokal grün,
2. vollständiger Primary-Lauf auf einem eingefrorenen Final-SHA,
3. echter Independent Verifier auf einem frischen Remote-Clone desselben SHA,
4. korrekte Primary-/Verifier-Divergenzprüfung,
5. identische kanonische Build-Artefakte,
6. GitHub Actions auf dem aktuellen PR-Merge-Ref vollständig grün,
7. keine False-GREEN-Pfade,
8. vollständige Evidence,
9. PR bleibt bis zur Owner-Freigabe ungemergt.

---

## 2. Verbindliche Grenzen

Erlaubt:

* bestehende Branch `fix/autonomous-test-harness-trust` aktualisieren,
* zusätzliche Reparatur-Commits erstellen,
* Branch pushen,
* PR-Beschreibung aktualisieren,
* lokale und CI-Evidence erzeugen,
* Tests und Harness-Code verändern,
* Dokumentation an den realen Contract anpassen.

Nicht erlaubt:

* direkt auf `master` pushen,
* PR mergen,
* Auto-Merge aktivieren,
* Tag oder Release erstellen,
* Issues schließen,
* Feature-Flag-Defaults ändern,
* Produktfehler außerhalb des Harness-Auftrags reparieren,
* Testfehler durch `skip`, `fixme`, Retries oder schwächere Assertions verstecken,
* Secret-Scanner pauschal auf Testverzeichnisse blind machen,
* bestehende Sicherheitsabdeckung reduzieren,
* Force-Push oder History-Rewrite ohne zwingenden Grund.

Bevorzugt additive Commits verwenden.

---

## 3. Reality Refresh

Chatverläufe, ältere Reports und diese Run Card sind nicht die aktuelle Source of Truth.

Ermittle zuerst live:

```text
repository_root
remote_origin
default_branch
master_sha
pr_294_head_sha
pr_294_merge_ref_sha
current_branch
working_tree_status
node_version
pnpm_version
rustc_version
cargo_version
git_version
playwright_version
hermes_version
opencode_version
current_ci_run
current_ci_jobs
current_ci_failure_steps
```

Prüfe mindestens:

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

* PR #294 weiterhin offen und Draft,
* tatsächlicher Head-SHA,
* Mergeability,
* Reviews und Review-Threads,
* CI-Läufe des aktuellen Head-SHA,
* CI-Lauf des aktuellen PR-Merge-Refs.

Wenn sich der Head seit `0e306fb…` verändert hat, auf dem neuen realen Head weiterarbeiten.

---

## 4. OS- und Shell-Preflight

Vor Befehlen feststellen:

```text
OS
OS-Version
Architektur
aktive Shell
Pfadseparator
Encoding
Repository-Dateisystem
Temp-Dateisystem
Paketmanager
Node/pnpm
Rust/Cargo
Git
Playwright
Hermes
OpenCode
```

Keine Bash-only-Annahmen in plattformneutralen Harness-Komponenten.

Insbesondere vermeiden:

* Shell-Redirection als Argument eines `spawn()`-Aufrufs,
* externes `find`, wenn Node-Dateisystem-APIs ausreichen,
* fest verdrahtete Linux-Home-Unterverzeichnisse,
* Tests, die zwingend einen aktiven Branchnamen erwarten.

---

## 5. Skill Preflight

Vorhandene Skills inventarisieren und Hash-Lock prüfen.

Erwartete Fähigkeiten:

```text
verification-before-completion
systematic-debugging
test-driven-development
subagent-driven-development
webapp-testing
playwright-best-practices
```

Keine neuen Skills installieren, sofern keine konkrete neue Fähigkeitslücke nachgewiesen wird.

Bei Hash- oder Upstream-Abweichung:

```text
AMBER_SKILL_UPSTREAM_DRIFT_REVIEW_REQUIRED
```

Der Skill-Preflight darf die eigentliche Reparatur nicht durch unnötige Neuinstallationen verzögern.

---

## 6. NO_OP_HYPOTHESIS

Prüfe jeden unten beschriebenen Fehler gegen den aktuellen PR-Head.

Falls ein Punkt bereits vollständig repariert und durch einen echten Contract-Test bewiesen ist:

```text
GREEN_ALREADY_SATISFIED_NO_CHANGE
```

Keine doppelte Implementierung hinzufügen.

---

# TEIL A — CI-Blocker schließen

## 7. Detached-HEAD-kompatibler Branch-Contract

Der aktuelle Test darf nicht mehr die reale CI-Umgebung als Fehler behandeln.

GitHub Actions checkt Pull Requests typischerweise als Detached-HEAD-Merge-Ref aus. Daher ist ein leerer Wert von:

```bash
git branch --show-current
```

in CI legitim.

### Neuer Contract

Die Branch-Erkennung muss folgende Zustände unterscheiden:

```text
normaler Checkout       -> tatsächlicher Branchname
detached HEAD           -> "detached HEAD"
Git nicht verfügbar     -> strukturierter Infrastrukturfehler
kein Repository         -> strukturierter Infrastrukturfehler
```

### Erforderliche Tests

Nicht die aktuelle Testumgebung voraussetzen.

Erzeuge isolierte temporäre Git-Repositories:

1. Repository mit normalem Branch:

   * Erkennung liefert Branchname.
2. Repository nach `git checkout --detach`:

   * Erkennung liefert exakt `detached HEAD`.
3. Context Manifest im Detached-HEAD-Modus:

   * `branch: "detached HEAD"`
   * korrekter `tested_git_sha`.
4. Kein Git-Repository:

   * kein stilles `unknown` als vermeintlich erfolgreicher Zustand.

Der Test muss die echte Branch-/Manifest-Funktion prüfen, nicht direkt den Shell-Befehl im Test duplizieren.

---

## 8. Secret-Test-Fixtures CI-sicher machen

Die eingecheckten Testdateien enthalten derzeit vollständige synthetische Secret-Muster, die der Repository-Scanner korrekt erkennt.

Repariere mindestens:

```text
scripts/__tests__/runner.test.js
scripts/__tests__/harness-contract.test.js
```

### Verbindliche Methode

Secret-Muster erst zur Testlaufzeit zusammensetzen.

Beispiele:

```js
const githubToken = ["gh", "p_", "1234...", "..."].join("");
const githubPat = ["github", "_pat_", "11", "..."].join("");
const awsKey = ["AK", "IA", "..."].join("");
```

Die vollständige Scan-Signatur darf nicht als zusammenhängender String im eingecheckten Repository vorkommen.

### Verboten

* gesamtes Testverzeichnis auf die Allowlist setzen,
* alle `*.test.js` vom Secret Scan ausschließen,
* Secret-Regex abschwächen,
* Scanner nur für PR #294 umgehen.

### Nachweis

1. Laufzeit-Fixture wird von `maskSecrets()` erkannt.
2. Seeded-Fault-Repository wird vom E10-Gate blockiert.
3. Repository-weite CI-Secret-Scan-Logik bleibt grün.
4. `.env`- und Datenbankdatei-Prüfung bleibt aktiv.

---

# TEIL B — Independent-Verifier-Vertrag schließen

## 9. Runner-Rolle korrekt propagieren

Verifier-Gates dürfen nicht als:

```json
{
  "runner": "primary"
}
```

gespeichert werden.

Implementiere eine eindeutige, intern kontrollierte Runner-Rolle:

```text
primary
independent
```

Mögliche Schnittstelle:

```text
--runner-role primary
--runner-role independent
```

oder eine interne API ohne öffentlich manipulierbare Sicherheitslücke.

### Contract

* Primary-Evidence: `runner: "primary"`
* Verifier-Evidence: `runner: "independent"`
* unbekannte Rollen: blockieren
* Verifier darf nicht versehentlich Primary-Dateinamen überschreiben
* Rolle muss in Gate-Einträgen, Summary, Manifest und Final Report erscheinen

### Tests

* echter Primary-CLI-Lauf,
* echter Independent-CLI-Lauf,
* unbekannte Rolle,
* Rolle fehlt im internen Verifier-Aufruf,
* Primary- und Independent-Evidence werden nicht vermischt.

---

## 10. Dependency-Installation im Clone fail-closed behandeln

Der frische Clone führt vor der Matrix aus:

```bash
pnpm install --frozen-lockfile
```

Der Exit-Code muss unmittelbar geprüft werden.

Bei Fehler:

```text
RED_INFRASTRUCTURE_FAILURE
```

Pflichtverhalten:

* Full Matrix nicht als erfolgreich fortsetzen,
* Fehlerlog sichern,
* Clone für Diagnose erhalten,
* keine Build- oder Delta-Evidence vortäuschen,
* Final Report enthält den realen Installationsfehler,
* Prozess endet ungleich null.

### Seeded Fault

Temporäres Remote-Repository mit absichtlich ungültigem beziehungsweise nicht auflösbarem Lockfile.

Erwartung:

* Installation schlägt fehl,
* Verifier stoppt fail-closed,
* keine PASS-Klassifikation.

---

## 11. Kanonischer Build-Artefakt-Vertrag

Primary und Verifier müssen exakt denselben Artefaktraum hashen.

Derzeit darf nicht eine Seite nur Build-Verzeichnisse und die andere Seite nahezu den gesamten Clone hashen.

### Definiere eine einzige gemeinsame Funktion

Beispielsweise:

```js
collectBuildArtifactHashes(root)
```

Kanonische Pfade aus der Live-Projektstruktur ableiten, mindestens prüfen:

```text
dist/
src-tauri/target/release/
weitere tatsächlich relevante Build-Ausgaben
```

Keine Caches, Quelltexte, Git-Dateien oder `node_modules`.

### Plattformneutralität

Bevorzugt Node-Dateisystem-APIs:

```text
fs.readdir
fs.stat
fs.readFile
path.relative
```

Kein externes `find`.

Keine Zeichenfolge wie:

```text
2>/dev/null
```

als Argument eines Befehls ohne Shell.

### Hash-Contract

Für jede Datei:

```json
{
  "relative_path": "dist/assets/index-....js",
  "sha256": "...",
  "size": 12345
}
```

Sortierung muss deterministisch sein.

---

## 12. Build-Divergenz vollständig erkennen

Folgende Fälle müssen sämtlich Divergenz erzeugen:

```text
Datei nur im Primary vorhanden
Datei nur im Verifier vorhanden
gleicher Pfad, anderer Hash
gleicher Pfad, andere Größe
kompletter Build-Pfad fehlt
Build-Manifest leer, obwohl Build-Gate PASS meldet
```

Erwartete Klassifikation:

```text
AMBER_PRIMARY_VERIFIER_DIVERGENCE
```

Exit-Code ungleich null.

`only_in_primary` und `only_in_verifier` dürfen nicht nur gezählt werden; sie müssen `hasDivergence: true` setzen.

### Seeded Faults

* Datei aus Verifier-Build entfernen,
* zusätzliche Datei hinzufügen,
* ein Byte verändern,
* vollständiges `dist/` entfernen,
* leeres Build-Manifest simulieren.

Jeder Fault muss GREEN blockieren.

---

## 13. Gate-Set-Divergenz vollständig erkennen

Primary und Verifier müssen dieselbe erwartete Gate-Menge ausführen.

Divergenz bei:

```text
Gate nur im Primary
Gate nur im Verifier
Gate fehlt auf beiden Seiten gegenüber dem Verification Contract
unterschiedliche Mandatory-/Optional-Klassifikation
unterschiedliche Gate-Reihenfolge, falls Reihenfolge Teil des Contracts ist
```

### Erwarteter Vergleich

```json
{
  "expected_gates": ["E1", "...", "E15"],
  "primary_gates": ["..."],
  "verifier_gates": ["..."],
  "missing_in_primary": [],
  "missing_in_verifier": [],
  "unexpected_in_primary": [],
  "unexpected_in_verifier": [],
  "has_divergence": false
}
```

Fehlende Gates müssen `hasDivergence` auf `true` setzen.

Keine stillen `continue`-Pfade, die fehlende Gates nur dokumentieren.

---

## 14. Verifier-Evidence wirklich isolieren

Der Verifier darf keine Primary-Dateien während seines Laufs überschreiben.

Bevorzugte Architektur:

1. Verifier erstellt frischen Clone in `os.tmpdir()`.
2. Verifier verwendet dort ein clone-lokales, eindeutig benanntes Evidence-Staging-Verzeichnis.
3. Nach Abschluss importiert der Parent die maskierte Evidence atomar in:

```text
06-independent-summary.json
06-independent-logs/
09-build-hashes-independent.json
```

4. Primary-Evidence bleibt unverändert.
5. Bei Verifier-Fehler wird der Clone-Pfad dokumentiert und nicht gelöscht.
6. Bei Erfolg kontrolliert aufräumen.

Mindestens muss technisch bewiesen werden:

* kein identischer Logpfad,
* keine identische Summary-Datei,
* keine atomare Überschreibung der Primary-Evidence,
* parallele Primary-/Verifier-Läufe kollidieren nicht.

---

# TEIL C — Pfad- und Evidence-Sicherheit

## 15. Eindeutige Output-Pfad-Policy

Die bisherige Prüfung darf nicht nur auf das Vorhandensein von `..` reagieren.

Definiere explizit erlaubte Pfade.

### Empfohlene Policy

Für öffentliche CLI-Aufrufe:

```text
--evidence-dir
--json-summary
```

sind ausschließlich erlaubt:

1. relative Pfade innerhalb des Repositorys,
2. absolute Pfade innerhalb des Repositorys,
3. ein durch den Parent intern erzeugtes Verifier-Staging-Verzeichnis unter `os.tmpdir()`.

Andere absolute Pfade werden blockiert.

Alternativ darf eine strengere Policy verwendet werden:

```text
nur <repo>/evidence/autonomous-test/
```

Die gewählte Policy muss im Contract dokumentiert sein.

### Pflichtprüfungen

Blockieren:

```text
../../../etc/evil
/etc/pvl-summary.json
C:\Windows\System32\pvl-summary.json
UNC-Pfad außerhalb erlaubter Roots
Symlink innerhalb des Repo, der nach außen zeigt
```

Erlauben:

```text
evidence/autonomous-test/<RUN_ID>/
absoluter kanonischer Pfad innerhalb des Repositorys
intern erzeugtes und verifiziertes Temp-Staging
```

Nicht nur Stringprüfung durchführen.

Verwende nach Möglichkeit:

```text
realpath
resolve
relative
lstat
```

und prüfe Symlink-Escape.

---

## 16. Atomisches Evidence-Schreiben

Temporäre Datei im selben Zielverzeichnis erstellen.

Ablauf:

1. Zielverzeichnis erstellen.
2. temporäre Datei im Zielverzeichnis mit exklusivem Namen erzeugen.
3. Inhalt schreiben.
4. optional `fsync`.
5. innerhalb desselben Verzeichnisses umbenennen.

Kein Rename von allgemeinem `/tmp` auf ein möglicherweise anderes Dateisystem.

Seeded Test für simuliertes Cross-Device-Verhalten beziehungsweise nachgewiesenen Same-Directory-Write.

---

# TEIL D — Klassifikation und optionale Gates

## 17. Optional bedeutet nicht „Fehler ignorieren“

Ein optionales Coverage-Gate darf gelb sein, wenn es nachweislich nicht ausgeführt werden konnte oder bewusst keine Baseline vorhanden ist.

Ein real ausgeführter Befehl mit Exit-Code ungleich null darf nicht durch:

```text
visualBaselinesMissing: true
```

zu YELLOW umklassifiziert werden.

Priorität:

1. realer Infrastruktur- oder Testfehler,
2. Divergenz,
3. optionale Coverage nicht ausgeführt,
4. PASS.

### Pflichtfälle

```text
E15 nicht ausgeführt, keine Baseline
-> YELLOW_VISUAL_BASELINE_MISSING

E15 ausgeführt und Befehl schlägt fehl
-> RED_TEST_FAILURE

USB-Corpus nicht konfiguriert, Core-E2E grün
-> YELLOW_OPTIONAL_HARDWARE_NOT_EXECUTED

Core-Playwright-Test schlägt fehl
-> RED_TEST_FAILURE
```

---

## 18. Run-Level-Klassifikation

Run-Level-Status darf Gate-Fehler nicht unpräzise überschreiben.

Mindestens unterscheiden:

```text
RED_REPRODUCIBLE_PRODUCT_FAILURE
RED_TEST_FAILURE
RED_TEST_INFRASTRUCTURE_FAILURE
AMBER_PRIMARY_VERIFIER_DIVERGENCE
AMBER_FLAKY_TESTS_BLOCK_COMPLETION_CLAIM
GREEN_CORE_GATES_AMBER_OPTIONAL_PLATFORM_OR_HARDWARE_COVERAGE
GREEN_AUTONOMOUS_TEST_HARNESS_PERSISTENT_AND_VALIDATED
```

Der Final Report muss die konkreten roten Gate-Klassifikationen erhalten.

---

# TEIL E — Testqualität

## 19. Red-Test-Matrix

Neue Tests müssen zunächst auf dem aktuellen fehlerhaften Verhalten RED sein.

Mindestens:

| ID  | Fehler                           | Erwartung                         |
| --- | -------------------------------- | --------------------------------- |
| C1  | Detached HEAD                    | Manifest meldet `detached HEAD`   |
| C2  | statisches Secret in Repo        | CI-Scanner erkennt es             |
| C3  | Laufzeit-Fixture                 | Unit-Test erkennt und maskiert es |
| C4  | Verifier-Rolle                   | Evidence trägt `independent`      |
| C5  | Installationsfehler              | Verifier stoppt rot               |
| C6  | Build nur im Primary             | Divergenz                         |
| C7  | Build nur im Verifier            | Divergenz                         |
| C8  | abweichender Hash                | Divergenz                         |
| C9  | fehlendes Verifier-Gate          | Divergenz                         |
| C10 | fehlendes Primary-Gate           | Divergenz                         |
| C11 | externes absolutes Evidence-Ziel | blockiert                         |
| C12 | Symlink-Escape                   | blockiert                         |
| C13 | E15 real fehlgeschlagen          | rot, nicht gelb                   |
| C14 | parallele Runs                   | keine Kollision                   |
| C15 | Verifier-Summary                 | Primary unverändert               |

Für jeden Fix:

1. RED nachweisen,
2. minimal reparieren,
3. GREEN nachweisen,
4. relevanten Seeded Fault erneut ausführen.

Keine Tests, die nur Kommentare oder Hilfswertvergleiche prüfen.

---

## 20. Bestehende Testbehauptungen korrigieren

Entferne oder korrigiere irreführende Aussagen wie:

```text
Frontend Vitest-Fehler sind vorbestehende Produktionsfehler.
```

Der aktuell bekannte CI-Frontend-Fehler stammt aus dem neuen Detached-HEAD-Harness-Test.

PR-Beschreibung und Final Report müssen Ursache und Scope korrekt wiedergeben.

---

# TEIL F — Vollständige Verifikation

## 21. Ziel-SHA einfrieren

Nach allen Codeänderungen:

1. `git diff --check`
2. gezielte Harness-Tests
3. Lint und TypeScript
4. Commit erstellen
5. Working Tree clean prüfen
6. Candidate-SHA erfassen
7. Branch pushen

Danach keine Änderungen ohne neuen Candidate-SHA.

Kein Full-GREEN auf uncommitted Dateien melden.

---

## 22. Gezielte Harness-Verifikation

Mindestens:

```bash
pnpm vitest run \
  scripts/__tests__/runner.test.js \
  scripts/__tests__/harness-contract.test.js
```

Erwartung:

```text
0 failed
```

Zusätzlich sicherstellen, dass alle neuen Contract-Tests tatsächlich im normalen:

```bash
pnpm test
```

enthalten sind.

---

## 23. Primary Full Run

Auf dem eingefrorenen Candidate-SHA:

```bash
pnpm verify:all
```

Erforderlich:

```text
E1  Repo Hygiene
E2  Dependency Integrity
E3  Frontend Tests
E4  ESLint
E5  TypeScript
E6  Frontend Build
E7  Rust Format
E8  Rust Tests --locked
E9  Rust Clippy --locked
E10 Secret Scan
E11 Playwright Core E2E
E12 Version Consistency
E13 Lockfile Drift
E14 Feature-Flag Defaults
E15 Visual Evidence / optionale Baseline
```

Nicht ausreichend:

```text
E1-E2 PASS
```

Alle Gates müssen im Summary erscheinen.

Bei einem roten Pflicht-Gate kein GREEN.

---

## 24. Independent Full Run

Erst nach Push des Candidate-SHA:

```bash
pnpm verify:independent -- --target-sha <FINAL_CANDIDATE_SHA>
```

Erforderlicher Nachweis:

```text
origin URL
frischer Remote-Clone
--no-local oder äquivalente echte Remote-Isolation
detached HEAD
exakter Candidate-SHA
keine geerbten Build-Ausgaben
eigene Dependency-Installation
vollständige E1-E15-Matrix
runner = independent
isolierte Logs
kanonischer Buildvergleich
Gate-Set-Vergleich
Working Tree clean
Clone bei Erfolg entfernt
```

Primary und Verifier müssen denselben Final-SHA prüfen.

---

## 25. Negative Canary Matrix

Nach positiver Implementierung kontrollierte Faults ausführen:

```text
Detached-HEAD-Umgebung
statisches Secret-Testmuster
committete .env
committete .db
pnpm-lock drift
Cargo.lock drift
fehlgeschlagene Dependency-Installation
Playwright-Core-Fehler
E15-Fehler trotz fehlender Baseline
fehlendes Primary-Gate
fehlendes Verifier-Gate
fehlendes Build-Artefakt
zusätzliches Build-Artefakt
abweichender Build-Hash
Evidence-Pfad außerhalb erlaubter Roots
Symlink-Escape
```

Jeder Fault muss den vorgesehenen Status erzeugen.

Danach alle Faults entfernen und Full Gate erneut durchführen.

---

# TEIL G — Remote CI

## 26. GitHub-Actions-Verifikation

Nach Push des Final-Candidate-SHA:

1. aktuellen PR-Head prüfen,
2. aktuellen PR-Merge-Ref bestimmen,
3. GitHub-Actions-Lauf abwarten,
4. alle Jobs und Steps prüfen.

Mindestens:

```text
Frontend        SUCCESS
Rust            SUCCESS
Secret Scan     SUCCESS
```

Frontend muss enthalten:

```text
Install
TypeScript
Lint
Vitest
Build
```

Secret Scan muss enthalten:

```text
Pattern Scan
.env Scan
DB Scan
```

Ein neuer Commit invalidiert ältere CI-Evidence.

Bei CI-Fehler:

* Logs analysieren,
* keine pauschale Wiederholung,
* Root Cause klassifizieren,
* neuen Fix-Commit erstellen,
* vollständige lokale und remote Verification erneut starten.

---

## 27. PR-Beschreibung aktualisieren

Nach vollständigem GREEN PR #294 aktualisieren mit:

```text
Final Head SHA
aktueller Merge-Ref SHA
vollständige Harness-Testzahl
vollständige Projekt-Testzahl
Primary E1-E15 Matrix
Independent E1-E15 Matrix
Fresh-Clone-Nachweis
Primary-/Verifier-Delta
Build-Artefaktvergleich
negative Canary Matrix
GitHub-Actions-Run
optionale USB-Lücke
optionale Visual-Baseline-Lücke
Evidence-Pfad
```

Keine Aussage „alle Gaps geschlossen“, wenn ein Punkt nur dokumentiert, aber nicht getestet wurde.

PR bleibt Draft, bis der Owner ausdrücklich die Review-Freigabe erteilt.

---

# TEIL H — Evolution Health

## 28. Architektur- und Wartbarkeitsdelta

Bewerte:

```text
Gesamt-LOC des Harness
größte Einzeldatei
Duplikation
Anzahl Module
Anzahl Runner-Tests
Testlaufzeit
CI-Laufzeit
externe Prozessabhängigkeiten
plattformabhängige Stellen
Evidence-Größe
Fehlerdiagnosequalität
```

Besonders prüfen:

* duplizierte `runCommand()`-Implementierungen,
* externes `find`,
* doppelte Hashlogik,
* doppelte Gate-Definitionen,
* übermäßige CLI-Flags,
* zu starke Kopplung zwischen Primary und Verifier.

Keine großflächige Refaktorierung ohne konkreten Nutzen.

Falls der Harness lokal grün, aber unnötig komplex oder schwer wartbar ist:

```text
AMBER_ARCHITECTURAL_EROSION
```

---

# TEIL I — Evidence

## 29. Evidence-Struktur

Erzeuge lokal:

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
└── FINAL-REPORT.md
```

Evidence muss:

* gitignored sein,
* exakten Candidate-SHA enthalten,
* Runner-Rollen korrekt enthalten,
* Log-Hashes enthalten,
* keine Secrets enthalten,
* Primary und Verifier trennen,
* Remote-CI-Run und Merge-Ref dokumentieren.

---

## 30. Abschlussklassifikationen

### Vollständig mergebereit

```text
GREEN_PR_294_TRUST_REPAIR_READY_FOR_OWNER_REVIEW
```

Erfordert:

* alle Harness-Tests grün,
* vollständige Projektmatrix grün,
* Primary E1-E15 vollständig,
* Independent E1-E15 vollständig,
* exakter gleicher SHA,
* keine Gate- oder Build-Divergenz,
* CI auf aktuellem Merge-Ref grün,
* keine False-GREEN-Pfade,
* Evidence vollständig,
* Evolution Health akzeptabel.

Optionale USB- und Baseline-Lücken dürfen separat bestehen:

```text
GREEN_CORE_GATES_AMBER_OPTIONAL_PLATFORM_OR_HARDWARE_COVERAGE
```

Sie dürfen den Ready-for-Owner-Review-Status nicht verhindern, sofern alle Kern-Gates grün sind.

### CI noch rot

```text
RED_REMOTE_CI_FAILED
```

### False-GREEN-Pfad verbleibt

```text
RED_FALSE_GREEN_PATH_REMAINS
```

### Primary-/Verifier-Abweichung

```text
AMBER_PRIMARY_VERIFIER_DIVERGENCE
```

### Architekturerosion

```text
AMBER_ARCHITECTURAL_EROSION
```

### Infrastrukturproblem

```text
RED_TEST_INFRASTRUCTURE_FAILURE
```

---

## 31. Final Report

Berichte abschließend:

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
Red-Test-Evidence
Harness-Testzahl
Projekt-Testzahl
Primary Gate Matrix
Independent Gate Matrix
Runner-Rollen
Fresh-Clone-Nachweis
Dependency-Install-Nachweis
Gate-Set-Delta
Build-Artefakt-Delta
negative Canary Matrix
CI Jobs und Steps
Secret-Scan-Nachweis
Pfad-Sicherheitsnachweis
Evolution Health
Evidence-Pfad
offene optionale Coverage
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

## 32. Stop-Bedingung

Stoppe mit:

```text
GREEN_PR_294_TRUST_REPAIR_READY_FOR_OWNER_REVIEW
```

und weiterhin offenem Draft-PR.

Nicht selbstständig:

* PR als Ready markieren,
* Review approven,
* mergen,
* Auto-Merge aktivieren,
* Tag setzen,
* Release erstellen,
* Branch löschen,
* Issues schließen.

Die nächste Aktion bleibt eine ausdrückliche Owner-Entscheidung.

