#!/usr/bin/env python3
"""
atspi_select.py — pure, desktop-free selection logic for AT-SPI dialog
confirmation (Run Card §9/§10/§15).

No gi/Atspi imports here: every function takes plain dicts, so the
fail-closed selection rules are unit-testable without a desktop session.

Contract:
  - zero candidates            → None (NOT_FOUND)
  - multiple equal candidates  → None (AMBIGUOUS)  — NEVER first-candidate-wins
  - disabled/hidden button     → excluded
  - button without action      → excluded
  - GTK default-state button   → preferred over non-default
  - exact affirmative name     → preferred over substring match
"""

_AFFIRMATIVE_NAMES = {
    "auswählen", "auswahlen", "öffnen", "offnen", "open",
    "select", "choose", "ok",
}

_CANCEL_NAMES = {
    "abbrechen", "cancel", "schließen", "schliessen", "close",
    "nein", "no",
}

# Affirmative substrings used as a secondary signal (Run Card §10).
_AFFIRMATIVE_SUBSTRINGS = ("auswähl", "öffn", "open", "select", "choos", "ok")


def normalize(name):
    """Normalize a button name: lowercase, strip mnemonics and ellipsis."""
    if not name:
        return ""
    n = name.casefold().strip()
    while n.startswith("_"):
        n = n[1:]
    if n.endswith("..."):
        n = n[:-3].strip()
    if n.endswith(".."):
        n = n[:-2].strip()
    return n


def is_affirmative(name):
    """Check if normalized name matches known confirm-button names."""
    return normalize(name) in _AFFIRMATIVE_NAMES


def is_cancel(name):
    """Check if normalized name matches known cancel-button names."""
    return normalize(name) in _CANCEL_NAMES


# ── Dialog selection (§9: unique-or-fail-closed) ──────────────────────────

def select_dialog_candidate(candidates):
    """Pick the unique valid dialog candidate, or None (fail-closed).

    candidates: iterable of dicts with keys:
        name, pid_matches, title_matches, role, visible, enabled

    Only candidates that satisfy ALL filters are kept. If exactly one
    remains it wins; otherwise None (NOT_FOUND on zero, AMBIGUOUS on >1).
    """
    if not candidates:
        return None

    valid = [
        c for c in candidates
        if c.get("title_matches")
        and c.get("pid_matches", True)
        and c.get("role") in ("dialog", "file chooser")
        and c.get("visible", True)
        and c.get("enabled", True)
    ]
    if len(valid) == 1:
        return valid[0]
    return None  # 0 → NOT_FOUND, >1 → AMBIGUOUS (fail-closed)


# ── Confirm button selection (§10: default-preferring, fail-closed) ───────

def select_confirm_button_candidate(buttons):
    """Pick the unique affirmative confirm button, or None (fail-closed).

    buttons: iterable of dicts with keys:
        name, enabled, visible, is_default, has_action

    Selection order (Run Card §10):
      1. keep only visible + enabled buttons with a real action
      2. exclude cancel buttons
      3. prefer exact affirmative names over substring matches
      4. prefer the GTK default-state button
      5. exactly one remaining candidate wins; otherwise None
    """
    if not buttons:
        return None

    viable = [
        b for b in buttons
        if b.get("visible", True)
        and b.get("enabled", True)
        and b.get("has_action", True)
        and not is_cancel(b.get("name"))
    ]
    if not viable:
        return None

    # Step 3: exact affirmative names first
    exact = [b for b in viable if is_affirmative(b.get("name"))]
    pool = exact if exact else [
        b for b in viable
        if any(sub in normalize(b.get("name")) for sub in _AFFIRMATIVE_SUBSTRINGS)
    ]
    if not pool:
        return None

    # Step 4: GTK default-state preference
    defaults = [b for b in pool if b.get("is_default")]
    if len(defaults) == 1:
        return defaults[0]
    if len(defaults) > 1:
        return None  # two defaults → AMBIGUOUS (fail-closed)

    # No default marker: unique name match wins, else ambiguous
    if len(pool) == 1:
        return pool[0]
    return None
