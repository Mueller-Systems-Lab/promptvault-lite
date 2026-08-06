#!/usr/bin/env python3
"""
Unit tests for atspi_confirm.py pure logic (normalize, is_affirmative, is_cancel).
No AT-SPI or X11 dependency — testable without a desktop session.

Run: python3 -m unittest e2e-tests/helpers/test_atspi_confirm.py
"""

import sys
import unittest
from pathlib import Path

# Add helpers dir to path so we can import atspi_confirm
sys.path.insert(0, str(Path(__file__).resolve().parent))
from atspi_confirm import _normalize, _is_affirmative, _is_cancel


class TestNormalize(unittest.TestCase):
    def test_lowercase(self):
        self.assertEqual(_normalize("Auswählen"), "auswählen")

    def test_strip_mnemonics(self):
        self.assertEqual(_normalize("_Öffnen"), "öffnen")

    def test_double_underscore(self):
        self.assertEqual(_normalize("__Auswählen"), "auswählen")

    def test_strip_ellipsis(self):
        self.assertEqual(_normalize("Öffnen..."), "öffnen")

    def test_strip_double_dot(self):
        self.assertEqual(_normalize("Open.."), "open")

    def test_strip_whitespace(self):
        self.assertEqual(_normalize("  Auswählen  "), "auswählen")

    def test_empty_string(self):
        self.assertEqual(_normalize(""), "")

    def test_none_safe(self):
        self.assertEqual(_normalize(None), "")

    def test_mixed_case_accents(self):
        self.assertEqual(_normalize("_ÖFFNEN..."), "öffnen")


class TestIsAffirmative(unittest.TestCase):
    def test_german_select(self):
        self.assertTrue(_is_affirmative("Auswählen"))

    def test_german_select_mnemonic(self):
        self.assertTrue(_is_affirmative("_Auswählen"))

    def test_german_open(self):
        self.assertTrue(_is_affirmative("Öffnen"))

    def test_german_open_no_umlaut(self):
        self.assertTrue(_is_affirmative("Offnen"))

    def test_english_open(self):
        self.assertTrue(_is_affirmative("Open"))

    def test_english_select(self):
        self.assertTrue(_is_affirmative("Select"))

    def test_english_choose(self):
        self.assertTrue(_is_affirmative("Choose"))

    def test_ok(self):
        self.assertTrue(_is_affirmative("OK"))

    def test_cancel_is_not_affirmative(self):
        self.assertFalse(_is_affirmative("Abbrechen"))
        self.assertFalse(_is_affirmative("Cancel"))

    def test_random_text(self):
        self.assertFalse(_is_affirmative("Hilfe"))
        self.assertFalse(_is_affirmative(""))

    def test_null(self):
        self.assertFalse(_is_affirmative(None))


class TestIsCancel(unittest.TestCase):
    def test_german_cancel(self):
        self.assertTrue(_is_cancel("Abbrechen"))
        self.assertTrue(_is_cancel("_Abbrechen"))

    def test_english_cancel(self):
        self.assertTrue(_is_cancel("Cancel"))

    def test_german_close(self):
        self.assertTrue(_is_cancel("Schließen"))

    def test_german_no(self):
        self.assertTrue(_is_cancel("Nein"))

    def test_english_no(self):
        self.assertTrue(_is_cancel("No"))

    def test_affirmative_is_not_cancel(self):
        self.assertFalse(_is_cancel("Auswählen"))
        self.assertFalse(_is_cancel("Open"))

    def test_random_is_not_cancel(self):
        self.assertFalse(_is_cancel("Hilfe"))


class TestButtonClassification(unittest.TestCase):
    """Integration of normalize + classification."""

    def test_all_affirmative_variants_not_cancel(self):
        variants = [
            "Auswählen", "_Auswählen", "Auswählen...", "_Auswählen...",
            "Öffnen", "Öffnen...", "_Öffnen",
            "Open", "Open...", "_Open",
            "Select", "Choose", "OK",
        ]
        for v in variants:
            with self.subTest(variant=v):
                self.assertTrue(_is_affirmative(v), f"{v!r} should be affirmative")
                self.assertFalse(_is_cancel(v), f"{v!r} should NOT be cancel")

    def test_all_cancel_variants_not_affirmative(self):
        variants = [
            "Abbrechen", "_Abbrechen", "Cancel", "_Cancel",
            "Schließen", "Nein", "No",
        ]
        for v in variants:
            with self.subTest(variant=v):
                self.assertTrue(_is_cancel(v), f"{v!r} should be cancel")
                self.assertFalse(_is_affirmative(v), f"{v!r} should NOT be affirmative")


if __name__ == "__main__":
    unittest.main()
