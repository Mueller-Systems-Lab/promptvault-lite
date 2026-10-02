# Runbook: Agent-Eval-Flywheel (Issue #146, Phase 4)

**Zweck:** wiederkehrende UI-/Packaging-Fehler systematisch in
Regression-Tests und Gate-Signale überführen (Phase 4 des
Agentic-Baselines-Issues #146).

## Rezurrenter Lauf

```bash
node scripts/eval-flywheel.mjs          # Vitest + Playwright chromium
node scripts/eval-flywheel.mjs --quick  # nur Vitest
```

- Ergebnis: `evidence/eval-flywheel/<runId>.json` (Suiten-Status,
  fehlerhafte Dateien, abgeleitete Regression-Aufgaben).
- Interpretation: jede stabil reproduzierbare Fehler-Signatur wird zu
  einem Regression-Test in der betroffenen Suite (Minimalreproduktion,
  strikte Assertions). **Keine Test-Abschwächung** (AGENTS.md).
- Empfohlener Takt: vor jedem Release-Kandidat und nach jedem Merge-Wave;
  optional als CI-Cron-Job (Owner-Entscheid, da Remote-CI-Policy #154).

## Verknüpfungen

- Gates: `scripts/verify-all.mjs`, `scripts/security-gate.mjs`
- Visual Evidence: `test-results/blueprint-visual/`, `docs/screenshots/`
- Regeldatei: `AGENTS.md` (Fake-Execution-/Fake-PASS-Verbote)
