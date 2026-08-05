#!/usr/bin/env python3
"""
Tests for the pure AT-SPI selection logic (fail-closed contract, Run Card §9/§10/§15).

These functions take plain dicts (no AT-SPI objects) so the selection rules
are testable without a desktop session:

  select_dialog_candidate(candidates)   — §9  unique-or-fail-closed dialog
  select_confirm_button_candidate(btns) — §10 default-preferring unique button

Fail-closed contract (Run Card §9/§10):
  - zero candidates            → None (NOT_FOUND)
  - multiple equal candidates  → None (AMBIGUOUS)  — NEVER "first candidate wins"
  - disabled/hidden button     → excluded
  - button without action      → excluded
  - GTK default-state button   → preferred over non-default
  - exact affirmative name     → preferred over substring match

Run: python3 -m unittest e2e-tests/helpers/test_atspi_select.py
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atspi_select import select_dialog_candidate, select_confirm_button_candidate


def btn(name, enabled=True, visible=True, is_default=False, has_action=True):
    return {
        "name": name,
        "enabled": enabled,
        "visible": visible,
        "is_default": is_default,
        "has_action": has_action,
    }


def dlg(name, pid_matches=True, title_matches=True, role="dialog",
        visible=True, enabled=True):
    return {
        "name": name,
        "pid_matches": pid_matches,
        "title_matches": title_matches,
        "role": role,
        "visible": visible,
        "enabled": enabled,
    }


class TestSelectDialogFailClosed(unittest.TestCase):
    def test_no_candidates_returns_none(self):
        self.assertIsNone(select_dialog_candidate([]))

    def test_none_list_returns_none(self):
        self.assertIsNone(select_dialog_candidate(None))

    def test_unique_candidate_wins(self):
        c = dlg("Ordner auswählen")
        self.assertEqual(select_dialog_candidate([c]), c)

    def test_unique_after_pid_filter(self):
        good = dlg("Ordner auswählen", pid_matches=True)
        bad = dlg("Anderes Fenster", pid_matches=False)
        self.assertEqual(select_dialog_candidate([bad, good]), good)

    def test_multiple_equal_candidates_ambiguous(self):
        a = dlg("Ordner auswählen")
        b = dlg("Ordner auswählen")
        # Fail-closed: ambiguity must NOT pick the first candidate
        self.assertIsNone(select_dialog_candidate([a, b]))

    def test_invisible_excluded(self):
        vis = dlg("Ordner auswählen", visible=True)
        hid = dlg("Ordner auswählen", visible=False)
        self.assertEqual(select_dialog_candidate([hid, vis]), vis)

    def test_disabled_excluded(self):
        en = dlg("Ordner auswählen", enabled=True)
        dis = dlg("Ordner auswählen", enabled=False)
        self.assertEqual(select_dialog_candidate([dis, en]), en)

    def test_wrong_role_excluded(self):
        d = dlg("Ordner auswählen", role="frame")
        other = dlg("Ordner auswählen", role="dialog")
        self.assertEqual(select_dialog_candidate([d, other]), other)


class TestSelectConfirmButtonFailClosed(unittest.TestCase):
    def test_no_buttons_returns_none(self):
        self.assertIsNone(select_confirm_button_candidate([]))

    def test_none_returns_none(self):
        self.assertIsNone(select_confirm_button_candidate(None))

    def test_unique_affirmative_wins(self):
        b = btn("Auswählen")
        self.assertEqual(select_confirm_button_candidate([b]), b)

    def test_cancel_excluded(self):
        ok = btn("Öffnen")
        cancel = btn("Abbrechen")
        self.assertEqual(select_confirm_button_candidate([cancel, ok]), ok)

    def test_only_cancel_returns_none(self):
        self.assertIsNone(select_confirm_button_candidate([btn("Abbrechen")]))

    def test_random_button_returns_none(self):
        self.assertIsNone(select_confirm_button_candidate([btn("Hilfe")]))

    def test_disabled_excluded(self):
        ok = btn("Öffnen", enabled=True)
        dis = btn("Öffnen", enabled=False)
        self.assertEqual(select_confirm_button_candidate([dis, ok]), ok)

    def test_only_disabled_returns_none(self):
        self.assertIsNone(select_confirm_button_candidate([btn("Öffnen", enabled=False)]))

    def test_hidden_excluded(self):
        ok = btn("Öffnen", visible=True)
        hid = btn("Öffnen", visible=False)
        self.assertEqual(select_confirm_button_candidate([hid, ok]), ok)

    def test_only_hidden_returns_none(self):
        self.assertIsNone(select_confirm_button_candidate([btn("Öffnen", visible=False)]))

    def test_no_action_excluded(self):
        ok = btn("Öffnen", has_action=True)
        noact = btn("Öffnen", has_action=False)
        self.assertEqual(select_confirm_button_candidate([noact, ok]), ok)

    def test_only_no_action_returns_none(self):
        self.assertIsNone(select_confirm_button_candidate([btn("Öffnen", has_action=False)]))

    def test_default_preferred_over_non_default(self):
        default = btn("Öffnen", is_default=True)
        other = btn("Öffnen", is_default=False)
        self.assertEqual(select_confirm_button_candidate([other, default]), default)

    def test_two_defaults_ambiguous(self):
        a = btn("Öffnen", is_default=True)
        b = btn("Auswählen", is_default=True)
        # Fail-closed: two defaults → ambiguous, NOT first candidate
        self.assertIsNone(select_confirm_button_candidate([a, b]))

    def test_two_affirmatives_without_default_ambiguous(self):
        a = btn("Öffnen")
        b = btn("Auswählen")
        self.assertIsNone(select_confirm_button_candidate([a, b]))

    def test_default_resolves_affirmative_ambiguity(self):
        a = btn("Öffnen", is_default=False)
        b = btn("Auswählen", is_default=True)
        self.assertEqual(select_confirm_button_candidate([a, b]), b)

    def test_english_open(self):
        self.assertEqual(select_confirm_button_candidate([btn("Open")]), btn("Open"))

    def test_german_open_mnemonic(self):
        b = btn("_Öffnen")
        self.assertEqual(select_confirm_button_candidate([b]), b)

    def test_mixed_cancel_and_two_affirmatives_ambiguous(self):
        cancel = btn("Abbrechen")
        a = btn("Öffnen")
        b = btn("Auswählen")
        self.assertIsNone(select_confirm_button_candidate([cancel, a, b]))

    def test_normalized_variant_wins(self):
        ok = btn("Öffnen...")
        self.assertEqual(select_confirm_button_candidate([ok]), ok)


if __name__ == "__main__":
    unittest.main()
