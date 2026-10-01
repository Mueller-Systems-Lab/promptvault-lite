# Spec: Recommendation-Apply-Workflow (Prompt-Vorschläge übernehmen und neu schreiben)

**Issue:** #45
**Status:** Accepted (backlog completion run, 2026-09-30)
**Date:** 2026-09-30
**Author:** Backlog Completion Run (xxammaxx authorization, goal of 2026-09-30)

---

## 1. Purpose

Nach der Analyse eines Prompts sollen die generierten Empfehlungen (Quality +
Hygiene) einzeln per Checkbox auswählbar sein. Ausgewählte Empfehlungen werden
als **editierbare Textbausteine** in den Prompt eingefügt (Vorschau), der
umgeschriebene Prompt kann **neu analysiert** werden, und die Analyse-Ergebnisse
werden **vorher/nachher** verglichen. Speichern erfolgt ausschließlich über den
bestehenden expliziten Speicher-Pfad des PromptEditor (v1.10.0-Lifecycle);
Abbruch stellt das Original wieder her.

## 2. Akzeptanzkriterien (aus Issue #45, unverändert)

1. Empfehlungen haben Checkboxen zur Auswahl
2. Ausgewählte Empfehlungen erscheinen als editierbare Blöcke im Prompt
3. Vorschau des modifizierten Prompts ist sichtbar
4. „Vorschläge anwenden und neu analysieren"-Workflow funktioniert
5. Analyse-Ergebnisse zeigen Vorher/Nachher-Vergleich
6. Speichern erfolgt nur bei explizitem Klick
7. Zurücksetzen stellt Original-Prompt wieder her

## 3. Non-Goals

- Keine automatische Prompt-Veränderung ohne Nutzeraktion (advisory-only)
- Kein neuer Persistenz-Pfad — Speichern läuft ausschließlich über den
  existierenden PromptEditor → dirty state → explizites „Speichern"
  (`create_prompt`/`update_prompt`)
- Keine Änderung an Analyze-Engine, Optimizer oder Missing-Info/Direction
- Keine Netzwerk-/LLM-Aufrufe (lokal, deterministisch)

## 4. Architektur

### 4.1 Mapping: Empfehlung → Textbaustein (regelbasiert)

`src/lib/recommendationBlocks.ts` (neu, pure Funktion, deterministisch):

```ts
mapRecommendationToBlock(rec: string, index: number): RecommendationBlock
```

Regelwerk (erste Match gewinnt, case-insensitive):

| Keyword in Empfehlung | Section-Heading | Vorlage-Text |
| --- | --- | --- |
| `Secret` | `## Sicherheit` | Entferne Secrets; Umgebungsvariable/Platzhalter |
| `Datenschutz`/`Pii`/`personenbezogen` | `## Datenschutz` | Anonymisierungshinweis |
| `Ziel` | `## Ziel` | Ziel präzise formulieren |
| `Rolle` | `## Rolle` | Rolle beschreiben |
| `Kontext` | `## Kontext` | Kontext ergänzen |
| `Ausgabeformat`/`Output` | `## Ausgabeformat` | Format definieren |
| `Anforderung` | `## Anforderungen` | Regeln auflisten |
| `Constraint`/`Grenzen` | `## Constraints` | Grenzen definieren |
| default | `## Ergänzung N` | Empfehlung als Guidance-Kommentar |

Jeder Block: `{ id, sourceRecommendation, heading, text (editierbar) }`.
Der initiale Blocktext enthält die Empfehlung als `<!-- Empfehlung: ... -->`
Kommentar plus eine Editier-Vorlage — der Nutzer kann den Text vor dem
Übernehmen beliebig anpassen.

### 4.2 Store-State (appStore, neu)

```ts
interface RecommendationDraftState {
  promptId: string;
  originalContent: string;
  blocks: Array<{ id: string; sourceRecommendation: string; heading: string; text: string }>;
  before: { quality: number | null; hygiene: number | null };
  after: { quality: number | null; hygiene: number | null } | null;
}
recommendationDraft: RecommendationDraftState | null;
```

Aktionen:

- `startRecommendationDraft(promptId, selectedRecommendations)` — Snapshot des
  Originals, erzeugt Blöcke via Mapping; `after` bleibt `null`.
- `updateRecommendationBlock(promptId, blockId, text)` — Blocktext editieren.
- `resetRecommendationDraft()` — verwirft den Entwurf (Akzeptanzkriterium 7).
- `applyRecommendationDraftToEditor(promptId)` — setzt den Editor-Inhalt auf
  `previewContent` über den **bestehenden** Editor-Draft-Pfad (dirty state);
  Speichern nur über explizites „Speichern" (Akzeptanzkriterium 6).

`previewContent` (Selector): Original + `\n\n` + Blöcke in Auswahlreihenfolge.

### 4.3 Neu analysieren (Vorher/Nachher)

`analyzeRecommendationPreview()` ruft die **bestehenden** Analyse-Funktionen
(`evaluatePromptContent`, `analyzeHygieneContent` bzw. die Store-Pendants) mit
dem `previewContent` auf — ohne Persistenz, ohne Prompt-Mutation — und schreibt
`after`. Der Vergleich (`before` vs `after`, Quality- und Hygiene-Score) wird im
UI als Vorher/Nachher-Anzeige gerendert (Akzeptanzkriterien 4+5).

### 4.4 UI (AnalysisPanel)

1. Die bestehende Empfehlungs-Liste erhält pro Eintrag eine Checkbox.
2. „Vorschläge übernehmen" startet den Entwurf; darunter erscheinen pro
   ausgewählter Empfehlung ein editierbarer Textblock (textarea).
3. Vorschau des modifizierten Prompts (read-only `<pre>`).
4. „Neu analysieren" → Vorher/Nachher-Score-Anzeige.
5. „In Editor übernehmen" → Editor dirty; „Zurücksetzen" → Original.
6. Stale-Schutz: Wechsel der Prompt-Auswahl oder Inhaltsänderung verwirft den
   Entwurf (konsistent zur bestehenden Stale-Invalidierung).

### 4.5 Observability / Privacy

Neue Operation `recommendations.apply` mit bounded Reason Codes
(`NO_PROMPT_SELECTED`, `NO_RECOMMENDATIONS_SELECTED`, `STALE_SOURCE`) im
bestehenden safe-metadata-v1-Kontrakt — nur Metadaten, keine Prompt-Inhalte.

## 5. Verification Contract (Red Tests vor Implementierung)

1. `recommendationBlocks.test.ts` — Mapping deterministisch, alle Keyword-Klassen,
   Default-Fall, ID-Stabilität.
2. `appStore.recommendationDraft.test.ts` — Start/Update/Reset/Apply; Apply setzt
   Editor dirty; Reset stellt Original her; Stale-Invalidierung bei
   Prompt-Wechsel.
3. `AnalysisPanel.recommendations.test.tsx` — Checkboxen sichtbar; Auswahl →
   Blöcke editierbar; Vorschau sichtbar; Neu-analysieren triggert Vergleich;
   Speichern nur explizit (kein Auto-Save); Zurücksetzen.
4. Existierende Gates bleiben grün (Regression).
